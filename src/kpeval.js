import {
  as,
  builtins,
  default_,
  force,
  isError,
  lazyBind,
  matches,
  rest,
  toString,
} from "./builtins.js";
import { core as coreCode } from "./core.js";
import { array, literal, object } from "./kpast.js";
import kperror from "./kperror.js";
import kpobject, {
  kpoEntries,
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
  return evalWithBuiltins(expression, withCustomNames);
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
    return kperror("notAnExpression", ["value", expression]);
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
      return kperror("nameNotDefined", ["name", expression.name]);
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
  } else if ("quote" in expression) {
    return quote(expression.quote, names);
  } else if ("unquote" in expression) {
    return evalWithBuiltins(
      deepToJsObject(evalWithBuiltins(expression.unquote, names)),
      names
    );
  } else {
    return kperror("notAnExpression", ["value", expression]);
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

const newBinding = true;

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
      if (newBinding) {
        return callBuiltin_NEW(f, allArgs, names);
      } else {
        return callBuiltin(f, allArgs, names);
      }
    }
  } else {
    return callNonFunction(f, allArgs);
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
    return callNonFunction(f, allArgs);
  }
}

function callGiven(f, allArgs, names) {
  const allParams = paramsFromGiven(f);
  const paramObjects = normalizeAllParams(allParams);
  const argObjects = normalizeAllArgs(allArgs);
  const bindings = bindArgs(argObjects, paramObjects);
  if (isError(bindings)) {
    return bindings;
  }
  const thunks = bindingsToThunks(paramObjects, bindings, names);
  return evalWithBuiltins(f.get("result"), new Scope(f.get("closure"), thunks));
}

export function paramsFromGiven(f) {
  return f.get("#given");
}

function bindingsToThunks(paramObjects, bindings, names) {
  const argGetter = new ArgGetter(paramObjects, bindings, names);
  return kpoMap(bindings, ([name, _]) => {
    if (name === argGetter.restParam?.name) {
      const result = [];
      for (let i = 0; i < argGetter.numRestArgs; i++) {
        result.push(() => argGetter.restArgCatching(i));
      }
      return [name, { restParamThunks: result }];
    } else {
      return [name, { thunk: () => argGetter.argCatching(name) }];
    }
  });
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
  const paramObjects = normalizeAllParams(allParams);
  const argObjects = normalizeAllArgs(allArgs);
  const bindings = bindArgs(argObjects, paramObjects);
  if (isError(bindings)) {
    return bindings;
  }
  const bindingValues = evalBindings(bindings, names);
  const validationError = validateBindings(paramObjects, bindingValues);
  if (validationError) {
    return validationError;
  }
  const [argValues, namedArgValues] = bindingValuesToBuiltinArgs(
    paramObjects,
    bindingValues
  );
  return f(argValues, namedArgValues);
}

