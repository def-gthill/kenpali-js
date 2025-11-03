import { display } from "../src/interop.js";
import { kptry } from "../src/kperror.js";
import { deepToJsObject } from "../src/kpobject.js";

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
