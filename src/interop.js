import { toJsObject, toKpobject } from "./kpobject.js";
import { kpvmCall } from "./kpvm.js";
import { display as internalDisplay } from "./values.js";

export function kpcall(
  kpf,
  args,
  namedArgs,
  { timeLimitSeconds = 0, debugLog = console.error } = {}
) {
  return kpvmCall(kpf, args, toKpobject(namedArgs), {
    timeLimitSeconds,
    debugLog,
  });
}

export function kpcallbackInNewSession(
  kpf,
  args,
  namedArgs,
  options = { timeLimitSeconds: 10 }
) {
  return kpcall(kpf, args, namedArgs, options);
}

export function toKpFunction(jsf) {
  return (args, namedArgs, { kpcallback }) =>
    jsf(args, toJsObject(namedArgs), (callback, args, namedArgs) =>
      kpcallback(callback, args, toKpobject(namedArgs))
    );
}

export function display(value, kpcallback = kpcallbackInNewSession) {
  return internalDisplay(value, kpcallback);
}
