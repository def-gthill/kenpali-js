import kperror from "./kperror.js";
import { callOnValues } from "./kpeval.js";
import kpobject, { kpoEntries } from "./kpobject.js";

export const rawBuiltins = {
  plus: (args) => args.reduce((acc, value) => acc + value, 0),
  negative: ([x]) => -x,
  times: (args) => args.reduce((acc, value) => acc * value, 1),
  oneOver: ([x]) => 1 / x,
  divideWithRemainder: ([a, b]) =>
    kpobject(["quotient", Math.floor(a / b)], ["remainder", ((a % b) + b) % b]),
  join(args) {
    return args.join("");
  },
  equals([a, b]) {
    return equals(a, b);
  },
  isLessThan([a, b]) {
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
  },
  typeOf([value]) {
    return typeOf(value);
  },
  toString([value]) {
    return toString(value);
  },
  toNumber([value]) {
    return parseFloat(value);
  },
  if([condition], namedArgs) {
    if (condition) {
      return namedArgs.get("then");
    } else {
      return namedArgs.get("else");
    }
  },
  repeat([start, step]) {
    let current = start;
    for (let i = 0; i < 1000; i++) {
      const stepResult = callOnValues(step, [current], kpobject());
      const next = stepResult.get("next");
      if (!stepResult.get("while")) {
        return current;
      }
      current = next;
    }
    return kperror("tooManyIterations", [
      ["function", "repeat"],
      ["currentValue", current],
    ]);
  },
  at([collection, index]) {
    if (isArray(collection)) {
      return collection[index - 1];
    } else if (isObject(collection)) {
      return collection.get(index);
    } else {
      return kperror("wrongArgumentType", [
        ["function", "at"],
        ["parameter", "collection"],
        ["value", collection],
        ["expectedType", "array or object"],
      ]);
    }
  },
  length([array]) {
    return array.length;
  },
  build([start, step]) {
    const result = [];
    let current = start;
    for (let i = 0; i < 1000; i++) {
      const stepResult = callOnValues(step, [current], kpobject());
      if (!stepResult.has("while")) {
        return kperror("requiredKeyMissing", [
          ["function", "build"],
          ["object", stepResult],
          ["key", "while"],
        ]);
      }
      if (!stepResult.has("next")) {
        return kperror("requiredKeyMissing", [
          ["function", "build"],
          ["object", stepResult],
          ["key", "next"],
        ]);
      }
      const next = stepResult.get("next");
      result.push(stepResult.get("out") ?? next);
      if (!stepResult.get("while")) {
        return result;
      }
      current = next;
    }
    return kperror("tooManyIterations", [
      ["function", "build"],
      ["currentValue", current],
      ["lastValuesOfResult", result.slice(-5)],
    ]);
  },
};

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
  return isObject(value) && value.has("!!given");
}

function isError(value) {
  return isObject(value) && value.has("!!error");
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
    return `function ${value.name.split(" ").at(-1)}`;
  } else {
    return JSON.stringify(value);
  }
}

function isValidName(string) {
  return /^[A-Za-z][A-Za-z0-9]*$/.test(string);
}

export const builtins = kpobject(
  ...Object.entries(rawBuiltins).map(([name, f]) => [name, f.bind(rawBuiltins)])
);
