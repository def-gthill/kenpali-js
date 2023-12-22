import { toJsObject } from "../src/kpobject.js";

export default function assertIsThrown(
  t,
  actual,
  expectedErrorName,
  expectedErrorDetails = {}
) {
  t.assert(actual instanceof Map, `${actual} isn't an error object`);
  t.assert(actual.has("#thrown"), `${actual} isn't an error object`);
  t.like(toJsObject(actual), {
    "#thrown": expectedErrorName,
    ...expectedErrorDetails,
  });
}
