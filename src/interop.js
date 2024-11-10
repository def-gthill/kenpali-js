import { builtin } from "./builtins.js";
import { callOnValues, Interpreter } from "./evalClean.js";
import { catch_ } from "./kperror.js";
import { toJsObject, toKpobject } from "./kpobject.js";
import { isError } from "./values.js";

export function kpcall(kpf, args, namedArgs, { timeLimitSeconds = 0 } = {}) {
  const interpreter = new Interpreter({ timeLimitSeconds });
  return catch_(() =>
    callOnValues(kpf, args, toKpobject(namedArgs), interpreter)
  );
}

export function toKpFunction(jsf) {
  return builtin(
    jsf.name || "<anonymous>",
    { params: [{ rest: "args" }], namedParams: [{ rest: "namedArgs" }] },
    (args, namedArgs, interpreter) => {
      const result = jsf(
        args,
        toJsObject(namedArgs),
        (callback, args, namedArgs) =>
          catch_(() =>
            callOnValues(callback, args, toKpobject(namedArgs), interpreter)
          )
      );
      if (isError(result)) {
        throw result;
      } else {
        return result;
      }
    }
  );
}
