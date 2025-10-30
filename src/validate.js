import kperror, {
  foldError,
  kpcatch,
  transformError,
  withDetails,
  withErrorType,
} from "./kperror.js";
import kpobject from "./kpobject.js";
import {
  anyProtocol,
  arrayClass,
  Class,
  classOf,
  displaySimple,
  equals,
  instanceProtocol,
  isInstance,
  isObject,
  isSequence,
  isType,
  objectClass,
  Protocol,
  sequenceProtocol,
  stringClass,
  typeProtocol,
} from "./values.js";

export default function validate(value, schema, kpcallback) {
  if (schema instanceof Class || schema instanceof Protocol) {
    return validateTypeSchema(value, schema);
  } else if (isObject(schema) && schema.has("form")) {
    switch (schema.get("form")) {
      case "enum":
        return validateEnumSchema(value, schema);
      case "union":
        return validateUnionSchema(value, schema, kpcallback);
      case "condition":
        return validateConditionSchema(value, schema, kpcallback);
      case "array":
        return validateArraySchema(value, schema, kpcallback);
      case "tuple":
        return validateTupleSchema(value, schema, kpcallback);
      case "object":
        return validateObjectSchema(value, schema, kpcallback);
      case "record":
        return validateRecordSchema(value, schema, kpcallback);
      default:
        throw invalidSchema(schema);
    }
  } else {
    throw invalidSchema(schema);
  }
}

function validateTypeSchema(value, schema) {
  if (classOf(value) === schema) {
    return;
  } else if (schema === anyProtocol) {
    return;
  } else if (schema === sequenceProtocol && isSequence(value)) {
    return;
  } else if (schema === typeProtocol && isType(value)) {
    return;
  } else if (schema === instanceProtocol && isInstance(value)) {
    return;
  } else {
    throw wrongType(value, schema);
  }
}

function validateEnumSchema(value, schema) {
  for (const option of schema.get("values")) {
    if (equals(value, option)) {
      return;
    }
  }
  throw badValue(value, ["options", schema.get("values")]);
}

function validateUnionSchema(value, schema, kpcallback) {
  const options = schema.get("options");
  const errors = [];
  for (const option of options) {
    const result = kpcatch(() => validate(value, option, kpcallback));
    if (result) {
      errors.push(result);
    } else {
      return;
    }
  }
  throw combineUnionErrors(value, errors);
}

function combineUnionErrors(value, errors) {
  if (errors.every((err) => err.properties.type === "wrongType")) {
    return wrongType(
      value,
      either(...errors.map((err) => err.properties.details.get("expectedType")))
    );
  } else {
    return badValue(value, ["errors", errors]);
  }
}

function validateConditionSchema(value, schema, kpcallback) {
  validate(value, schema.get("schema"), kpcallback);
  if (!kpcallback(schema.get("condition"), [value], kpobject())) {
    throw badValue(value, ["condition", schema.get("condition")]);
  }
}

function validateArraySchema(value, schema, kpcallback) {
  validateTypeSchema(value, arrayClass);
  validateArrayElements(value, schema.get("elements"), kpcallback);
}

function validateArrayElements(value, schema, kpcallback) {
  for (let i = 0; i < value.length; i++) {
    transformError(
      () => validate(value[i], schema, kpcallback),
      (err) => withReason(badElement(value, i + 1), err)
    );
  }
}

function validateTupleSchema(value, schema, kpcallback) {
  validateTypeSchema(value, arrayClass);
  validateTupleShape(value, schema, kpcallback);
}

function validateTupleShape(value, schema, kpcallback) {
  const shape = schema.get("shape");
  for (let i = 0; i < shape.length; i++) {
    const isOptional =
      isObject(shape[i]) && shape[i].get("form") === "optional";
    if (i < value.length) {
      transformError(
        () =>
          validate(
            value[i],
            isOptional ? shape[i].get("schema") : shape[i],
            kpcallback
          ),
        (err) => withReason(badElement(value, i + 1), err)
      );
    } else if (!isOptional) {
      throw missingElement(value, i + 1, schema);
    }
  }
}

