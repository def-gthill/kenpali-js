import { builtin, isError } from "./builtins.js";
import { callOnValues, evalCompiledToFunction, kpcompile } from "./kpeval.js";
import kpobject, { toJsObject, toKpobject } from "./kpobject.js";

export function toJsFunction(kpf) {
  return (...args) => {
    const hasNamedParams = kpf.get("#given").get("namedParams").length > 0;
    const posArgs = hasNamedParams ? args.slice(0, -1) : args;
    const namedArgs = hasNamedParams ? toKpobject(args.at(-1)) : kpobject();
    return callOnValues(kpf, posArgs, namedArgs);
  };
}

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
