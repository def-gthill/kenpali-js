import { deepToJsObject } from "../src/evalClean.js";
import { isError } from "../src/values.js";

export function assertIsError(
  t,
  actual,
  expectedErrorName,
  expectedErrorDetails = {}
) {
  t.assert(isError(actual), `${actual} isn't an error object`);
  t.is(actual.error, expectedErrorName);
  if (Object.keys(expectedErrorDetails).length > 0) {
    t.like(deepToJsObject(actual.details), expectedErrorDetails);
  }
}
