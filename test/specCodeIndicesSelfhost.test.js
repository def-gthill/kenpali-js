import { deepToJsObject } from "../src/kpobject.js";
import kpparseSelfhost from "../src/kpparseSelfhost.js";
import { assertIsError } from "./assertions.js";
import { runSpecFile } from "./specRunner.js";

const specPath = "../kenpali/kenpali-code-indices.md";

runSpecFile(
  specPath,
  (code) => kpparseSelfhost(code, { timeLimitSeconds: 1 }),
  (t, actualCode, expectedOutput) => {
    const expectedCode = JSON.parse(expectedOutput);
    t.deepEqual(deepToJsObject(actualCode), expectedCode);
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
