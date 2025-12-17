import {
  arrayPattern,
  checked,
  literal,
  name,
  objectPattern,
  optional as optionalNode,
  rest,
  restKey,
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
  matches,
  objectOf,
  oneOfValues,
  optional,
  recordLike,
  returnError,
  satisfying,
  tupleLike,
} from "./validate.js";
import {
  anyProtocol,
  arrayClass,
  booleanClass,
  Class,
  classClass,
  classOf,
  collectionProtocol,
  display,
  displayProtocol,
  displaySimple,
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
  typeProtocol,
} from "./values.js";

const rawBuiltins = [
  platformFunction(
    "add",
    { posParams: [{ rest: { name: "numbers", type: arrayOf(numberClass) } }] },
    function ([numbers]) {
      return numbers.reduce((acc, value) => acc + value, 0);
    }
  ),
  platformFunction(
    "sub",
    {
      posParams: [
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
    { posParams: [{ name: "n", type: numberClass }] },
    function ([n]) {
      return -n;
    }
  ),
  platformFunction(
    "up",
    { posParams: [{ name: "n", type: numberClass }] },
    function ([n]) {
      return n + 1;
    }
  ),
  platformFunction(
    "down",
    { posParams: [{ name: "n", type: numberClass }] },
    function ([n]) {
      return n - 1;
    }
  ),
  platformFunction(
    "mul",
    { posParams: [{ rest: { name: "numbers", type: arrayOf(numberClass) } }] },
    function ([numbers]) {
      return numbers.reduce((acc, value) => acc * value, 1);
    }
  ),
  platformFunction(
    "div",
    {
      posParams: [
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
    { posParams: [{ name: "x", type: numberClass }] },
    function ([x]) {
      return 1 / x;
    }
  ),
  platformFunction(
    "quotientBy",
    {
      posParams: [
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
      posParams: [
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
      posParams: [{ name: "string", type: stringClass }],
    },
    function ([string]) {
      return [...string].map((char) => char.codePointAt(0));
    }
  ),
  platformFunction(
    "fromCodePoints",
    {
      posParams: [{ name: "codePoints", type: arrayOf(numberClass) }],
    },
    function ([codePoints]) {
      return String.fromCodePoint(...codePoints);
    }
  ),
  platformFunction(
    "join",
    {
      posParams: [{ name: "strings", type: either(arrayClass, streamClass) }],
      namedParams: [
        {
          name: "on",
          type: stringClass,
          defaultValue: literal(""),
        },
      ],
    },
    function ([strings, on], { kpcallback }) {
      const array = toArray(strings, kpcallback);
      validateArgument(array, arrayOf(stringClass));
      return array.join(on);
    }
  ),
  platformFunction(
    "split",
    {
      posParams: [{ name: "string", type: stringClass }],
      namedParams: [{ name: "on", type: stringClass }],
    },
    function ([string, on]) {
      return string.split(on);
    }
  ),
  platformFunction("eq", { posParams: ["a", "b"] }, function ([a, b]) {
    return equals(a, b);
  }),
  platformFunction(
    "lt",
    {
      posParams: [
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
    "le",
    {
      posParams: [
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
    "gt",
    {
      posParams: [
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
    "ge",
    {
      posParams: [
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
      posParams: [
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
      posParams: [
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
    { posParams: [{ name: "x", type: booleanClass }] },
    function ([x]) {
      return !x;
    }
  ),
  constant("Null", nullClass),
  constant("Boolean", booleanClass),
  constant("Number", numberClass),
  constant("String", stringClass),
  constant("Array", arrayClass),
  constant("Stream", streamClass),
  constant("Object", objectClass),
  constant("Function", functionClass),
  constant("Error", errorClass),
  constant("Class", classClass),
  constant("Protocol", protocolClass),
  constant("Collection", collectionProtocol),
  constant("Sequence", sequenceProtocol),
  constant("Display", displayProtocol),
  constant("Instance", instanceProtocol),
  constant("Type", typeProtocol),
  constant("Any", anyProtocol),
  platformFunction("classOf", { posParams: ["value"] }, function ([value]) {
    return classOf(value);
  }),
  platformFunction("isNull", { posParams: ["value"] }, function ([value]) {
    return value === null;
  }),
  platformFunction("isBoolean", { posParams: ["value"] }, function ([value]) {
    return isBoolean(value);
  }),
  platformFunction("isNumber", { posParams: ["value"] }, function ([value]) {
    return isNumber(value);
  }),
  platformFunction(
    "toNumber",
    { posParams: [{ name: "value", type: either(stringClass, numberClass) }] },
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
  platformFunction("isString", { posParams: ["value"] }, function ([value]) {
    return isString(value);
  }),
  platformFunction(
    "display",
    { posParams: ["value"] },
    function ([value], { kpcallback }) {
      return display(value, kpcallback);
    }
  ),
  platformFunction("isArray", { posParams: ["value"] }, function ([value]) {
    return isArray(value);
  }),
  platformFunction(
    "toArray",
    { posParams: [{ name: "value", type: collectionProtocol }] },
    function ([value], { kpcallback }) {
      return toArray(value, kpcallback);
    }
  ),
  platformFunction("isStream", { posParams: ["value"] }, function ([value]) {
    return isStream(value);
  }),
  platformFunction(
    "toStream",
    { posParams: [{ name: "value", type: collectionProtocol }] },
    function ([value], { kpcallback }) {
      return toStream(value, kpcallback);
    }
  ),
  platformFunction("isObject", { posParams: ["value"] }, function ([value]) {
    return isObject(value);
  }),
  platformFunction(
    "toObject",
    {
      posParams: [
        {
          name: "value",
          type: either(arrayClass, instanceProtocol),
        },
      ],
    },
    function ([value], { kpcallback }) {
      return toObject(value, kpcallback);
    }
  ),
  platformFunction("isFunction", { posParams: ["value"] }, function ([value]) {
    return isFunction(value);
  }),
  platformFunction("isError", { posParams: ["value"] }, function ([value]) {
    return isError(value);
  }),
  platformFunction("isClass", { posParams: ["value"] }, function ([value]) {
    return isClass(value);
  }),
  platformFunction("isProtocol", { posParams: ["value"] }, function ([value]) {
    return isProtocol(value);
  }),
  platformFunction("isSequence", { posParams: ["value"] }, function ([value]) {
    return isSequence(value);
  }),
  platformFunction("isType", { posParams: ["value"] }, function ([value]) {
    return isType(value);
  }),
  platformFunction("isInstance", { posParams: ["value"] }, function ([value]) {
    return isInstance(value);
  }),
  platformFunction(
    "if",
    {
      posParams: [{ name: "condition", type: booleanClass }],
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
      posParams: [
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
    "length",
    { posParams: [{ name: "sequence", type: sequenceProtocol }] },
    function ([sequence], { kpcallback }) {
      if (isString(sequence)) {
        return [...sequence].length;
      } else if (isArray(sequence, kpcallback)) {
        return sequence.length;
      } else {
        return toArray(sequence, kpcallback).length;
      }
    }
  ),
  platformFunction(
    "sort",
    {
      posParams: [{ name: "collection", type: collectionProtocol }],
      namedParams: [
        {
          name: "by",
          type: either(functionClass, nullClass),
          defaultValue: literal(null),
        },
      ],
    },
    function ([collection, by], { kpcallback }) {
      const array = toArray(collection, kpcallback);
      if (array.length === 0) {
        return array;
      }
      const ordered = either(
        numberClass,
        stringClass,
        booleanClass,
        arrayClass
      );
      if (by) {
        const withSortKey = array.map((element) => [
          element,
          kpcallback(by, [element], kpobject()),
        ]);
        validateArgument(withSortKey[0][1], ordered);
        const keyClass = classOf(withSortKey[0][1]);
        for (const [_, key] of withSortKey) {
          validateReturn(key, keyClass);
        }
        withSortKey.sort(([_a, aKey], [_b, bKey]) => compare(aKey, bKey));
        return withSortKey.map(([element, _]) => element);
      } else {
        validateArgument(array[0], ordered);
        const elementClass = classOf(array[0]);
        validateArgument(array, arrayOf(elementClass));
        const result = [...array];
        result.sort(compare);
        return result;
      }
    }
  ),
  platformFunction(
    "forEach",
    {
      posParams: [
        { name: "collection", type: collectionProtocol },
        { name: "action", type: functionClass },
      ],
    },
    function ([collection, action], { kpcallback }) {
      const array = toArray(collection, kpcallback);
      for (const element of array) {
        kpcallback(action, [element], kpobject());
      }
      return array;
    }
  ),
  platformFunction(
    "isEmpty",
    { posParams: [{ name: "collection", type: collectionProtocol }] },
    function ([collection], { kpcallback }) {
      if (isString(collection)) {
        return collection.length === 0;
      } else if (isArray(collection)) {
        return collection.length === 0;
      } else if (isInstance(collection) && "isEmpty" in collection.properties) {
        return kpcallback(collection.properties.isEmpty, [], kpobject());
      } else {
        return toStream(collection, kpcallback).isEmpty();
      }
    }
  ),
  // Override the natural implementation for performance.
  platformFunction(
    "transform",
    {
      posParams: [
        { name: "collection", type: collectionProtocol },
        { name: "f", type: functionClass },
      ],
    },
    function ([collection, f], { kpcallback }) {
      const start = toStream(collection, kpcallback);
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
    "keepFirst",
    {
      posParams: [
        { name: "sequence", type: sequenceProtocol },
        { name: "n", type: numberClass },
      ],
    },
    function ([sequence, n], { kpcallback }) {
      if (isString(sequence)) {
        if (n <= 0) {
          return "";
        }
        return sequence.slice(0, n);
      }

      if (n <= 0) {
        return emptyStream();
      }

      const start = toStream(sequence, kpcallback);

      function streamFrom(current, i) {
        if (current.properties.isEmpty()) {
          return emptyStream();
        } else {
          return stream({
            value() {
              return current.properties.value();
            },
            next() {
              if (i >= n) {
                return emptyStream();
              } else {
                return streamFrom(current.properties.next(), i + 1);
              }
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
      posParams: [
        { name: "sequence", type: sequenceProtocol },
        { name: "n", type: numberClass, defaultValue: literal(1) },
      ],
    },
    function ([sequence, n], { kpcallback }) {
      if (n <= 0) {
        return sequence;
      }
      if (isString(sequence)) {
        return sequence.slice(n);
      }
      let start = toStream(sequence, kpcallback);

      for (let i = 1; i <= n; i++) {
        if (start.properties.isEmpty()) {
          return emptyStream();
        }
        start = start.properties.next();
      }

      return start;
    }
  ),
  // Override the natural implementation for performance.
  platformFunction(
    "flatten",
    { posParams: [{ name: "sequence", type: sequenceProtocol }] },
    function ([sequence], { kpcallback }) {
      const outer = toStream(sequence, kpcallback);
      function streamFrom(startOuter, startInner) {
        let outer = startOuter;
        let inner = startInner;
        while (!outer.properties.isEmpty() && inner.properties.isEmpty()) {
          const rawInner = outer.properties.value();
          validateReturn(rawInner, sequenceProtocol);
          inner = toStream(rawInner, kpcallback);
          outer = outer.properties.next();
        }
        if (inner.properties.isEmpty()) {
          return emptyStream();
        } else {
          return stream({
            value() {
              return inner.properties.value();
            },
            next() {
              return streamFrom(outer, inner.properties.next());
            },
          });
        }
      }
      return streamFrom(outer, emptyStream());
    }
  ),
  platformFunction(
    "keys",
    { posParams: [{ name: "object", type: objectClass }] },
    function ([object]) {
      return [...object.keys()];
    }
  ),
  platformFunction(
    "at",
    {
      posParams: [
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
        validateArgument(index, numberClass);
        return indexArray(collection, index, default_, kpcallback);
      } else if (isStream(collection)) {
        validateArgument(index, either(numberClass, stringClass));
        return indexStream(collection, index, default_, kpcallback);
      } else if (isObject(collection)) {
        validateArgument(index, stringClass);
        return indexMapping(collection, index, default_, kpcallback);
      } else {
        if (isSequence(collection) && isNumber(index)) {
          return indexSequenceInstance(collection, index, default_, kpcallback);
        } else {
          validateArgument(index, stringClass);
          return indexInstance(collection, index, default_, kpcallback);
        }
      }
    }
  ),
  platformFunction(
    "debug",
    {
      posParams: [
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
        debugLog(`${name}: ${display(value, kpcallback)}`);
      } else {
        debugLog(display(value, kpcallback));
      }
      return value;
    }
  ),
  platformFunction(
    "callOnce",
    {
      posParams: [{ name: "body", type: functionClass }],
    },
    function ([body], { kpcallback }) {
      let result;
      return () => {
        if (result === undefined) {
          result = kpcallback(body, [], kpobject());
        }
        return result;
      };
    }
  ),
  ...platformClass("Set", {
    protocols: [collectionProtocol, displayProtocol],
    constructors: {
      newSet: {
        posParams: [
          {
            name: "elements",
            type: collectionProtocol,
            defaultValue: literal([]),
          },
        ],
        body: ([elements], { getMethod, kpcallback }) => {
          const array = toArray(elements, kpcallback);
          const keys = array.map(toKey);
          const set = new Set(keys);
          const originalKeys = new Map(keys.map((key, i) => [key, array[i]]));
          return {
            internals: {
              set,
              originalKeys,
            },
            properties: {
              size: getMethod("size"),
              elements: getMethod("elements"),
              has: getMethod("has"),
              toArray: getMethod("toArray"),
              toStream: getMethod("toStream"),
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
        posParams: ["element"],
        body: ([self, element]) => self.set.has(toKey(element)),
      },
      toArray: {
        body: ([self]) =>
          [...self.set.keys()].map((key) => self.originalKeys.get(key)),
      },
      toStream: {
        body: ([self]) => {
          return iterToStream(self.set.keys(), (key) =>
            self.originalKeys.get(key)
          );
        },
      },
      display: {
        body: ([self], { kpcallback }) =>
          `Set {elements: ${display(kpcallback(self.properties.elements, [], kpobject()), kpcallback)}}`,
      },
    },
  }),
  ...platformClass("Map", {
    protocols: [collectionProtocol, displayProtocol],
    constructors: {
      newMap: {
        posParams: [
          {
            name: "entries",
            type: collectionProtocol,
            defaultValue: literal([]),
          },
        ],
        body: ([entries], { getMethod, kpcallback }) => {
          const array = toArray(entries, kpcallback);
          validateArgument(
            array,
            arrayOf(tupleLike([anyProtocol, anyProtocol]))
          );
          const realEntries = array.map(([key, value]) => [toKey(key), value]);
          const map = new Map(realEntries);
          const originalKeys = new Map(
            realEntries.map(([key, _], i) => [key, array[i][0]])
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
              toArray: getMethod("toArray"),
              toStream: getMethod("toStream"),
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
        posParams: ["key"],
        body: ([self, key]) => self.map.has(toKey(key)),
      },
      at: {
        posParams: ["key"],
        namedParams: [optionalFunctionParameter("default")],
        body: ([self, key, default_], { kpcallback }) => {
          const realKey = toKey(key);
          return indexMapping(
            self.map,
            realKey,
            default_,
            kpcallback,
            "missingKey",
            self
          );
        },
      },
      toArray: {
        body: ([self]) =>
          [...self.map.entries()].map(([key, value]) => [
            self.originalKeys.get(key),
            value,
          ]),
      },
      toStream: {
        body: ([self]) => {
          return iterToStream(self.map.entries(), ([key, value]) => [
            self.originalKeys.get(key),
            value,
          ]);
        },
      },
      display: {
        body: ([self], { kpcallback }) =>
          `Map {entries: ${display(kpcallback(self.properties.entries, [], kpobject()), kpcallback)}}`,
      },
    },
  }),
  ...platformClass("Var", {
    protocols: [displayProtocol],
    constructors: {
      newVar: {
        posParams: ["initialValue"],
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
        posParams: ["newValue"],
        body: ([self, newValue]) => {
          self.value = newValue;
          return newValue;
        },
      },
      display: {
        body: ([self], { kpcallback }) =>
          `Var {value: ${display(self.value, kpcallback)}}`,
      },
    },
  }),
  ...platformClass("MutableArray", {
    protocols: [sequenceProtocol, displayProtocol],
    constructors: {
      newMutableArray: {
        posParams: [
          {
            name: "elements",
            type: sequenceProtocol,
            defaultValue: literal([]),
          },
        ],
        body: ([elements], { getMethod, kpcallback }) => {
          const array = isArray(elements)
            ? [...elements]
            : toArray(elements, kpcallback);
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
              isEmpty: getMethod("isEmpty"),
              toArray: getMethod("toArray"),
              toStream: getMethod("toStream"),
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
        posParams: ["element"],
        body: ([self, element]) => {
          self.array.push(element);
          return self;
        },
      },
      set: {
        posParams: [{ name: "index", type: numberClass }, "element"],
        body: ([self, index, element]) => {
          setArray(self.array, index, element, self);
          return self;
        },
      },
      storeAt: {
        posParams: ["element", { name: "index", type: numberClass }],
        body: ([self, element, index]) => {
          setArray(self.array, index, element, self);
          return self;
        },
      },
      at: {
        posParams: [{ name: "index", type: numberClass }],
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
      isEmpty: {
        body: ([self]) => self.array.length === 0,
      },
      toArray: {
        body: ([self]) => [...self.array],
      },
      toStream: {
        body: ([self], { kpcallback }) => {
          return toStream([...self.array], kpcallback);
        },
      },
      display: {
        body: ([self], { kpcallback }) =>
          `MutableArray {elements: ${display(kpcallback(self.properties.elements, [], kpobject()), kpcallback)}}`,
      },
    },
  }),
  ...platformClass("MutableSet", {
    protocols: [collectionProtocol, displayProtocol],
    constructors: {
      newMutableSet: {
        posParams: [
          {
            name: "elements",
            type: collectionProtocol,
            defaultValue: literal([]),
          },
        ],
        body: ([elements], { getMethod, kpcallback }) => {
          const array = toArray(elements, kpcallback);
          const keys = array.map(toKey);
          const set = new Set(keys);
          const originalKeys = new Map(keys.map((key, i) => [key, array[i]]));
          return {
            internals: { set, originalKeys },
            properties: {
              size: getMethod("size"),
              elements: getMethod("elements"),
              add: getMethod("add"),
              remove: getMethod("remove"),
              has: getMethod("has"),
              clear: getMethod("clear"),
              isEmpty: getMethod("isEmpty"),
              toArray: getMethod("toArray"),
              toStream: getMethod("toStream"),
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
        posParams: ["element"],
        body: ([self, element]) => {
          const key = toKey(element);
          self.set.add(key);
          self.originalKeys.set(key, element);
          return self;
        },
      },
      remove: {
        posParams: ["element"],
        body: ([self, element]) => {
          const key = toKey(element);
          self.set.delete(key);
          self.originalKeys.delete(key);
          return self;
        },
      },
      has: {
        posParams: ["element"],
        body: ([self, element]) => self.set.has(toKey(element)),
      },
      clear: {
        body: ([self]) => {
          self.set.clear();
          return self;
        },
      },
      isEmpty: {
        body: ([self]) => self.set.size === 0,
      },
      toArray: {
        body: ([self]) =>
          [...self.set.keys()].map((key) => self.originalKeys.get(key)),
      },
      toStream: {
        body: ([self]) => {
          return toStream(
            [...self.set].map((key) => self.originalKeys.get(key))
          );
        },
      },
      display: {
        body: ([self], { kpcallback }) =>
          `MutableSet {elements: ${display(kpcallback(self.properties.elements, [], kpobject()), kpcallback)}}`,
      },
    },
  }),
  ...platformClass("MutableMap", {
    protocols: [collectionProtocol, displayProtocol],
    constructors: {
      newMutableMap: {
        posParams: [
          {
            name: "entries",
            type: collectionProtocol,
            defaultValue: literal([]),
          },
        ],
        body: ([entries], { getMethod, kpcallback }) => {
          const array = toArray(entries, kpcallback);
          validateArgument(
            array,
            arrayOf(tupleLike([anyProtocol, anyProtocol]))
          );
          const realEntries = array.map(([key, value]) => [toKey(key), value]);
          const map = new Map(realEntries);
          const originalKeys = new Map(
            realEntries.map(([key, _], i) => [key, array[i][0]])
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
              isEmpty: getMethod("isEmpty"),
              toArray: getMethod("toArray"),
              toStream: getMethod("toStream"),
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
        posParams: ["key", "value"],
        body: ([self, key, value]) => {
          const realKey = toKey(key);
          self.map.set(realKey, value);
          self.originalKeys.set(realKey, key);
          return self;
        },
      },
      storeAt: {
        posParams: ["value", "key"],
        body: ([self, value, key]) => {
          const realKey = toKey(key);
          self.map.set(realKey, value);
          self.originalKeys.set(realKey, key);
          return self;
        },
      },
      remove: {
        posParams: ["key"],
        body: ([self, key]) => {
          const realKey = toKey(key);
          self.map.delete(realKey);
          self.originalKeys.delete(realKey);
          return self;
        },
      },
      has: {
        posParams: ["key"],
        body: ([self, key]) => self.map.has(toKey(key)),
      },
      at: {
        posParams: ["key"],
        namedParams: [optionalFunctionParameter("default")],
        body: ([self, key, default_], { kpcallback }) => {
          const realKey = toKey(key);
          return indexMapping(
            self.map,
            realKey,
            default_,
            kpcallback,
            "missingKey",
            self
          );
        },
      },
      clear: {
        body: ([self]) => {
          self.map.clear();
          self.originalKeys.clear();
          return self;
        },
      },
      isEmpty: {
        body: ([self]) => self.map.size === 0,
      },
      toArray: {
        body: ([self]) =>
          [...self.map.entries()].map(([key, value]) => [
            self.originalKeys.get(key),
            value,
          ]),
      },
      toStream: {
        body: ([self]) => {
          return toStream(
            [...self.map.entries()].map(([key, value]) => [
              self.originalKeys.get(key),
              value,
            ])
          );
        },
      },
      display: {
        body: ([self], { kpcallback }) =>
          `MutableMap {entries: ${display(kpcallback(self.properties.entries, [], kpobject()), kpcallback)}}`,
      },
    },
  }),
  platformFunction(
    "newError",
    {
      posParams: [{ name: "type", type: stringClass }],
      namedParams: [{ rest: "details" }],
    },
    function ([type, details]) {
      return kperror(type, ...kpoEntries(details));
    }
  ),
  platformFunction(
    "throw",
    {
      posParams: [{ name: "error", type: errorClass }],
    },
    function ([error]) {
      throw error;
    }
  ),
  platformFunction(
    "try",
    {
      posParams: [{ name: "f", type: functionClass }],
      namedParams: [
        { name: "onError", type: functionClass },
        optionalFunctionParameter("onSuccess"),
      ],
    },
    function ([f, onError, onSuccess], { kpcallback }) {
      let result;
      try {
        result = kpcallback(f, [], kpobject());
      } catch (error) {
        return kpcallback(onError, [error], kpobject());
      }
      if (onSuccess) {
        return kpcallback(onSuccess, [result], kpobject());
      } else {
        return result;
      }
    }
  ),
  platformFunction(
    "validate",
    { posParams: ["value", "schema"] },
    function ([value, schema], { kpcallback }) {
      validate(value, schema, kpcallback);
      return true;
    }
  ),
  platformFunction(
    "matches",
    { posParams: ["value", "schema"] },
    function ([value, schema], { kpcallback }) {
      return matches(value, schema, kpcallback);
    }
  ),
  platformFunction(
    "oneOfValues",
    { posParams: [{ rest: "values" }] },
    function ([values]) {
      return oneOfValues(values);
    }
  ),
  platformFunction(
    "either",
    { posParams: [{ rest: "schemas" }] },
    function ([schemas]) {
      return either(...schemas);
    }
  ),
  platformFunction(
    "satisfying",
    { posParams: ["schema", { name: "condition", type: functionClass }] },
    function ([schema, condition]) {
      return satisfying(schema, condition);
    }
  ),
  platformFunction(
    "arrayOf",
    {
      posParams: ["elements"],
    },
    function ([elements]) {
      return arrayOf(elements);
    }
  ),
  platformFunction(
    "tupleLike",
    {
      posParams: ["shape"],
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
      ],
    },
    function ([keys, values]) {
      return objectOf(keys, values);
    }
  ),
  platformFunction(
    "recordLike",
    {
      posParams: ["shape"],
    },
    function ([shape]) {
      return recordLike(shape);
    }
  ),
  platformFunction(
    "optional",
    {
      posParams: ["schema"],
    },
    function ([schema]) {
      return optional(schema);
    }
  ),
];

export function constant(name, constantValue) {
  return [name, value(constantValue)];
}

export function platformFunction(name, paramSpec, f) {
  f.functionName = name;
  if ("posParams" in paramSpec) {
    f.posParams = paramSpec.posParams;
  }
  if ("namedParams" in paramSpec) {
    f.namedParams = paramSpec.namedParams;
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
  if ("posParams" in paramSpec) {
    f.posParams = paramSpec.posParams;
  }
  if ("namedParams" in paramSpec) {
    f.namedParams = paramSpec.namedParams;
  }
  return f;
}

export function platformClass(
  name,
  { protocols = [], constructors, methods: methodSpecs }
) {
  const class_ = new Class(name, protocols);
  const methods = Object.entries(methodSpecs).map(
    ([name, { posParams, namedParams, body }]) =>
      platformMethod(name, { posParams, namedParams }, body)
  );
  return [
    constant(name, class_),
    ...Object.entries(constructors).map(
      ([name, { posParams, namedParams, body }]) =>
        platformConstructor(
          name,
          { posParams, namedParams },
          (args, context) => {
            const { internals, properties } = body(args, context);
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
  const posParamPattern = arrayPattern(
    ...(f.posParams ?? []).map(toArrayNamePattern)
  );
  const namedParamPattern = objectPattern(
    ...(f.namedParams ?? []).map(toObjectNamePattern)
  );
  return { posParamPattern, namedParamPattern };
}

function toArrayNamePattern(param) {
  if (typeof param === "string") {
    return name(param);
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
    return [literal(param), name(param)];
  } else if ("rest" in param) {
    return [restKey(), toNamePattern(param.rest)];
  } else if ("defaultValue" in param) {
    const { defaultValue, ...rest } = param;
    return [
      literal(param.name),
      optionalNode(toNamePattern(rest), defaultValue),
    ];
  } else if ("type" in param) {
    const { type, ...rest } = param;
    return [literal(param.name), checked(toNamePattern(rest), type)];
  } else {
    throw new Error(`Invalid object name pattern: ${param}`);
  }
}

function toNamePattern(param) {
  if (typeof param === "string") {
    return name(param);
  } else if ("type" in param) {
    const { type, ...rest } = param;
    return checked(toNamePattern(rest), type);
  } else {
    return name(param.name);
  }
}

function compareValidating(a, b) {
  validateArgument(
    a,
    either(numberClass, stringClass, booleanClass, arrayClass)
  );
  validateArgument(
    b,
    either(numberClass, stringClass, booleanClass, arrayClass)
  );
  validateArgument(b, classOf(a));
  return compare(a, b);
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
      const elementCompare = compareValidating(a[i], b[i]);
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

export function toArray(value, kpcallback) {
  if (isArray(value)) {
    return value;
  } else if (isString(value)) {
    return [...value];
  } else if (isStream(value)) {
    let current = value;
    const result = [];
    while (!current.properties.isEmpty()) {
      result.push(current.properties.value());
      current = current.properties.next();
    }
    return result;
  } else if (isInstance(value) && "toArray" in value.properties) {
    return kpcallback(value.properties.toArray, [], kpobject());
  } else {
    return toArray(toStream(value, kpcallback), kpcallback);
  }
}

export function toStream(value, kpcallback) {
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
    return toStream(toArray(value, kpcallback));
  } else if (isStream(value)) {
    return value;
  } else {
    return kpcallback(value.properties.toStream, [], kpobject());
  }
}

export function toObject(value, kpcallback) {
  if (isObject(value)) {
    return value;
  } else if (isSequence(value)) {
    const array = toArray(value, kpcallback);
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

export function indexString(
  string,
  index,
  default_,
  kpcallback,
  valueForError = string
) {
  if (index > 0) {
    let i = 1;
    for (const codePoint of string) {
      if (i === index) {
        return codePoint;
      }
      i += 1;
    }
    return badIndex();
  } else if (index < 0) {
    let i = 1;
    for (const codePoint of [...string].reverse()) {
      if (i === -index) {
        return codePoint;
      }
      i += 1;
    }
    return badIndex();
  } else {
    return badIndex();
  }

  function badIndex() {
    if (default_) {
      return kpcallback(default_, [], kpobject());
    } else {
      throw kperror(
        "indexOutOfBounds",
        ["value", valueForError],
        ["length", string.length],
        ["index", index]
      );
    }
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
      return indexArray(
        toArray(stream, kpcallback),
        index,
        default_,
        kpcallback,
        stream
      );
    } else if (index > 0) {
      let last;
      let current = stream;
      let j = 0;
      while (!current.properties.isEmpty() && j < index) {
        last = current;
        j += 1;
        if (j === index) {
          return last.properties.value();
        }
        current = current.properties.next();
      }
      if (default_) {
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

export function indexSequenceInstance(
  sequence,
  index,
  default_,
  kpcallback,
  valueForError = sequence
) {
  if ("at" in sequence.properties) {
    const namedArgs = [];
    if (default_) {
      namedArgs.push(["default", default_]);
    }
    return kpcallback(sequence.properties.at, [index], kpobject(...namedArgs));
  } else {
    return indexStream(
      toStream(sequence, kpcallback),
      index,
      default_,
      kpcallback,
      valueForError
    );
  }
}

export function indexMapping(
  mapping,
  index,
  default_,
  kpcallback,
  errorType = "missingProperty",
  valueForError = mapping
) {
  if (mapping.has(index)) {
    return mapping.get(index);
  } else if (default_) {
    return kpcallback(default_, [], kpobject());
  } else {
    throw kperror(errorType, ["value", valueForError], ["key", index]);
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

function iterToStream(iter, f) {
  function streamFrom(current) {
    if (current.done) {
      return emptyStream();
    } else {
      return stream({
        value() {
          return f(current.value);
        },
        next() {
          return streamFrom(iter.next());
        },
      });
    }
  }
  return streamFrom(iter.next());
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
    return displaySimple(value);
  } else if (isObject(value)) {
    const keys = kpoKeys(value);
    keys.sort(compare);
    return displaySimple(kpobject(...keys.map((key) => [key, value.get(key)])));
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
