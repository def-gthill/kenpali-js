import {
  as,
  builtins,
  default_,
  eagerBind,
  force,
  isThrown,
  lazyBind,
  rest,
  toString,
} from "./builtins.js";
import { core as coreCode } from "./core.js";
import { array, literal, object } from "./kpast.js";
import kpthrow from "./kperror.js";
import kpobject, {
  kpoFilter,
  kpoMap,
  kpoMerge,
  toJsObject,
  toKpobject,
} from "./kpobject.js";
import kpparse from "./kpparse.js";

export function kpevalJson(json, names = kpobject()) {
  const expressionRaw = JSON.parse(json);
  const expression = toAst(expressionRaw);
  return kpeval(expression, names);
}

export function toAst(expressionRaw) {
  if (expressionRaw === null) {
    return null;
  } else if (Array.isArray(expressionRaw)) {
    return expressionRaw.map(toAst);
  } else if (typeof expressionRaw === "object") {
    return Object.fromEntries(
      Object.entries(expressionRaw).map(([key, value]) => {
        if (["defining", "namedArgs"].includes(key)) {
          return [
            key,
            kpoMap(toKpobject(value), ([key, value]) => [key, toAst(value)]),
          ];
        } else {
          return [key, toAst(value)];
        }
      })
    );
  } else {
    return expressionRaw;
  }
}

export default function kpeval(expression, names = kpobject(), trace = false) {
  tracing = trace;
  const withCore = loadCore(builtins);
  const withCustomNames = new Scope(withCore, names);
  return catch_(evalWithBuiltins(expression, withCustomNames));
}

let coreScope = null;

function loadCore(enclosingScope) {
  if (!coreScope) {
    const code = coreCode;
    const ast = kpparse(code + "null");
    coreScope = selfReferentialScope(enclosingScope, ast.defining);
  }
  return coreScope;
}

export function evalWithBuiltins(expression, names) {
  if (expression === null || typeof expression !== "object") {
    return kpthrow("notAnExpression", ["value", expression]);
  } else if ("literal" in expression) {
    return expression.literal;
  } else if ("array" in expression) {
    return expression.array.map((element) => evalWithBuiltins(element, names));
  } else if ("object" in expression) {
    return kpobject(
      ...expression.object.map(([key, value]) => [
        typeof key === "string" ? key : evalWithBuiltins(key, names),
        evalWithBuiltins(value, names),
      ])
    );
  } else if ("name" in expression) {
    if (!names.has(expression.name)) {
      return kpthrow("nameNotDefined", ["name", expression.name]);
    }
    const binding = names.get(expression.name);
    if (typeof binding === "object" && "expression" in binding) {
      const result = evalWithBuiltins(binding.expression, binding.context);
      names.set(expression.name, result);
      return result;
    } else if (typeof binding === "object" && "thunk" in binding) {
      const result = binding.thunk();
      names.set(expression.name, result);
      return result;
    } else {
      return binding;
    }
  } else if ("defining" in expression) {
    const scope = selfReferentialScope(names, expression.defining);
    return evalWithBuiltins(expression.result, scope);
  } else if ("given" in expression) {
    return kpobject(
      ["#given", paramSpecToKpValue(expression.given)],
      ["result", expression.result],
      ["closure", names]
    );
  } else if ("calling" in expression) {
    const f = evalWithBuiltins(expression.calling, names);
    const args = expression.args ?? [];
    const namedArgs = expression.namedArgs ?? kpobject();
    return callOnExpressionsTracing(f, args, namedArgs, names);
  } else if ("catching" in expression) {
    return catch_(evalWithBuiltins(expression.calling, names));
  } else if ("quote" in expression) {
    return quote(expression.quote, names);
  } else if ("unquote" in expression) {
    return evalWithBuiltins(
      deepToJsObject(evalWithBuiltins(expression.unquote, names)),
      names
    );
  } else {
    return kpthrow("notAnExpression", ["value", expression]);
  }
}

