import kpeval from "../src/kpeval.js";
import { toJsObject } from "../src/kpobject.js";
import kpparse from "../src/kpparse.js";
import { runSpecFile } from "./specRunner.js";

const specPath = "../kenpali/kenpali-builtin-errors.md";

runSpecFile(
  specPath,
  (input) => kpeval(kpparse(input)),
  (t, actualOutputValue, expectedOutput) => {
    const expectedOutputValue = kpeval(kpparse(expectedOutput));
    t.deepEqual(actualOutputValue, expectedOutputValue);
  },
  (t, actualOutputValue, expectedErrorName, expectedErrorDetails) => {
    t.assert(
      actualOutputValue instanceof Map,
      `${actualOutputValue} isn't an error object`
    );
    t.like(toJsObject(actualOutputValue), {
      "#error": expectedErrorName,
      ...JSON.parse(expectedErrorDetails),
    });
  }
);
