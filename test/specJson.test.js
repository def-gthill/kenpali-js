import { fromString } from "../src/builtins.js";
import { kpcompileJson } from "../src/kpcompile.js";
import { kpcatch } from "../src/kperror.js";
import kpvm from "../src/kpvm.js";
import { assertIsError } from "./assertIsError.js";
import { runSpecFile } from "./specRunner.js";

const specPath = "../kenpali/kenpali-json.md";

runSpecFile(
  specPath,
  (json) =>
    kpcatch(() => {
      const program = kpcompileJson(json);
      // const program = kpcompileJson(json, { trace: true });
      const result = kpvm(program);
      // const result = kpvm(program, { trace: true });
      return result;
    }),
  (t, actualOutputValue, expectedOutput) => {
    const expectedOutputValue = fromString(expectedOutput);
    t.deepEqual(actualOutputValue, expectedOutputValue);
  },
  (t, actualOutputValue, expectedErrorName, expectedErrorDetails) => {
    assertIsError(
      t,
      actualOutputValue,
      expectedErrorName,
      JSON.parse(expectedErrorDetails)
    );
  },
  ["Object destructuring with aliases"]
);