function selfReferentialScope(enclosingScope, localNames) {
  const localNamesWithContext = kpoMap(localNames, ([name, value]) => [
    name,
    { expression: value },
  ]);
  const scope = new Scope(enclosingScope, localNamesWithContext);
  for (const [_, value] of localNamesWithContext) {
    value.context = scope;
  }
  return scope;
}

function paramSpecToKpValue(paramSpec) {
  return {
    params: (paramSpec.params ?? []).map(paramToKpValue),
    restParam: mapNullable(paramSpec.restParam, paramToKpValue),
    namedParams: (paramSpec.namedParams ?? []).map(paramToKpValue),
    namedRestParam: mapNullable(paramSpec.namedRestParam, paramToKpValue),
  };
}

function paramToKpValue(param) {
  if (param instanceof Map) {
    return param;
  } else if (typeof param === "object") {
    return toKpobject(param);
  } else {
    return param;
  }
}

let tracing = false;

class Tracer {
  constructor() {
    this.indent = "";
  }

  push() {
    this.indent = this.indent + "| ";
  }

  pop() {
    this.indent = this.indent.slice(0, -2);
  }

  trace(text) {
    console.log(this.indent + text);
  }
}

let tracer = new Tracer();

function callOnExpressionsTracing(f, args, namedArgs, names) {
  if (tracing) {
    tracer.trace("Calling " + toString(f));
    tracer.push();
  }
  const result = callOnExpressions(f, args, namedArgs, names);
  if (tracing) {
    tracer.pop();
    tracer.trace("Called " + toString(f));
    tracer.trace("Result was " + toString(result));
  }
  return result;
}

function callOnExpressions(f, args, namedArgs, names) {
  const allArgs = {
    args: evalExpressionArgs(args, names),
    namedArgs: evalExpressionNamedArgs(namedArgs, names),
  };
  if (f instanceof Map && f.has("#given")) {
    return callGiven(f, allArgs, names);
  } else if (typeof f === "function") {
    if (f.isLazy) {
      return callLazyBuiltin(f, allArgs, names);
    } else {
      return callBuiltin(f, allArgs, names);
    }
  } else {
    return f;
  }
}

function evalExpressionArgs(args, names) {
  if (Array.isArray(args)) {
    return args;
  } else {
    return evalWithBuiltins(args, names).map(literal);
  }
}

function evalExpressionNamedArgs(namedArgs, names) {
  if (namedArgs.has("#all")) {
    return kpoMap(
      evalWithBuiltins(namedArgs.get("#all"), names),
      ([name, value]) => [name, literal(value)]
    );
  } else {
    return namedArgs;
  }
}

// For use by the host program.
// This expects already-evaluated arguments, rather than expressions.
export function callOnValues(f, args, namedArgs = kpobject()) {
  const argExpressions = args.map((arg) => literal(arg));
  const namedArgExpressions = kpoMap(namedArgs, ([name, value]) => [
    name,
    literal(value),
  ]);
  const allArgs = {
    args: argExpressions,
    namedArgs: namedArgExpressions,
  };
  if (f instanceof Map && f.has("#given")) {
    return callGiven(f, allArgs, kpobject());
  } else if (typeof f === "function") {
    return callBuiltin(f, allArgs, kpobject());
  } else {
    return f;
  }
}

function callGiven(f, allArgs, names) {
  const allParams = paramsFromGiven(f);
  const args = captureArgContext(allArgs.args, names);
  const namedArgs = captureNamedArgContext(allArgs.namedArgs, names);
  const paramObjects = normalizeAllParams(allParams);
  const schema = createParamSchema(paramObjects);
  const bindings = lazyBind([args, namedArgs], schema);
  if (isThrown(bindings)) {
    return argumentError(paramObjects, bindings);
  }
  return evalWithBuiltins(
    f.get("result"),
    new Scope(f.get("closure"), bindings)
  );
}

export function paramsFromGiven(f) {
  return f.get("#given");
}

