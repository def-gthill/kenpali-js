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
  kpoValues,
} from "./kpobject.js";

export function eagerBind(value, schema) {
  return deepUnwrapErrorPassed(eagerBindInternal(value, schema));
}

function eagerBindInternal(value, schema) {
  const forcedValue = deepForce(value);
  if (isThrown(forcedValue)) {
    return forcedValue;
  }
  return lazyBindInternal(forcedValue, schema);
}

export function force(value) {
  if (isThrown(value)) {
    return withReason(kpthrow("errorPassed"), value);
  } else if (isExpression(value)) {
    return evalWithBuiltins(value.expression, value.context);
  } else if (isThunk(value)) {
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
    return invalidSchema(schema);
  }
}

function bindTypeSchema(value, schema) {
  if (isPending(value)) {
    // Type schemas don't bind names by themselves.
    // They need to wait for the parent to force the value.
    return kpobject();
  }
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
  if (isPending(value)) {
    // Array schemas don't bind names by themselves.
    // They need to wait for the parent to force the value.
    return kpobject();
  }
  if (isThrown(value)) {
    return withReason(errorPassed(), value);
  }
  if (!isArray(value)) {
    return wrongType(value, "array");
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
        return missingElement(value, i + 1, schema);
      }
    } else {
      const bindings = lazyBindInternal(value[i], schema[i]);
      if (isThrown(bindings)) {
        return withReason(badElement(value, i + 1), bindings);
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
                        badElement(value, i + 1),
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
              return wrongType(
                value,
                either(...errors.map(([_, err]) => err.get("expectedType")))
              );
            } else {
              return badValue(value, ["errors", errors]);
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
      return wrongType(
        value,
        either(...errors.map(([_, err]) => err.get("expectedType")))
      );
    } else {
      return badValue(value, ["errors", errors]);
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
        if (isPending(elementValue)) {
          subschemaBindings.get(key).push({
            thunk: () => {
              const forcedValue = force(elementValue);
              let result;
              if (isThrown(forcedValue)) {
                result = withReason(badElement(value, i + 1), forcedValue);
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
        return badKey(key, catch_(bindings));
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

        if (isPending(propertyValue)) {
          subschemaBindings.get(subschemaKey).set(key, {
            thunk: () => {
              const forcedValue = force(propertyValue);
              let result;
              if (isThrown(forcedValue)) {
                result = withReason(badProperty(value, key), forcedValue);
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
    return badValue(value, ["condition", schema.get("where")]);
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
      const bindings = lazyBindInternal(value.get(key), propertySchema);
      if (isThrown(bindings)) {
        return withReason(badProperty(value, key), bindings);
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
                      result = withReason(badProperty(value, key), forcedValue);
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
                result = withReason(badProperty(value, key), bindings);
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
  return isExpression(value) || isThunk(value);
}

function isExpression(value) {
  return value !== null && typeof value === "object" && "expression" in value;
}

function isThunk(value) {
  return value !== null && typeof value === "object" && "thunk" in value;
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
