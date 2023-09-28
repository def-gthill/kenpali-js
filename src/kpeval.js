import { builtins, isError, typeOf } from "./builtins.js";
import { core as coreCode } from "./core.js";
import { array, literal } from "./kpast.js";
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

export default function kpeval(expression, names = kpobject()) {
  const withCore = loadCore(builtins);
  const withCustomNames = new Scope(withCore, names);
  return evalWithBuiltins(expression, withCustomNames);
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

let coreScope = null;

function loadCore(enclosingScope) {
  if (!coreScope) {
    const code = coreCode;
    const ast = kpparse(code + "null");
    coreScope = selfReferentialScope(enclosingScope, ast.defining);
  }
  return coreScope;
}

function evalWithBuiltins(expression, names) {
  if ("literal" in expression) {
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
      return binding.thunk();
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
    return callOnExpressions(f, args, namedArgs, names);
  } else if ("quote" in expression) {
    return quote(expression.quote, names);
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

function callOnExpressions(f, args, namedArgs, names) {
  const allArgs = { args, namedArgs };
  if (f instanceof Map && f.has("#given")) {
    return callGiven(f, allArgs, names);
  } else if (typeof f === "function") {
    if (f.isLazy) {
      return callLazyBuiltin(f, allArgs, names);
    } else {
      return callBuiltin(f, allArgs, names);
    }
  } else {
    return callNonFunction(f, allArgs);
  }
}

function evalArg(arg, names) {
  if ("optional" in arg) {
    return { optional: evalArg(arg.optional, names) };
  } else if ("errorPassing" in arg) {
    return { errorPassing: evalArg(arg.errorPassing, names) };
  } else {
    return evalWithBuiltins(arg, names);
  }
}

function evalAllArgs(args, names) {
  const argValues = args.args.map((arg) => ({
    ...arg,
    value: evalWithBuiltins(arg.value, names),
  }));
  const namedArgValues = kpoMap(args.namedArgs, ([name, arg]) => [
    name,
    {
      ...arg,
      value: evalWithBuiltins(arg.value, names),
    },
  ]);
  return {
    args: argValues,
    namedArgs: namedArgValues,
  };
}

// For use by the host program.
// This expects already-evaluated arguments, rather than expressions.
export function callOnValues(f, args, namedArgs) {
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
        result.push(() => argGetter.restArg(i));
      }
      return [name, { restParamThunks: result }];
    } else {
      return [name, { thunk: () => argGetter.arg(name) }];
    }
  });
}

function callBuiltin(f, allArgs, names) {
  const allParams = paramsFromBuiltin(f);
  const paramObjects = paramsToKpobjects(normalizeAllParams(allParams));
  const argObjects = normalizeAllArgs(allArgs);
  const allArgValues = evalAllArgs(argObjects, names);
  const argValues = bindArgObjects(
    allArgValues.args,
    paramObjects.params,
    paramObjects.restParam
  );
  if (isError(argValues)) {
    return argValues;
  }
  const validationResult = validateArgObjects(
    allArgValues.args,
    paramObjects.params,
    paramObjects.restParam
  );
  if (isError(validationResult)) {
    return validationResult;
  }
  const namedArgValues = bindNamedArgObjects(
    allArgValues.namedArgs,
    paramObjects.namedParams,
    paramObjects.namedRestParam
  );
  if (isError(namedArgValues)) {
    return namedArgValues;
  }
  const namedValidationResult = validateNamedArgObjects(
    allArgValues.namedArgs,
    paramObjects.namedParams,
    paramObjects.namedRestParam
  );
  if (isError(namedValidationResult)) {
    return namedValidationResult;
  }
  return f(argValues, namedArgValues);
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

    this.restParam = this.paramObjects.restParam;
    this.restArgs = this.bindings.get(this.restParam?.name) ?? [];
    this.numRestArgs = this.restArgs.length;
  }

  restArg(index) {
    const arg = this.restArgs[index];
    const argValue = evalArg(arg, this.names);
    const typeError = checkType_NEW(argValue, toKpobject(this.restParam));
    if (typeError) {
      throw typeError;
    }
    return argValue;
  }

  arg(name) {
    const argValue = evalArg(this.bindings.get(name), this.names);
    return argValue;
  }
}

