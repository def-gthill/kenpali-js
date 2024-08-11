import { isError, isThrown } from "../src/builtins.js";
import { toJsObject } from "../src/kpobject.js";

export function assertIsThrown(
  t,
  actual,
  expectedErrorName,
  expectedErrorDetails = {}
) {
  t.assert(isThrown(actual), `${actual} isn't a thrown error`);
  t.like(toJsObject(actual), {
    "#thrown": expectedErrorName,
    ...expectedErrorDetails,
  });
}

export function assertIsError(
  t,
  actual,
  expectedErrorName,
  expectedErrorDetails = {}
) {
  t.assert(isError(actual), `${actual} isn't an error object`);
  t.like(toJsObject(actual), {
    "#error": expectedErrorName,
    ...expectedErrorDetails,
  });
}
