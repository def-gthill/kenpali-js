import kperror, {
  errorType,
  foldError,
  kpcatch,
  transformError,
  withDetails,
  withErrorType,
} from "./kperror.js";
import kpobject from "./kpobject.js";
import {
  equals,
  isFunction,
  isObject,
  isSequence,
  isString,
  typeOf,
} from "./values.js";

export default function validate(value, schema, kpcallback) {
  if (isString(schema)) {
    return validateTypeSchema(value, schema);
  } else if (isObject(schema)) {
    if (schema.has("either")) {
      return validateEitherSchema(value, schema, kpcallback);
    } else if (schema.has("oneOf")) {
      return validateOneOfSchema(value, schema);
    } else if (schema.has("type")) {
      const result = validateTypeWithConditionsSchema(
        value,
        schema,
        kpcallback
      );
      return result;
    } else {
      throw invalidSchema(schema);
    }
  } else {
    throw invalidSchema(schema);
  }
}

function validateTypeSchema(value, schema) {
  if (typeOf(value) === schema) {
    return;
  } else if (schema === "any") {
    return;
  } else if (schema === "object" && isObject(value)) {
    return;
  } else if (schema === "function" && isFunction(value)) {
    return;
  } else if (schema === "sequence" && isSequence(value)) {
    return;
  } else {
    throw wrongType(value, schema);
  }
}

function validateEitherSchema(value, schema, kpcallback) {
  const options = schema.get("either");
  const errors = [];
  for (const option of options) {
    const result = kpcatch(() => validate(value, option, kpcallback));
    if (result) {
      errors.push(result);
    } else {
      return;
    }
  }
  throw combineEitherErrors(value, errors);
}

function combineEitherErrors(value, errors) {
  if (errors.every((err) => errorType(err) === "wrongType")) {
    return wrongType(
      value,
      either(...errors.map((err) => err.details.get("expectedType")))
    );
  } else {
    return badValue(value, ["errors", errors]);
  }
}

function validateOneOfSchema(value, schema) {
  for (const option of schema.get("oneOf")) {
    if (equals(value, option)) {
      return;
    }
  }
  throw badValue(value, ["options", schema.get("oneOf")]);
}

function validateTypeWithConditionsSchema(value, schema, kpcallback) {
  validateTypeSchema(value, schema.get("type"));
  if (schema.get("type") === "array") {
    if (schema.has("shape")) {
      validateArrayShape(value, schema.get("shape"), kpcallback);
    }
    if (schema.has("elements")) {
      validateArrayElements(value, schema.get("elements"), kpcallback);
    }
  } else if (schema.get("type") === "object") {
    if (schema.has("shape")) {
      validateObjectShape(value, schema.get("shape"), kpcallback);
    }
    if (schema.has("keys")) {
      validateObjectKeys(value, schema.get("keys"), kpcallback);
    }
    if (schema.has("values")) {
      validateObjectValues(value, schema.get("values"), kpcallback);
    }
  }
  if (
    schema.get("where") &&
    !kpcallback(schema.get("where"), [value], kpobject())
  ) {
    throw badValue(value, ["condition", schema.get("where")]);
  }
}

function validateArrayShape(value, shape, kpcallback) {
  for (let i = 0; i < shape.length; i++) {
    const isOptional = isObject(shape[i]) && shape[i].has("optional");
    if (i < value.length) {
      transformError(
        () =>
          validate(
            value[i],
            isOptional ? shape[i].get("optional") : shape[i],
            kpcallback
          ),
        (err) => withReason(badElement(value, i + 1), err)
      );
    } else if (!isOptional) {
      throw missingElement(value, i + 1, shape);
    }
  }
}

function validateArrayElements(value, schema, kpcallback) {
  for (let i = 0; i < value.length; i++) {
    transformError(
      () => validate(value[i], schema, kpcallback),
      (err) => withReason(badElement(value, i + 1), err)
    );
  }
}

function validateObjectShape(value, shape, kpcallback) {
  for (const [key, propertySchema] of shape) {
    const isOptional =
      isObject(propertySchema) && propertySchema.has("optional");
    if (value.has(key)) {
      transformError(
        () =>
          validate(
            value.get(key),
            isOptional ? propertySchema.get("optional") : propertySchema,
            kpcallback
          ),
        (err) => withReason(badProperty(value, key), err)
      );
    } else if (!isOptional) {
      throw missingProperty(value, key);
    }
  }
}

function validateObjectKeys(value, schema, kpcallback) {
  for (const [key, _] of value) {
    transformError(
      () => validate(key, schema, kpcallback),
      (err) => withReason(badKey(value, key), err)
    );
  }
}

function validateObjectValues(value, schema, kpcallback) {
  for (const [key, propertyValue] of value) {
    transformError(
      () => validate(propertyValue, schema, kpcallback),
      (err) => withReason(badProperty(value, key), err)
    );
  }
}

export function matches(value, schema, kpcallback) {
  return foldError(
    () => validate(value, schema, kpcallback),
    () => true,
    () => false
  );
}

export function is(type, where) {
  const result = kpobject(["type", type]);
  if (where) {
    result.set("where", where);
  }
  return result;
}

export function oneOf(values) {
  return kpobject(["oneOf", values]);
}

export function arrayOf(elementSchema, where) {
  const result = kpobject(["type", "array"], ["elements", elementSchema]);
  if (where) {
    result.set("where", where);
  }
  return result;
}

export function tupleLike(shape) {
  return kpobject(["type", "array"], ["shape", shape]);
}

export function objectOf(keys, values, where) {
  const result = kpobject(
    ["type", "object"],
    ["keys", keys],
    ["values", values]
  );
  if (where) {
    result.set("where", where);
  }
  return result;
}

export function recordLike(shape) {
  return kpobject(["type", "object"], ["shape", shape]);
}

export function optional(schema) {
  return kpobject(["optional", schema]);
}

export function either(...schemas) {
  return kpobject(["either", schemas]);
}

function invalidSchema(schema) {
  return kperror("invalidSchema", ["schema", schema]);
}

function wrongType(value, schema) {
  return kperror("wrongType", ["value", value], ["expectedType", schema]);
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

function badKey(value, key) {
  return kperror("badKey", ["value", value], ["key", key]);
}

function missingProperty(value, key) {
  return kperror("missingProperty", ["value", value], ["key", key]);
}

function badProperty(value, key) {
  return kperror("badProperty", ["value", value], ["key", key]);
}

function withReason(err, reason) {
  return withDetails(err, ["reason", reason]);
}

export function argumentError(err) {
  if (errorType(err) === "badElement") {
    return withErrorType(err, "badArgumentValue");
  } else if (errorType(err) === "wrongType") {
    return withErrorType(err, "wrongArgumentType");
  } else if (errorType(err) === "badValue") {
    return withErrorType(err, "badArgumentValue");
  } else {
    return err;
  }
}

export function returnError(err) {
  if (errorType(err) === "wrongType") {
    return withErrorType(err, "wrongReturnType");
  } else if (errorType(err) === "badValue") {
    return withErrorType(err, "badReturnValue");
  } else {
    return err;
  }
}

export function argumentPatternError(err) {
  if (errorType(err) === "badElement") {
    return argumentError(err.details.get("reason"));
  } else {
    return argumentError(err);
  }
}
