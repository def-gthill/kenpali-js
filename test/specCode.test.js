import { toAst } from "../src/kpast.js";
import { kpcatch } from "../src/kperror.js";
import kpparse from "../src/kpparse.js";
import { assertIsError } from "./assertIsError.js";
import { runSpecFile } from "./specRunner.js";

const specPath = "../kenpali/kenpali-code.md";

runSpecFile(
  specPath,
  (code) => kpcatch(() => kpparse(code)),
  (t, actualCode, expectedOutput) => {
    const expectedCode = toAst(JSON.parse(expectedOutput));
    t.deepEqual(actualCode, expectedCode);
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