class Scope {
  constructor(enclosingScope, localNames) {
    this.enclosingScope = enclosingScope;
    this.localNames = localNames;
  }

  has(key) {
    return this.localNames.has(key) || this.enclosingScope.has(key);
  }

  get(key) {
    if (this.localNames.has(key)) {
      return this.localNames.get(key);
    } else {
      return this.enclosingScope.get(key);
    }
  }

  set(key, value) {
    if (this.localNames.has(key)) {
      this.localNames.set(key, value);
    } else {
      this.enclosingScope.set(key, value);
    }
  }
}

function callBuiltin(f, allArgs, names) {
  const allParams = paramsFromBuiltin(f);
  const args = captureArgContext(allArgs.args, names);
  const namedArgs = captureNamedArgContext(allArgs.namedArgs, names);
  const paramObjects = normalizeAllParams(allParams);
  const schema = createParamSchema(paramObjects);
  const bindings = eagerBind([args, namedArgs], schema);
  if (isThrown(bindings)) {
    return argumentError(paramObjects, bindings);
  }
  const argValues = paramObjects.params.map((param) =>
    force(bindings.get(param.name))
  );
  if (paramObjects.restParam) {
    argValues.push(...bindings.get(paramObjects.restParam.name).map(force));
  }
  const namedArgValues = kpobject(
    ...paramObjects.namedParams.map((param) => [
      param.name,
      force(bindings.get(param.name)),
    ])
  );
  if (paramObjects.namedRestParam) {
    for (const [name, param] of bindings.get(
      paramObjects.namedRestParam.name
    )) {
      namedArgValues.set(name, force(param));
    }
  }
  return f(argValues, namedArgValues);
}

function captureArgContext(args, names) {
  return args.map((arg) => captureContext(arg, names));
}

function captureNamedArgContext(namedArgs, names) {
  return kpoMap(namedArgs, ([name, arg]) => [name, captureContext(arg, names)]);
}

function captureContext(expression, names) {
  return { expression, context: names };
}

function argumentError(paramObjects, err) {
  let updatedErr = err;
  if (updatedErr.get("#thrown") === "badElement") {
    updatedErr = updatedErr.get("reason");
  }
  if (updatedErr.get("#thrown") === "badElement") {
    updatedErr = updatedErr.get("reason");
  }
  if (updatedErr.get("#thrown") === "badElement") {
    updatedErr = kpoMerge(
      updatedErr,
      kpobject(["#thrown", "badArgumentValue"])
    );
  } else if (updatedErr.get("#thrown") === "wrongType") {
    updatedErr = kpoMerge(
      updatedErr,
      kpobject(["#thrown", "wrongArgumentType"])
    );
  } else if (updatedErr.get("#thrown") === "badValue") {
    updatedErr = kpoMerge(
      updatedErr,
      kpobject(["#thrown", "badArgumentValue"])
    );
  } else if (updatedErr.get("#thrown") === "missingElement") {
    updatedErr = kpoMerge(
      updatedErr,
      kpobject(
        ["#thrown", "missingArgument"],
        ["name", paramObjects.params[updatedErr.get("index") - 1].name]
      )
    );
  }
  return updatedErr;
}

function callLazyBuiltin(f, allArgs, names) {
  const allParams = paramsFromBuiltin(f);
  const args = captureArgContext(allArgs.args, names);
  const namedArgs = captureNamedArgContext(allArgs.namedArgs, names);
  const paramObjects = normalizeAllParams(allParams);
  const schema = createParamSchema(paramObjects);
  const bindings = lazyBind([args, namedArgs], schema);
  if (isThrown(bindings)) {
    return argumentError(paramObjects, bindings);
  }
  const restArgs = paramObjects.restParam
    ? force(bindings.get(paramObjects.restParam.name))
    : [];
  const argGetter = {
    arg(name) {
      const argValue = force(bindings.get(name));
      if (isThrown(argValue)) {
        throw argumentError(paramObjects, argValue);
      }
      return argValue;
    },
    numRestArgs: restArgs.length,
    restArg(index) {
      const argValue = force(restArgs[index]);
      if (isThrown(argValue)) {
        throw argumentError(paramObjects, argValue);
      }
      return argValue;
    },
  };
  try {
    return f(argGetter);
  } catch (error) {
    if (isThrown(error)) {
      return error;
    } else {
      throw error;
    }
  }
}

