import { builtin, isError } from "./builtins.js";
import { evalCompiledToFunction, kpcompile } from "./kpeval.js";
import kpobject, { toJsObject } from "./kpobject.js";

export function makeFunction(
  expression,
  { names = kpobject(), modules = kpobject() } = {}
) {
  const compiled = kpcompile(expression, { names, modules });
  if (isError(compiled)) {
    return compiled;
  }
  return evalCompiledToFunction(compiled);
}

export function toKpFunction(jsf) {
  return builtin(
    jsf.name || "<anonymous>",
    { params: [{ rest: "args" }], namedParams: [{ rest: "namedArgs" }] },
    (args, namedArgs) => jsf(...args, toJsObject(namedArgs))
  );
}
