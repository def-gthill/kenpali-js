import { builtin } from "./builtins.js";
import { callOnValues, Interpreter } from "./evalClean.js";
import { catch_ } from "./kperror.js";
import kpobject, { toJsObject, toKpobject } from "./kpobject.js";
import { isError } from "./values.js";

export function toJsFunction(kpf) {
  return (...args) => {
    const hasNamedParams = (kpf.given.namedParams ?? []).length > 0;
    const posArgs = hasNamedParams ? args.slice(0, -1) : args;
    const namedArgs = hasNamedParams ? toKpobject(args.at(-1)) : kpobject();
    return catch_(() =>
      callOnValues(kpf, posArgs, namedArgs, new Interpreter())
    );
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
