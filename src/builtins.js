import kperror from "./kperror.js";
import { callOnValues } from "./kpeval.js";
import kpobject, { kpoEntries } from "./kpobject.js";

const rawBuiltins = [
  builtin(
    "plus",
    { restParam: { name: "rest", type: "number" } },
    function (args) {
      return args.reduce((acc, value) => acc + value, 0);
    }
  ),
  builtin(
    "negative",
    { params: [{ name: "x", type: "number" }] },
    function ([x]) {
      return -x;
    }
  ),
  builtin(
    "times",
    { restParam: { name: "rest", type: "number" } },
    function (args) {
      return args.reduce((acc, value) => acc * value, 1);
    }
  ),
  builtin(
    "oneOver",
    { params: [{ name: "x", type: "number" }] },
    function ([x]) {
      return 1 / x;
    }
  ),
  builtin(
    "divideWithRemainder",
    {
      params: [
        { name: "a", type: "number" },
        { name: "b", type: "number" },
      ],
    },
    function ([a, b]) {
      return kpobject(
        ["quotient", Math.floor(a / b)],
        ["remainder", ((a % b) + b) % b]
      );
    }
  ),
  builtin(
    "join",
    { restParam: { name: "rest", type: "string" } },
    function (args) {
      return args.join("");
    }
  ),
  builtin("equals", { params: ["a", "b"] }, function ([a, b]) {
    return equals(a, b);
  }),
  builtin("isLessThan", { params: ["a", "b"] }, function ([a, b]) {
    return isLessThan(a, b);
  }),
  lazyBuiltin(
    "and",
    { restParam: { name: "rest", type: "boolean" } },
    function (argGetter) {
      for (let i = 0; i < argGetter.numRestArgs; i++) {
        if (!argGetter.restArg(i)) {
          return false;
        }
      }
      return true;
    }
  ),
  lazyBuiltin(
    "or",
    { restParam: { name: "rest", type: "boolean" } },
    function (argGetter) {
      for (let i = 0; i < argGetter.numRestArgs; i++) {
        if (argGetter.restArg(i)) {
          return true;
        }
      }
      return false;
    }
  ),
  builtin("not", { params: [{ name: "x", type: "boolean" }] }, function ([x]) {
    return !x;
  }),
  builtin("typeOf", { params: ["value"] }, function ([value]) {
    return typeOf(value);
  }),
  builtin("toString", { params: ["value"] }, function ([value]) {
    return toString(value);
  }),
  builtin("toNumber", { params: ["value"] }, function ([value]) {
    return parseFloat(value);
  }),
  lazyBuiltin(
    "if",
    { params: ["condition"], namedParams: ["then", "else"] },
    function (argGetter) {
      if (argGetter.arg("condition")) {
        return argGetter.arg("then");
      } else {
        return argGetter.arg("else");
      }
    }
  ),
  builtin("repeat", { params: ["start", "step"] }, function ([start, step]) {
    return loop("repeat", start, step, () => {});
  }),
  builtin(
    "at",
    { params: ["collection", "index"] },
    function ([collection, index]) {
      if (isArray(collection)) {
        if (index < 1 || index > collection.length) {
          return kperror(
            "indexOutOfBounds",
            ["function", "at"],
            ["value", collection],
            ["length", collection.length],
            ["index", index]
          );
        }
        return collection[index - 1];
      } else if (isObject(collection)) {
        return collection.get(index);
      } else {
        return kperror(
          "wrongArgumentType",
          ["function", "at"],
          ["parameter", "collection"],
          ["value", collection],
          ["expectedType", "array or object"]
        );
      }
    }
  ),
  builtin("length", { params: ["array"] }, function ([array]) {
    return array.length;
  }),
  builtin("build", { params: ["start", "step"] }, function ([start, step]) {
    const result = [];
    const loopResult = loop("build", start, step, (stepResult) => {
      result.push(stepResult.get("out") ?? stepResult.get("next"));
    });
    if (isError(loopResult)) {
      return loopResult;
    } else {
      return result;
    }
  }),
];

export function builtin(name, paramSpec, f) {
  f.builtinName = name;
  for (const property in paramSpec) {
    f[property] = paramSpec[property];
  }
  return f;
}

