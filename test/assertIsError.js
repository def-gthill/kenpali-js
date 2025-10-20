import { isError } from "../src/kperror.js";
import { deepToJsObject } from "../src/kpobject.js";
import { toString } from "../src/values.js";

export function assertIsError(
  t,
  actual,
  expectedErrorName,
  expectedErrorDetails = {}
) {
  t.assert(isError(actual), `${toString(actual)} isn't an error object`);
  t.is(actual.properties.error, expectedErrorName);
  if (Object.keys(expectedErrorDetails).length > 0) {
    t.like(deepToJsObject(actual.properties.details), expectedErrorDetails);
  }
}
