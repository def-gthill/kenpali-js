import { given, literal } from "./kpast.js";
import kpthrow from "./kperror.js";
import { callOnValues, catch_, evalWithBuiltins, rethrow } from "./kpeval.js";
import kpobject, {
  kpoEntries,
  kpoKeys,
  kpoMap,
  kpoMerge,
  kpoValues,
} from "./kpobject.js";

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
  builtin("isNull", { params: ["value"] }, function ([value]) {
    return value === null;
  }),
  builtin("isBoolean", { params: ["value"] }, function ([value]) {
    return isBoolean(value);
  }),
  builtin("isNumber", { params: ["value"] }, function ([value]) {
    return isNumber(value);
  }),
  builtin("toNumber", { params: ["value"] }, function ([value]) {
    return parseFloat(value);
  }),
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
  builtin("repeat", { params: ["start", "step"] }, function ([start, step]) {
    return loop("repeat", start, step, () => {});
  }),
  builtin(
    "at",
    {
      params: [
        { name: "collection", type: either("string", "array", "object") },
        "index",
      ],
    },
    function ([collection, index]) {
      if (isString(collection) || isArray(collection)) {
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
  builtin("length", { params: ["array"] }, function ([array]) {
    return array.length;
  }),
  builtin("build", { params: ["start", "step"] }, function ([start, step]) {
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
  }),
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
          return callOnValues(f, [value], bindings);
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

function isString(value) {
  return typeof value === "string";
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

export function isThrown(value) {
  return isObject(value) && value.has("#thrown");
}

function isObject(value) {
  return value instanceof Map;
}

function isFunction(value) {
  return isBuiltin(value) || isGiven(value);
}

function isSequence(value) {
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

export function eagerBind(value, schema) {
  return deepUnwrapErrorPassed(eagerBindInternal(value, schema));
}

function eagerBindInternal(value, schema) {
  const forcedValue = deepForce(value);
  if (isThrown(forcedValue)) {
    return forcedValue;
  }
  const bindings = lazyBindInternal(forcedValue, schema);
  if (isThrown(bindings)) {
    return bindings;
  }
  const forcedBindings = kpobject();
  for (const key of bindings.keys()) {
    const bindingValue = deepForce(bindings.get(key));
    if (isThrown(bindingValue)) {
      return bindingValue;
    } else {
      forcedBindings.set(key, bindingValue);
    }
  }
  return forcedBindings;
}

export function force(value) {
  if (isThrown(value)) {
    return withReason(kpthrow("errorPassed"), value);
  } else if (value === null) {
    return value;
  } else if (typeof value === "object" && "expression" in value) {
    return evalWithBuiltins(value.expression, value.context);
  } else if (typeof value === "object" && "thunk" in value) {
    return value.thunk();
  } else {
    return value;
  }
}

export function deepForce(value) {
  const forcedValue = force(value);
  if (isThrown(forcedValue)) {
    return forcedValue;
  } else if (isArray(forcedValue)) {
    return forcedValue.map(deepForce);
  } else if (isObject(forcedValue)) {
    return kpoMap(forcedValue, ([key, propertyValue]) => [
      key,
      deepForce(propertyValue),
    ]);
  } else {
    return force(forcedValue);
  }
}

function namesToBind(schema) {
  if (isArray(schema)) {
    return mergeArrays(schema.map(namesToBind));
  } else if (isObject(schema)) {
    if (schema.has("#either")) {
      return mergeArrays(schema.get("#either").map(namesToBind));
    } else if (schema.has("#type")) {
      if (schema.has("elements")) {
        return namesToBind(schema.get("elements"));
      } else if (schema.has("values")) {
        return namesToBind(schema.get("values"));
      } else {
        return [];
      }
    } else if (schema.has("#bind")) {
      return [schema.get("as"), ...namesToBind(schema.get("#bind"))];
    } else if (schema.has("#default")) {
      return namesToBind(schema.get("for"));
    } else {
      return [
        ...kpoKeys(schema),
        ...mergeArrays(kpoValues(schema).map(namesToBind)),
      ];
    }
  } else {
    return [];
  }
}

function mergeArrays(arrays) {
  const result = [];
  for (const array of arrays) {
    for (const element of array) {
      if (!result.includes(element)) {
        result.push(element);
      }
    }
  }
  return result;
}

export function lazyBind(value, schema) {
  return deepUnwrapErrorPassed(lazyBindInternal(value, schema));
}

function lazyBindInternal(value, schema) {
  if (isString(schema)) {
    return bindTypeSchema(value, schema);
  } else if (isArray(schema)) {
    return bindArraySchema(value, schema);
  } else if (isObject(schema)) {
    if (schema.has("#either")) {
      return bindUnionSchema(value, schema);
    } else if (schema.has("#oneOf")) {
      return bindLiteralListSchema(value, schema);
    } else if (schema.has("#type")) {
      const result = bindTypeWithConditionsSchema(value, schema);
      return result;
    } else if (schema.has("#bind")) {
      return explicitBind(value, schema);
    } else if (schema.has("#default")) {
      return lazyBindInternal(value, schema.get("for"));
    } else {
      return bindObjectSchema(value, schema);
    }
  } else {
    return kpthrow("invalidSchema", ["schema", schema]);
  }
}

function bindTypeSchema(value, schema) {
  if (isPending(value)) {
    // Type schemas don't bind names by themselves.
    // They need to wait for the parent to force the value.
    return kpobject();
  }
  if (isThrown(value)) {
    return withReason(kpthrow("errorPassed"), value);
  }
  if (typeOf(value) === schema) {
    return kpobject();
  } else if (schema === "any") {
    return kpobject();
  } else if (schema === "object" && isObject(value)) {
    return kpobject();
  } else if (schema === "function" && isFunction(value)) {
    return kpobject();
  } else if (schema === "sequence" && isSequence(value)) {
    return kpobject();
  } else {
    return kpthrow("wrongType", ["value", value], ["expectedType", schema]);
  }
}

function bindArraySchema(value, schema) {
  if (isPending(value)) {
    // Array schemas don't bind names by themselves.
    // They need to wait for the parent to force the value.
    return kpobject();
  }
  if (isThrown(value)) {
    return withReason(kpthrow("errorPassed"), value);
  }
  if (!isArray(value)) {
    return kpthrow("wrongType", ["value", value], ["expectedType", "array"]);
  }
  const hasRest = isObject(schema.at(-1)) && schema.at(-1).has("#rest");
  const elementBindings = [];
  for (let i = 0; i < schema.length; i++) {
    if (isObject(schema[i]) && schema[i].has("#rest")) {
      break;
    } else if (i >= value.length) {
      if (isObject(schema[i]) && schema[i].has("#default")) {
        const forSchema = schema[i].get("for");
        elementBindings.push(
          kpobject([forSchema.get("as"), schema[i].get("#default")])
        );
      } else {
        return kpthrow(
          "missingElement",
          ["value", value],
          ["index", i + 1],
          ["schema", schema]
        );
      }
    } else {
      const bindings = lazyBindInternal(value[i], schema[i]);
      if (isThrown(bindings)) {
        if (bindings.get("#thrown") === "errorPassed") {
          return rethrow(bindings.get("reason"));
        } else {
          return kpthrow(
            "badElement",
            ["value", value],
            ["index", i + 1],
            ["reason", catch_(bindings)]
          );
        }
      }
      elementBindings.push(
        kpobject(
          ...kpoEntries(bindings).map(([key, bindingValue]) => [
            key,
            isPending(bindingValue)
              ? {
                  thunk: () => {
                    const forcedValue = force(bindingValue);
                    let result;
                    if (isThrown(forcedValue)) {
                      result = withReason(
                        kpthrow(
                          "badElement",
                          ["value", value],
                          ["index", i + 1]
                        ),
                        forcedValue
                      );
                    } else {
                      result = forcedValue;
                    }
                    return deepUnwrapErrorPassed(result);
                  },
                }
              : bindingValue,
          ])
        )
      );
    }
  }
  if (hasRest) {
    const bindings = lazyBindInternal(
      value.slice(schema.length - 1),
      arrayOf(schema.at(-1).get("#rest"))
    );
    elementBindings.push(bindings);
  }
  return kpoMerge(...elementBindings);
}

function bindUnionSchema(value, schema) {
  if (isPending(value)) {
    const keys = namesToBind(schema);
    const options = schema.get("#either");
    const bindings = options.map((option) => lazyBindInternal(value, option));

    return kpobject(
      ...keys.map((key) => [
        key,
        {
          thunk: () => {
            const errors = [];
            for (let i = 0; i < options.length; i++) {
              const option = options[i];
              const optionBindings = bindings[i];
              if (optionBindings.has(key)) {
                const forcedValue = force(optionBindings.get(key));
                if (isThrown(forcedValue)) {
                  errors.push([option, forcedValue]);
                } else {
                  return forcedValue;
                }
              }
            }

            if (
              errors.every(([_, err]) => err.get("#thrown") === "wrongType")
            ) {
              return kpthrow(
                "wrongType",
                ["value", value],
                [
                  "expectedType",
                  either(...errors.map(([_, err]) => err.get("expectedType"))),
                ]
              );
            } else {
              return kpthrow("badValue", ["value", value], ["errors", errors]);
            }
          },
        },
      ])
    );
  } else {
    let succeeded = false;
    const result = kpobject();
    const options = schema.get("#either");
    const bindings = options.map((option) => lazyBindInternal(value, option));
    const errors = [];
    const errorsByKey = kpobject();
    for (let i = 0; i < options.length; i++) {
      const option = options[i];
      const optionBindings = bindings[i];
      if (isThrown(optionBindings)) {
        if (optionBindings.get("#thrown") === "errorPassed") {
          return optionBindings;
        }
        errors.push([option, optionBindings]);
        for (const key of namesToBind(option)) {
          if (!errorsByKey.has(key)) {
            errorsByKey.set(key, optionBindings);
          }
        }
      } else {
        succeeded = true;
        for (const [key, binding] of optionBindings) {
          result.set(key, binding);
        }
      }
    }
    if (succeeded) {
      return kpoMerge(errorsByKey, result);
    }
    if (errors.every(([_, err]) => err.get("#thrown") === "wrongType")) {
      return kpthrow(
        "wrongType",
        ["value", value],
        [
          "expectedType",
          either(...errors.map(([_, err]) => err.get("expectedType"))),
        ]
      );
    } else {
      return kpthrow("badValue", ["value", value], ["errors", errors]);
    }
  }
}

function bindLiteralListSchema(value, schema) {
  if (isPending(value)) {
    // Literal list schemas don't bind names by themselves.
    // They need to wait for the parent to force the value.
    return kpobject();
  }
  if (isThrown(value)) {
    return withReason(kpthrow("errorPassed"), value);
  }
  for (const option of schema.get("#oneOf")) {
    if (equals(value, option)) {
      return kpobject();
    }
  }
  return kpthrow(
    "badValue",
    ["value", value],
    ["options", schema.get("#oneOf")]
  );
}

function bindTypeWithConditionsSchema(value, schema) {
  if (isPending(value)) {
    // Type-with-conditions schemas don't bind names by themselves.
    // They need to wait for the parent to force the value.
    return kpobject();
  }
  const typeBindings = bindTypeSchema(value, schema.get("#type"));
  if (isThrown(typeBindings)) {
    return typeBindings;
  }
  const subschemaBindings = kpobject();
  if (schema.has("elements")) {
    const keys = namesToBind(schema);
    const bindings = value.map((element) =>
      lazyBindInternal(element, schema.get("elements"))
    );

    for (const key of keys) {
      subschemaBindings.set(key, []);
    }
    for (let i = 0; i < value.length; i++) {
      const elementBindings = bindings[i];
      if (isThrown(elementBindings)) {
        return withReason(
          kpthrow("badElement", ["value", value], ["index", i + 1]),
          elementBindings
        );
      }
      for (const key of keys) {
        if (!elementBindings.has(key)) {
          subschemaBindings
            .get(key)
            .push(
              catch_(
                kpthrow("missingProperty", ["value", bindings], ["key", key])
              )
            );
          continue;
        }
        const elementValue = elementBindings.get(key);
        if (isPending(elementValue)) {
          subschemaBindings.get(key).push({
            thunk: () => {
              const forcedValue = force(elementValue);
              let result;
              if (isThrown(forcedValue)) {
                result = withReason(
                  kpthrow("badElement", ["value", value], ["index", i + 1]),
                  forcedValue
                );
              } else {
                result = forcedValue;
              }
              return deepUnwrapErrorPassed(result);
            },
          });
        } else {
          subschemaBindings.get(key).push(elementValue);
        }
      }
    }
  }
  if (schema.has("keys")) {
    for (const key of value.keys()) {
      const bindings = eagerBindInternal(key, schema.get("keys"));
      if (isThrown(bindings)) {
        return kpthrow("badKey", ["key", key], ["reason", catch_(bindings)]);
      }
    }
  }
  if (schema.has("values")) {
    const bindings = kpoMap(value, ([key, propertyValue]) => [
      key,
      lazyBindInternal(propertyValue, schema.get("values")),
    ]);

    const subschemaKeys = [];

    for (const [_, propertyBindings] of bindings) {
      for (const key of kpoKeys(propertyBindings)) {
        if (!subschemaKeys.includes(key)) {
          subschemaKeys.push(key);
        }
      }
    }

    for (const key of subschemaKeys) {
      subschemaBindings.set(key, kpobject());
    }

    for (const [key, propertyValue] of value) {
      const propertyBindings = bindings.get(key);
      if (isThrown(propertyBindings)) {
        return withReason(
          kpthrow("badProperty", ["key", key], ["value", propertyValue]),
          propertyBindings
        );
      }
      for (const subschemaKey of subschemaKeys) {
        if (!propertyBindings.has(subschemaKey)) {
          subschemaBindings
            .get(subschemaKey)
            .set(
              key,
              catch_(
                kpthrow(
                  "missingProperty",
                  ["value", bindings],
                  ["key", subschemaKey]
                )
              )
            );
          continue;
        }
        const propertyValue = propertyBindings.get(subschemaKey);

        if (isPending(propertyValue)) {
          subschemaBindings.get(subschemaKey).set(key, {
            thunk: () => {
              const forcedValue = force(propertyValue);
              let result;
              if (isThrown(forcedValue)) {
                result = withReason(
                  kpthrow("badProperty", ["value", value], ["key", key]),
                  forcedValue
                );
              } else {
                result = forcedValue;
              }
              return deepUnwrapErrorPassed(result);
            },
          });
        } else {
          subschemaBindings.get(subschemaKey).set(key, propertyValue);
        }
      }
    }
  }
  if (
    schema.has("where") &&
    !isPending(value) &&
    !callOnValues(schema.get("where"), [value])
  ) {
    return kpthrow(
      "badValue",
      ["value", value],
      ["condition", schema.get("where")]
    );
  }
  return subschemaBindings;
}

function explicitBind(value, schema) {
  const bindSchema = schema.get("#bind");
  const bindings = lazyBindInternal(value, bindSchema);
  if (isThrown(bindings)) {
    return bindings;
  }
  let explicitBinding;
  if (isPending(value)) {
    explicitBinding = {
      thunk: () => {
        const forcedValue = force(value);
        const check = lazyBindInternal(forcedValue, bindSchema);
        let result;
        if (isThrown(check)) {
          result = check;
        } else {
          result = forcedValue;
        }
        return deepUnwrapErrorPassed(result);
      },
    };
  } else {
    explicitBinding = value;
  }
  return kpoMerge(kpobject([schema.get("as"), explicitBinding]), bindings);
}

function bindObjectSchema(value, schema) {
  if (isPending(value)) {
    return bindObjectSchema(force(value), schema);
  }
  if (isThrown(value)) {
    return withReason(kpthrow("errorPassed"), value);
  }
  if (!isObject(value)) {
    return kpthrow("wrongType", ["value", value], ["expectedType", "object"]);
  }
  let restName;
  const ownBindings = kpobject();
  const propertyBindings = [];
  for (let [key, propertySchema] of schema) {
    if (isObject(propertySchema) && propertySchema.has("#rest")) {
      restName = key;
      break;
    }
    if (isObject(propertySchema) && propertySchema.has("#optional")) {
      propertySchema = propertySchema.get("#optional");
    } else if (!value.has(key)) {
      if (isObject(propertySchema) && propertySchema.has("#default")) {
        ownBindings.set(key, [propertySchema.get("#default"), "any"]);
        propertyBindings.push(kpobject([key, propertySchema.get("#default")]));
      } else {
        return kpthrow("missingProperty", ["value", value], ["key", key]);
      }
    }
    if (value.has(key)) {
      ownBindings.set(key, [value.get(key), propertySchema]);
      const bindings = lazyBindInternal(value.get(key), propertySchema);
      if (isThrown(bindings)) {
        return withReason(
          kpthrow("badProperty", ["value", value], ["key", key]),
          bindings
        );
      }
      propertyBindings.push(
        kpobject(
          ...kpoEntries(bindings).map(([key, bindingValue]) => [
            key,
            isPending(bindingValue)
              ? {
                  thunk: () => {
                    const forcedValue = force(bindingValue);
                    let result;
                    if (isThrown(forcedValue)) {
                      result = withReason(
                        kpthrow("badProperty", ["value", value], ["key", key]),
                        forcedValue
                      );
                    } else {
                      result = forcedValue;
                    }
                    return deepUnwrapErrorPassed(result);
                  },
                }
              : bindingValue,
          ])
        )
      );
    }
  }
  if (restName !== undefined) {
    const rest = kpobject();
    for (const [key, property] of value) {
      if (!ownBindings.has(key)) {
        rest.set(key, property);
      }
    }
    ownBindings.set(restName, [
      rest,
      objectOf(
        kpobject(
          ["keys", "string"],
          ["values", schema.get(restName).get("#rest")]
        )
      ),
    ]);
  }
  return kpobject(
    ...kpoEntries(ownBindings).map(([key, [propertyValue, propertySchema]]) => [
      key,
      isPending(propertyValue)
        ? {
            thunk: () => {
              const forcedValue = force(propertyValue);
              const bindings = eagerBindInternal(forcedValue, propertySchema);
              let result;
              if (isThrown(bindings)) {
                result = withReason(
                  kpthrow("badProperty", ["value", value], ["key", key]),
                  bindings
                );
              } else {
                result = forcedValue;
              }
              return deepUnwrapErrorPassed(result);
            },
          }
        : propertyValue,
    ]),
    ...kpoMerge(...propertyBindings)
  );
}

function unwrapErrorPassed(value) {
  if (isThrown(value) && value.get("#thrown") === "errorPassed") {
    return rethrow(value.get("reason"));
  } else {
    return value;
  }
}

function deepUnwrapErrorPassed(value) {
  const shallowUnwrapped = unwrapErrorPassed(value);
  if (isThrown(shallowUnwrapped)) {
    return shallowUnwrapped;
  } else if (isArray(shallowUnwrapped)) {
    return shallowUnwrapped.map(deepUnwrapErrorPassed);
  } else if (isObject(shallowUnwrapped)) {
    return kpoMap(shallowUnwrapped, ([key, propertyValue]) => [
      key,
      deepUnwrapErrorPassed(propertyValue),
    ]);
  } else {
    return shallowUnwrapped;
  }
}

function withReason(err, reason) {
  if (reason.get("#thrown") === "errorPassed") {
    return reason;
  } else {
    return kpoMerge(err, kpobject(["reason", catch_(reason)]));
  }
}

function isPending(value) {
  if (value === null) {
    return false;
  } else if (typeof value === "object" && "expression" in value) {
    return true;
  } else if (typeof value === "object" && "thunk" in value) {
    return true;
  } else {
    return false;
  }
}

export function matches(value, schema) {
  if (isThrown(eagerBind(value, schema))) {
    return false;
  } else {
    return true;
  }
}

export function is(type, namedArgs = kpobject()) {
  return kpoMerge(kpobject(["#type", type]), namedArgs);
}

export function oneOf(values) {
  return kpobject(["#oneOf", values]);
}

export function arrayOf(elementSchema, namedArgs = kpobject()) {
  return kpoMerge(
    kpobject(["#type", "array"], ["elements", elementSchema]),
    namedArgs
  );
}

export function objectOf(namedArgs) {
  return kpoMerge(kpobject(["#type", "object"]), namedArgs);
}

export function optional(schema) {
  return kpobject(["#optional", schema]);
}

export function either(...schemas) {
  return kpobject(["#either", schemas]);
}

export function as(schema, name) {
  if (isObject(schema) && schema.has("#rest")) {
    return kpobject(["#rest", as(schema.get("#rest"), name)]);
  } else {
    return kpobject(["#bind", schema], ["as", name]);
  }
}

export function default_(schema, defaultValue) {
  return kpobject(["#default", defaultValue], ["for", schema]);
}

export function rest(schema) {
  return kpobject(["#rest", schema]);
}

export const builtins = kpobject(...rawBuiltins.map((f) => [f.builtinName, f]));
