import { toJsObject, toKpobject } from "./kpobject.js";
import { kpvmCall } from "./kpvm.js";
import { toString as internalToString } from "./values.js";

export function kpcall(kpf, args, namedArgs, { timeLimitSeconds = 0 } = {}) {
  return kpvmCall(kpf, args, toKpobject(namedArgs), { timeLimitSeconds });
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

export function toString(value, options = { timeLimitSeconds: 10 }) {
  return internalToString(value, (...args) =>
    kpcallbackInNewSession(...args, options)
  );
}
