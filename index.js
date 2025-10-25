import { platformClass, platformFunction } from "./src/builtins.js";
import { kpcall, toKpFunction } from "./src/interop.js";
import kpcompile from "./src/kpcompile.js";
import { foldError, isError, kpcatch } from "./src/kperror.js";
import kpeval from "./src/kpeval.js";
import kpobject, { deepToKpobject } from "./src/kpobject.js";
import kpparse from "./src/kpparse.js";
import kpvm from "./src/kpvm.js";
import internalValidate, {
  matches as internalMatches,
} from "./src/validate.js";
import {
  anyProtocol,
  arrayClass,
  booleanClass,
  classClass,
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
  toString,
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

export {
  anyProtocol,
  arrayClass,
  booleanClass,
  classClass,
  displayProtocol,
  foldError,
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
  platformClass,
  platformFunction,
  protocolClass,
  sequenceProtocol,
  stringClass,
  toKpFunction,
  toString,
  typeProtocol,
  validate,
  validateCatching,
  validateErrorTo,
};