function callBuiltin_NEW(f, allArgs, names) {
  const allParams = paramsFromBuiltin(f);
  // console.log(allParams);
  // console.log("All args");
  // console.log(allArgs);
  const args = captureArgContext(allArgs.args, names);
  // console.log("Args");
  // console.log(args);
  const namedArgs = captureNamedArgContext(allArgs.namedArgs, names);
  // console.log("Named Args");
  // console.log(namedArgs);
  const paramObjects = normalizeAllParams(allParams);
  // console.log("Param Objects");
  // console.log(paramObjects);
  const paramSchema = paramObjects.params.map((param) =>
    as(param.type ?? "any", param.name)
  );
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
  // console.log("Param Schema");
  // console.log(paramSchema);
  // console.log("Named Param Schema");
  // console.log(namedParamSchema);
  const schema = [paramSchema, namedParamSchema];
  const bindings = lazyBind([args, namedArgs], schema);
  // console.log("Bindings");
  // console.log(bindings);
  if (isError(bindings)) {
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
  // console.log(argValues);
  // console.log(namedArgValues);
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
  if (updatedErr.get("#error") === "badElement") {
    updatedErr = updatedErr.get("reason");
  }
  if (updatedErr.get("#error") === "badElement") {
    updatedErr = updatedErr.get("reason");
  }
  if (updatedErr.get("#error") === "badElement") {
    updatedErr = kpoMerge(updatedErr, kpobject(["#error", "badArgumentValue"]));
  } else if (updatedErr.get("#error") === "wrongType") {
    updatedErr = kpoMerge(
      updatedErr,
      kpobject(["#error", "wrongArgumentType"])
    );
  } else if (updatedErr.get("#error") === "badValue") {
    updatedErr = kpoMerge(updatedErr, kpobject(["#error", "badArgumentValue"]));
  } else if (updatedErr.get("#error") === "missingElement") {
    updatedErr = kpoMerge(
      updatedErr,
      kpobject(
        ["#error", "missingArgument"],
        ["name", paramObjects.params[updatedErr.get("index") - 1].name]
      )
    );
  }
  return updatedErr;
}

function evalBindings(bindings, names) {
  return kpoMap(bindings, ([name, binding]) => [
    name,
    evalBinding(binding, names),
  ]);
}

function evalBinding(binding, names) {
  if (binding instanceof Map) {
    return kpoMap(binding, ([name, expression]) => [
      name,
      evalArg(expression, names),
    ]);
  } else if (Array.isArray(binding)) {
    return binding.map((expression) => evalArg(expression, names));
  } else {
    return evalArg(binding, names);
  }
}

function evalArg(arg, names) {
  return { ...arg, value: evalWithBuiltins(arg.value, names) };
}

function bindingValuesToBuiltinArgs(paramObjects, bindingValues) {
  const argValues = [
    ...paramObjects.params.map((param) => bindingValues.get(param.name)),
    ...(bindingValues.get(paramObjects.restParam?.name) ?? []),
  ].map((binding) => binding.value);
  const namedArgValues = kpoMap(
    kpobject(
      ...paramObjects.namedParams.map((param) => [
        param.name,
        bindingValues.get(param.name),
      ]),
      ...(bindingValues.get(paramObjects.namedRestParam?.name) ?? kpobject())
    ),
    ([name, binding]) => [name, binding.value]
  );
  return [argValues, namedArgValues];
}

function callLazyBuiltin(f, allArgs, names) {
  const allParams = paramsFromBuiltin(f);
  const paramObjects = normalizeAllParams(allParams);
  const argObjects = normalizeAllArgs(allArgs);
  const bindings = bindArgs(argObjects, paramObjects);
  if (isError(bindings)) {
    return bindings;
  }
  try {
    return f(new ArgGetter(paramObjects, bindings, names));
  } catch (error) {
    if (isError(error)) {
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

class ArgGetter {
  constructor(paramObjects, bindings, names) {
    this.paramObjects = paramObjects;
    this.bindings = bindings;

    this.names = names;

    this.paramObjectsByName = new Map();
    for (const param of this.paramObjects.params) {
      this.paramObjectsByName.set(param.name, param);
    }
    for (const param of this.paramObjects.namedParams) {
      this.paramObjectsByName.set(param.name, param);
    }

    this.restParam = this.paramObjects.restParam;
    this.restArgs = this.bindings.get(this.restParam?.name) ?? [];
    this.numRestArgs = this.restArgs.length;
  }

  restArg(index) {
    const argBinding = this.restArgs[index];
    const argValue = evalBinding(argBinding, this.names);
    const typeError = validateBinding(this.restParam, argValue);
    if (typeError) {
      throw typeError;
    }
    return argValue.value;
  }

  restArgCatching(index) {
    try {
      return this.restArg(index);
    } catch (error) {
      if (isError(error)) {
        return error;
      } else {
        throw error;
      }
    }
  }

  arg(name) {
    const argBinding = this.bindings.get(name);
    const argValue = evalBinding(argBinding, this.names);
    const typeError = validateBinding(
      this.paramObjectsByName.get(name),
      argValue
    );
    if (typeError) {
      throw typeError;
    }
    return argValue.value;
  }

  argCatching(name) {
    try {
      return this.arg(name);
    } catch (error) {
      if (isError(error)) {
        return error;
      } else {
        throw error;
      }
    }
  }
}

function callNonFunction(f, allArgs) {
  const argObjects = normalizeAllArgs(allArgs);
  if (
    argObjects.args.filter((arg) => !arg.optional).length === 0 &&
    kpoFilter(argObjects.namedArgs, ([_, arg]) => !arg.optional).size === 0
  ) {
    return f;
  } else {
    return kperror("notCallable", ["value", f]);
  }
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

export function normalizeAllArgs(args) {
  return {
    args: args.args.map(normalizeArg),
    namedArgs: kpoMap(args.namedArgs, ([name, value]) => [
      name,
      normalizeArg(value),
    ]),
  };
}

export function normalizeArg(arg) {
  let value = arg;
  const result = { optional: false, errorPassing: false };
  if ("optional" in value) {
    value = value.optional;
    result.optional = true;
  }
  if ("errorPassing" in value) {
    value = value.errorPassing;
    result.errorPassing = true;
  }
  result.value = value;
  return result;
}

export function bindArgs(args, params) {
  const acceptedArgs = bindArgObjects(
    args.args,
    params.params,
    params.restParam
  );
  if (isError(acceptedArgs)) {
    return acceptedArgs;
  }
  const paramBindings = kpobject(
    ...params.params.map((param, i) => [param.name, acceptedArgs[i]])
  );
  if (params.restParam) {
    paramBindings.set(
      params.restParam.name,
      acceptedArgs.slice(params.params.length)
    );
  }
  const namedParamBindings = bindNamedArgObjects(
    args.namedArgs,
    params.namedParams,
    params.namedRestParam
  );
  if (isError(namedParamBindings)) {
    return namedParamBindings;
  }
  return kpoMerge(paramBindings, namedParamBindings);
}

function bindArgObjects(args, params, restParam) {
  const hasRest = restParam !== null;
  let numRequiredParams = params.findIndex((param) => "defaultValue" in param);
  if (numRequiredParams === -1) {
    numRequiredParams = params.length;
  }
  if (args.length < numRequiredParams) {
    return kperror("missingArgument", ["name", params[args.length].name]);
  }
  if (!hasRest) {
    let numRequiredArgs = args.findIndex((arg) => arg.optional);
    if (numRequiredArgs === -1) {
      numRequiredArgs = args.length;
    }
    if (numRequiredArgs > params.length) {
      return kperror(
        "unexpectedArgument",
        ["position", params.length + 1],
        ["value", args[params.length].value]
      );
    }
  }
  const argsToBind = hasRest ? args : args.slice(0, params.length);
  for (const arg of argsToBind) {
    if (!arg.errorPassing && isError(arg.value)) {
      return arg.value;
    }
  }
  const defaults = hasRest
    ? []
    : params.slice(args.length).map((param) => ({ value: param.defaultValue }));
  return [...argsToBind, ...defaults];
}

function bindNamedArgObjects(args, params, restParam) {
  const hasRest = restParam !== null;
  const defaults = kpobject();
  for (const param of params) {
    if (!args.has(param.name)) {
      if ("defaultValue" in param) {
        defaults.set(param.name, { value: param.defaultValue });
      } else {
        return kperror("missingArgument", ["name", param.name]);
      }
    }
  }
  if (!hasRest) {
    for (const [name, arg] of kpoEntries(args)) {
      if (!arg.optional && !params.some((param) => param.name === name)) {
        return kperror(
          "unexpectedArgument",
          ["name", name],
          ["value", arg.value]
        );
      }
    }
  }
  const argsToBind = kpobject();
  const restArgs = kpobject();
  for (const [name, arg] of kpoEntries(args)) {
    if (params.some((param) => param.name === name)) {
      argsToBind.set(name, arg);
    } else {
      restArgs.set(name, arg);
    }
  }
  if (hasRest) {
    argsToBind.set(restParam.name, restArgs);
  }
  return kpoMerge(argsToBind, defaults);
}

function validateBindings(paramObjects, bindings) {
  for (const param of paramObjects.params) {
    const error = validateBinding(param, bindings.get(param.name));
    if (error) {
      return error;
    }
  }
  if (paramObjects.restParam) {
    for (const binding of bindings.get(paramObjects.restParam.name)) {
      const error = validateBinding(paramObjects.restParam, binding);
      if (error) {
        return error;
      }
    }
  }
}

function validateBinding(paramObject, binding) {
  const errorShortCircuit = checkErrorShortCircuit(binding, paramObject);
  if (errorShortCircuit) {
    return errorShortCircuit;
  }
  const typeError = checkType(binding.value, paramObject);
  if (typeError) {
    return typeError;
  }
}

function checkType(arg, param) {
  if ("type" in param && !matches(arg, param.type)) {
    return kperror(
      "wrongArgumentType",
      ["parameter", param.name],
      ["value", arg],
      ["expectedType", param.type]
    );
  }
}

function checkErrorShortCircuit(arg) {
  if (isError(arg.value) && !arg.errorPassing) {
    return arg.value;
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
