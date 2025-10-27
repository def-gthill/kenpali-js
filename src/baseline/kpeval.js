import kpcompile from "./kpcompile.js";
import kpobject from "./kpobject.js";
import kpvm from "./kpvm.js";

export default function kpeval(
  expression,
  {
    names = kpobject(),
    modules = kpobject(),
    trace = false,
    timeLimitSeconds = 0,
    debugLog = console.error,
  } = {}
) {
  return kpvm(kpcompile(expression, { names, modules, trace }), {
    trace,
    timeLimitSeconds,
    debugLog,
  });
}
