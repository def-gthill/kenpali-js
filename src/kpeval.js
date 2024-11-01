import { as, bind, deepForce, default_, force, rest } from "./bind.js";
import { isError, loadBuiltins, toString } from "./builtins.js";
import { core as coreCode } from "./core.js";
import { array, literal, object } from "./kpast.js";
import kperror, { catch_, errorType, withErrorType } from "./kperror.js";
import kpobject, {
  kpoEntries,
  kpoMap,
  kpoMerge,
  toJsObject,
  toKpobject,
} from "./kpobject.js";
import kpparse from "./kpparse.js";

export function kpevalJson(
  json,
  { names = kpobject(), modules = kpobject() } = {}
) {
  const expressionRaw = JSON.parse(json);
  const expression = toAst(expressionRaw);
  return kpeval(expression, { names, modules });
}

export function toAst(expressionRaw) {
  return transformTree(expressionRaw, {
    handleDefining(node, _recurse, handleDefault) {
      return handleDefault({
        ...node,
        defining: Array.isArray(node.defining)
          ? node.defining
          : toKpobject(node.defining),
      });
    },
    handleCalling(node, _recurse, handleDefault) {
      const result = handleDefault({
        ...node,
        args: node.args,
        namedArgs: node.namedArgs,
      });
      if (result.args.length === 0) {
        delete result.args;
      }
      if (result.namedArgs.length === 0) {
        delete result.namedArgs;
      }
      return result;
    },
  });
}

export default function kpeval(
  expression,
  { names = kpobject(), modules = kpobject(), trace = false } = {}
) {
  tracing = trace;
  validateExpression(expression);
  const builtins = loadBuiltins(modules);
  const withCore = loadCore(builtins);
  const withCustomNames = new Scope(withCore, names);
  return deepForce(catch_(() => evalWithBuiltins(expression, withCustomNames)));
}

function validateExpression(expression) {
  try {
    transformTree(expression, {
      handleOther(node) {
        if (node === null || typeof node !== "object") {
          throw kperror("notAnExpression", ["value", node]);
        }
      },
    });
  } catch (error) {
    if (isError(error)) {
      return error;
    } else {
      throw error;
    }
  }
}

function transformTree(expression, handlers) {
  function recurse(node) {
    return transformTree(node, handlers);
  }

  function transformNode(handlerName, defaultHandler) {
    if (handlerName in handlers) {
      return handlers[handlerName](expression, recurse, defaultHandler);
    } else {
      return defaultHandler(expression);
    }
  }

  if (expression === null || typeof expression !== "object") {
    return transformNode("handleOther", (node) => node);
  } else if ("literal" in expression) {
    return transformNode("handleLiteral", (node) => node);
  } else if ("array" in expression) {
    return transformNode("handleArray", (node) => ({
      ...node,
      array: node.array.map(recurse),
    }));
  } else if ("object" in expression) {
    return transformNode("handleObject", (node) => ({
      ...node,
      object: node.object.map((element) => {
        if ("spread" in element) {
          return recurse(element);
        } else {
          const [key, value] = element;
          return [typeof key === "string" ? key : recurse(key), recurse(value)];
        }
      }),
    }));
  } else if ("name" in expression) {
    return transformNode("handleName", (node) => node);
  } else if ("defining" in expression) {
    return transformNode("handleDefining", (node) => ({
      ...node,
      defining: Array.isArray(node.defining)
        ? node.defining.map(([name, value]) => [
            typeof name === "string" ? name : recurse(name),
            recurse(value),
          ])
        : kpoMap(node.defining, ([name, value]) => [name, recurse(value)]),
      result: recurse(node.result),
    }));
  } else if ("given" in expression) {
    return transformNode("handleGiven", (node) => ({
      ...node,
      result: recurse(node.result),
    }));
  } else if ("calling" in expression) {
    return transformNode("handleCalling", (node) => {
      return {
        ...node,
        calling: recurse(node.calling),
        args: (node.args ?? []).map(recurse),
        namedArgs: (node.namedArgs ?? []).map((element) => {
          if ("spread" in element) {
            return { spread: recurse(element.spread) };
          } else {
            const [name, value] = element;
            return [name, recurse(value)];
          }
        }),
      };
    });
  } else if ("catching" in expression) {
    return transformNode("handleCatching", (node) => ({
      ...node,
      catching: recurse(node.catching),
    }));
  } else if ("expression" in expression) {
    // Special node type that shows up when loading core
    return transformNode("handleExpression", (node) => ({
      ...node,
      expression: recurse(node.expression),
    }));
  } else {
    return transformNode("handleOther", (node) => node);
  }
}

let core = null;

