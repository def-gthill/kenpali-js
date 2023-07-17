import fs from "fs";
import { builtins, isError } from "./builtins.js";
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
    const code = fs.readFileSync("../kenpali/core.kpc", { encoding: "utf-8" });
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
    return expression.array.map((element) => kpeval(element, names));
  } else if ("object" in expression) {
    return kpobject(
      ...expression.object.map(([key, value]) => [
        typeof key === "string" ? key : kpeval(key, names),
        kpeval(value, names),
      ])
    );
  } else if ("name" in expression) {
    if (!names.has(expression.name)) {
      return kperror("nameNotDefined", ["name", expression.name]);
    }
    const binding = names.get(expression.name);
    if (typeof binding === "object" && "expression" in binding) {
      return kpeval(binding.expression, binding.context);
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
    return kpeval(expression.result, combinedNames);
  } else if ("given" in expression) {
    return kpobject(
      ["#given", expression.given],
      ["result", expression.result],
      ["closure", names]
    );
  } else if ("calling" in expression) {
    const f = kpeval(expression.calling, names);
    const args = expression.args ?? [];
    const namedArgs = expression.namedArgs ?? kpobject();
    return callOnExpressions(f, args, namedArgs, names);
  } else if ("quote" in expression) {
    return quote(expression.quote, names);
  } else {
    return kperror("notAnExpression", ["value", expression]);
  }
}

function callOnExpressions(f, args, namedArgs, names) {
  const argValues = args.map((arg) => evalArg(arg, names));
  const namedArgValues = kpoMap(namedArgs, ([name, value]) => [
    name,
    evalArg(value, names),
  ]);
  return callOnValues(f, argValues, namedArgValues);
}

function evalArg(arg, names) {
  if ("optional" in arg) {
    return kpobject(["#optional", evalArg(arg.optional, names)]);
  } else if ("errorPassing" in arg) {
    return kpobject(["#errorPassing", evalArg(arg.errorPassing, names)]);
  } else {
    return kpeval(arg, names);
  }
}

export function callOnValues(f, args, namedArgs) {
  if (f instanceof Map && f.has("#given")) {
    const params = f.get("#given").params ?? [];
    const namedParams = f.get("#given").namedParams ?? [];
    const argValues = bindArgs(args, params);
    if (isError(argValues)) {
      return argValues;
    }
    const paramBindings = kpobject(
      ...(params ?? []).map((name, i) => [name, argValues[i]])
    );
    const namedParamBindings = bindNamedArgs(namedArgs, namedParams);
    if (isError(namedParamBindings)) {
      return namedParamBindings;
    }
    return kpeval(
      f.get("result"),
      kpoMerge(f.get("closure"), paramBindings, namedParamBindings)
    );
  } else if (typeof f === "function") {
    if ("params" in f) {
      const params = f.params;
      const namedParams = f.namedParams;
      const argValues = bindArgs(args, params);
      if (isError(argValues)) {
        return argValues;
      }
      const namedArgValues = bindNamedArgs(namedArgs, namedParams);
      if (isError(namedArgValues)) {
        return namedArgValues;
      }
      return f(argValues, namedArgValues);
    } else {
      const argObjects = args.map(toArgObject);
      const argValues = [];
      for (const arg of argObjects) {
        if (!arg.errorPassing && isError(arg.value)) {
          return arg.value;
        }
        argValues.push(arg.value);
      }
      const namedArgObjects = kpoMap(namedArgs, ([name, arg]) => [
        name,
        toArgObject(arg),
      ]);
      const namedArgValues = kpobject();
      for (const [name, arg] of kpoEntries(namedArgObjects)) {
        if (!arg.errorPassing && isError(arg.value)) {
          return arg.value;
        }
        namedArgValues.set(name, arg.value);
      }
      return f(argValues, namedArgValues);
    }
  } else {
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
}

export function bindArgs(args, params) {
  return bindArgObjects(args.map(toArgObject), params.map(toParamObject));
}

function bindArgObjects(args, params) {
  const hasRest = params.at(-1)?.name === "#rest";
  let numRequiredParams = params.findIndex((param) => "defaultValue" in param);
  if (numRequiredParams === -1) {
    numRequiredParams = params.length;
    if (hasRest) {
      numRequiredParams -= 1;
    }
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
    : params.slice(args.length).map((param) => param.defaultValue);
  return [...argsToBind.map((arg) => arg.value), ...defaults];
}

export function bindNamedArgs(args, params) {
  return bindNamedArgObjects(
    kpoMap(args, ([name, arg]) => [name, toArgObject(arg)]),
    params.map(toParamObject)
  );
}

function bindNamedArgObjects(args, params) {
  const hasRest = params.some((param) => param.name === "#rest");
  const defaults = kpobject();
  for (const param of params) {
    if (param.name === "#rest") {
      continue;
    }
    if (!args.has(param.name)) {
      if ("defaultValue" in param) {
        defaults.set(param.name, param.defaultValue);
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
  for (const [name, arg] of kpoEntries(args)) {
    if (hasRest || params.some((param) => param.name === name)) {
      if (!arg.errorPassing && isError(arg.value)) {
        return arg.value;
      }
      argsToBind.set(name, arg.value);
    }
  }
  return kpoMerge(argsToBind, defaults);
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
  if (Array.isArray(param)) {
    const [name, defaultValue] = param;
    return { name, defaultValue };
  } else {
    return { name: param };
  }
}

function quote(expression, names) {
  if ("unquote" in expression) {
    return toKpobject(literal(kpeval(expression.unquote, names)));
  } else if ("array" in expression) {
    return toKpobject(
      array(...expression.array.map((element) => quote(element, names)))
    );
  } else {
    return toKpobject(expression);
  }
}
