import { isError, toString } from "../src/builtins.js";
import kpeval, { deepToJsObject } from "../src/kpeval.js";
import kpparse from "../src/kpparse.js";
import { runSpecFile } from "./specRunner.js";

const specPath = "../kenpali/kenpali-bind.md";

runSpecFile(
  specPath,
  (input) => kpeval(kpparse(input)),
  (t, actualOutputValue, expectedOutput) => {
    const expectedOutputValue = kpeval(kpparse(expectedOutput));
    t.deepEqual(
      deepToJsObject(actualOutputValue),
      deepToJsObject(expectedOutputValue)
    );
  },
  (t, actualOutputValue, expectedErrorName, expectedErrorDetails) => {
    t.assert(
      isError(actualOutputValue),
      `${toString(actualOutputValue)} isn't an error object`
    );
    t.like(deepToJsObject(actualOutputValue), {
      "#error": expectedErrorName,
      ...JSON.parse(expectedErrorDetails),
    });
  }
);