function loadCore(enclosingScope) {
  if (!core) {
    const code = coreCode;
    const ast = kpparse(code + "null");
    core = ast.defining;
  }
  return selfReferentialScope(enclosingScope, core);
}

export function evalWithBuiltins(expression, names) {
  if (expression === null || typeof expression !== "object") {
    throw kperror("notAnExpression", ["value", expression]);
  } else if ("type" in expression) {
    return evalThis[expression.type](expression, names);
  } else if ("literal" in expression) {
    return evalThis.literal(expression, names);
  } else if ("array" in expression) {
    return evalThis.array(expression, names);
  } else if ("object" in expression) {
    return evalThis.object(expression, names);
  } else if ("name" in expression) {
    return evalThis.name(expression, names);
  } else if ("defining" in expression) {
    return evalThis.defining(expression, names);
  } else if ("given" in expression) {
    return evalThis.given(expression, names);
  } else if ("calling" in expression) {
    return evalThis.calling(expression, names);
  } else if ("catching" in expression) {
    return evalThis.catching(expression, names);
  } else if ("quote" in expression) {
    return evalThis.quote(expression, names);
  } else if ("unquote" in expression) {
    return evalThis.unquote(expression, names);
  } else {
    throw kperror("notAnExpression", ["value", expression]);
  }
}

const evalThis = {
  literal(expression) {
    return expression.literal;
  },
  array(expression, names) {
    const result = [];
    for (const element of expression.array) {
      if ("spread" in element) {
        const values = evalWithBuiltins(element.spread, names);
        if (isError(values)) {
          return values;
        }
        result.push(...values);
      } else {
        const value = evalWithBuiltins(element, names);
        if (isError(value)) {
          return value;
        }
        result.push(value);
      }
    }
    return result;
  },
  object(expression, names) {
    const result = [];
    for (const element of expression.object) {
      if ("spread" in element) {
        const entries = evalWithBuiltins(element.spread, names);
        if (isError(entries)) {
          return entries;
        }
        result.push(...kpoEntries(entries));
      } else {
        const [key, value] = element;
        const keyResult =
          typeof key === "string" ? key : evalWithBuiltins(key, names);
        if (isError(keyResult)) {
          return keyResult;
        }
        const valueResult = evalWithBuiltins(value, names);
        if (isError(valueResult)) {
          return valueResult;
        }
        result.push([keyResult, valueResult]);
      }
    }
    return kpobject(...result);
  },
  name(expression, names) {
    if (!names.has(expression.name)) {
      throw kperror("nameNotDefined", ["name", expression.name]);
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
  },
  defining(expression, names) {
    const definedNames = defineNames(expression.defining, names);
    const scope = selfReferentialScope(names, definedNames);
    return evalWithBuiltins(expression.result, scope);
  },
  given(expression, names) {
    const result = kpobject(
      ["#given", paramSpecToKpValue(expression.given)],
      ["result", expression.result],
      ["closure", names]
    );
    if ("binder" in expression) {
      result.set("binder", expression.binder);
    }
    return result;
  },
  calling(expression, names) {
    const f = evalWithBuiltins(expression.calling, names);
    const args = expression.args ?? [];
    const namedArgs = expression.namedArgs ?? kpobject();
    return callOnExpressionsTracing(f, args, namedArgs, names);
  },
  catching(expression, names) {
    return catch_(() => evalWithBuiltins(expression.catching, names));
  },
  quote(expression, names) {
    return quote(expression.quote, names);
  },
  unquote(expression, names) {
    return evalWithBuiltins(
      deepToJsObject(evalWithBuiltins(expression.unquote, names)),
      names
    );
  },
};

function defineNames(definitions, names) {
  let result = kpobject();
  for (const definition of definitions) {
    result = kpoMerge(result, defineNamesInDefinition(definition, names));
  }
  return result;
}

function defineNamesInDefinition(definition, names) {
  const [pattern, value] = definition;
  const schema = createPatternSchema(pattern);
  let forcedValue;
  if (typeof pattern === "string") {
    forcedValue = value;
  } else if ("arrayPattern" in pattern) {
    forcedValue = evalWithBuiltins(value, names).map(literal);
  } else if ("objectPattern" in pattern) {
    forcedValue = kpoMap(evalWithBuiltins(value, names), ([key, value]) => [
      key,
      literal(value),
    ]);
  } else {
    throw kperror("invalidPattern", ["pattern", pattern]);
  }
  const bindings = bind(forcedValue, schema);
  return bindings;
}

function createPatternSchema(pattern) {
  if (typeof pattern === "string") {
    return as("any", pattern);
  } else if ("arrayPattern" in pattern) {
    return pattern.arrayPattern.map(createPatternSchema);
  } else if ("objectPattern" in pattern) {
    return kpobject(
      ...pattern.objectPattern.map((element) => [element, "any"])
    );
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
    return callBuiltin(f, allArgs, names);
  } else {
    throw kperror("notCallable", ["value", f]);
  }
}

function evalExpressionArgs(args, names) {
  const result = [];
  for (const element of args) {
    if ("spread" in element) {
      result.push(...evalWithBuiltins(element.spread, names).map(literal));
    } else {
      result.push(element);
    }
  }
  return result;
}

function evalExpressionNamedArgs(namedArgs, names) {
  const result = [];
  for (const element of namedArgs) {
    if ("spread" in element) {
      result.push(
        ...kpoEntries(evalWithBuiltins(element.spread, names)).map(
          ([name, value]) => [name, literal(value)]
        )
      );
    } else {
      result.push(element);
    }
  }
  return kpobject(...result);
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
    throw kperror("notCallable", ["value", f]);
  }
}

