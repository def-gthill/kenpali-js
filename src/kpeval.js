import fs from "fs";
import { builtins } from "./builtins.js";
import { array, literal } from "./kpast.js";
import kperror from "./kperror.js";
import kpobject, { kpoMap, kpoMerge, toKpobject } from "./kpobject.js";
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
    const binding = names.get(expression.name);
    if (!binding) {
      return kperror("nameNotDefined", ["name", expression.name]);
    }
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
    for (const [_, value] of combinedNames) {
      value.context = combinedNames;
    }
    return kpeval(expression.result, combinedNames);
  } else if ("given" in expression) {
    return kpobject(
      ["!!given", expression.given],
      ["result", expression.result]
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
  const argValues = args.map((arg) => kpeval(arg, names));
  const namedArgValues = kpoMap(namedArgs, ([name, value]) => [
    name,
    kpeval(value, names),
  ]);
  return callOnValues(f, argValues, namedArgValues);
}

function callOnValues(f, args, namedArgs) {
  if (f instanceof Map && f.get("!!given")) {
    const paramBindings = kpobject(
      ...(f.get("!!given").params ?? []).map((name, i) => [name, args[i]])
    );
    return kpeval(f.get("result"), kpoMerge(paramBindings, namedArgs));
  } else if (typeof f === "function") {
    return f(args, namedArgs);
  } else {
    return kperror("notCallable", ["value", f]);
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
