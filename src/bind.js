import {
  equals,
  isArray,
  isError,
  isFunction,
  isObject,
  isSequence,
  isString,
  typeOf,
} from "./builtins.js";
import kperror, {
  catch_,
  errorType,
  foldError,
  transformError,
  withDetails,
} from "./kperror.js";
import { callOnValues, evalWithBuiltins } from "./kpeval.js";
import kpobject, {
  kpoEntries,
  kpoKeys,
  kpoMap,
  kpoMerge,
  kpoValues,
} from "./kpobject.js";

export function bind(value, schema) {
  const forcedValue = deepForce(value);
  return bindInternal(forcedValue, schema);
}

export function force(value) {
  if (isExpression(value)) {
    return evalWithBuiltins(value.expression, value.context);
  } else {
    return value;
  }
}

export function deepForce(value) {
  const forcedValue = force(value);
  if (isArray(forcedValue)) {
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
  if (isObject(schema)) {
    if (schema.has("either")) {
      return mergeArrays(schema.get("either").map(namesToBind));
    } else if (schema.has("type")) {
      const names = [];
      if (schema.get("type") === "array" && schema.has("shape")) {
        names.push(...mergeArrays(schema.get("shape").map(namesToBind)));
      }
      if (schema.get("type") === "object" && schema.has("shape")) {
        names.push(
          ...kpoKeys(schema.get("shape")),
          ...mergeArrays(kpoValues(schema.get("shape")).map(namesToBind))
        );
      }
      if (schema.has("elements")) {
        names.push(...namesToBind(schema.get("elements")));
      }
      if (schema.has("values")) {
        names.push(...namesToBind(schema.get("values")));
      }
      return names;
    } else if (schema.has("bind")) {
      return [schema.get("as"), ...namesToBind(schema.get("bind"))];
    } else if (schema.has("default")) {
      return namesToBind(schema.get("for"));
    } else {
      return [];
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
  if (isString(schema)) {
    return bindTypeSchema(value, schema);
  } else if (isObject(schema)) {
    if (schema.has("either")) {
      return bindUnionSchema(value, schema);
    } else if (schema.has("oneOf")) {
      return bindLiteralListSchema(value, schema);
    } else if (schema.has("type")) {
      const result = bindTypeWithConditionsSchema(value, schema);
      return result;
    } else if (schema.has("bind")) {
      return explicitBind(value, schema);
    } else if (schema.has("default")) {
      return bindInternal(value, schema.get("for"));
    } else {
      throw invalidSchema(schema);
    }
  } else {
    throw invalidSchema(schema);
  }
}

function bindTypeSchema(value, schema) {
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
    throw wrongType(value, schema);
  }
}

function bindUnionSchema(value, schema) {
  let succeeded = false;
  const result = kpobject();
  const options = schema.get("either");
  const bindings = options.map((option) =>
    catch_(() => bindInternal(value, option))
  );
  const errors = [];
  const errorsByKey = kpobject();
  for (let i = 0; i < options.length; i++) {
    const option = options[i];
    const optionBindings = bindings[i];
    if (isError(optionBindings)) {
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
  throw combineUnionErrors(value, errors);
}

function combineUnionErrors(value, errors) {
  if (errors.every(([_, err]) => errorType(err) === "wrongType")) {
    return wrongType(
      value,
      either(...errors.map(([_, err]) => err.details.get("expectedType")))
    );
  } else {
    return badValue(value, ["errors", errors]);
  }
}

function bindLiteralListSchema(value, schema) {
  for (const option of schema.get("oneOf")) {
    if (equals(value, option)) {
      return kpobject();
    }
  }
  throw badValue(value, ["options", schema.get("oneOf")]);
}

function bindTypeWithConditionsSchema(value, schema) {
  bindTypeSchema(value, schema.get("type"));
  const subschemaBindings = kpobject();
  if (schema.get("type") === "array" && schema.has("shape")) {
    const bindings = bindArrayShape(value, schema.get("shape"));
    for (const [key, value] of bindings) {
      subschemaBindings.set(key, value);
    }
  }
  if (schema.get("type") === "object" && schema.has("shape")) {
    const bindings = bindObjectShape(value, schema.get("shape"));
    for (const [key, value] of bindings) {
      subschemaBindings.set(key, value);
    }
  }
  if (schema.has("elements")) {
    const keys = namesToBind(schema);
    const bindings = value.map((element, i) =>
      transformError(
        () => bindInternal(element, schema.get("elements")),
        (err) => withReason(badElement(value, i + 1), err)
      )
    );

    for (const key of keys) {
      subschemaBindings.set(key, []);
    }
    for (let i = 0; i < value.length; i++) {
      const elementBindings = bindings[i];
      for (const key of keys) {
        if (!elementBindings.has(key)) {
          subschemaBindings.get(key).push(missingProperty(bindings, key));
          continue;
        }
        const elementValue = elementBindings.get(key);
        subschemaBindings.get(key).push(elementValue);
      }
    }
  }
  if (schema.has("keys")) {
    for (const key of value.keys()) {
      transformError(
        () => bindInternal(key, schema.get("keys")),
        (err) => badKey(key, err)
      );
    }
  }
  if (schema.has("values")) {
    const bindings = kpoMap(value, ([key, propertyValue]) => [
      key,
      transformError(
        () => bindInternal(propertyValue, schema.get("values")),
        (err) => withReason(badProperty(propertyValue, key), err)
      ),
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

    for (const [key, _] of value) {
      const propertyBindings = bindings.get(key);
      for (const subschemaKey of subschemaKeys) {
        if (!propertyBindings.has(subschemaKey)) {
          subschemaBindings
            .get(subschemaKey)
            .set(key, missingProperty(bindings, subschemaKey));
          continue;
        }
        const propertyValue = propertyBindings.get(subschemaKey);
        subschemaBindings.get(subschemaKey).set(key, propertyValue);
      }
    }
  }
  if (schema.has("where") && !callOnValues(schema.get("where"), [value])) {
    throw badValue(value, ["condition", schema.get("where")]);
  }
  return subschemaBindings;
}

function explicitBind(value, schema) {
  const bindSchema = schema.get("bind");
  const bindings = bindInternal(value, bindSchema);
  const result = kpobject();
  result.set(schema.get("as"), value);
  for (const [name, binding] of bindings) {
    result.set(name, binding);
  }
  return result;
}

function bindArrayShape(value, schema) {
  const hasRest = isObject(schema.at(-1)) && schema.at(-1).has("rest");
  if (hasRest) {
    if (!isArray(value)) {
      throw wrongType(value, "array");
    }
    const result = kpobject();
    for (let i = 0; i < schema.length - 1; i++) {
      if (i >= value.length) {
        if (isObject(schema[i]) && schema[i].has("default")) {
          const forSchema = schema[i].get("for");
          result.set(forSchema.get("as"), schema[i].get("default"));
        } else {
          throw missingElement(value, i + 1, schema);
        }
      } else {
        const bindings = transformError(
          () => bindInternal(value[i], schema[i]),
          (err) => withReason(badElement(value, i + 1), err)
        );
        for (const [name, binding] of bindings) {
          result.set(name, binding);
        }
      }
    }
    const numNonRestElements = schema.length - 1;
    const bindings = transformError(
      () =>
        bindInternal(
          value.slice(numNonRestElements),
          arrayOf(schema.at(-1).get("rest"))
        ),
      (err) =>
        withDetails(err, [
          "index",
          numNonRestElements + err.details.get("index"),
        ])
    );
    for (const [name, binding] of bindings) {
      result.set(name, binding);
    }
    return result;
  } else {
    if (!isArray(value)) {
      throw wrongType(value, "array");
    }
    const result = kpobject();
    for (let i = 0; i < schema.length; i++) {
      if (i >= value.length) {
        if (isObject(schema[i]) && schema[i].has("default")) {
          const forSchema = schema[i].get("for");
          result.set(forSchema.get("as"), schema[i].get("default"));
        } else {
          throw missingElement(value, i + 1, schema);
        }
      } else {
        const bindings = transformError(
          () => bindInternal(value[i], schema[i]),
          (err) => withReason(badElement(value, i + 1), err)
        );
        for (const [name, binding] of bindings) {
          result.set(name, binding);
        }
      }
    }
    return result;
  }
}

function bindObjectShape(value, schema) {
  if (!isObject(value)) {
    throw wrongType(value, "object");
  }
  let restName;
  const ownBindings = kpobject();
  const propertyBindings = [];
  for (let [key, propertySchema] of schema) {
    if (isObject(propertySchema) && propertySchema.has("rest")) {
      restName = key;
      break;
    }
    if (isObject(propertySchema) && propertySchema.has("optional")) {
      propertySchema = propertySchema.get("optional");
    } else if (!value.has(key)) {
      if (isObject(propertySchema) && propertySchema.has("default")) {
        ownBindings.set(key, [propertySchema.get("default"), "any"]);
        propertyBindings.push(kpobject([key, propertySchema.get("default")]));
      } else {
        throw missingProperty(value, key);
      }
    }
    if (value.has(key)) {
      ownBindings.set(key, [value.get(key), propertySchema]);
      const bindings = transformError(
        () => bindInternal(value.get(key), propertySchema),
        (err) => withReason(badProperty(value, key), err)
      );
      propertyBindings.push(bindings);
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
          ["values", schema.get(restName).get("rest")]
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

function withReason(err, reason) {
  return withDetails(err, ["reason", reason]);
}

function isExpression(value) {
  return value !== null && typeof value === "object" && "expression" in value;
}

export function matches(value, schema) {
  return foldError(
    () => bind(value, schema),
    () => true,
    () => false
  );
}

export function is(type, namedArgs = kpobject()) {
  return kpoMerge(kpobject(["type", type]), namedArgs);
}

export function oneOf(values) {
  return kpobject(["oneOf", values]);
}

export function arrayOf(elementSchema, namedArgs = kpobject()) {
  return kpoMerge(
    kpobject(["type", "array"], ["elements", elementSchema]),
    namedArgs
  );
}

export function arrayLike(shape) {
  return kpobject(["type", "array"], ["shape", shape]);
}

export function objectOf(namedArgs) {
  return kpoMerge(kpobject(["type", "object"]), namedArgs);
}

export function objectLike(shape) {
  return kpobject(["type", "object"], ["shape", shape]);
}

export function optional(schema) {
  return kpobject(["optional", schema]);
}

export function either(...schemas) {
  return kpobject(["either", schemas]);
}

export function as(schema, name) {
  if (isObject(schema) && schema.has("rest")) {
    return kpobject(["rest", as(schema.get("rest"), name)]);
  } else {
    return kpobject(["bind", schema], ["as", name]);
  }
}

export function default_(schema, defaultValue) {
  return kpobject(["default", defaultValue], ["for", schema]);
}

export function rest(schema) {
  return kpobject(["rest", schema]);
}

function invalidSchema(schema) {
  return kperror("invalidSchema", ["schema", schema]);
}

function wrongType(value, schema) {
  return kperror("wrongType", ["value", value], ["expectedType", schema]);
}

function badKey(key, reason) {
  return kperror("badKey", ["key", key], ["reason", reason]);
}

function badValue(value, ...details) {
  return kperror("badValue", ["value", value], ...details);
}

function missingElement(value, index, schema) {
  return kperror(
    "missingElement",
    ["value", value],
    ["index", index],
    ["schema", schema]
  );
}

function badElement(value, index) {
  return kperror("badElement", ["value", value], ["index", index]);
}

function missingProperty(value, key) {
  return kperror("missingProperty", ["value", value], ["key", key]);
}

function badProperty(value, key) {
  return kperror("badProperty", ["value", value], ["key", key]);
}
