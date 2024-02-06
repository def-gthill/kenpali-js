import {
  arrayOf,
  as,
  default_,
  eagerBind,
  either,
  is,
  matches,
  objectOf,
  oneOf,
  optional,
  rest,
} from "./bind.js";
import { given, literal } from "./kpast.js";
import kpthrow from "./kperror.js";
import { argumentError, callOnValues } from "./kpeval.js";
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
    "minus",
    {
      params: [
        { name: "a", type: "number" },
        { name: "b", type: "number" },
      ],
    },
    function ([a, b]) {
      return a - b;
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
    "increment",
    { params: [{ name: "x", type: "number" }] },
    function ([x]) {
      return x + 1;
    }
  ),
  builtin(
    "decrement",
    { params: [{ name: "x", type: "number" }] },
    function ([x]) {
      return x - 1;
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
    "dividedBy",
    {
      params: [
        { name: "a", type: "number" },
        { name: "b", type: "number" },
      ],
    },
    function ([a, b]) {
      return a / b;
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
    {
      params: [{ name: "strings", type: arrayOf("string") }],
      namedParams: [
        {
          name: "with",
          type: "string",
          defaultValue: literal(""),
        },
      ],
    },
    function ([strings], namedArgs) {
      return strings.join(namedArgs.get("with"));
    }
  ),
  builtin("equals", { params: ["a", "b"] }, function ([a, b]) {
    return equals(a, b);
  }),
  builtin(
    "isLessThan",
    {
      params: [
        { name: "a", type: either("number", "string", "boolean", "array") },
        { name: "b", type: either("number", "string", "boolean", "array") },
      ],
    },
    function ([a, b]) {
      return isLessThan(a, b);
    }
  ),
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
  builtin("isNull", { params: ["value"] }, function ([value]) {
    return value === null;
  }),
  builtin("isBoolean", { params: ["value"] }, function ([value]) {
    return isBoolean(value);
  }),
  builtin("isNumber", { params: ["value"] }, function ([value]) {
    return isNumber(value);
  }),
  builtin(
    "toNumber",
    { params: [{ name: "value", type: either("string", "number") }] },
    function ([value]) {
      if (isNumber(value)) {
        return value;
      }
      if (!/^-?(0|[1-9](\d*))(.\d+)?([Ee][+-]?\d+)?$/.test(value)) {
        return kpthrow("notNumeric", ["value", value]);
      }
      return parseFloat(value);
    }
  ),
  builtin("isString", { params: ["value"] }, function ([value]) {
    return isString(value);
  }),
  builtin("toString", { params: ["value"] }, function ([value]) {
    return toString(value);
  }),
  builtin("isArray", { params: ["value"] }, function ([value]) {
    return isArray(value);
  }),
  builtin("isRecord", { params: ["value"] }, function ([value]) {
    return isRecord(value);
  }),
  builtin("isBuiltin", { params: ["value"] }, function ([value]) {
    return isBuiltin(value);
  }),
  builtin("isGiven", { params: ["value"] }, function ([value]) {
    return isGiven(value);
  }),
  builtin("isError", { params: ["value"] }, function ([value]) {
    return isError(value);
  }),
  builtin("isObject", { params: ["value"] }, function ([value]) {
    return isObject(value);
  }),
  builtin("isFunction", { params: ["value"] }, function ([value]) {
    return isFunction(value);
  }),
  builtin("toFunction", { params: ["value"] }, function ([value]) {
    return toFunction(value);
  }),
  builtin("isSequence", { params: ["value"] }, function ([value]) {
    return isSequence(value);
  }),
  lazyBuiltin(
    "if",
    {
      params: [{ name: "condition", type: "boolean" }],
      namedParams: ["then", "else"],
    },
    function (argGetter) {
      if (argGetter.arg("condition")) {
        return argGetter.arg("then");
      } else {
        return argGetter.arg("else");
      }
    }
  ),
  builtin(
    "repeat",
    { params: ["start", { name: "step", type: "function" }] },
    function ([start, step]) {
      return loop("repeat", start, step, () => {});
    }
  ),
  builtin(
    "at",
    {
      params: [
        { name: "collection", type: either("sequence", "object") },
        "index",
      ],
    },
    function ([collection, index]) {
      if (isString(collection) || isArray(collection)) {
        const check = validateArgument(index, "number");
        if (isThrown(check)) {
          return check;
        }
        if (index < 1 || index > collection.length) {
          return kpthrow(
            "indexOutOfBounds",
            ["function", "at"],
            ["value", collection],
            ["length", collection.length],
            ["index", index]
          );
        }
        return collection[index - 1];
      } else if (isObject(collection)) {
        const check = validateArgument(index, "string");
        if (isThrown(check)) {
          return check;
        }
        if (collection.has(index)) {
          return collection.get(index);
        } else {
          return kpthrow(
            "missingProperty",
            ["value", collection],
            ["key", index]
          );
        }
      }
    }
  ),
  builtin(
    "length",
    { params: [{ name: "sequence", type: "sequence" }] },
    function ([sequence]) {
      return sequence.length;
    }
  ),
  builtin(
    "build",
    { params: ["start", { name: "step", type: "function" }] },
    function ([start, step]) {
      const result = [];
      const loopResult = loop("build", start, step, (stepResult) => {
        if (stepResult.get("where") ?? true) {
          result.push(stepResult.get("out") ?? stepResult.get("next"));
        }
      });
      if (isThrown(loopResult)) {
        return loopResult;
      } else {
        return result;
      }
    }
  ),
  builtin(
    "keys",
    { params: [{ name: "object", type: "object" }] },
    function ([object]) {
      return [...object.keys()];
    }
  ),
  builtin(
    "toObject",
    { params: [{ name: "properties", type: arrayOf(["string", "any"]) }] },
    function ([properties]) {
      return kpobject(...properties);
    }
  ),
  builtin("bind", { params: ["value", "schema"] }, function ([value, schema]) {
    return eagerBind(value, schema);
  }),
  builtin(
    "matches",
    { params: ["value", "schema"] },
    function ([value, schema]) {
      return matches(value, schema);
    }
  ),
  builtin(
    "switch",
    {
      params: ["value"],
      restParam: { name: "cases", type: ["any", "any"] },
    },
    function ([value, ...cases]) {
      for (const [schema, f] of cases) {
        const bindings = eagerBind(value, schema);
        if (!isThrown(bindings)) {
          return callOnValues(toFunction(f), [value], bindings);
        }
      }
    }
  ),
  builtin(
    "is",
    {
      params: [{ name: "type", type: "string" }],
      namedParams: [
        {
          name: "where",
          type: "function",
          defaultValue: given({ params: ["value"] }, literal(true)),
        },
      ],
    },
    function ([type], namedArgs) {
      return is(type, namedArgs);
    }
  ),
  builtin(
    "oneOf",
    {
      restParam: "values",
    },
    function (values) {
      return oneOf(values);
    }
  ),
  builtin(
    "arrayOf",
    {
      params: ["elementSchema"],
      namedParams: [
        {
          name: "where",
          type: "function",
          defaultValue: given({ params: ["value"] }, literal(true)),
        },
      ],
    },
    function ([type], namedArgs) {
      return arrayOf(type, namedArgs);
    }
  ),
  builtin(
    "objectOf",
    {
      namedParams: [
        { name: "keys", defaultValue: literal("string") },
        "values",
        {
          name: "where",
          type: "function",
          defaultValue: given({ params: ["value"] }, literal(true)),
        },
      ],
    },
    function ([], namedArgs) {
      return objectOf(namedArgs);
    }
  ),
  builtin(
    "optional",
    {
      params: ["schema"],
    },
    function ([schema]) {
      return optional(schema);
    }
  ),
  builtin(
    "either",
    {
      restParam: "schemas",
    },
    function (schemas) {
      return either(...schemas);
    }
  ),
  builtin(
    "as",
    {
      params: ["schema", { name: "name", type: "string" }],
    },
    function ([schema, name]) {
      return as(schema, name);
    }
  ),
  builtin(
    "default",
    {
      params: ["schema", "defaultValue"],
    },
    function ([schema, defaultValue]) {
      return default_(schema, defaultValue);
    }
  ),
  builtin(
    "rest",
    {
      params: ["schema"],
    },
    function ([schema]) {
      return rest(schema);
    }
  ),
];

export function builtin(name, paramSpec, f) {
  f.builtinName = name;
  for (const property in paramSpec) {
    f[property] = paramSpec[property];
  }
  return f;
}

export function lazyBuiltin(name, paramSpec, f) {
  f.builtinName = name;
  f.isLazy = true;
  for (const property in paramSpec) {
    f[property] = paramSpec[property];
  }
  return f;
}

export function equals(a, b) {
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

export function isLessThan(a, b) {
  const check = validateArgument(b, typeOf(a));
  if (isThrown(check)) {
    return check;
  }
  if (isArray(a) && isArray(b)) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (i >= a.length) {
        return true;
      }
      if (i >= b.length) {
        return false;
      }
      const checkA = validateArgument(
        a[i],
        either("number", "string", "boolean", "array")
      );
      if (isThrown(checkA)) {
        return checkA;
      }
      const checkB = validateArgument(
        b[i],
        either("number", "string", "boolean", "array")
      );
      if (isThrown(checkB)) {
        return checkB;
      }
      const aLessThanB = isLessThan(a[i], b[i]);
      if (isThrown(aLessThanB)) {
        return aLessThanB;
      }
      if (aLessThanB) {
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

export function isNumber(value) {
  return typeof value === "number";
}

export function isString(value) {
  return typeof value === "string";
}

export function isArray(value) {
  return Array.isArray(value);
}

export function isRecord(value) {
  return isObject(value) && !isGiven(value) && !isError(value);
}

export function isBuiltin(value) {
  return typeof value === "function";
}

export function isGiven(value) {
  return isObject(value) && value.has("#given");
}

export function isError(value) {
  return isObject(value) && value.has("#error");
}

export function isThrown(value) {
  return isObject(value) && value.has("#thrown");
}

export function isObject(value) {
  return value instanceof Map;
}

export function isFunction(value) {
  return isBuiltin(value) || isGiven(value);
}

export function isSequence(value) {
  return isString(value) || isArray(value);
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

export function toFunction(value) {
  if (isFunction(value)) {
    return value;
  } else {
    return builtin("constant", {}, () => value);
  }
}

function isValidName(string) {
  return /^[A-Za-z][A-Za-z0-9]*$/.test(string);
}

function loop(functionName, start, step, callback) {
  let current = start;
  for (let i = 0; i < 1000; i++) {
    const stepResult = callOnValues(step, [current]);
    const whileCondition = stepResult.has("while")
      ? stepResult.get("while")
      : true;
    if (!isBoolean(whileCondition)) {
      if (isThrown(whileCondition)) {
        return whileCondition;
      }
      return kpthrow(
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
      if (isThrown(continueIf)) {
        return continueIf;
      }
      return kpthrow(
        "wrongElementType",
        ["function", functionName],
        ["object", stepResult],
        ["key", "continueIf"],
        ["value", continueIf],
        ["expectedType", "boolean"]
      );
    }
    if (!stepResult.has("next")) {
      return kpthrow(
        "requiredKeyMissing",
        ["function", functionName],
        ["object", stepResult],
        ["key", "next"]
      );
    }
    callback(stepResult);
    const next = stepResult.get("next");
    if (isThrown(next)) {
      return kpthrow(
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
  return kpthrow(
    "tooManyIterations",
    ["function", functionName],
    ["currentValue", current]
  );
}

function validateArgument(value, schema) {
  const check = eagerBind(value, schema);
  if (isThrown(check)) {
    return argumentError(check);
  }
  return null;
}

export const builtins = kpobject(...rawBuiltins.map((f) => [f.builtinName, f]));
