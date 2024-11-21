import { builtin } from "./builtins.js";
import { kpcatch } from "./kperror.js";
import { toJsObject, toKpobject } from "./kpobject.js";
import { kpvmCall } from "./kpvm.js";
import { isError } from "./values.js";

export function kpcall(kpf, args, namedArgs, { timeLimitSeconds = 0 } = {}) {
  return kpvmCall(kpf, args, toKpobject(namedArgs), { timeLimitSeconds });
}

export function toKpFunction(jsf) {
  return builtin(
    jsf.name || "<anonymous>",
    { params: [{ rest: "args" }], namedParams: [{ rest: "namedArgs" }] },
    (args, namedArgs, kpcallback) => {
      const result = jsf(
        args,
        toJsObject(namedArgs),
        (callback, args, namedArgs) =>
          kpcatch(() => kpcallback(callback, args, toKpobject(namedArgs)))
      );
      if (isError(result)) {
        throw result;
      } else {
        return result;
      }
    }
  );
}
