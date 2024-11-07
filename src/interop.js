import { builtin, isError } from "./builtins.js";
import { catch_ } from "./kperror.js";
import { callOnValues } from "./kpeval.js";
import kpobject, { toJsObject, toKpobject } from "./kpobject.js";

export function toJsFunction(kpf) {
  return (...args) => {
    const hasNamedParams = (kpf.given.namedParams ?? []).length > 0;
    const posArgs = hasNamedParams ? args.slice(0, -1) : args;
    const namedArgs = hasNamedParams ? toKpobject(args.at(-1)) : kpobject();
    return catch_(() => callOnValues(kpf, posArgs, namedArgs));
  };
}

export function toKpFunction(jsf) {
  return builtin(
    jsf.name || "<anonymous>",
    { params: [{ rest: "args" }], namedParams: [{ rest: "namedArgs" }] },
    (args, namedArgs) => {
      const result = jsf(...args, toJsObject(namedArgs));
      if (isError(result)) {
        throw result;
      } else {
        return result;
      }
    }
  );
}
