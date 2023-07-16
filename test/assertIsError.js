import { toJsObject } from "../src/kpobject.js";

export default function assertIsError(
  t,
  actual,
  expectedErrorName,
  expectedErrorDetails = {}
) {
  t.assert(actual instanceof Map, `${actual} isn't an error object`);
  t.assert(actual.has("#error"), `${actual} isn't an error object`);
  t.like(toJsObject(actual), {
    "#error": expectedErrorName,
    ...expectedErrorDetails,
  });
}
