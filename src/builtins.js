import kperror from "./kperror.js";
import { callOnValues } from "./kpeval.js";
import kpobject, { kpoEntries } from "./kpobject.js";

const rawBuiltins = [
  builtin("plus", ["#rest"], [], function (args) {
    for (const arg of args) {
      if (!isNumber(arg)) {
        return kperror(
          "wrongArgumentType",
          ["function", "plus"],
          ["parameter", "args"],
          ["value", arg],
          ["expectedType", "number"]
        );
      }
    }
    return args.reduce((acc, value) => acc + value, 0);
  }),
  builtin("negative", ["x"], [], function ([x]) {
    if (!isNumber(x)) {
      return kperror(
        "wrongArgumentType",
        ["function", "negative"],
        ["parameter", "x"],
        ["value", x],
        ["expectedType", "number"]
      );
    }
    return -x;
  }),
  builtin("times", ["#rest"], [], function (args) {
    return args.reduce((acc, value) => acc * value, 1);
  }),
  builtin("oneOver", ["x"], [], function ([x]) {
    return 1 / x;
  }),
  builtin("divideWithRemainder", ["a", "b"], [], function ([a, b]) {
    return kpobject(
      ["quotient", Math.floor(a / b)],
      ["remainder", ((a % b) + b) % b]
    );
  }),
  builtin("join", ["#rest"], [], function (args) {
    return args.join("");
  }),
  builtin("equals", ["a", "b"], [], function ([a, b]) {
    return equals(a, b);
  }),
  builtin("isLessThan", ["a", "b"], [], function ([a, b]) {
    if (isArray(a) && isArray(b)) {
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (i >= a.length) {
          return true;
        }
        if (i >= b.length) {
          return false;
        }
        if (a[i] < b[i]) {
          return true;
        }
        if (b[i] < a[i]) {
          return false;
        }
      }
      return false;
    } else {
      return a < b;
    }
  }),
  builtin("typeOf", ["value"], [], function ([value]) {
    return typeOf(value);
  }),
  builtin("toString", ["value"], [], function ([value]) {
    return toString(value);
  }),
  builtin("toNumber", ["value"], [], function ([value]) {
    return parseFloat(value);
  }),
  builtin(
    "if",
    ["condition"],
    ["then", "else"],
    function ([condition], namedArgs) {
      if (condition) {
        return namedArgs.get("then");
      } else {
        return namedArgs.get("else");
      }
    }
  ),
  builtin("repeat", ["start", "step"], [], function ([start, step]) {
    let current = start;
    for (let i = 0; i < 1000; i++) {
      const stepResult = callOnValues(step, [current], kpobject());
      const next = stepResult.get("next");
      if (!stepResult.get("while")) {
        return current;
      }
      current = next;
    }
    return kperror(
      "tooManyIterations",
      ["function", "repeat"],
      ["currentValue", current]
    );
  }),
  builtin("at", ["collection", "index"], [], function ([collection, index]) {
    if (isArray(collection)) {
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
  }),
  builtin("length", ["array"], [], function ([array]) {
    return array.length;
  }),
  builtin("build", ["start", "step"], [], function ([start, step]) {
    const result = [];
    let current = start;
    for (let i = 0; i < 1000; i++) {
      const stepResult = callOnValues(step, [current], kpobject());
      if (!stepResult.has("while")) {
        return kperror(
          "requiredKeyMissing",
          ["function", "build"],
          ["object", stepResult],
          ["key", "while"]
        );
      }
      if (!stepResult.has("next")) {
        return kperror(
          "requiredKeyMissing",
          ["function", "build"],
          ["object", stepResult],
          ["key", "next"]
        );
      }
      const next = stepResult.get("next");
      result.push(stepResult.get("out") ?? next);
      if (!stepResult.get("while")) {
        return result;
      }
      current = next;
    }
    return kperror(
      "tooManyIterations",
      ["function", "build"],
      ["currentValue", current],
      ["lastValuesOfResult", result.slice(-5)]
    );
  }),
];

function builtin(name, params, namedParams, f) {
  f.builtinName = name;
  f.params = params;
  f.namedParams = namedParams;
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

function typeOf(value) {
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

function toString(value) {
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

export const builtins = kpobject(...rawBuiltins.map((f) => [f.builtinName, f]));
