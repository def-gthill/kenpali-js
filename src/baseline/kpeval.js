import kpcompile from "./kpcompile.js";
import kpvm from "./kpvm.js";

export default function kpeval(
  expression,
  {
    names = new Map(),
    modules = new Map(),
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
