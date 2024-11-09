import {
  arrayOf,
  as,
  bind,
  default_,
  either,
  is,
  matches,
  objectOf,
  oneOf,
  optional,
  recordLike,
  rest,
  tupleLike,
} from "./bind.js";
import { argumentError, callOnValues } from "./evalClean.js";
import { array, given, literal, name } from "./kpast.js";
import kperror, { errorToNull, transformError } from "./kperror.js";
import kpobject, { kpoEntries, toKpobject } from "./kpobject.js";
import {
  equals,
  isArray,
  isBoolean,
  isBuiltin,
  isError,
  isFunction,
  isGiven,
  isNumber,
  isObject,
  isSequence,
  isString,
  toString,
  typeOf,
} from "./values.js";

const rawBuiltins = [
  builtin(
    "plus",
    { params: [{ rest: { name: "rest", type: "number" } }] },
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
    { params: [{ rest: { name: "rest", type: "number" } }] },
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
          defaultValue: "",
        },
      ],
    },
    function ([strings], namedArgs) {
      return strings.join(namedArgs.get("with"));
    }
  ),
  builtin(
    "toCodePoints",
    {
      params: [{ name: "string", type: "string" }],
    },
    function ([string]) {
      return [...string].map((char) => char.codePointAt(0));
    }
  ),
  builtin(
    "fromCodePoints",
    {
      params: [{ name: "codePoints", type: arrayOf("number") }],
    },
    function ([codePoints]) {
      return String.fromCodePoint(...codePoints);
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
      validateArgument(b, typeOf(a));
      return compare(a, b) < 0;
    }
  ),
  builtin(
    "isAtMost",
    {
      params: [
        { name: "a", type: either("number", "string", "boolean", "array") },
        { name: "b", type: either("number", "string", "boolean", "array") },
      ],
    },
    function ([a, b]) {
      validateArgument(b, typeOf(a));
      return compare(a, b) <= 0;
    }
  ),
  builtin(
    "isMoreThan",
    {
      params: [
        { name: "a", type: either("number", "string", "boolean", "array") },
        { name: "b", type: either("number", "string", "boolean", "array") },
      ],
    },
    function ([a, b]) {
      validateArgument(b, typeOf(a));
      return compare(a, b) > 0;
    }
  ),
  builtin(
    "isAtLeast",
    {
      params: [
        { name: "a", type: either("number", "string", "boolean", "array") },
        { name: "b", type: either("number", "string", "boolean", "array") },
      ],
    },
    function ([a, b]) {
      validateArgument(b, typeOf(a));
      return compare(a, b) >= 0;
    }
  ),
  builtin(
    "and",
    {
      params: [
        { name: "first", type: "boolean" },
        { rest: { name: "rest", type: "function" } },
      ],
    },
    function ([first, ...rest], _, interpreter) {
      if (!first) {
        return false;
      }
      for (const f of rest) {
        const condition = callOnValues(f, [], kpobject(), interpreter);
        if (!isBoolean(condition)) {
          throw kperror(
            "wrongReturnType",
            ["value", condition],
            ["expectedType", "boolean"]
          );
        }
        if (!condition) {
          return false;
        }
      }
      return true;
    }
  ),
  builtin(
    "or",
    {
      params: [
        { name: "first", type: "boolean" },
        { rest: { name: "rest", type: "function" } },
      ],
    },
    function ([first, ...rest], _, interpreter) {
      if (first) {
        return true;
      }
      for (const f of rest) {
        const condition = callOnValues(f, [], kpobject(), interpreter);
        if (!isBoolean(condition)) {
          throw kperror(
            "wrongReturnType",
            ["value", condition],
            ["expectedType", "boolean"]
          );
        }
        if (condition) {
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
        throw kperror("notNumeric", ["value", value]);
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
  builtin(
    "if",
    {
      params: [{ name: "condition", type: "boolean" }],
      namedParams: [
        { name: "then", type: "function" },
        { name: "else", type: "function" },
      ],
    },
    function ([condition], namedArgs, interpreter) {
      if (condition) {
        return callOnValues(namedArgs.get("then"), [], kpobject(), interpreter);
      } else {
        return callOnValues(namedArgs.get("else"), [], kpobject(), interpreter);
      }
    }
  ),
  builtin(
    "repeat",
    {
      params: ["start"],
      namedParams: [
        {
          name: "while",
          type: "function",
          defaultValue: given({ params: ["current"] }, literal(true)),
        },
        { name: "next", type: "function" },
        {
          name: "continueIf",
          type: "function",
          defaultValue: given({ params: ["current"] }, literal(true)),
        },
      ],
    },
    function ([start], namedArgs, interpreter) {
      let result = start;
      loop(
        "repeat",
        start,
        namedArgs.get("while"),
        namedArgs.get("next"),
        namedArgs.get("continueIf"),
        (current) => {
          result = current;
        },
        interpreter
      );
      return result;
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
        validateArgument(index, "number");
        if (index < 1 || index > collection.length) {
          throw kperror(
            "indexOutOfBounds",
            ["function", "at"],
            ["value", collection],
            ["length", collection.length],
            ["index", index]
          );
        }
        return collection[index - 1];
      } else if (isObject(collection)) {
        validateArgument(index, "string");
        if (collection.has(index)) {
          return collection.get(index);
        } else {
          throw kperror(
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
    {
      params: ["start"],
      namedParams: [
        {
          name: "while",
          type: "function",
          defaultValue: given({ params: ["current"] }, literal(true)),
        },
        { name: "next", type: "function" },
        {
          name: "out",
          type: "function",
          defaultValue: given({ params: ["current"] }, array(name("current"))),
        },
        {
          name: "continueIf",
          type: "function",
          defaultValue: given({ params: ["current"] }, literal(true)),
        },
      ],
    },
    function ([start], namedArgs, interpreter) {
      const result = [];
      loop(
        "build",
        start,
        namedArgs.get("while"),
        namedArgs.get("next"),
        namedArgs.get("continueIf"),
        (current) => {
          result.push(
            ...callOnValues(
              namedArgs.get("out"),
              [current],
              kpobject(),
              interpreter
            )
          );
        },
        interpreter
      );
      return result;
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
    {
      params: [
        {
          name: "value",
          type: either(arrayOf(tupleLike(["string", "any"])), "error"),
        },
      ],
    },
    function ([value]) {
      if (isArray(value)) {
        return kpobject(...value);
      } else {
        return toKpobject(value);
      }
    }
  ),
  builtin(
    "bind",
    { params: ["value", "schema"] },
    function ([value, schema], _, interpreter) {
      return bind(value, schema, interpreter);
    }
  ),
  builtin(
    "matches",
    { params: ["value", "schema"] },
    function ([value, schema], _, interpreter) {
      return matches(value, schema, interpreter);
    }
  ),
  builtin(
    "switch",
    {
      params: [
        "value",
        { rest: { name: "cases", type: tupleLike(["any", "any"]) } },
      ],
    },
    function ([value, ...cases], _, interpreter) {
      for (const [schema, f] of cases) {
        const bindings = errorToNull(() => bind(value, schema));
        if (bindings) {
          return callOnValues(toFunction(f), [value], bindings, interpreter);
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
  builtin("oneOf", { params: [{ rest: "values" }] }, function (values) {
    return oneOf(values);
  }),
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
    "tupleLike",
    {
      params: ["shape"],
    },
    function ([shape]) {
      return tupleLike(shape);
    }
  ),
  builtin(
    "objectOf",
    {
      namedParams: [
        { name: "keys", defaultValue: "string" },
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
    "recordLike",
    {
      params: ["shape"],
    },
    function ([shape]) {
      return recordLike(shape);
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
  builtin("either", { params: [{ rest: "schemas" }] }, function (schemas) {
    return either(...schemas);
  }),
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
  builtin(
    "error",
    {
      params: [{ name: "type", type: "string" }],
      namedParams: [{ rest: "details" }],
    },
    function ([type], details) {
      return kperror(type, ...kpoEntries(details));
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

function compare(a, b) {
  if (isArray(a)) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (i >= a.length) {
        return -1;
      }
      if (i >= b.length) {
        return 1;
      }
      validateArgument(a[i], either("number", "string", "boolean", "array"));
      validateArgument(b[i], either("number", "string", "boolean", "array"));
      validateArgument(b[i], typeOf(a[i]));
      const elementCompare = compare(a[i], b[i]);
      if (elementCompare !== 0) {
        return elementCompare;
      }
    }
    return 0;
  } else {
    if (a < b) {
      return -1;
    } else if (a > b) {
      return 1;
    } else {
      return 0;
    }
  }
}

export function toFunction(value) {
  if (isFunction(value)) {
    return value;
  } else {
    return builtin("constant", {}, () => value);
  }
}

function loop(
  functionName,
  start,
  while_,
  next,
  continueIf,
  callback,
  interpreter
) {
  let current = start;
  while (true) {
    const whileCondition = callOnValues(
      while_,
      [current],
      kpobject(),
      interpreter
    );
    if (!isBoolean(whileCondition)) {
      throw kperror(
        "wrongReturnType",
        ["value", whileCondition],
        ["expectedType", "boolean"]
      );
    }
    if (!whileCondition) {
      return current;
    }
    callback(current);
    const nextResult = callOnValues(next, [current], kpobject(), interpreter);
    const continueIfCondition = callOnValues(
      continueIf,
      [current],
      kpobject(),
      interpreter
    );
    if (!isBoolean(continueIfCondition)) {
      throw kperror(
        "wrongReturnType",
        ["value", continueIfCondition],
        ["expectedType", "boolean"]
      );
    }
    current = nextResult;
    if (!continueIfCondition) {
      return current;
    }
  }
}

function validateArgument(value, schema) {
  transformError(() => bind(value, schema), argumentError);
}

export function loadBuiltins(modules = kpobject()) {
  const import_ = builtin(
    "import",
    {
      params: ["module"],
    },
    function ([module]) {
      if (!modules.has(module)) {
        throw kperror("missingModule", ["name", module]);
      }
      return modules.get(module);
    }
  );
  return kpobject(...[import_, ...rawBuiltins].map((f) => [f.builtinName, f]));
}
