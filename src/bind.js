import {
  equals,
  isArray,
  isFunction,
  isObject,
  isSequence,
  isString,
  isThrown,
  typeOf,
} from "./builtins.js";
import kpthrow from "./kperror.js";
import { callOnValues, catch_, evalWithBuiltins, rethrow } from "./kpeval.js";
import kpobject, {
  kpoEntries,
  kpoKeys,
  kpoMap,
  kpoMerge,
  kpoUpdate,
  kpoValues,
} from "./kpobject.js";

export function bind(value, schema) {
  const forcedValue = deepForce(value);
  if (isThrown(forcedValue)) {
    return forcedValue;
  }
  return deepUnwrapErrorPassed(bindInternal(forcedValue, schema));
}

export function force(value) {
  if (isThrown(value)) {
    return withReason(kpthrow("errorPassed"), value);
  } else if (isExpression(value)) {
    return evalWithBuiltins(value.expression, value.context);
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

function bindInternal(value, schema) {
  if (isArray(schema)) {
    return bindArraySchema(value, schema);
  } else if (isString(schema)) {
    return bindTypeSchema(value, schema);
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
      return bindInternal(value, schema.get("for"));
    } else {
      return bindObjectSchema(value, schema);
    }
  } else {
    return invalidSchema(schema);
  }
}

function bindTypeSchema(value, schema) {
  if (isThrown(value)) {
    return withReason(errorPassed(), value);
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
    return wrongType(value, schema);
  }
}

function bindArraySchema(value, schema) {
  const hasRest = isObject(schema.at(-1)) && schema.at(-1).has("#rest");
  if (hasRest) {
    if (isThrown(value)) {
      return withReason(errorPassed(), value);
    }
    if (!isArray(value)) {
      return wrongType(value, "array");
    }
    const result = kpobject();
    for (let i = 0; i < schema.length - 1; i++) {
      if (i >= value.length) {
        if (isObject(schema[i]) && schema[i].has("#default")) {
          const forSchema = schema[i].get("for");
          result.set(forSchema.get("as"), schema[i].get("#default"));
        } else {
          return missingElement(value, i + 1, schema);
        }
      } else {
        const bindings = bindInternal(value[i], schema[i]);
        const bindingsWithErrorWrapping = wrapErrorsInBindings(
          bindings,
          (err) => withReason(badElement(value, i + 1), err)
        );
        if (isThrown(bindingsWithErrorWrapping)) {
          return bindingsWithErrorWrapping;
        } else {
          for (const [name, binding] of bindingsWithErrorWrapping) {
            result.set(name, binding);
          }
        }
      }
    }
    const numNonRestElements = schema.length - 1;
    const bindings = bindInternal(
      value.slice(numNonRestElements),
      arrayOf(schema.at(-1).get("#rest"))
    );
    const bindingsWithErrorWrapping = wrapErrorsInBindings(bindings, (err) =>
      kpoUpdate(err, "index", (index) => numNonRestElements + index)
    );
    if (isThrown(bindingsWithErrorWrapping)) {
      return bindingsWithErrorWrapping;
    } else {
      for (const [name, binding] of bindingsWithErrorWrapping) {
        result.set(name, binding);
      }
    }
    return result;
  } else {
    if (isThrown(value)) {
      return withReason(errorPassed(), value);
    }
    if (!isArray(value)) {
      return wrongType(value, "array");
    }
    const result = kpobject();
    for (let i = 0; i < schema.length; i++) {
      if (i >= value.length) {
        if (isObject(schema[i]) && schema[i].has("#default")) {
          const forSchema = schema[i].get("for");
          result.set(forSchema.get("as"), schema[i].get("#default"));
        } else {
          return missingElement(value, i + 1, schema);
        }
      } else {
        const bindings = bindInternal(value[i], schema[i]);
        const bindingsWithErrorWrapping = wrapErrorsInBindings(
          bindings,
          (err) => withReason(badElement(value, i + 1), err)
        );
        if (isThrown(bindingsWithErrorWrapping)) {
          return bindingsWithErrorWrapping;
        } else {
          for (const [name, binding] of bindingsWithErrorWrapping) {
            result.set(name, binding);
          }
        }
      }
    }
    return result;
  }
}

function bindUnionSchema(value, schema) {
  let succeeded = false;
  const result = kpobject();
  const options = schema.get("#either");
  const bindings = options.map((option) => bindInternal(value, option));
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
  return combineUnionErrors(value, errors);
}

function combineUnionErrors(value, errors) {
  if (errors.every(([_, err]) => err.get("#thrown") === "wrongType")) {
    return wrongType(
      value,
      either(...errors.map(([_, err]) => err.get("expectedType")))
    );
  } else {
    return badValue(value, ["errors", errors]);
  }
}

function bindLiteralListSchema(value, schema) {
  if (isThrown(value)) {
    return withReason(errorPassed(), value);
  }
  for (const option of schema.get("#oneOf")) {
    if (equals(value, option)) {
      return kpobject();
    }
  }
  return badValue(value, ["options", schema.get("#oneOf")]);
}

function bindTypeWithConditionsSchema(value, schema) {
  const typeBindings = bindTypeSchema(value, schema.get("#type"));
  if (isThrown(typeBindings)) {
    return typeBindings;
  }
  const subschemaBindings = kpobject();
  if (schema.has("elements")) {
    const keys = namesToBind(schema);
    const bindings = value.map((element) =>
      bindInternal(element, schema.get("elements"))
    );

    for (const key of keys) {
      subschemaBindings.set(key, []);
    }
    for (let i = 0; i < value.length; i++) {
      const elementBindings = bindings[i];
      if (isThrown(elementBindings)) {
        return withReason(badElement(value, i + 1), elementBindings);
      }
      for (const key of keys) {
        if (!elementBindings.has(key)) {
          subschemaBindings
            .get(key)
            .push(catch_(missingProperty(bindings, key)));
          continue;
        }
        const elementValue = elementBindings.get(key);
        subschemaBindings.get(key).push(elementValue);
      }
    }
  }
  if (schema.has("keys")) {
    for (const key of value.keys()) {
      const bindings = bindInternal(key, schema.get("keys"));
      if (isThrown(bindings)) {
        return badKey(key, catch_(bindings));
      }
    }
  }
  if (schema.has("values")) {
    const bindings = kpoMap(value, ([key, propertyValue]) => [
      key,
      bindInternal(propertyValue, schema.get("values")),
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
        return withReason(badProperty(propertyValue, key), propertyBindings);
      }
      for (const subschemaKey of subschemaKeys) {
        if (!propertyBindings.has(subschemaKey)) {
          subschemaBindings
            .get(subschemaKey)
            .set(key, catch_(missingProperty(bindings, subschemaKey)));
          continue;
        }
        const propertyValue = propertyBindings.get(subschemaKey);
        subschemaBindings.get(subschemaKey).set(key, propertyValue);
      }
    }
  }
  if (schema.has("where") && !callOnValues(schema.get("where"), [value])) {
    return badValue(value, ["condition", schema.get("where")]);
  }
  return subschemaBindings;
}

function explicitBind(value, schema) {
  const bindSchema = schema.get("#bind");
  const bindings = bindInternal(value, bindSchema);
  if (isThrown(bindings)) {
    return bindings;
  }
  const result = kpobject();
  result.set(schema.get("as"), value);
  for (const [name, binding] of bindings) {
    result.set(name, binding);
  }
  return result;
}

function bindObjectSchema(value, schema) {
  if (isThrown(value)) {
    return withReason(errorPassed(), value);
  }
  if (!isObject(value)) {
    return wrongType(value, "object");
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
        return missingProperty(value, key);
      }
    }
    if (value.has(key)) {
      ownBindings.set(key, [value.get(key), propertySchema]);
      const bindings = bindInternal(value.get(key), propertySchema);
      const bindingsWithErrorWrapping = wrapErrorsInBindings(bindings, (err) =>
        withReason(badProperty(value, key), err)
      );
      if (isThrown(bindingsWithErrorWrapping)) {
        return bindingsWithErrorWrapping;
      } else {
        propertyBindings.push(bindingsWithErrorWrapping);
      }
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
      propertyValue,
    ]),
    ...kpoMerge(...propertyBindings)
  );
}

