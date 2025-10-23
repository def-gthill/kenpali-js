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
  toStringSimple,
  typeProtocol,
} from "./values.js";

const rawBuiltins = [
  platformFunction(
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
  platformFunction(
    "plus",
    { params: [{ rest: { name: "numbers", type: arrayOf(numberClass) } }] },
    function ([numbers]) {
      return numbers.reduce((acc, value) => acc + value, 0);
    }
  ),
  platformFunction(
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
  platformFunction(
    "negative",
    { params: [{ name: "n", type: numberClass }] },
    function ([n]) {
      return -n;
    }
  ),
  platformFunction(
    "up",
    { params: [{ name: "n", type: numberClass }] },
    function ([n]) {
      return n + 1;
    }
  ),
  platformFunction(
    "down",
    { params: [{ name: "n", type: numberClass }] },
    function ([n]) {
      return n - 1;
    }
  ),
  platformFunction(
    "times",
    { params: [{ rest: { name: "numbers", type: arrayOf(numberClass) } }] },
    function ([numbers]) {
      return numbers.reduce((acc, value) => acc * value, 1);
    }
  ),
  platformFunction(
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
  platformFunction(
    "oneOver",
    { params: [{ name: "x", type: numberClass }] },
    function ([x]) {
      return 1 / x;
    }
  ),
  platformFunction(
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
  platformFunction(
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
  platformFunction(
    "toCodePoints",
    {
      params: [{ name: "string", type: stringClass }],
    },
    function ([string]) {
      return [...string].map((char) => char.codePointAt(0));
    }
  ),
  platformFunction(
    "fromCodePoints",
    {
      params: [{ name: "codePoints", type: arrayOf(numberClass) }],
    },
    function ([codePoints]) {
      return String.fromCodePoint(...codePoints);
    }
  ),
  platformFunction(
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
  platformFunction(
    "split",
    {
      params: [{ name: "string", type: stringClass }],
      namedParams: [{ name: "on", type: stringClass }],
    },
    function ([string, on]) {
      return string.split(on);
    }
  ),
  platformFunction("equals", { params: ["a", "b"] }, function ([a, b]) {
    return equals(a, b);
  }),
  platformFunction(
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
  platformFunction(
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
  platformFunction(
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
  platformFunction(
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
  platformFunction(
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
  platformFunction(
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
  platformFunction(
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
  platformFunction("classOf", { params: ["value"] }, function ([value]) {
    return classOf(value);
  }),
  platformFunction("isNull", { params: ["value"] }, function ([value]) {
    return value === null;
  }),
  platformFunction("isBoolean", { params: ["value"] }, function ([value]) {
    return isBoolean(value);
  }),
  platformFunction("isNumber", { params: ["value"] }, function ([value]) {
    return isNumber(value);
  }),
  platformFunction(
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
  platformFunction("isString", { params: ["value"] }, function ([value]) {
    return isString(value);
  }),
  platformFunction(
    "toString",
    { params: ["value"] },
    function ([value], { kpcallback }) {
      return toString(value, kpcallback);
    }
  ),
  platformFunction("isArray", { params: ["value"] }, function ([value]) {
    return isArray(value);
  }),
  platformFunction(
    "toArray",
    { params: [{ name: "value", type: sequenceProtocol }] },
    function ([value]) {
      return toArray(value);
    }
  ),
  platformFunction("isStream", { params: ["value"] }, function ([value]) {
    return isStream(value);
  }),
  platformFunction(
    "toStream",
    { params: [{ name: "value", type: sequenceProtocol }] },
    function ([value]) {
      return toStream(value);
    }
  ),
  platformFunction("isObject", { params: ["value"] }, function ([value]) {
    return isObject(value);
  }),
  platformFunction("isFunction", { params: ["value"] }, function ([value]) {
    return isFunction(value);
  }),
  platformFunction("isError", { params: ["value"] }, function ([value]) {
    return isError(value);
  }),
  platformFunction("isClass", { params: ["value"] }, function ([value]) {
    return isClass(value);
  }),
  platformFunction("isProtocol", { params: ["value"] }, function ([value]) {
    return isProtocol(value);
  }),
  platformFunction("isSequence", { params: ["value"] }, function ([value]) {
    return isSequence(value);
  }),
  platformFunction("isType", { params: ["value"] }, function ([value]) {
    return isType(value);
  }),
  platformFunction("isInstance", { params: ["value"] }, function ([value]) {
    return isInstance(value);
  }),
  platformFunction(
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
  platformFunction(
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
  platformFunction(
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
  platformFunction(
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
  platformFunction("emptyStream", {}, function () {
    return emptyStream();
  }),
  platformFunction(
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
  platformFunction(
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
  platformFunction(
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
  platformFunction(
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
  platformFunction(
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
  platformFunction(
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
  platformFunction(
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
  platformFunction(
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
  platformFunction(
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
  platformFunction(
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
  platformFunction(
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
  platformFunction(
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
  platformFunction(
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
  platformFunction(
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
  platformFunction(
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
  platformFunction(
    "keys",
    { params: [{ name: "object", type: objectClass }] },
    function ([object]) {
      return [...object.keys()];
    }
  ),
  platformFunction(
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
  ...platformClass("Set", {
    protocols: [displayProtocol],
    constructors: {
      newSet: {
        params: [
          { name: "elements", type: arrayClass, defaultValue: literal([]) },
        ],
        body: ([elements], { getMethod }) => {
          const keys = elements.map(toKey);
          const set = new Set(keys);
          const originalKeys = new Map(
            keys.map((key, i) => [key, elements[i]])
          );
          return {
            internals: {
              set,
              originalKeys,
            },
            properties: {
              size: getMethod("size"),
              elements: getMethod("elements"),
              has: getMethod("has"),
              display: getMethod("display"),
            },
          };
        },
      },
    },
    methods: {
      size: {
        body: ([self]) => self.set.size,
      },
      elements: {
        body: ([self]) =>
          [...self.set.keys()].map((key) => self.originalKeys.get(key)),
      },
      has: {
        params: ["element"],
        body: ([self, element]) => self.set.has(toKey(element)),
      },
      display: {
        body: ([self], { kpcallback }) =>
          `Set {elements: ${toString(kpcallback(self.properties.elements, [], kpobject()), kpcallback)}}`,
      },
    },
  }),
  ...platformClass("Map", {
    protocols: [displayProtocol],
    constructors: {
      newMap: {
        params: [
          {
            name: "entries",
            type: arrayOf(tupleLike([anyProtocol, anyProtocol])),
            defaultValue: literal([]),
          },
        ],
        body: ([entries], { getMethod }) => {
          const realEntries = entries.map(([key, value]) => [
            toKey(key),
            value,
          ]);
          const map = new Map(realEntries);
          const originalKeys = new Map(
            realEntries.map(([key, _], i) => [key, entries[i][0]])
          );
          return {
            internals: { map, originalKeys },
            properties: {
              size: getMethod("size"),
              keys: getMethod("keys"),
              values: getMethod("values"),
              entries: getMethod("entries"),
              has: getMethod("has"),
              at: getMethod("at"),
              display: getMethod("display"),
            },
          };
        },
      },
    },
    methods: {
      size: {
        body: ([self]) => self.map.size,
      },
      keys: {
        body: ([self]) =>
          [...self.map.keys()].map((key) => self.originalKeys.get(key)),
      },
      values: {
        body: ([self]) => [...self.map.values()],
      },
      entries: {
        body: ([self]) =>
          [...self.map.entries()].map(([key, value]) => [
            self.originalKeys.get(key),
            value,
          ]),
      },
      has: {
        params: ["key"],
        body: ([self, key]) => self.map.has(toKey(key)),
      },
      at: {
        params: ["key"],
        namedParams: [optionalFunctionParameter("default")],
        body: ([self, key, default_], { kpcallback }) => {
          const realKey = toKey(key);
          return indexMapping(self.map, realKey, default_, kpcallback, self);
        },
      },
      display: {
        body: ([self], { kpcallback }) =>
          `Map {entries: ${toString(kpcallback(self.properties.entries, [], kpobject()), kpcallback)}}`,
      },
    },
  }),
  ...platformClass("Var", {
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
  ...platformClass("MutableArray", {
    protocols: [displayProtocol],
    constructors: {
      newMutableArray: {
        params: [
          { name: "elements", type: arrayClass, defaultValue: literal([]) },
        ],
        body: ([elements], { getMethod }) => {
          const array = [...elements];
          return {
            internals: { array },
            properties: {
              size: getMethod("size"),
              elements: getMethod("elements"),
              append: getMethod("append"),
              set: getMethod("set"),
              storeAt: getMethod("storeAt"),
              at: getMethod("at"),
              pop: getMethod("pop"),
              clear: getMethod("clear"),
              display: getMethod("display"),
            },
          };
        },
      },
    },
    methods: {
      size: {
        body: ([self]) => self.array.length,
      },
      elements: {
        body: ([self]) => [...self.array],
      },
      append: {
        params: ["element"],
        body: ([self, element]) => {
          self.array.push(element);
          return self;
        },
      },
      set: {
        params: [{ name: "index", type: numberClass }, "element"],
        body: ([self, index, element]) => {
          setArray(self.array, index, element, self);
          return self;
        },
      },
      storeAt: {
        params: ["element", { name: "index", type: numberClass }],
        body: ([self, element, index]) => {
          setArray(self.array, index, element, self);
          return self;
        },
      },
      at: {
        params: [{ name: "index", type: numberClass }],
        namedParams: [optionalFunctionParameter("default")],
        body: ([self, index, default_], { kpcallback }) => {
          return indexArray(self.array, index, default_, kpcallback, self);
        },
      },
      pop: {
        namedParams: [optionalFunctionParameter("default")],
        body: ([self, default_], { kpcallback }) => {
          const result = indexArray(self.array, -1, default_, kpcallback, self);
          self.array.pop();
          return result;
        },
      },
      clear: {
        body: ([self]) => {
          self.array.length = 0;
          return self;
        },
      },
      display: {
        body: ([self], { kpcallback }) =>
          `MutableArray {elements: ${toString(kpcallback(self.properties.elements, [], kpobject()), kpcallback)}}`,
      },
    },
  }),
  ...platformClass("MutableSet", {
    protocols: [displayProtocol],
    constructors: {
      newMutableSet: {
        params: [
          { name: "elements", type: arrayClass, defaultValue: literal([]) },
        ],
        body: ([elements], { getMethod }) => {
          const keys = elements.map(toKey);
          const set = new Set(keys);
          const originalKeys = new Map(
            keys.map((key, i) => [key, elements[i]])
          );
          return {
            internals: { set, originalKeys },
            properties: {
              size: getMethod("size"),
              elements: getMethod("elements"),
              add: getMethod("add"),
              remove: getMethod("remove"),
              has: getMethod("has"),
              clear: getMethod("clear"),
              display: getMethod("display"),
            },
          };
        },
      },
    },
    methods: {
      size: {
        body: ([self]) => self.set.size,
      },
      elements: {
        body: ([self]) =>
          [...self.set.keys()].map((key) => self.originalKeys.get(key)),
      },
      add: {
        params: ["element"],
        body: ([self, element]) => {
          const key = toKey(element);
          self.set.add(key);
          self.originalKeys.set(key, element);
          return self;
        },
      },
      remove: {
        params: ["element"],
        body: ([self, element]) => {
          const key = toKey(element);
          self.set.delete(key);
          self.originalKeys.delete(key);
          return self;
        },
      },
      has: {
        params: ["element"],
        body: ([self, element]) => self.set.has(toKey(element)),
      },
      clear: {
        body: ([self]) => {
          self.set.clear();
          return self;
        },
      },
      display: {
        body: ([self], { kpcallback }) =>
          `MutableSet {elements: ${toString(kpcallback(self.properties.elements, [], kpobject()), kpcallback)}}`,
      },
    },
  }),
  ...platformClass("MutableMap", {
    protocols: [displayProtocol],
    constructors: {
      newMutableMap: {
        params: [
          {
            name: "entries",
            type: arrayOf(tupleLike([anyProtocol, anyProtocol])),
            defaultValue: literal([]),
          },
        ],
        body: ([entries], { getMethod }) => {
          const realEntries = entries.map(([key, value]) => [
            toKey(key),
            value,
          ]);
          const map = new Map(realEntries);
          const originalKeys = new Map(
            realEntries.map(([key, _], i) => [key, entries[i][0]])
          );
          return {
            internals: { map, originalKeys },
            properties: {
              size: getMethod("size"),
              keys: getMethod("keys"),
              values: getMethod("values"),
              entries: getMethod("entries"),
              set: getMethod("set"),
              storeAt: getMethod("storeAt"),
              remove: getMethod("remove"),
              has: getMethod("has"),
              at: getMethod("at"),
              clear: getMethod("clear"),
              display: getMethod("display"),
            },
          };
        },
      },
    },
    methods: {
      size: {
        body: ([self]) => self.map.size,
      },
      keys: {
        body: ([self]) =>
          [...self.map.keys()].map((key) => self.originalKeys.get(key)),
      },
      values: {
        body: ([self]) => [...self.map.values()],
      },
      entries: {
        body: ([self]) =>
          [...self.map.entries()].map(([key, value]) => [
            self.originalKeys.get(key),
            value,
          ]),
      },
      set: {
        params: ["key", "value"],
        body: ([self, key, value]) => {
          const realKey = toKey(key);
          self.map.set(realKey, value);
          self.originalKeys.set(realKey, key);
          return self;
        },
      },
      storeAt: {
        params: ["value", "key"],
        body: ([self, value, key]) => {
          const realKey = toKey(key);
          self.map.set(realKey, value);
          self.originalKeys.set(realKey, key);
          return self;
        },
      },
      remove: {
        params: ["key"],
        body: ([self, key]) => {
          const realKey = toKey(key);
          self.map.delete(realKey);
          self.originalKeys.delete(realKey);
          return self;
        },
      },
      has: {
        params: ["key"],
        body: ([self, key]) => self.map.has(toKey(key)),
      },
      at: {
        params: ["key"],
        namedParams: [optionalFunctionParameter("default")],
        body: ([self, key, default_], { kpcallback }) => {
          const realKey = toKey(key);
          return indexMapping(self.map, realKey, default_, kpcallback, self);
        },
      },
      clear: {
        body: ([self]) => {
          self.map.clear();
          self.originalKeys.clear();
          return self;
        },
      },
      display: {
        body: ([self], { kpcallback }) =>
          `MutableMap {entries: ${toString(kpcallback(self.properties.entries, [], kpobject()), kpcallback)}}`,
      },
    },
  }),
  platformFunction(
    "validate",
    { params: ["value", "schema"] },
    function ([value, schema], { kpcallback }) {
      validate(value, schema, kpcallback);
      return true;
    }
  ),
  platformFunction(
    "matches",
    { params: ["value", "schema"] },
    function ([value, schema], { kpcallback }) {
      return matches(value, schema, kpcallback);
    }
  ),
  platformFunction(
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
  platformFunction(
    "oneOf",
    { params: [{ rest: "values" }] },
    function ([values]) {
      return oneOf(values);
    }
  ),
  platformFunction(
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
  platformFunction(
    "tupleLike",
    {
      params: ["shape"],
    },
    function ([shape]) {
      return tupleLike(shape);
    }
  ),
  platformFunction(
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
  platformFunction(
    "recordLike",
    {
      params: ["shape"],
    },
    function ([shape]) {
      return recordLike(shape);
    }
  ),
  platformFunction(
    "optional",
    {
      params: ["schema"],
    },
    function ([schema]) {
      return optional(schema);
    }
  ),
  platformFunction(
    "either",
    { params: [{ rest: "schemas" }] },
    function ([schemas]) {
      return either(...schemas);
    }
  ),
  platformFunction(
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

export function platformFunction(name, paramSpec, f) {
  f.functionName = name;
  for (const property in paramSpec) {
    f[property] = paramSpec[property];
  }
  return f;
}

function platformConstructor(name, paramSpec, f, methods) {
  const result = platformFunction(name, paramSpec, f);
  result.methods = methods;
  return result;
}

function platformMethod(name, paramSpec, f) {
  f.methodName = name;
  for (const property in paramSpec) {
    f[property] = paramSpec[property];
  }
  return f;
}

export function platformClass(
  name,
  { protocols = [], constructors, methods: methodSpecs }
) {
  const class_ = new Class(name, [instanceProtocol, ...protocols]);
  const methods = Object.entries(methodSpecs).map(
    ([name, { params, namedParams, body }]) =>
      platformMethod(name, { params, namedParams }, body)
  );
  return [
    constant(name, class_),
    ...Object.entries(constructors).map(
      ([name, { params, namedParams, body }]) =>
        platformConstructor(
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
    return toStringSimple(value);
  } else if (isObject(value)) {
    const keys = kpoKeys(value);
    keys.sort(compare);
    return toStringSimple(
      kpobject(...keys.map((key) => [key, value.get(key)]))
    );
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
