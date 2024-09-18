import { isObject } from "./builtins.js";
import kpobject, { kpoMerge } from "./kpobject.js";

export function is(type, namedArgs = kpobject()) {
  if (namedArgs.get("where") === null) {
    namedArgs.delete("where");
  }
  return kpoMerge(kpobject(["#type", type]), namedArgs);
}

export function oneOf(values) {
  return kpobject(["#oneOf", values]);
}

export function arrayOf(elementSchema, namedArgs = kpobject()) {
  if (namedArgs.get("where") === null) {
    namedArgs.delete("where");
  }
  return kpoMerge(
    kpobject(["#type", "array"], ["elements", elementSchema]),
    namedArgs
  );
}

export function objectOf(namedArgs) {
  if (namedArgs.get("where") === null) {
    namedArgs.delete("where");
  }
  return kpoMerge(kpobject(["#type", "object"]), namedArgs);
}

export function optional(schema) {
  return kpobject(["#default", null], ["for", either(schema, "null")]);
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
