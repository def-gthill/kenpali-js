import { deepToJsObject } from "../src/kpobject.js";
import { isError, toString } from "../src/values.js";

export function assertIsError(
  t,
  actual,
  expectedErrorName,
  expectedErrorDetails = {}
) {
  t.assert(isError(actual), `${toString(actual)} isn't an error object`);
  t.is(actual.error, expectedErrorName);
  if (Object.keys(expectedErrorDetails).length > 0) {
    t.like(deepToJsObject(actual.details), expectedErrorDetails);
  }
}