function lazyBuiltin(name, paramSpec, f) {
  f.builtinName = name;
  f.isLazy = true;
  for (const property in paramSpec) {
    f[property] = paramSpec[property];
  }
  return f;
}

function equals(a, b) {
  if (isArray(a) && isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    return a.map((a_i, i) => equals(a_i, b[i])).every((x) => x);
  } else if (isObject(a) && isObject(b)) {
    if (a.size !== b.size) {
      return false;
    }
    for (const [key, value] of a) {
      if (!equals(value, b.get(key))) {
        return false;
      }
    }
    return true;
  } else {
    return a === b;
  }
}

function isLessThan(a, b) {
  if (isArray(a) && isArray(b)) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (i >= a.length) {
        return true;
      }
      if (i >= b.length) {
        return false;
      }
      if (isLessThan(a[i], b[i])) {
        return true;
      }
      if (isLessThan(b[i], a[i])) {
        return false;
      }
    }
    return false;
  } else {
    return a < b;
  }
}

export function typeOf(value) {
  if (value === null) {
    return "null";
  } else if (isArray(value)) {
    return "array";
  } else if (isRecord(value)) {
    return "record";
  } else if (isBuiltin(value)) {
    return "builtin";
  } else if (isGiven(value)) {
    return "given";
  } else if (isError(value)) {
    return "error";
  } else {
    return typeof value;
  }
}

export function isBoolean(value) {
  return typeof value === "boolean";
}

function isNumber(value) {
  return typeof value === "number";
}

function isArray(value) {
  return Array.isArray(value);
}

function isRecord(value) {
  return isObject(value) && !isGiven(value) && !isError(value);
}

function isBuiltin(value) {
  return typeof value === "function";
}

function isGiven(value) {
  return isObject(value) && value.has("#given");
}

export function isError(value) {
  return isObject(value) && value.has("#error");
}

function isObject(value) {
  return value instanceof Map;
}

function isFunction(value) {
  return isBuiltin(value) || isGiven(value);
}

export function toString(value) {
  if (isArray(value)) {
    return "[" + value.map(toString).join(", ") + "]";
  } else if (isObject(value)) {
    return (
      "{" +
      kpoEntries(value)
        .map(([k, v]) => `${isValidName(k) ? k : `"${k}"`}: ${toString(v)}`)
        .join(", ") +
      "}"
    );
  } else if (isBuiltin(value)) {
    return `function ${value.builtinName}`;
  } else {
    return JSON.stringify(value);
  }
}

function isValidName(string) {
  return /^[A-Za-z][A-Za-z0-9]*$/.test(string);
}

function loop(functionName, start, step, callback) {
  let current = start;
  for (let i = 0; i < 1000; i++) {
    const stepResult = callOnValues(step, [current], kpobject());
    const whileCondition = stepResult.has("while")
      ? stepResult.get("while")
      : true;
    if (!isBoolean(whileCondition)) {
      return kperror(
        "wrongElementType",
        ["function", functionName],
        ["object", stepResult],
        ["key", "while"],
        ["value", whileCondition],
        ["expectedType", "boolean"]
      );
    }
    if (!whileCondition) {
      return current;
    }
    const continueIf = stepResult.has("continueIf")
      ? stepResult.get("continueIf")
      : true;
    if (!isBoolean(continueIf)) {
      return kperror(
        "wrongElementType",
        ["function", functionName],
        ["object", stepResult],
        ["key", "continueIf"],
        ["value", continueIf],
        ["expectedType", "boolean"]
      );
    }
    if (!stepResult.has("next")) {
      return kperror(
        "requiredKeyMissing",
        ["function", functionName],
        ["object", stepResult],
        ["key", "next"]
      );
    }
    callback(stepResult);
    const next = stepResult.get("next");
    if (isError(next)) {
      return kperror(
        "errorInIteration",
        ["function", functionName],
        ["currentValue", current],
        ["error", next]
      );
    }
    if (!continueIf) {
      return next;
    }
    current = next;
  }
  return kperror(
    "tooManyIterations",
    ["function", functionName],
    ["currentValue", current]
  );
}

export const builtins = kpobject(...rawBuiltins.map((f) => [f.builtinName, f]));
