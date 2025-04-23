import { builtin, instance, method } from "./src/builtins.js";
import { kpcall, toKpFunction } from "./src/interop.js";
import kpcompile from "./src/kpcompile.js";
import { foldError, kpcatch } from "./src/kperror.js";
import kpeval from "./src/kpeval.js";
import kpobject, { deepToKpobject } from "./src/kpobject.js";
import kpparse from "./src/kpparse.js";
import kpvm from "./src/kpvm.js";
import internalValidate, {
  matches as internalMatches,
} from "./src/validate.js";
import { isError, toString } from "./src/values.js";

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
  builtin,
  foldError,
  instance,
  isError,
  kpcall,
  kpcatch,
  kpcompile,
  kpeval,
  kpobject,
  kpparse,
  kpvm,
  matches,
  method,
  toKpFunction,
  toString,
  validate,
  validateCatching,
  validateErrorTo,
};
