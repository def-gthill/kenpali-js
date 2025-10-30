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
  objectOf,
  oneOfValues,
  optional,
  recordLike,
  satisfying,
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

function jsOneOfValues(values) {
  return toJsObject(oneOfValues(values));
}

function jsEither(...schemas) {
  return toJsObject(either(...schemas));
}

function jsSatisfying(schema, condition) {
  return toJsObject(satisfying(schema, condition));
}

function jsArrayOf(elementSchema) {
  return toJsObject(arrayOf(elementSchema));
}

function jsTupleLike(shape) {
  return toJsObject(tupleLike(shape));
}

function jsObjectOf(keys, values) {
  return toJsObject(objectOf(keys, values));
}

function jsRecordLike(shape) {
  return toJsObject(recordLike(shape));
}

function jsOptional(schema) {
  return toJsObject(optional(schema));
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
  jsOneOfValues as oneOfValues,
  jsOptional as optional,
  platformClass,
  platformFunction,
  protocolClass,
  jsRecordLike as recordLike,
  jsSatisfying as satisfying,
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
