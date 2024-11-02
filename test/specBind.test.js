import kpeval from "../src/kpeval.js";
import kpparse from "../src/kpparse.js";
import { assertIsError } from "./assertIsError.js";
import { runSpecFile } from "./specRunner.js";

const specPath = "../kenpali/kenpali-bind.md";

runSpecFile(
  specPath,
  (input) => kpeval(kpparse(input)),
  (t, actualOutputValue, expectedOutput) => {
    const expectedOutputValue = kpeval(kpparse(expectedOutput));
    t.deepEqual(actualOutputValue, expectedOutputValue);
  },
  (t, actualOutputValue, expectedErrorName, expectedErrorDetails) => {
    assertIsError(
      t,
      actualOutputValue,
      expectedErrorName,
      JSON.parse(expectedErrorDetails)
    );
  }
);
