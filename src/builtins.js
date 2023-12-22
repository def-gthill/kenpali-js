import { given, literal } from "./kpast.js";
import kperror from "./kperror.js";
import { callOnValues, evalWithBuiltins } from "./kpeval.js";
import kpobject, { kpoEntries, kpoMerge } from "./kpobject.js";

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
  builtin("isString", { params: ["value"] }, function ([value]) {
    return isString(value);
  }),
  builtin("toString", { params: ["value"] }, function ([value]) {
    return toString(value);
  }),
  builtin("toNumber", { params: ["value"] }, function ([value]) {
    return parseFloat(value);
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
          return kperror(
            "indexOutOfBounds",
            ["function", "at"],
            ["value", collection],
            ["length", collection.length],
            ["index", index]
          );
        }
        return collection[index - 1];
      } else if (isObject(collection)) {
        return collection.get(index);
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
    if (isError(loopResult)) {
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
      if (isError(whileCondition)) {
        return whileCondition;
      }
      return kperror(
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
      if (isError(continueIf)) {
        return continueIf;
      }
      return kperror(
        "wrongElementType",
        ["function", functionName],
        ["object", stepResult],
        ["key", "continueIf"],
        ["value", continueIf],
        ["expectedType", "boolean"]
      );
    }
    if (!stepResult.has("next")) {
      return kperror(
        "requiredKeyMissing",
        ["function", functionName],
        ["object", stepResult],
        ["key", "next"]
      );
    }
    callback(stepResult);
    const next = stepResult.get("next");
    if (isError(next)) {
      return kperror(
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
  return kperror(
    "tooManyIterations",
    ["function", functionName],
    ["currentValue", current]
  );
}

export function eagerBind(value, schema) {
  const forcedValue = force(value);
  if (isError(forcedValue)) {
    return kperror("errorPassed", ["reason", forcedValue]);
  }
  const bindings = lazyBind(forcedValue, schema);
  if ("force" in bindings) {
    return bindings.force();
  } else {
    return bindings;
  }
}

export function force(value) {
  if (value === null) {
    return value;
  } else if (typeof value === "object" && "expression" in value) {
    return evalWithBuiltins(value.expression, value.context);
  } else if (typeof value === "object" && "thunk" in value) {
    return value.thunk();
  } else {
    return value;
  }
}

export function requiredNames(schema) {
  if (isObject(schema)) {
    if (schema.has("#bind")) {
      return [schema.get("as")];
    } else {
      return [];
    }
  } else {
    return [];
  }
}

export function lazyBind(value, schema) {
  console.log("Schema");
  console.log(schema);
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
      return bindTypeWithConditionsSchema(value, schema);
    } else if (schema.has("#bind")) {
      return explicitBind(value, schema);
    } else if (schema.has("#default")) {
      return lazyBind(value, schema.get("for"));
    } else {
      return bindObjectSchema(value, schema);
    }
  } else {
    return kperror("invalidSchema", ["schema", schema]);
  }
}

function bindTypeSchema(value, schema) {
  if (typeof value === "object" && value !== null && "expression" in value) {
    return kpobject();
  } else if (typeOf(value) === schema) {
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
    return kperror("wrongType", ["value", value], ["expectedType", schema]);
  }
}

function bindArraySchema(value, schema) {
  if (!isArray(value)) {
    return kperror("wrongType", ["value", value], ["expectedType", "array"]);
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
        return kperror(
          "missingElement",
          ["value", value],
          ["index", i + 1],
          ["schema", schema]
        );
      }
    } else {
      const bindings = eagerBind(value[i], schema[i]);
      if (isError(bindings)) {
        if (bindings.get("#error") === "errorPassed") {
          return bindings.get("reason");
        } else {
          return kperror(
            "badElement",
            ["value", value],
            ["index", i + 1],
            ["reason", bindings]
          );
        }
      }
      elementBindings.push(bindings);
    }
  }
  if (hasRest) {
    const bindings = eagerBind(
      value.slice(schema.length - 1),
      arrayOf(schema.at(-1).get("#rest"))
    );
    elementBindings.push(bindings);
  }
  return kpoMerge(...elementBindings);
}

function bindUnionSchema(value, schema) {
  const errors = [];
  for (const option of schema.get("#either")) {
    const bindings = eagerBind(value, option);
    if (isError(bindings)) {
      errors.push([option, bindings]);
    } else {
      return bindings;
    }
  }
  // console.log("Errors are");
  // console.log(errors);
  if (errors.every(([_, err]) => err.get("#error") === "wrongType")) {
    return kperror(
      "wrongType",
      ["value", value],
      [
        "expectedType",
        either(...errors.map(([_, err]) => err.get("expectedType"))),
      ]
    );
  } else {
    return kperror("badValue", ["value", value], ["errors", errors]);
  }
}