export function paramsFromBuiltin(f) {
  return {
    params: f.params ?? [],
    restParam: f.restParam ?? null,
    namedParams: f.namedParams ?? [],
    namedRestParam: f.namedRestParam ?? null,
  };
}

export function normalizeAllParams(params) {
  return {
    params: params.params.map(normalizeParam),
    restParam: mapNullable(params.restParam, normalizeParam),
    namedParams: params.namedParams.map(normalizeParam),
    namedRestParam: mapNullable(params.namedRestParam, normalizeParam),
  };
}

export function normalizeParam(param) {
  if (typeof param === "string") {
    return { name: param };
  } else if (param instanceof Map) {
    return toJsObject(param);
  } else {
    return param;
  }
}

function createParamSchema(paramObjects) {
  const paramSchema = paramObjects.params.map((param) => {
    let schema = as(param.type ?? "any", param.name);
    if ("defaultValue" in param) {
      schema = default_(schema, captureContext(param.defaultValue));
    }
    return schema;
  });
  if (paramObjects.restParam) {
    paramSchema.push(
      as(
        rest(paramObjects.restParam.type ?? "any"),
        paramObjects.restParam.name
      )
    );
  }
  const namedParamSchema = kpobject(
    ...paramObjects.namedParams.map((param) => {
      let valueSchema = param.type ?? "any";
      if ("defaultValue" in param) {
        valueSchema = default_(valueSchema, captureContext(param.defaultValue));
      }
      return [param.name, valueSchema];
    })
  );
  if (paramObjects.namedRestParam) {
    namedParamSchema.set(
      paramObjects.namedRestParam.name,
      rest(paramObjects.namedRestParam.type ?? "any")
    );
  }
  return [paramSchema, namedParamSchema];
}

function catch_(expression) {
  if (isThrown(expression)) {
    return kpobject(
      ["#error", expression.get("#thrown")],
      ...kpoFilter(expression, ([name, _]) => name !== "#thrown")
    );
  } else {
    return expression;
  }
}

function quote(expression, names) {
  if (typeof expression !== "object") {
    return expression;
  } else if ("unquote" in expression) {
    return deepToKpObject(evalWithBuiltins(expression.unquote, names));
  } else if ("array" in expression) {
    return deepToKpObject(
      array(...expression.array.map((element) => quote(element, names)))
    );
  } else if ("object" in expression) {
    return deepToKpObject(
      object(
        ...expression.object.map(([key, value]) => [
          quote(key, names),
          quote(value, names),
        ])
      )
    );
  } else {
    return deepToKpObject(expression);
  }
}

function deepToKpObject(expression) {
  if (expression === null) {
    return expression;
  } else if (Array.isArray(expression)) {
    return expression.map(deepToKpObject);
  } else if (expression instanceof Map) {
    return expression;
  } else if (typeof expression === "object") {
    return kpoMap(toKpobject(expression), ([key, value]) => [
      key,
      deepToKpObject(value),
    ]);
  } else {
    return expression;
  }
}

export function deepToJsObject(expression) {
  if (expression === null) {
    return expression;
  } else if (Array.isArray(expression)) {
    return expression.map(deepToJsObject);
  } else if (expression instanceof Map) {
    return toJsObject(
      kpoMap(expression, ([key, value]) => [key, deepToJsObject(value)])
    );
  } else {
    return expression;
  }
}

function mapNullable(nullable, f) {
  return nullable === null || nullable === undefined ? null : f(nullable);
}
