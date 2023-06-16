import kpobject, { kpoEntries } from "./kpobject.js";

export const rawBuiltins = {
  plus: (args) => args.reduce((acc, value) => acc + value, 0),
  negative: ([x]) => -x,
  times: (args) => args.reduce((acc, value) => acc * value, 1),
  oneOver: ([x]) => 1 / x,
  divideWithRemainder: ([a, b]) =>
    kpobject(["quotient", Math.floor(a / b)], ["remainder", ((a % b) + b) % b]),
  equals([a, b]) {
    return equals(a, b);
  },
  isLessThan([a, b]) {
    return a < b;
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
  at([collection, index]) {
    if (isArray(collection)) {
      return collection[index - 1];
    } else if (isObject(collection)) {
      return collection.get(index);
    } else {
      return error("wrongArgumentType", {
        function: "at",
        parameter: "collection",
        value: collection,
        expectedType: "array or object",
      });
    }
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
  } else {
    return typeof value;
  }
}

function isArray(value) {
  return Array.isArray(value);
}

function isObject(value) {
  return value instanceof Map;
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
