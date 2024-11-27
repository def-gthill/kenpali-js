import { either } from "./bind.js";
import kperror, {
  errorType,
  kpcatch,
  transformError,
  withDetails,
} from "./kperror.js";
import kpobject from "./kpobject.js";
import { isFunction, isObject, isString, typeOf } from "./values.js";

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
    if (
      i >= value.length &&
      !(isObject(shape[i]) && shape[i].has("optional"))
    ) {
      throw missingElement(value, i + 1, shape);
    } else {
      transformError(
        () => validate(value[i], shape[i], kpcallback),
        (err) => withReason(badElement(value, i + 1), err)
      );
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

function validateObjectShape(value, shape, kpcallback) {}

function validateObjectKeys(value, shape, kpcallback) {}

function validateObjectValues(value, shape, kpcallback) {}

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

function withReason(err, reason) {
  return withDetails(err, ["reason", reason]);
}
