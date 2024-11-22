import { kpcall, toKpFunction } from "./src/interop.js";
import { calling, literal, name } from "./src/kpast.js";
import kpcompile from "./src/kpcompile.js";
import { kpcatch } from "./src/kperror.js";
import kpeval from "./src/kpeval.js";
import kpobject from "./src/kpobject.js";
import kpparse from "./src/kpparse.js";
import kpvm from "./src/kpvm.js";
import { toString } from "./src/values.js";

function matches(value, schema, { timeLimitSeconds = 0 } = {}) {
  const ast = calling(name("matches"), [literal(value), literal(schema)]);
  return kpeval(ast, { timeLimitSeconds });
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
};