function callGiven(f, allArgs, names) {
  const allParams = paramsFromGiven(f);
  const paramObjects = normalizeAllParams(allParams);
  const args = captureArgContext(allArgs.args, names);
  const namedArgs = captureNamedArgContext(allArgs.namedArgs, names);
  const schema = createParamSchema(paramObjects);
  const bindings = catch_(() =>
    kpoMerge(bind(args, schema[0]), bind(namedArgs, schema[1]))
  );
  if (isError(bindings)) {
    throw argumentErrorGivenParamObjects(paramObjects, bindings);
  }
  return evalWithBuiltins(
    f.get("result"),
    new Scope(f.get("closure") ?? kpobject(), bindings)
  );
}

export function paramsFromGiven(f) {
  return f.get("#given");
}

class Scope {
  constructor(enclosingScope, localNames) {
    if (!enclosingScope) {
      throw new Error(`Invalid enclosing scope: ${enclosingScope}`);
    }
    if (!localNames) {
      throw new Error(`Invalid local names: ${localNames}`);
    }
    this.enclosingScope = enclosingScope;
    this.localNames = localNames;
  }

  *names() {
    for (const name of this.localNames.keys()) {
      yield name;
    }
    if (this.enclosingScope instanceof Scope) {
      for (const name of this.enclosingScope.names()) {
        yield name;
      }
    } else {
      for (const name of this.enclosingScope.keys()) {
        yield name;
      }
    }
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
  const paramObjects = normalizeAllParams(allParams);
  const args = captureArgContext(allArgs.args, names);
  const namedArgs = captureNamedArgContext(allArgs.namedArgs, names);
  const schema = createParamSchema(paramObjects);
  const bindings = catch_(() =>
    kpoMerge(bind(args, schema[0]), bind(namedArgs, schema[1]))
  );
  if (isError(bindings)) {
    throw argumentErrorGivenParamObjects(paramObjects, bindings);
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

function argumentErrorGivenParamObjects(paramObjects, err) {
  return argumentError(
    err,
    paramObjects.params.map((param) => param.name)
  );
}

export function argumentError(err, argumentNames) {
  let updatedErr = err;
  if (errorType(updatedErr) === "badElement") {
    updatedErr = updatedErr.get("reason");
  }
  if (errorType(updatedErr) === "badElement") {
    updatedErr = withErrorType(updatedErr, "badArgumentValue");
  } else if (errorType(updatedErr) === "wrongType") {
    updatedErr = withErrorType(updatedErr, "wrongArgumentType");
  } else if (errorType(updatedErr) === "badValue") {
    updatedErr = withErrorType(updatedErr, "badArgumentValue");
  } else if (errorType(updatedErr) === "missingElement") {
    updatedErr = withErrorType(updatedErr, "missingArgument", [
      "name",
      argumentNames[updatedErr.get("index") - 1],
    ]);
  }
  return updatedErr;
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
  const normalizedParams = params.params.map(normalizeParam);
  const normalizedNamedParams = params.namedParams.map(normalizeParam);
  return {
    params: normalizedParams.filter((param) => !("rest" in param)),
    restParam: normalizedParams.find((param) => "rest" in param)?.rest,
    namedParams: normalizedNamedParams.filter((param) => !("rest" in param)),
    namedRestParam: normalizedNamedParams.find((param) => "rest" in param)
      ?.rest,
  };
}

export function normalizeParam(param) {
  const jsParam = deepToJsObject(param);
  if (typeof jsParam === "string") {
    return { name: jsParam };
  } else if ("rest" in jsParam) {
    return { rest: normalizeParam(jsParam.rest) };
  } else {
    return jsParam;
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