function bindLiteralListSchema(value, schema) {
  for (const option of schema.get("#oneOf")) {
    if (equals(value, option)) {
      return kpobject();
    }
  }
  return kperror(
    "badValue",
    ["value", value],
    ["options", schema.get("#oneOf")]
  );
}

function bindTypeWithConditionsSchema(value, schema) {
  const typeBindings = eagerBind(value, schema.get("#type"));
  if (isError(typeBindings)) {
    return typeBindings;
  }
  const elementBindings = kpobject();
  for (const requiredName of requiredNames(schema.get("elements"))) {
    elementBindings.set(requiredName, []);
  }
  if (schema.has("elements")) {
    for (let i = 0; i < value.length; i++) {
      const bindings = eagerBind(value[i], schema.get("elements"));
      if (isError(bindings)) {
        if (bindings.get("#error") === "errorPassed") {
          return bindings.get("reason");
        } else {
          return kperror(
            "badElement",
            ["value", value],
            ["index", i + 1],
            ["reason", bindings]
          );
        }
      }
      for (const [key, elementValue] of bindings) {
        if (!elementBindings.has(key)) {
          elementBindings.set(key, []);
        }
        elementBindings.get(key).push(elementValue);
      }
    }
  }
  if (schema.has("keys")) {
    for (const key of value.keys()) {
      const bindings = eagerBind(key, schema.get("keys"));
      if (isError(bindings)) {
        return kperror("badKey", ["key", key], ["reason", bindings]);
      }
    }
  }
  if (schema.has("values")) {
    for (const [key, propertyValue] of value.entries()) {
      const bindings = eagerBind(propertyValue, schema.get("values"));
      if (isError(bindings)) {
        return kperror(
          "badProperty",
          ["key", key],
          ["value", propertyValue],
          ["reason", bindings]
        );
      }
    }
  }
  if (schema.has("where") && !callOnValues(schema.get("where"), [value])) {
    return kperror(
      "badValue",
      ["value", value],
      ["condition", schema.get("where")]
    );
  }
  return elementBindings;
}

function explicitBind(value, schema) {
  const bindSchema = schema.get("#bind");
  const bindings = eagerBind(value, bindSchema);
  if (isError(bindings)) {
    return bindings;
  }
  return kpoMerge(bindings, kpobject([schema.get("as"), value]));
}

function bindObjectSchema(value, schema) {
  if (!isObject(value)) {
    return kperror("wrongType", ["value", value], ["expectedType", "object"]);
  }
  let restName;
  const properties = kpobject();
  for (let [key, propertySchema] of schema) {
    if (isObject(propertySchema) && propertySchema.has("#rest")) {
      restName = key;
      break;
    }
    if (isObject(propertySchema) && propertySchema.has("#optional")) {
      propertySchema = propertySchema.get("#optional");
    } else if (!value.has(key)) {
      if (isObject(propertySchema) && propertySchema.has("#default")) {
        properties.set(key, [propertySchema.get("#default"), "any"]);
      } else {
        return kperror("missingProperty", ["value", value], ["key", key]);
      }
    }
    if (value.has(key)) {
      properties.set(key, [value.get(key), propertySchema]);
    }
  }
  if (restName !== undefined) {
    const rest = kpobject();
    for (const [key, property] of value) {
      if (!properties.has(key)) {
        rest.set(key, property);
      }
    }
    properties.set(restName, [
      rest,
      objectOf(
        kpobject(
          ["keys", "string"],
          ["values", schema.get(restName).get("#rest")]
        )
      ),
    ]);
  }
  const wrapper = {
    get(key) {
      const [propertyValue, propertySchema] = properties.get(key);
      const forcedValue = force(propertyValue);
      const bindings = eagerBind(forcedValue, propertySchema);
      if (isError(bindings)) {
        return kperror(
          "badProperty",
          ["value", value],
          ["key", key],
          ["reason", bindings]
        );
      } else {
        return forcedValue;
      }
    },
    force() {
      const forcedValue = kpobject();
      for (const key of properties.keys()) {
        const propertyValue = this.get(key);
        if (isError(propertyValue)) {
          return propertyValue;
        } else {
          forcedValue.set(key, propertyValue);
        }
      }
      return forcedValue;
    },
  };
  return wrapper;
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
  if (isError(eagerBind(value, schema))) {
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
