import { builtins, isError, typeOf } from "./builtins.js";
import { core as coreCode } from "./core.js";
import { array, literal } from "./kpast.js";
import kperror from "./kperror.js";
import kpobject, {
  kpoEntries,
  kpoFilter,
  kpoMap,
  kpoMerge,
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
  const namesWithBuiltins = kpoMerge(builtins, names);
  const namesWithCore = kpoMerge(
    loadCore(namesWithBuiltins),
    namesWithBuiltins
  );
  return evalWithBuiltins(expression, namesWithCore);
}

let core = null;

function loadCore(names) {
  if (!core) {
    // const code = fs.readFileSync("../kenpali/core.kpc", { encoding: "utf-8" });
    const code = coreCode;
    const ast = kpparse(code + "null");
    core = kpoMap(ast.defining, ([name, f]) => [
      name,
      evalWithBuiltins(f, names),
    ]);
  }
  return core;
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
    } else {
      return binding;
    }
  } else if ("defining" in expression) {
    const localNamesWithContext = kpoMap(
      expression.defining,
      ([name, value]) => [name, { expression: value }]
    );
    const combinedNames = kpoMerge(names, localNamesWithContext);
    for (const [_, value] of localNamesWithContext) {
      value.context = combinedNames;
    }
    return evalWithBuiltins(expression.result, combinedNames);
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

function paramSpecToKpValue(paramSpec) {
  return {
    params: (paramSpec.params ?? []).map(paramToKpValue),
    namedParams: (paramSpec.namedParams ?? []).map(paramToKpValue),
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
  if (f instanceof Map && f.has("#given")) {
    const argValues = args.map((arg) => evalArg(arg, names));
    const namedArgValues = kpoMap(namedArgs, ([name, value]) => [
      name,
      evalArg(value, names),
    ]);
    return callGiven(f, argValues, namedArgValues);
  } else if (typeof f === "function") {
    if (f.isLazy) {
      return callLazyBuiltin(f, args, namedArgs, names);
    } else {
      const argValues = args.map((arg) => evalArg(arg, names));
      const namedArgValues = kpoMap(namedArgs, ([name, value]) => [
        name,
        evalArg(value, names),
      ]);
      return callBuiltin(f, argValues, namedArgValues);
    }
  } else {
    const argValues = args.map((arg) => evalArg(arg, names));
    const namedArgValues = kpoMap(namedArgs, ([name, value]) => [
      name,
      evalArg(value, names),
    ]);
    return callNonFunction(f, argValues, namedArgValues);
  }
}

function evalArg(arg, names) {
  if ("optional" in arg) {
    return kpobject(["#optional", evalArg(arg.optional, names)]);
  } else if ("errorPassing" in arg) {
    return kpobject(["#errorPassing", evalArg(arg.errorPassing, names)]);
  } else {
    return evalWithBuiltins(arg, names);
  }
}

export function callOnValues(f, args, namedArgs) {
  if (f instanceof Map && f.has("#given")) {
    return callGiven(f, args, namedArgs);
  } else if (typeof f === "function") {
    return callBuiltin(f, args, namedArgs);
  } else {
    return callNonFunction(f, args, namedArgs);
  }
}

function callGiven(f, args, namedArgs) {
  const params = f.get("#given").params;
  const namedParams = f.get("#given").namedParams;
  const argValues = bindArgs(args, params);
  if (isError(argValues)) {
    return argValues;
  }
  const paramBindings = kpobject(
    ...params.map((param, i) => [
      toParamObject(param).get("name"),
      argValues[i],
    ])
  );
  const namedParamBindings = bindNamedArgs(namedArgs, namedParams);
  if (isError(namedParamBindings)) {
    return namedParamBindings;
  }
  return kpeval(
    f.get("result"),
    kpoMerge(f.get("closure"), paramBindings, namedParamBindings)
  );
}

function callBuiltin(f, args, namedArgs) {
  const params = (f.params ?? []).map(paramToKpValue);
  const restParam = f.restParam ? paramToKpValue(f.restParam) : null;
  const argValues = bindArgs(args, params, restParam);
  if (isError(argValues)) {
    return argValues;
  }
  const namedParams = (f.namedParams ?? []).map(paramToKpValue);
  const namedArgValues = bindNamedArgs(namedArgs, namedParams);
  if (isError(namedArgValues)) {
    return namedArgValues;
  }
  return f(argValues, namedArgValues);
}

function callLazyBuiltin(f, args, namedArgs, names) {
  const argObjects = args.map(toArgObject);
  const params = (f.params ?? []).map(toParamObject).map(paramToKpValue);
  const restParam = f.restParam
    ? paramToKpValue(toParamObject(f.restParam))
    : null;
  const boundArgs = bindArgObjects(argObjects, params, restParam);
  if (isError(boundArgs)) {
    return boundArgs;
  }
  const namedArgObjects = kpoMap(namedArgs, ([name, arg]) => [
    name,
    toArgObject(arg),
  ]);
  const namedParams = (f.namedParams ?? [])
    .map(toParamObject)
    .map(paramToKpValue);
  const namedRestParam = f.namedRestParam
    ? paramToKpValue(toParamObject(f.namedRestParam))
    : null;
  const boundNamedArgs = bindNamedArgObjects(
    namedArgObjects,
    namedParams,
    namedRestParam
  );
  if (isError(boundNamedArgs)) {
    return boundNamedArgs;
  }
  try {
    return f(
      new ArgGetter(
        { args: boundArgs, params, restParam },
        {
          args: boundNamedArgs,
          params: namedParams,
          restParam: namedRestParam,
        },
        names
      )
    );
  } catch (error) {
    if (isError(error)) {
      return error;
    } else {
      throw error;
    }
  }
}

class ArgGetter {
  constructor(positional, named, names) {
    this.args = positional.args;
    this.params = positional.params;
    this.restParam = positional.restParam;

    this.namedArgs = named.args;
    this.namedParams = named.params;
    this.namedRestParam = named.restParam;

    this.names = names;

    this.numArgs = this.args.length;
  }

  arg(index) {
    const argValue = evalArg(this.args[index], this.names);
    const validationResult = validateArg(
      argValue,
      this.params,
      this.restParam,
      index
    );
    if (isError(validationResult)) {
      throw validationResult;
    }
    return argValue;
  }

  namedArg(name) {
    const argValue = evalArg(this.namedArgs.get(name), this.names);
    return argValue;
  }
}

export function bindArgs(args, params, restParam = null) {
  const argObjects = args.map(toArgObject);
  const paramObjects = params.map(toParamObject);
  const restParamObject = restParam === null ? null : toParamObject(restParam);
  const result = bindArgObjects(argObjects, paramObjects, restParamObject);
  if (isError(result)) {
    return result;
  }
  const validationResult = validateArgObjects(
    argObjects,
    paramObjects,
    restParamObject
  );
  if (isError(validationResult)) {
    return validationResult;
  }
  return result;
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

export function bindNamedArgs(args, params, restParam = null) {
  const argObjects = kpoMap(args, ([name, arg]) => [name, toArgObject(arg)]);
  const paramObjects = params.map(toParamObject);
  const restParamObject = restParam === null ? null : toParamObject(restParam);
  const result = bindNamedArgObjects(argObjects, paramObjects, restParamObject);
  if (isError(result)) {
    return result;
  }
  const validationResult = validateNamedArgObjects(
    argObjects,
    paramObjects,
    restParamObject
  );
  if (isError(validationResult)) {
    return validationResult;
  }
  return result;
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

function toArgObject(arg) {
  let value = arg;
  let result = { optional: false, errorPassing: false };
  if (value instanceof Map && value.has("#optional")) {
    value = value.get("#optional");
    result.optional = true;
  }
  if (value instanceof Map && value.has("#errorPassing")) {
    value = value.get("#errorPassing");
    result.errorPassing = true;
  }
  result.value = value;
  return result;
}

function toParamObject(param) {
  if (typeof param === "string") {
    return kpobject(["name", param]);
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

function callNonFunction(f, args, namedArgs) {
  const argObjects = args.map(toArgObject);
  const namedArgObjects = kpoMap(namedArgs, ([name, arg]) => [
    name,
    toArgObject(arg),
  ]);
  if (
    argObjects.filter((arg) => !arg.optional).length === 0 &&
    kpoFilter(namedArgObjects, ([_, arg]) => !arg.optional).size === 0
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
