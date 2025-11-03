import { display } from "../src/interop.js";
import { isError, kptry } from "../src/kperror.js";
import { deepToJsObject } from "../src/kpobject.js";

export function assertIsError(
  t,
  actual,
  expectedErrorName,
  expectedErrorDetails = {}
) {
  t.assert(isError(actual), `${display(actual)} isn't an error object`);
  t.is(actual.properties.type, expectedErrorName);
  if (Object.keys(expectedErrorDetails).length > 0) {
    t.like(deepToJsObject(actual.properties.details), expectedErrorDetails);
  }
}

export function assertThrows(
  t,
  f,
  expectedErrorName,
  expectedErrorDetails = {}
) {
  kptry(
    f,
    (error) => {
      t.is(error.properties.type, expectedErrorName);
      if (Object.keys(expectedErrorDetails).length > 0) {
        t.like(deepToJsObject(error.properties.details), expectedErrorDetails);
      }
    },
    (result) => {
      t.fail(`Expected an error, but got result ${display(result)}`);
    }
  );
}