function validateObjectSchema(value, schema, kpcallback) {
  validateTypeSchema(value, objectClass);
  if (schema.has("keys")) {
    validateObjectKeys(value, schema.get("keys"), kpcallback);
  }
  validateObjectValues(value, schema.get("values"), kpcallback);
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

function validateRecordSchema(value, schema, kpcallback) {
  validateTypeSchema(value, objectClass);
  validateRecordShape(value, schema.get("shape"), kpcallback);
}

function validateRecordShape(value, shape, kpcallback) {
  for (const [key, propertySchema] of shape) {
    const isOptional =
      isObject(propertySchema) && propertySchema.get("form") === "optional";
    if (value.has(key)) {
      transformError(
        () =>
          validate(
            value.get(key),
            isOptional ? propertySchema.get("schema") : propertySchema,
            kpcallback
          ),
        (err) => withReason(badProperty(value, key), err)
      );
    } else if (!isOptional) {
      throw missingProperty(value, key);
    }
  }
}

export function matches(value, schema, kpcallback) {
  return foldError(
    () => validate(value, schema, kpcallback),
    () => true,
    () => false
  );
}

export function oneOfValues(values) {
  return kpobject(["form", "enum"], ["values", values]);
}

export function either(...schemas) {
  return kpobject(["form", "union"], ["options", schemas]);
}

export function satisfying(schema, condition) {
  return kpobject(
    ["form", "condition"],
    ["schema", schema],
    ["condition", condition]
  );
}

export function arrayOf(elements) {
  return kpobject(["form", "array"], ["elements", elements]);
}

export function tupleLike(shape) {
  return kpobject(["form", "tuple"], ["shape", shape]);
}

export function objectOf(keys, values) {
  const result = kpobject(
    ["form", "object"],
    ["keys", keys],
    ["values", values]
  );
  return result;
}

export function recordLike(shape) {
  return kpobject(["form", "record"], ["shape", shape]);
}

export function optional(schema) {
  return kpobject(["form", "optional"], ["schema", schema]);
}

function invalidSchema(schema) {
  return kperror("invalidSchema", ["schema", schema]);
}

export function wrongType(value, schema) {
  return kperror(
    "wrongType",
    ["value", value],
    ["expectedType", toTypeName(schema)]
  );
}

function badValue(value, ...details) {
  return kperror("badValue", ["value", value], ...details);
}

function missingElement(value, index, schema) {
  return kperror(
    "missingElement",
    ["value", value],
    ["index", index],
    ["schema", toTypeName(schema)]
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
  if (err.properties.type === "badElement") {
    return withErrorType(err, "badArgumentValue");
  } else if (err.properties.type === "wrongType") {
    return withErrorType(err, "wrongArgumentType");
  } else if (err.properties.type === "badValue") {
    return withErrorType(err, "badArgumentValue");
  } else {
    return err;
  }
}

export function returnError(err) {
  if (err.properties.type === "wrongType") {
    return withErrorType(err, "wrongReturnType");
  } else if (err.properties.type === "badValue") {
    return withErrorType(err, "badReturnValue");
  } else {
    return err;
  }
}

export function argumentPatternError(err) {
  if (err.properties.type === "badElement") {
    return argumentError(err.properties.details.get("reason"));
  } else {
    return argumentError(err);
  }
}

function toTypeName(schema) {
  if (typeof schema === "string") {
    // Already got converted to a string.
    return schema;
  } else if (schema instanceof Class || schema instanceof Protocol) {
    return schema.properties.name;
  } else if (isObject(schema) && schema.has("form")) {
    switch (schema.get("form")) {
      case "enum":
        return `oneOfValues(${schema
          .get("values")
          .map((value) => displaySimple(value))
          .join(", ")})`;
      case "union":
        return `either(${schema.get("options").map(toTypeName).join(", ")})`;
      case "condition":
        return `satisfying(${toTypeName(schema.get("schema"))}, ${displaySimple(schema.get("condition"))})`;
      case "array":
        return `arrayOf(${toTypeName(schema.get("elements"))})`;
      case "tuple":
        return `tupleLike([${schema.get("shape").map(toTypeName).join(", ")}])`;
      case "object":
        return `objectOf(${toTypeName(schema.get("keys") ?? stringClass)}, ${toTypeName(schema.get("values"))})`;
      case "record":
        return `recordLike({${schema
          .get("shape")
          .map(([key, value]) => `${key}: ${toTypeName(value)}`)
          .join(", ")}})`;
      case "optional":
        return `optional(${toTypeName(schema.get("schema"))})`;
      default:
        throw invalidSchema(schema);
    }
  } else {
    throw invalidSchema(schema);
  }
}
