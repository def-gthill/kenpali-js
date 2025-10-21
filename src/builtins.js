import {
  arrayPattern,
  checked,
  literal,
  objectPattern,
  optional as optionalNode,
  rest,
  value,
} from "./kpast.js";
import kperror, { errorClass, isError, transformError } from "./kperror.js";
import kpobject, { kpoEntries, kpoKeys, toKpobject } from "./kpobject.js";
import kpparse from "./kpparse.js";
import { emptyStream, isStream, stream, streamClass } from "./stream.js";
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
  returnError,
  tupleLike,
} from "./validate.js";
import {
  anyProtocol,
  arrayClass,
  booleanClass,
  Class,
  classClass,
  classOf,
  displayProtocol,
  equals,
  functionClass,
  Instance,
  instanceProtocol,
  isArray,
  isBoolean,
  isClass,
  isFunction,
  isInstance,
  isNumber,
  isObject,
  isProtocol,
  isSequence,
  isString,
  isType,
  nullClass,
  numberClass,
  objectClass,
  protocolClass,
  sequenceProtocol,
  stringClass,
  toString,
  typeProtocol,
} from "./values.js";

const rawBuiltins = [
  builtin(
    "debug",
    {
      params: [
        "value",
        {
          name: "name",
          type: either(stringClass, nullClass),
          defaultValue: literal(null),
        },
      ],
    },
    function ([value, name], { debugLog, kpcallback }) {
      if (name) {
        debugLog(`${name}: ${toString(value, kpcallback)}`);
      } else {
        debugLog(toString(value, kpcallback));
      }
      return value;
    }
  ),
  builtin(
    "plus",
    { params: [{ rest: { name: "numbers", type: arrayOf(numberClass) } }] },
    function ([numbers]) {
      return numbers.reduce((acc, value) => acc + value, 0);
    }
  ),
  builtin(
    "minus",
    {
      params: [
        { name: "a", type: numberClass },
        { name: "b", type: numberClass },
      ],
    },
    function ([a, b]) {
      return a - b;
    }
  ),
  builtin(
    "negative",
    { params: [{ name: "n", type: numberClass }] },
    function ([n]) {
      return -n;
    }
  ),
  builtin("up", { params: [{ name: "n", type: numberClass }] }, function ([n]) {
    return n + 1;
  }),
  builtin(
    "down",
    { params: [{ name: "n", type: numberClass }] },
    function ([n]) {
      return n - 1;
    }
  ),
  builtin(
    "times",
    { params: [{ rest: { name: "numbers", type: arrayOf(numberClass) } }] },
    function ([numbers]) {
      return numbers.reduce((acc, value) => acc * value, 1);
    }
  ),
  builtin(
    "dividedBy",
    {
      params: [
        { name: "a", type: numberClass },
        { name: "b", type: numberClass },
      ],
    },
    function ([a, b]) {
      return a / b;
    }
  ),
  builtin(
    "oneOver",
    { params: [{ name: "x", type: numberClass }] },
    function ([x]) {
      return 1 / x;
    }
  ),
  builtin(
    "quotientBy",
    {
      params: [
        { name: "a", type: numberClass },
        { name: "b", type: numberClass },
      ],
    },
    function ([a, b]) {
      return Math.floor(a / b);
    }
  ),
  builtin(
    "remainderBy",
    {
      params: [
        { name: "a", type: numberClass },
        { name: "b", type: numberClass },
      ],
    },
    function ([a, b]) {
      return ((a % b) + b) % b;
    }
  ),
  builtin(
    "toCodePoints",
    {
      params: [{ name: "string", type: stringClass }],
    },
    function ([string]) {
      return [...string].map((char) => char.codePointAt(0));
    }
  ),
  builtin(
    "fromCodePoints",
    {
      params: [{ name: "codePoints", type: arrayOf(numberClass) }],
    },
    function ([codePoints]) {
      return String.fromCodePoint(...codePoints);
    }
  ),
  builtin(
    "join",
    {
      params: [{ name: "strings", type: either(arrayClass, streamClass) }],
      namedParams: [
        {
          name: "on",
          type: stringClass,
          defaultValue: literal(""),
        },
      ],
    },
    function ([strings, on]) {
      const array = toArray(strings);
      validateArgument(array, arrayOf(stringClass));
      return array.join(on);
    }
  ),
  builtin(
    "split",
    {
      params: [{ name: "string", type: stringClass }],
      namedParams: [{ name: "on", type: stringClass }],
    },
    function ([string, on]) {
      return string.split(on);
    }
  ),
  builtin("equals", { params: ["a", "b"] }, function ([a, b]) {
    return equals(a, b);
  }),
  builtin(
    "isLessThan",
    {
      params: [
        {
          name: "a",
          type: either(numberClass, stringClass, booleanClass, arrayClass),
        },
        {
          name: "b",
          type: either(numberClass, stringClass, booleanClass, arrayClass),
        },
      ],
    },
    function ([a, b]) {
      validateArgument(b, classOf(a));
      return compare(a, b) < 0;
    }
  ),
  builtin(
    "isAtMost",
    {
      params: [
        {
          name: "a",
          type: either(numberClass, stringClass, booleanClass, arrayClass),
        },
        {
          name: "b",
          type: either(numberClass, stringClass, booleanClass, arrayClass),
        },
      ],
    },
    function ([a, b]) {
      validateArgument(b, classOf(a));
      return compare(a, b) <= 0;
    }
  ),
  builtin(
    "isMoreThan",
    {
      params: [
        {
          name: "a",
          type: either(numberClass, stringClass, booleanClass, arrayClass),
        },
        {
          name: "b",
          type: either(numberClass, stringClass, booleanClass, arrayClass),
        },
      ],
    },
    function ([a, b]) {
      validateArgument(b, classOf(a));
      return compare(a, b) > 0;
    }
  ),
  builtin(
    "isAtLeast",
    {
      params: [
        {
          name: "a",
          type: either(numberClass, stringClass, booleanClass, arrayClass),
        },
        {
          name: "b",
          type: either(numberClass, stringClass, booleanClass, arrayClass),
        },
      ],
    },
    function ([a, b]) {
      validateArgument(b, classOf(a));
      return compare(a, b) >= 0;
    }
  ),
  builtin(
    "and",
    {
      params: [
        { name: "first", type: booleanClass },
        { rest: { name: "rest", type: arrayOf(functionClass) } },
      ],
    },
    function ([first, rest], { kpcallback }) {
      if (!first) {
        return false;
      }
      for (const f of rest) {
        const condition = kpcallback(f, [], kpobject());
        validateReturn(condition, booleanClass);
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
        { name: "first", type: booleanClass },
        { rest: { name: "rest", type: arrayOf(functionClass) } },
      ],
    },
    function ([first, rest], { kpcallback }) {
      if (first) {
        return true;
      }
      for (const f of rest) {
        const condition = kpcallback(f, [], kpobject());
        validateReturn(condition, booleanClass);
        if (condition) {
          return true;
        }
      }
      return false;
    }
  ),
  builtin(
    "not",
    { params: [{ name: "x", type: booleanClass }] },
    function ([x]) {
      return !x;
    }
  ),
  constant("Null", value(nullClass)),
  constant("Boolean", value(booleanClass)),
  constant("Number", value(numberClass)),
  constant("String", value(stringClass)),
  constant("Array", value(arrayClass)),
  constant("Stream", value(streamClass)),
  constant("Object", value(objectClass)),
  constant("Function", value(functionClass)),
  constant("Error", value(errorClass)),
  constant("Class", value(classClass)),
  constant("Protocol", value(protocolClass)),
  constant("Sequence", value(sequenceProtocol)),
  constant("Type", value(typeProtocol)),
  constant("Any", value(anyProtocol)),
  builtin("classOf", { params: ["value"] }, function ([value]) {
    return classOf(value);
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
    { params: [{ name: "value", type: either(stringClass, numberClass) }] },
    function ([value]) {
      if (isNumber(value)) {
        return value;
      }
      if (!/^-?((\d+))(.\d+)?([Ee][+-]?\d+)?$/.test(value)) {
        throw kperror("notNumeric", ["value", value]);
      }
      return parseFloat(value);
    }
  ),
  builtin("isString", { params: ["value"] }, function ([value]) {
    return isString(value);
  }),
  builtin(
    "toString",
    { params: ["value"] },
    function ([value], { kpcallback }) {
      return toString(value, kpcallback);
    }
  ),
  builtin("isArray", { params: ["value"] }, function ([value]) {
    return isArray(value);
  }),
  builtin(
    "toArray",
    { params: [{ name: "value", type: sequenceProtocol }] },
    function ([value]) {
      return toArray(value);
    }
  ),
  builtin("isStream", { params: ["value"] }, function ([value]) {
    return isStream(value);
  }),
  builtin(
    "toStream",
    { params: [{ name: "value", type: sequenceProtocol }] },
    function ([value]) {
      return toStream(value);
    }
  ),
  builtin("isObject", { params: ["value"] }, function ([value]) {
    return isObject(value);
  }),
  builtin("isFunction", { params: ["value"] }, function ([value]) {
    return isFunction(value);
  }),
  builtin("isError", { params: ["value"] }, function ([value]) {
    return isError(value);
  }),
  builtin("isClass", { params: ["value"] }, function ([value]) {
    return isClass(value);
  }),
  builtin("isProtocol", { params: ["value"] }, function ([value]) {
    return isProtocol(value);
  }),
  builtin("isSequence", { params: ["value"] }, function ([value]) {
    return isSequence(value);
  }),
  builtin("isType", { params: ["value"] }, function ([value]) {
    return isType(value);
  }),
  builtin("isInstance", { params: ["value"] }, function ([value]) {
    return isInstance(value);
  }),
  builtin(
    "if",
    {
      params: [{ name: "condition", type: booleanClass }],
      namedParams: [
        { name: "then", type: functionClass },
        { name: "else", type: functionClass },
      ],
    },
    function ([condition, then, else_], { kpcallback }) {
      if (condition) {
        return kpcallback(then, [], kpobject());
      } else {
        return kpcallback(else_, [], kpobject());
      }
    }
  ),
  builtin(
    "switch",
    {
      params: [
        "value",
        {
          rest: {
            name: "conditions",
            type: arrayOf(tupleLike([functionClass, functionClass])),
          },
        },
      ],
      namedParams: [{ name: "else", type: functionClass }],
    },
    function ([value, conditions, else_], { kpcallback }) {
      for (const [condition, result] of conditions) {
        const conditionResult = kpcallback(condition, [value], kpobject());
        validateReturn(conditionResult, booleanClass);
        if (conditionResult) {
          return kpcallback(result, [value], kpobject());
        }
      }
      return kpcallback(else_, [value], kpobject());
    }
  ),
  builtin(
    "build",
    {
      params: ["start", { name: "next", type: functionClass }],
    },
    function ([start, next], { kpcallback }) {
      function streamFrom(state) {
        return stream({
          value() {
            return state;
          },
          next() {
            return streamFrom(kpcallback(next, [state], kpobject()));
          },
        });
      }

      return streamFrom(start);
    }
  ),
  builtin(
    "newStream",
    {
      namedParams: [
        { name: "value", type: functionClass },
        { name: "next", type: functionClass },
      ],
    },
    function ([value, next], { kpcallback }) {
      return stream({
        value: () => kpcallback(value, [], kpobject()),
        next: () => kpcallback(next, [], kpobject()),
      });
    }
  ),
  builtin("emptyStream", {}, function () {
    return emptyStream();
  }),
  builtin(
    "at",
    {
      params: [
        {
          name: "collection",
          type: either(sequenceProtocol, objectClass, instanceProtocol),
        },
        { name: "index", type: either(numberClass, stringClass) },
      ],
      namedParams: [optionalFunctionParameter("default")],
    },
    function ([collection, index, default_], { kpcallback }) {
      if (isString(collection) || isArray(collection)) {
        if (!isNumber(index)) {
          throw kperror(
            "wrongType",
            ["value", index],
            ["expectedType", "Number"]
          );
        }
        return indexArray(collection, index, default_, kpcallback);
      } else if (isStream(collection)) {
        if (!(isNumber(index) || isString(index))) {
          throw kperror(
            "wrongType",
            ["value", index],
            ["expectedType", "either(Number, String)"]
          );
        }
        return indexStream(collection, index, default_, kpcallback);
      } else if (isObject(collection)) {
        if (!isString(index)) {
          throw kperror(
            "wrongType",
            ["value", index],
            ["expectedType", "String"]
          );
        }
        return indexMapping(collection, index, default_, kpcallback);
      } else {
        if (!isString(index)) {
          throw kperror(
            "wrongType",
            ["value", index],
            ["expectedType", "String"]
          );
        }
        return indexInstance(collection, index, default_, kpcallback);
      }
    }
  ),
  builtin(
    "length",
    { params: [{ name: "sequence", type: sequenceProtocol }] },
    function ([sequence]) {
      if (isStream(sequence)) {
        return toArray(sequence).length;
      } else {
        return sequence.length;
      }
    }
  ),
  builtin(
    "sort",
    {
      params: [{ name: "sequence", type: sequenceProtocol }],
      namedParams: [
        {
          name: "by",
          type: either(functionClass, nullClass),
          defaultValue: literal(null),
        },
      ],
    },
    function ([sequence, by], { kpcallback }) {
      const array = toArray(sequence);
      if (by) {
        const withSortKey = array.map((element) => [
          element,
          kpcallback(by, [element], kpobject()),
        ]);
        withSortKey.sort(([_a, aKey], [_b, bKey]) => compare(aKey, bKey));
        return withSortKey.map(([element, _]) => element);
      } else {
        const result = [...array];
        result.sort(compare);
        return result;
      }
    }
  ),
  builtin(
    "forEach",
    {
      params: [
        { name: "sequence", type: sequenceProtocol },
        { name: "action", type: functionClass },
      ],
    },
    function ([sequence, action], { kpcallback }) {
      const array = toArray(sequence);
      for (const element of array) {
        kpcallback(action, [element], kpobject());
      }
      return array;
    }
  ),
  builtin(
    "transform",
    {
      params: [
        { name: "sequence", type: sequenceProtocol },
        { name: "f", type: functionClass },
      ],
    },
    function ([sequence, f], { kpcallback }) {
      const start = toStream(sequence);
      function streamFrom(current) {
        if (current.properties.isEmpty()) {
          return emptyStream();
        } else {
          return stream({
            value() {
              return kpcallback(f, [current.properties.value()], kpobject());
            },
            next() {
              return streamFrom(current.properties.next());
            },
          });
        }
      }
      return streamFrom(start);
    }
  ),
  builtin(
    "running",
    {
      params: [{ name: "sequence", type: sequenceProtocol }],
      namedParams: ["start", { name: "next", type: functionClass }],
    },
    function ([in_, start, next], { kpcallback }) {
      const inStream = toStream(in_);
      function streamFrom(current, state) {
        return stream({
          value() {
            return state;
          },
          next() {
            return current.properties.isEmpty()
              ? emptyStream()
              : streamFrom(
                  current.properties.next(state),
                  kpcallback(
                    next,
                    [current.properties.value(state)],
                    kpobject(["state", state])
                  )
                );
          },
        });
      }

      return streamFrom(inStream, start);
    }
  ),
  builtin(
    "keepFirst",
    {
      params: [
        { name: "sequence", type: sequenceProtocol },
        { name: "n", type: numberClass },
      ],
    },
    function ([sequence, n]) {
      if (isString(sequence)) {
        return sequence.slice(0, n);
      }
      const start = toStream(sequence);

      function streamFrom(current, i) {
        if (current.properties.isEmpty() || i > n) {
          return emptyStream();
        } else {
          return stream({
            value() {
              return current.properties.value();
            },
            next() {
              return streamFrom(current.properties.next(), i + 1);
            },
          });
        }
      }

      return streamFrom(start, 1);
    }
  ),
  builtin(
    "dropFirst",
    {
      params: [
        { name: "sequence", type: sequenceProtocol },
        { name: "n", type: numberClass, defaultValue: literal(1) },
      ],
    },
    function ([sequence, n]) {
      if (isString(sequence)) {
        if (n > 0) {
          return sequence.slice(n);
        } else {
          return sequence;
        }
      }
      let start = toStream(sequence);

      for (let i = 1; i <= n; i++) {
        if (start.properties.isEmpty()) {
          return emptyStream();
        }
        start = start.properties.next();
      }

      return start;
    }
  ),
  builtin(
    "while",
    {
      params: [
        { name: "sequence", type: sequenceProtocol },
        { name: "condition", type: functionClass },
      ],
    },
    function ([sequence, condition], { kpcallback }) {
      const start = toStream(sequence);

      function streamFrom(current) {
        if (current.properties.isEmpty()) {
          return emptyStream();
        }
        const conditionSatisfied = kpcallback(
          condition,
          [current.properties.value()],
          kpobject()
        );
        validateReturn(conditionSatisfied, booleanClass);
        if (!conditionSatisfied) {
          return emptyStream();
        }
        return stream({
          value() {
            return current.properties.value();
          },
          next() {
            return streamFrom(current.properties.next());
          },
        });
      }

      return streamFrom(start);
    }
  ),
  builtin(
    "continueIf",
    {
      params: [
        { name: "sequence", type: sequenceProtocol },
        { name: "condition", type: functionClass },
      ],
    },
    function ([sequence, condition], { kpcallback }) {
      const start = toStream(sequence);

      function streamFrom(current) {
        if (current.properties.isEmpty()) {
          return emptyStream();
        }
        const conditionSatisfied = kpcallback(
          condition,
          [current.properties.value()],
          kpobject()
        );
        validateReturn(conditionSatisfied, booleanClass);
        return stream({
          value() {
            return current.properties.value();
          },
          next() {
            return conditionSatisfied
              ? streamFrom(current.properties.next())
              : emptyStream();
          },
        });
      }

      return streamFrom(start);
    }
  ),
  builtin(
    "where",
    {
      params: [
        { name: "sequence", type: sequenceProtocol },
        { name: "condition", type: functionClass },
      ],
    },
    function ([sequence, condition], { kpcallback }) {
      const inStream = toStream(sequence);

      function streamFrom(start) {
        let current = start;

        function satisfied() {
          const conditionSatisfied = kpcallback(
            condition,
            [current.properties.value()],
            kpobject()
          );
          validateReturn(conditionSatisfied, booleanClass);
          return conditionSatisfied;
        }

        while (!current.properties.isEmpty() && !satisfied()) {
          current = current.properties.next();
        }

        if (current.properties.isEmpty()) {
          return emptyStream();
        }

        return stream({
          value() {
            return current.properties.value();
          },
          next() {
            return streamFrom(current.properties.next());
          },
        });
      }

      return streamFrom(inStream);
    }
  ),
  builtin(
    "zip",
    {
      params: [
        { rest: { name: "sequences", type: arrayOf(sequenceProtocol) } },
      ],
    },
    function ([sequences]) {
      const streams = sequences.map(toStream);

      function streamFrom(currents) {
        if (currents.some((current) => current.properties.isEmpty())) {
          return emptyStream();
        } else {
          return stream({
            value() {
              return currents.map((current) => current.properties.value());
            },
            next() {
              return streamFrom(
                currents.map((current) => current.properties.next())
              );
            },
          });
        }
      }

      return streamFrom(streams);
    }
  ),
  builtin(
    "unzip",
    {
      params: [
        { name: "sequence", type: sequenceProtocol },
        { name: "numStreams", type: numberClass, defaultValue: literal(2) },
      ],
    },
    function ([sequence, numStreams]) {
      const inStream = toStream(sequence);

      function streamFrom(current, i) {
        if (current.properties.isEmpty()) {
          return emptyStream();
        } else {
          return stream({
            value() {
              return indexCollection(current.properties.value(), i);
            },
            next() {
              return streamFrom(current.properties.next(), i);
            },
          });
        }
      }

      return [...Array(numStreams)].map((_, i) => streamFrom(inStream, i + 1));
    }
  ),
  builtin(
    "flatten",
    { params: [{ name: "sequences", type: sequenceProtocol }] },
    function ([sequences]) {
      const outer = toStream(sequences);

      function streamFrom(startOuter, startInner) {
        let outer = startOuter;
        let inner = startInner;
        while (inner.properties.isEmpty()) {
          if (outer.properties.isEmpty()) {
            return emptyStream();
          }
          const innerResult = outer.properties.value();
          validateReturn(innerResult, either(arrayClass, streamClass));
          inner = toStream(innerResult);
          outer = outer.properties.next();
        }
        return stream({
          value() {
            return inner.properties.value();
          },
          next() {
            return streamFrom(outer, inner.properties.next());
          },
        });
      }

      return streamFrom(outer, emptyStream());
    }
  ),
  builtin(
    "dissect",
    {
      params: [
        { name: "sequence", type: sequenceProtocol },
        { name: "condition", type: functionClass },
      ],
    },
    function ([sequence, condition], { kpcallback }) {
      const start = toStream(sequence);
      function streamFrom(start) {
        let current = start;
        const out = [];

        function satisfied() {
          const conditionSatisfied = kpcallback(
            condition,
            [current.properties.value()],
            kpobject()
          );
          validateReturn(conditionSatisfied, booleanClass);
          return conditionSatisfied;
        }

        while (!current.properties.isEmpty() && !satisfied()) {
          out.push(current.properties.value());
          current = current.properties.next();
        }

        if (!current.properties.isEmpty()) {
          out.push(current.properties.value());
          current = current.properties.next();
        }

        if (out.length > 0) {
          return stream({
            value() {
              return out;
            },
            next() {
              return streamFrom(current);
            },
          });
        } else {
          return emptyStream();
        }
      }
      return streamFrom(start);
    }
  ),
  builtin(
    "keys",
    { params: [{ name: "object", type: objectClass }] },
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
          type: either(arrayClass, instanceProtocol),
        },
      ],
    },
    function ([value]) {
      return toObject(value);
    }
  ),
  builtin(
    "newSet",
    {
      params: [
        { name: "elements", type: arrayClass, defaultValue: literal([]) },
      ],
    },
    function ([elements], { getMethod }) {
      const keys = elements.map(toKey);
      const set = new Set(keys);
      const originalKeys = new Map(keys.map((key, i) => [key, elements[i]]));
      const self = { set, originalKeys };
      return instance(self, ["size", "elements", "has"], getMethod);
    },
    [
      method("size", {}, function ([self]) {
        return self.set.size;
      }),
      method("elements", {}, function ([self]) {
        return [...self.set.keys()].map((key) => self.originalKeys.get(key));
      }),
      method("has", { params: ["element"] }, function ([self, element]) {
        return self.set.has(toKey(element));
      }),
    ]
  ),
  builtin(
    "newMap",
    {
      params: [
        {
          name: "entries",
          type: arrayOf(tupleLike([anyProtocol, anyProtocol])),
          defaultValue: literal([]),
        },
      ],
    },
    function ([entries], { getMethod }) {
      const realEntries = entries.map(([key, value]) => [toKey(key), value]);
      const map = new Map(realEntries);
      const originalKeys = new Map(
        realEntries.map(([key, _], i) => [key, entries[i][0]])
      );
      const self = { map, originalKeys };
      return instance(
        self,
        ["size", "keys", "values", "entries", "has", "at"],
        getMethod
      );
    },
    [
      method("size", {}, function ([self]) {
        return self.map.size;
      }),
      method("keys", {}, function ([self]) {
        return [...self.map.keys()].map((key) => self.originalKeys.get(key));
      }),
      method("values", {}, function ([self]) {
        return [...self.map.values()];
      }),
      method("entries", {}, function ([self]) {
        return [...self.map.entries()].map(([key, value]) => [
          self.originalKeys.get(key),
          value,
        ]);
      }),
      method("has", { params: ["key"] }, function ([self, key]) {
        return self.map.has(toKey(key));
      }),
      method(
        "at",
        {
          params: ["key"],
          namedParams: [optionalFunctionParameter("default")],
        },
        function ([self, key, default_], { kpcallback }) {
          const realKey = toKey(key);
          return indexMapping(self.map, realKey, default_, kpcallback, self);
        }
      ),
    ]
  ),
  ...builtinClass("Var", {
    protocols: [displayProtocol],
    constructors: {
      newVar: {
        params: ["initialValue"],
        body: ([initialValue], { getMethod }) => ({
          internals: {
            value: initialValue,
          },
          properties: {
            get: getMethod("get"),
            set: getMethod("set"),
            display: getMethod("display"),
          },
        }),
      },
    },
    methods: {
      get: {
        body: ([self]) => self.value,
      },
      set: {
        params: ["newValue"],
        body: ([self, newValue]) => {
          self.value = newValue;
          return newValue;
        },
      },
      display: {
        body: ([self], { kpcallback }) =>
          `Var {value: ${toString(self.value, kpcallback)}}`,
      },
    },
  }),
  builtin(
    "mutableArray",
    {
      params: [
        { name: "elements", type: arrayClass, defaultValue: literal([]) },
      ],
    },
    function ([elements], { getMethod }) {
      const array = [...elements];

      const self = { array };

      const object = instance(
        self,
        ["size", "elements", "append", "set", "storeAt", "at", "pop", "clear"],
        getMethod
      );

      self.object = object;

      return object;
    },
    [
      method("size", {}, function ([self]) {
        return self.array.length;
      }),
      method("elements", {}, function ([self]) {
        return [...self.array];
      }),
      method("append", { params: ["element"] }, function ([self, element]) {
        self.array.push(element);
        return self.object;
      }),
      method(
        "set",
        {
          params: [{ name: "index", type: numberClass }, "element"],
        },
        function ([self, index, element]) {
          setArray(self.array, index, element, self.object);
          return self.object;
        }
      ),
      method(
        "storeAt",
        {
          params: ["element", { name: "index", type: numberClass }],
        },
        function ([self, element, index]) {
          setArray(self.array, index, element, self.object);
          return self.object;
        }
      ),
      method(
        "at",
        {
          params: [{ name: "index", type: numberClass }],
          namedParams: [optionalFunctionParameter("default")],
        },
        function ([self, index, default_], { kpcallback }) {
          return indexArray(
            self.array,
            index,
            default_,
            kpcallback,
            self.object
          );
        }
      ),
      method(
        "pop",
        {
          namedParams: [optionalFunctionParameter("default")],
        },
        function ([self, default_], { kpcallback }) {
          const result = indexArray(
            self.array,
            -1,
            default_,
            kpcallback,
            self.object
          );
          self.array.pop();
          return result;
        }
      ),
      method("clear", {}, function ([self]) {
        self.array.length = 0;
        return self.object;
      }),
    ]
  ),
  builtin(
    "mutableSet",
    {
      params: [
        { name: "elements", type: arrayClass, defaultValue: literal([]) },
      ],
    },
    function ([elements], { getMethod }) {
      const keys = elements.map(toKey);
      const set = new Set(keys);
      const originalKeys = new Map(keys.map((key, i) => [key, elements[i]]));
      const self = { set, originalKeys };
      const object = instance(
        self,
        ["size", "elements", "add", "remove", "has", "clear"],
        getMethod
      );
      self.object = object;
      return object;
    },
    [
      method("size", {}, function ([self]) {
        return self.set.size;
      }),
      method("elements", {}, function ([self]) {
        return [...self.set.keys()].map((key) => self.originalKeys.get(key));
      }),
      method("add", { params: ["element"] }, function ([self, element]) {
        const key = toKey(element);
        self.set.add(key);
        self.originalKeys.set(key, element);
        return self.object;
      }),
      method("remove", { params: ["element"] }, function ([self, element]) {
        const key = toKey(element);
        self.set.delete(key);
        self.originalKeys.delete(key);
        return self.object;
      }),
      method("has", { params: ["element"] }, function ([self, element]) {
        return self.set.has(toKey(element));
      }),
      method("clear", {}, function ([self]) {
        self.set.clear();
        originalKeys.clear();
        return self.object;
      }),
    ]
  ),
  builtin(
    "mutableMap",
    {
      params: [
        {
          name: "entries",
          type: arrayOf(tupleLike([anyProtocol, anyProtocol])),
          defaultValue: literal([]),
        },
      ],
    },
    function ([entries], { getMethod }) {
      const realEntries = entries.map(([key, value]) => [toKey(key), value]);
      const map = new Map(realEntries);
      const originalKeys = new Map(
        realEntries.map(([key, _], i) => [key, entries[i][0]])
      );
      const self = { map, originalKeys };
      const object = instance(
        self,
        [
          "size",
          "keys",
          "values",
          "entries",
          "set",
          "storeAt",
          "remove",
          "has",
          "at",
          "clear",
        ],
        getMethod
      );
      self.object = object;
      return object;
    },
    [
      method("size", {}, function ([self]) {
        return self.map.size;
      }),
      method("keys", {}, function ([self]) {
        return [...self.map.keys()].map((key) => self.originalKeys.get(key));
      }),
      method("values", {}, function ([self]) {
        return [...self.map.values()];
      }),
      method("entries", {}, function ([self]) {
        return [...self.map.entries()].map(([key, value]) => [
          self.originalKeys.get(key),
          value,
        ]);
      }),
      method(
        "set",
        { params: ["key", "value"] },
        function ([self, key, value]) {
          const realKey = toKey(key);
          self.map.set(realKey, value);
          self.originalKeys.set(realKey, key);
          return self.object;
        }
      ),
      method(
        "storeAt",
        { params: ["value", "key"] },
        function ([self, value, key]) {
          const realKey = toKey(key);
          self.map.set(realKey, value);
          self.originalKeys.set(realKey, key);
          return self.object;
        }
      ),
      method("remove", { params: ["key"] }, function ([self, key]) {
        const realKey = toKey(key);
        self.map.delete(realKey);
        self.originalKeys.delete(realKey);
        return self.object;
      }),
      method("has", { params: ["key"] }, function ([self, key]) {
        return self.map.has(toKey(key));
      }),
      method(
        "at",
        {
          params: ["key"],
          namedParams: [optionalFunctionParameter("default")],
        },
        function ([self, key, default_], { kpcallback }) {
          const realKey = toKey(key);
          return indexMapping(
            self.map,
            realKey,
            default_,
            kpcallback,
            self.object
          );
        }
      ),
      method("clear", {}, function ([self]) {
        self.map.clear();
        self.originalKeys.clear();
        return self.object;
      }),
    ]
  ),
  builtin(
    "validate",
    { params: ["value", "schema"] },
    function ([value, schema], { kpcallback }) {
      validate(value, schema, kpcallback);
      return true;
    }
  ),
  builtin(
    "matches",
    { params: ["value", "schema"] },
    function ([value, schema], { kpcallback }) {
      return matches(value, schema, kpcallback);
    }
  ),
  builtin(
    "is",
    {
      params: [{ name: "type", type: typeProtocol }],
      namedParams: [
        {
          name: "where",
          type: either(functionClass, nullClass),
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
          type: either(functionClass, nullClass),
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
        { name: "keys", defaultValue: value(stringClass) },
        "values",
        {
          name: "where",
          type: either(functionClass, nullClass),
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
    "newError",
    {
      params: [{ name: "type", type: stringClass }],
      namedParams: [{ rest: "details" }],
    },
    function ([type, details]) {
      return kperror(type, ...kpoEntries(details));
    }
  ),
];

export function constant(name, value) {
  return [name, value];
}

export function builtin(name, paramSpec, f, methods = []) {
  f.functionName = name;
  for (const property in paramSpec) {
    f[property] = paramSpec[property];
  }
  if (methods.length > 0) {
    f.methods = methods;
  }
  return f;
}

export function method(name, paramSpec, f) {
  f.methodName = name;
  for (const property in paramSpec) {
    f[property] = paramSpec[property];
  }
  return f;
}

export function instance(self, methods, getMethod) {
  return kpobject(
    ...methods.map((name) => [name, bindMethod(self, getMethod(name))])
  );
}

export function bindMethod(self, method) {
  method.self = self;
  return method;
}

export function builtinClass(
  name,
  { protocols = [], constructors, methods: methodSpecs }
) {
  const class_ = new Class(name, [instanceProtocol, ...protocols]);
  const methods = Object.entries(methodSpecs).map(
    ([name, { params, namedParams, body }]) =>
      method(name, { params, namedParams }, body)
  );
  return [
    constant(name, class_),
    ...Object.entries(constructors).map(
      ([name, { params, namedParams, body }]) =>
        builtin(
          name,
          { params, namedParams },
          (args, { getMethod }) => {
            const { internals, properties } = body(args, { getMethod });
            const instance = new Instance(class_, properties, internals);
            for (const name in properties) {
              if ("target" in properties[name]) {
                properties[name].self = instance;
              }
            }
            return instance;
          },
          methods
        )
    ),
  ];
}

function optionalFunctionParameter(name) {
  return {
    name,
    type: either(functionClass, nullClass),
    defaultValue: literal(null),
  };
}

export function getParamPatterns(f) {
  const paramPattern = arrayPattern(
    ...(f.params ?? []).map(toArrayNamePattern)
  );
  const namedParamPattern = objectPattern(
    ...(f.namedParams ?? []).map(toObjectNamePattern)
  );
  return { paramPattern, namedParamPattern };
}

function toArrayNamePattern(param) {
  if (typeof param === "string") {
    return param;
  } else if ("rest" in param) {
    return rest(toNamePattern(param.rest));
  } else if ("defaultValue" in param) {
    const { defaultValue, ...rest } = param;
    return optionalNode(toNamePattern(rest), defaultValue);
  } else if ("type" in param) {
    const { type, ...rest } = param;
    return checked(toNamePattern(rest), type);
  } else {
    throw new Error(`Invalid array name pattern: ${param}`);
  }
}

function toObjectNamePattern(param) {
  if (typeof param === "string") {
    return [param, param];
  } else if ("rest" in param) {
    return rest(toNamePattern(param.rest));
  } else if ("defaultValue" in param) {
    const { defaultValue, ...rest } = param;
    return [param.name, optionalNode(toNamePattern(rest), defaultValue)];
  } else if ("type" in param) {
    const { type, ...rest } = param;
    return [param.name, checked(toNamePattern(rest), type)];
  } else {
    throw new Error(`Invalid object name pattern: ${param}`);
  }
}

function toNamePattern(param) {
  if (typeof param === "string") {
    return param;
  } else if ("type" in param) {
    const { type, ...rest } = param;
    return checked(toNamePattern(rest), type);
  } else {
    return param.name;
  }
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
      validateArgument(
        a[i],
        either(numberClass, stringClass, booleanClass, arrayClass)
      );
      validateArgument(
        b[i],
        either(numberClass, stringClass, booleanClass, arrayClass)
      );
      validateArgument(b[i], classOf(a[i]));
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

export function toArray(value) {
  if (isArray(value)) {
    return value;
  } else if (isString(value)) {
    return [...value];
  } else {
    let current = value;
    const result = [];
    while (!current.properties.isEmpty()) {
      result.push(current.properties.value());
      current = current.properties.next();
    }
    return result;
  }
}

export function toStream(value) {
  if (isArray(value)) {
    function streamFrom(i) {
      if (i >= value.length) {
        return emptyStream();
      }
      return stream({
        value() {
          return value[i];
        },
        next() {
          return streamFrom(i + 1);
        },
      });
    }
    return streamFrom(0);
  } else if (isString(value)) {
    return toStream(toArray(value));
  } else {
    return value;
  }
}

export function toObject(value) {
  if (isObject(value)) {
    return value;
  } else if (isSequence(value)) {
    const array = toArray(value);
    validateArgument(array, arrayOf(tupleLike([stringClass, anyProtocol])));
    return kpobject(...array);
  } else {
    return toKpobject({
      "#class": value.class_.properties.name,
      ...value.properties,
    });
  }
}

function setArray(array, index, element, valueForError) {
  if (index > 0 && index <= array.length) {
    array[index - 1] = element;
  } else if (index < 0 && index >= -array.length) {
    array[array.length - index] = element;
  } else {
    throw kperror(
      "indexOutOfBounds",
      ["value", valueForError],
      ["length", array.length],
      ["index", index]
    );
  }
}

export function indexCollection(
  collection,
  index,
  default_,
  kpcallback,
  valueForError = collection
) {
  if (isString(collection) || isArray(collection)) {
    return indexArray(collection, index, default_, kpcallback, valueForError);
  } else if (isStream(collection)) {
    return indexStream(collection, index, default_, kpcallback, valueForError);
  } else if (isObject(collection)) {
    return indexMapping(collection, index, default_, kpcallback, valueForError);
  } else {
    throw kperror(
      "wrongType",
      ["value", collection],
      ["expectedType", either("sequence", "object")]
    );
  }
}

export function indexArray(
  array,
  index,
  default_,
  kpcallback,
  valueForError = array
) {
  if (index > 0 && index <= array.length) {
    return array[index - 1];
  } else if (index < 0 && index >= -array.length) {
    return array.at(index);
  } else if (default_) {
    return kpcallback(default_, [], kpobject());
  } else {
    throw kperror(
      "indexOutOfBounds",
      ["value", valueForError],
      ["length", array.length],
      ["index", index]
    );
  }
}

export function indexStream(
  stream,
  index,
  default_,
  kpcallback,
  valueForError = stream
) {
  if (isNumber(index)) {
    if (index < 0) {
      return indexArray(toArray(stream), index, default_, kpcallback, stream);
    } else if (index > 0) {
      let last;
      let current = stream;
      let j = 0;
      while (!current.properties.isEmpty() && j < index) {
        last = current;
        current = current.properties.next();
        j += 1;
      }
      if (j === index) {
        return last.properties.value();
      } else if (default_) {
        return kpcallback(default_, [], kpobject());
      } else {
        throw kperror(
          "indexOutOfBounds",
          ["value", valueForError],
          ["length", j],
          ["index", index]
        );
      }
    } else if (default_) {
      return kpcallback(default_, [], kpobject());
    } else {
      throw kperror("indexOutOfBounds", ["value", valueForError], ["index", 0]);
    }
  } else {
    return indexInstance(stream, index, default_, kpcallback, valueForError);
  }
}

export function indexMapping(
  mapping,
  index,
  default_,
  kpcallback,
  valueForError = mapping
) {
  if (mapping.has(index)) {
    return mapping.get(index);
  } else if (default_) {
    return kpcallback(default_, [], kpobject());
  } else {
    throw kperror("missingProperty", ["value", valueForError], ["key", index]);
  }
}

export function indexInstance(
  instance,
  index,
  default_,
  kpcallback,
  valueForError = instance
) {
  if (index in instance.properties) {
    return instance.properties[index];
  } else if (default_) {
    return kpcallback(default_, [], kpobject());
  } else {
    throw kperror("missingProperty", ["value", valueForError], ["key", index]);
  }
}

export function fromString(string) {
  return toValue(kpparse(string));
}

function toValue(expression) {
  switch (expression.type) {
    case "literal":
      return expression.value;
    case "array":
      return expression.elements.map(toValue);
    case "object":
      return kpobject(
        ...expression.entries.map(([key, value]) => [
          typeof key == "string" ? key : toValue(key),
          toValue(value),
        ])
      );
    default:
      throw kperror("invalidConstant", ["value", expression]);
  }
}

function toKey(value) {
  if (isString(value) || isArray(value)) {
    return toString(value);
  } else if (isObject(value)) {
    const keys = kpoKeys(value);
    keys.sort(compare);
    return toString(kpobject(...keys.map((key) => [key, value.get(key)])));
  } else {
    return value;
  }
}

function validateArgument(value, schema) {
  transformError(() => validate(value, schema), argumentError);
}

function validateReturn(value, schema) {
  transformError(() => validate(value, schema), returnError);
}

export function loadBuiltins() {
  return kpobject(
    ...rawBuiltins.map((builtin) =>
      typeof builtin === "function" ? [builtin.functionName, builtin] : builtin
    )
  );
}