function wrapErrorsInBindings(bindings, wrapError) {
  if (isThrown(bindings)) {
    return wrapError(bindings);
  } else {
    return kpobject(
      ...kpoEntries(bindings).map(([key, bindingValue]) => [key, bindingValue])
    );
  }
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

function isExpression(value) {
  return value !== null && typeof value === "object" && "expression" in value;
}

export function matches(value, schema) {
  if (isThrown(bind(value, schema))) {
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

function invalidSchema(schema) {
  return kpthrow("invalidSchema", ["schema", schema]);
}

function errorPassed() {
  return kpthrow("errorPassed");
}

function wrongType(value, schema) {
  return kpthrow("wrongType", ["value", value], ["expectedType", schema]);
}

function badKey(key, reason) {
  return kpthrow("badKey", ["key", key], ["reason", reason]);
}

function badValue(value, ...details) {
  return kpthrow("badValue", ["value", value], ...details);
}

function missingElement(value, index, schema) {
  return kpthrow(
    "missingElement",
    ["value", value],
    ["index", index],
    ["schema", schema]
  );
}

function badElement(value, index) {
  return kpthrow("badElement", ["value", value], ["index", index]);
}

function missingProperty(value, key) {
  return kpthrow("missingProperty", ["value", value], ["key", key]);
}

function badProperty(value, key) {
  return kpthrow("badProperty", ["value", value], ["key", key]);
}
