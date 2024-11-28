import { kpcall, toKpFunction } from "./src/interop.js";
import kpcompile from "./src/kpcompile.js";
import { kpcatch } from "./src/kperror.js";
import kpeval from "./src/kpeval.js";
import kpobject, { deepToKpobject } from "./src/kpobject.js";
import kpparse from "./src/kpparse.js";
import kpvm from "./src/kpvm.js";
import internalValidate, {
  matches as internalMatches,
} from "./src/validate.js";
import { toString } from "./src/values.js";

function matches(value, schema) {
  return internalMatches(value, deepToKpobject(schema), (f, [arg]) => f(arg));
}

function validate(value, schema) {
  internalValidate(value, deepToKpobject(schema), (f, [arg]) => f(arg));
}

export {
  kpcall,
  kpcatch,
  kpcompile,
  kpeval,
  kpobject,
  kpparse,
  kpvm,
  matches,
  toKpFunction,
  toString,
  validate,
};
