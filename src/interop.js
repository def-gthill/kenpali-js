import { toJsObject, toKpobject } from "./kpobject.js";
import { kpvmCall } from "./kpvm.js";
import { display as internalDisplay } from "./values.js";

export function kpcall(
  kpf,
  posArgs,
  namedArgs,
  { timeLimitSeconds = 0, debugLog = console.error } = {}
) {
  return kpvmCall(kpf, posArgs, toKpobject(namedArgs), {
    timeLimitSeconds,
    debugLog,
  });
}

export function kpcallbackInNewSession(
  kpf,
  posArgs,
  namedArgs,
  options = { timeLimitSeconds: 10 }
) {
  return kpcall(kpf, posArgs, namedArgs, options);
}

export function toKpFunction(jsf) {
  return (posArgs, namedArgs, { kpcallback }) =>
    jsf(posArgs, toJsObject(namedArgs), (callback, posArgs, namedArgs) =>
      kpcallback(callback, posArgs, toKpobject(namedArgs))
    );
}

export function display(value, kpcallback = kpcallbackInNewSession) {
  return internalDisplay(value, kpcallback);
}