export function bindArgs(args, params) {
  const kpParams = paramsToKpobjects(params);
  const acceptedArgs = bindArgObjects(
    args.args,
    kpParams.params,
    kpParams.restParam
  );
  if (isError(acceptedArgs)) {
    return acceptedArgs;
  }
  const paramBindings = kpobject(
    ...kpParams.params.map((param, i) => [
      toParamObject(param).get("name"),
      acceptedArgs[i],
    ])
  );
  if (kpParams.restParam) {
    paramBindings.set(
      toParamObject(kpParams.restParam).get("name"),
      acceptedArgs.slice(kpParams.params.length)
    );
  }
  const namedParamBindings = bindNamedArgObjects(
    args.namedArgs,
    kpParams.namedParams,
    kpParams.namedRestParam
  );
  if (isError(namedParamBindings)) {
    return namedParamBindings;
  }
  return kpoMerge(paramBindings, namedParamBindings);
}

function bindArgObjects(args, params, restParam) {
  const hasRest = restParam !== null;
  let numRequiredParams = params.findIndex((param) =>
    param.has("defaultValue")
  );
  if (numRequiredParams === -1) {
    numRequiredParams = params.length;
  }
  if (args.length < numRequiredParams) {
    return kperror("missingArgument", [
      "name",
      params[args.length].get("name"),
    ]);
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
    : params.slice(args.length).map((param) => param.get("defaultValue"));
  return [...argsToBind.map((arg) => arg.value), ...defaults];
}

function validateArgObjects(args, params, restParam) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const validationResult = validateArg(arg.value, params, restParam, i);
    if (isError(validationResult)) {
      return validationResult;
    }
  }
  return null;
}

function validateArg(arg, params, restParam, i) {
  const hasRest = restParam !== null;
  if (i >= params.length) {
    if (hasRest) {
      const typeError = checkType_NEW(arg, restParam);
      if (typeError) {
        return typeError;
      }
    }
  } else {
    const param = params[i];
    const typeError = checkType_NEW(arg, param);
    if (typeError) {
      return typeError;
    }
  }
  return null;
}

function bindNamedArgObjects(args, params, restParam) {
  const hasRest = restParam !== null;
  const defaults = kpobject();
  for (const param of params) {
    if (param.get("name") === "#rest") {
      continue;
    }
    if (!args.has(param.get("name"))) {
      if (param.has("defaultValue")) {
        defaults.set(param.get("name"), param.get("defaultValue"));
      } else {
        return kperror("missingArgument", ["name", param.get("name")]);
      }
    }
  }
  if (!hasRest) {
    for (const [name, arg] of kpoEntries(args)) {
      if (
        !arg.optional &&
        !params.some((param) => param.get("name") === name)
      ) {
        return kperror(
          "unexpectedArgument",
          ["name", name],
          ["value", arg.value]
        );
      }
    }
  }
  const argsToBind = kpobject();
  for (const [name, arg] of kpoEntries(args)) {
    if (hasRest || params.some((param) => param.get("name") === name)) {
      argsToBind.set(name, arg.value);
    }
  }
  return kpoMerge(argsToBind, defaults);
}

function validateNamedArgObjects(args, params, restParam) {
  const hasRest = restParam !== null;
  for (const [name, arg] of kpoEntries(args)) {
    if (hasRest || params.some((param) => param.get("name") === name)) {
      if (!arg.errorPassing && isError(arg.value)) {
        return arg.value;
      }
      const param =
        params.find((param) => param.get("name") === name) ?? restParam;
      const typeError = checkType(arg, param);
      if (typeError) {
        return typeError;
      }
    }
  }
  return null;
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

function toParamObject(param) {
  return toKpobject(normalizeParam(param));
}

function paramsToKpobjects(params) {
  return {
    params: params.params.map(toKpobject),
    restParam: mapNullable(params.restParam, toKpobject),
    namedParams: params.namedParams.map(toKpobject),
    namedRestParam: mapNullable(params.namedRestParam, toKpobject),
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

function checkType(arg, param) {
  if (param.has("type") && typeOf(arg.value) !== param.get("type")) {
    return kperror(
      "wrongArgumentType",
      ["parameter", param.get("name")],
      ["value", arg.value],
      ["expectedType", param.get("type")]
    );
  }
}

function checkType_NEW(arg, param) {
  if (param.has("type") && typeOf(arg) !== param.get("type")) {
    return kperror(
      "wrongArgumentType",
      ["parameter", param.get("name")],
      ["value", arg],
      ["expectedType", param.get("type")]
    );
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

function quote(expression, names) {
  if ("unquote" in expression) {
    return toKpobject(literal(evalWithBuiltins(expression.unquote, names)));
  } else if ("array" in expression) {
    return toKpobject(
      array(...expression.array.map((element) => quote(element, names)))
    );
  } else {
    return toKpobject(expression);
  }
}

function mapNullable(nullable, f) {
  return nullable === null || nullable === undefined ? null : f(nullable);
}
