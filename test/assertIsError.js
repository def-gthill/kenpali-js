import { toJsObject } from "../src/kpobject.js";

export function assertIsThrown(
  t,
  actual,
  expectedErrorName,
  expectedErrorDetails = {}
) {
  t.assert(actual instanceof Map, `${actual} isn't a thrown error`);
  t.assert(actual.has("#thrown"), `${actual} isn't a thrown error`);
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
  t.assert(actual instanceof Map, `${actual} isn't an error object`);
  t.assert(actual.has("#error"), `${actual} isn't an error object`);
  t.like(toJsObject(actual), {
    "#error": expectedErrorName,
    ...expectedErrorDetails,
  });
}
