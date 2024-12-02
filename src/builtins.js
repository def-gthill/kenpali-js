import { literal } from "./kpast.js";
import kperror, { transformError } from "./kperror.js";
import kpobject, { kpoEntries, toKpobject } from "./kpobject.js";
import kpparse from "./kpparse.js";
import validate, {
  argumentError,
  arrayOf,
  either,
  is,
  matches,
  objectOf,
  oneOf,
  optional,
  recordLike,
  tupleLike,
} from "./validate.js";
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
    { params: [{ rest: { name: "numbers", type: arrayOf("number") } }] },
    function ([numbers]) {
      return numbers.reduce((acc, value) => acc + value, 0);
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
    { params: [{ rest: { name: "numbers", type: arrayOf("number") } }] },
    function ([numbers]) {
      return numbers.reduce((acc, value) => acc * value, 1);
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
          name: "on",
          type: "string",
          defaultValue: literal(""),
        },
      ],
    },
    function ([strings, on]) {
      return strings.join(on);
    }
  ),
  builtin(
    "split",
    {
      params: [{ name: "string", type: "string" }],
      namedParams: [{ name: "on", type: "string" }],
    },
    function ([string, on]) {
      return string.split(on);
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
        { rest: { name: "rest", type: arrayOf("function") } },
      ],
    },
    function ([first, rest], kpcallback) {
      if (!first) {
        return false;
      }
      for (const f of rest) {
        const condition = kpcallback(f, [], kpobject());
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
        { rest: { name: "rest", type: arrayOf("function") } },
      ],
    },
    function ([first, rest], kpcallback) {
      if (first) {
        return true;
      }
      for (const f of rest) {
        const condition = kpcallback(f, [], kpobject());
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
    function ([condition, then, else_], kpcallback) {
      if (condition) {
        return kpcallback(then, [], kpobject());
      } else {
        return kpcallback(else_, [], kpobject());
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
          type: either("function", "null"),
          defaultValue: literal(null),
        },
        { name: "next", type: "function" },
        {
          name: "continueIf",
          type: either("function", "null"),
          defaultValue: literal(null),
        },
      ],
    },
    function ([start, while_, next, continueIf], kpcallback) {
      let result = start;
      loop(
        "repeat",
        start,
        while_,
        next,
        continueIf,
        (current) => {
          result = current;
        },
        kpcallback
      );
      return result;
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
          type: either("function", "null"),
          defaultValue: literal(null),
        },
        { name: "next", type: "function" },
        {
          name: "out",
          type: either("function", "null"),
          defaultValue: literal(null),
        },
        {
          name: "continueIf",
          type: either("function", "null"),
          defaultValue: literal(null),
        },
      ],
    },
    function ([start, while_, next, out, continueIf], kpcallback) {
      const result = [];
      loop(
        "build",
        start,
        while_,
        next,
        continueIf,
        (current) => {
          const outElements = out
            ? kpcallback(out, [current], kpobject())
            : [current];
          result.push(...outElements);
        },
        kpcallback
      );
      return result;
    }
  ),
  builtin(
    "sort",
    {
      params: [{ name: "array", type: "array" }],
      namedParams: [
        {
          name: "by",
          type: either("function", "null"),
          defaultValue: literal(null),
        },
      ],
    },
    function ([array, by], kpcallback) {
      if (by) {
        const withSortKey = array.map((element) => [
          element,
          kpcallback(by, [element], kpobject()),
        ]);
        withSortKey.sort(([_a, aKey], [_b, bKey]) => compare(aKey, bKey));
        return withSortKey.map(([element, _]) => element);
      } else {
        const result = [...array];
        result.sort();
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
    "at",
    {
      params: [
        { name: "collection", type: either("sequence", "object") },
        { name: "index", type: either("number", "string") },
      ],
      namedParams: ["default"],
    },
    function ([collection, index, default_]) {
      if (isString(collection) || isArray(collection)) {
        if (!isNumber(index)) {
          this.throw_(
            kperror("wrongType", ["value", index], ["expectedType", "number"])
          );
        }
        if (index < 1 || index > collection.length) {
          return default_;
        }
        return collection[index - 1];
      } else {
        if (!isString(index)) {
          this.throw_(
            kperror("wrongType", ["value", index], ["expectedType", "string"])
          );
        }
        if (collection.has(index)) {
          return collection.get(index);
        } else {
          return default_;
        }
      }
    }
  ),
  builtin(
    "buildMap",
    {
      params: ["start"],
      namedParams: [
        {
          name: "while",
          type: either("function", "null"),
          defaultValue: literal(null),
        },
        { name: "next", type: "function" },
        { name: "keys", type: "function" },
        {
          name: "new",
          type: either("function", "null"),
          defaultValue: literal(null),
        },
        {
          name: "update",
          type: either("function", "null"),
          defaultValue: literal(null),
        },
        {
          name: "continueIf",
          type: either("function", "null"),
          defaultValue: literal(null),
        },
      ],
    },
    function (
      [start, while_, next, keys, new_, update, continueIf],
      kpcallback
    ) {
      const result = kpobject();
      loop(
        "buildMap",
        start,
        while_,
        next,
        continueIf,
        (current) => {
          const keysResult = kpcallback(keys, [current], kpobject());
          for (const key of keysResult) {
            if (result.has(key)) {
              if (update) {
                result.set(
                  key,
                  kpcallback(update, [current, result.get(key)], kpobject())
                );
              } else {
                result.set(key, [current]);
              }
            } else {
              result.set(
                key,
                new_ ? kpcallback(new_, [current], kpobject()) : [current]
              );
            }
          }
        },
        kpcallback
      );
      return result;
    }
  ),
  builtin(
    "validate",
    { params: ["value", "schema"] },
    function ([value, schema], kpcallback) {
      validate(value, schema, kpcallback);
      return true;
    }
  ),
  builtin(
    "matches",
    { params: ["value", "schema"] },
    function ([value, schema], kpcallback) {
      return matches(value, schema, kpcallback);
    }
  ),
  builtin(
    "is",
    {
      params: [{ name: "type", type: "string" }],
      namedParams: [
        {
          name: "where",
          type: either("function", "null"),
          defaultValue: literal(null),
        },
      ],
    },
    function ([type, where]) {
      return is(type, where);
    }
  ),
  builtin("oneOf", { params: [{ rest: "values" }] }, function ([values]) {
    return oneOf(values);
  }),
  builtin(
    "arrayOf",
    {
      params: ["elementSchema"],
      namedParams: [
        {
          name: "where",
          type: either("function", "null"),
          defaultValue: literal(null),
        },
      ],
    },
    function ([elementSchema, where]) {
      return arrayOf(elementSchema, where);
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
        { name: "keys", defaultValue: literal("string") },
        "values",
        {
          name: "where",
          type: either("function", "null"),
          defaultValue: literal(null),
        },
      ],
    },
    function ([keys, values, where]) {
      return objectOf(keys, values, where);
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
  builtin("either", { params: [{ rest: "schemas" }] }, function ([schemas]) {
    return either(...schemas);
  }),
  builtin(
    "error",
    {
      params: [{ name: "type", type: "string" }],
      namedParams: [{ rest: "details" }],
    },
    function ([type, details]) {
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
  kpcallback
) {
  let current = start;
  while (true) {
    if (while_) {
      const whileCondition = kpcallback(while_, [current], kpobject());
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
    }
    callback(current);
    const nextResult = kpcallback(next, [current], kpobject());
    if (continueIf) {
      const continueIfCondition = kpcallback(continueIf, [current], kpobject());
      if (!isBoolean(continueIfCondition)) {
        throw kperror(
          "wrongReturnType",
          ["value", continueIfCondition],
          ["expectedType", "boolean"]
        );
      }
      if (!continueIfCondition) {
        return nextResult;
      }
    }
    current = nextResult;
  }
}

export function fromString(string) {
  return toValue(kpparse(string));
}

function toValue(expression) {
  if ("literal" in expression) {
    return expression.literal;
  } else if ("array" in expression) {
    return expression.array.map(toValue);
  } else if ("object" in expression) {
    return kpobject(
      ...expression.object.map(([key, value]) => [key, toValue(value)])
    );
  } else {
    throw kperror("");
  }
}

function validateArgument(value, schema) {
  transformError(() => validate(value, schema), argumentError);
}

export function loadBuiltins() {
  return kpobject(...rawBuiltins.map((f) => [f.builtinName, f]));
}
