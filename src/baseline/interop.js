import { toJsObject, toKpobject } from "./kpobject.js";
import { kpvmCall } from "./kpvm.js";

export function kpcall(kpf, args, namedArgs, { timeLimitSeconds = 0 } = {}) {
  return kpvmCall(kpf, args, toKpobject(namedArgs), { timeLimitSeconds });
}

export function toKpFunction(jsf) {
  return (args, namedArgs, kpcallback) =>
    jsf(args, toJsObject(namedArgs), (callback, args, namedArgs) =>
      kpcallback(callback, args, toKpobject(namedArgs))
    );
}
