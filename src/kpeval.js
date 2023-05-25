import { builtins } from "./builtins.js";
import { array, literal } from "./kpast.js";
import kperror from "./kperror.js";
import kpobject, { kpoMap, kpoMerge, toKpobject } from "./kpobject.js";

export default function kpeval(expression, names = kpobject()) {
  const allNames = kpoMerge(builtins, names);
  return evalWithBuiltins(expression, allNames);
}

function evalWithBuiltins(expression, names) {
  if ("literal" in expression) {
    return expression.literal;
  } else if ("array" in expression) {
    return expression.array.map((element) => kpeval(element, names));
  } else if ("object" in expression) {
    return kpobject(
      ...expression.object.map(([key, value]) => [
        kpeval(key, names),
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
    const kwargs = expression.kwargs ?? kpobject();
    return callOnExpressions(f, args, kwargs, names);
  } else if ("quote" in expression) {
    return quote(expression.quote, names);
  } else {
    return kperror("notAnExpression", ["value", expression]);
  }
}

function callOnExpressions(f, args, kwargs, names) {
  const argValues = args.map((arg) => kpeval(arg, names));
  const kwargValues = kpoMap(kwargs, ([name, value]) => [
    name,
    kpeval(value, names),
  ]);
  return callOnValues(f, argValues, kwargValues);
}

function callOnValues(f, args, kwargs) {
  if (f instanceof Map && f.get("!!given")) {
    const paramBindings = kpobject(
      ...f.get("!!given").params.map((name, i) => [name, args[i]])
    );
    return kpeval(f.get("result"), kpoMerge(paramBindings, kwargs));
  } else {
    return f(args, kwargs);
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
