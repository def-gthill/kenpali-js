import { platformClass, platformFunction } from "./src/builtins.js";
import { kpcall, toKpFunction } from "./src/interop.js";
import kpcompile from "./src/kpcompile.js";
import { errorClass, foldError, isError, kpcatch } from "./src/kperror.js";
import kpeval from "./src/kpeval.js";
import kpobject, { deepToKpobject, toJsObject } from "./src/kpobject.js";
import kpparse from "./src/kpparse.js";
import kpvm from "./src/kpvm.js";
import {
  EmptyStream,
  emptyStream,
  FullStream,
  Stream,
  stream,
  streamClass,
} from "./src/stream.js";
import internalValidate, {
  arrayOf,
  either,
  matches as internalMatches,
  is,
  objectOf,
  oneOf,
  optional,
  recordLike,
  tupleLike,
} from "./src/validate.js";
import {
  anyProtocol,
  arrayClass,
  booleanClass,
  classClass,
  display,
  displayProtocol,
  functionClass,
  instanceProtocol,
  Class as KpClass,
  Protocol as KpProtocol,
  nullClass,
  numberClass,
  objectClass,
  protocolClass,
  sequenceProtocol,
  stringClass,
  typeProtocol,
} from "./src/values.js";

function matches(value, schema) {
  return internalMatches(value, deepToKpobject(schema), (f, [arg]) => f(arg));
}

function validate(value, schema) {
  internalValidate(value, deepToKpobject(schema), (f, [arg]) => f(arg));
}

function validateCatching(value, schema) {
  return foldError(
    () => validate(value, schema),
    () => null,
    (error) => error
  );
}

function validateErrorTo(value, schema, onFailure) {
  foldError(
    () => validate(value, schema),
    () => null,
    (error) => {
      onFailure(error);
      return null;
    }
  );
}

function jsIs(type, where) {
  return toJsObject(is(type, where));
}
function jsOneOf(values) {
  return toJsObject(oneOf(values));
}
function jsArrayOf(elementSchema, where) {
  return toJsObject(arrayOf(elementSchema, where));
}
function jsTupleLike(shape) {
  return toJsObject(tupleLike(shape));
}
function jsObjectOf(keys, values, where) {
  return toJsObject(objectOf(keys, values, where));
}
function jsRecordLike(shape) {
  return toJsObject(recordLike(shape));
}
function jsOptional(schema) {
  return toJsObject(optional(schema));
}
function jsEither(...schemas) {
  return toJsObject(either(...schemas));
}

export {
  anyProtocol,
  arrayClass,
  jsArrayOf as arrayOf,
  booleanClass,
  classClass,
  display,
  displayProtocol,
  jsEither as either,
  emptyStream,
  EmptyStream,
  errorClass,
  foldError,
  FullStream,
  functionClass,
  instanceProtocol,
  jsIs as is,
  isError,
  kpcall,
  kpcatch,
  KpClass,
  kpcompile,
  kpeval,
  kpobject,
  kpparse,
  KpProtocol,
  kpvm,
  matches,
  nullClass,
  numberClass,
  objectClass,
  jsObjectOf as objectOf,
  jsOneOf as oneOf,
  jsOptional as optional,
  platformClass,
  platformFunction,
  protocolClass,
  jsRecordLike as recordLike,
  sequenceProtocol,
  stream,
  Stream,
  streamClass,
  stringClass,
  toKpFunction,
  jsTupleLike as tupleLike,
  typeProtocol,
  validate,
  validateCatching,
  validateErrorTo,
};
