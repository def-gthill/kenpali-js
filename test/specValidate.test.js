import { fromString } from "../src/builtins.js";
import kpcompile from "../src/kpcompile.js";
import kpparse from "../src/kpparse.js";
import kpvm from "../src/kpvm.js";
import { assertIsError } from "./assertions.js";
import { runSpecFile } from "./specRunner.js";

const specPath = "../kenpali/kenpali-validate.md";

runSpecFile(
  specPath,
  (code) => {
    const ast = kpparse(code);
    const program = kpcompile(ast);
    // const program = kpcompile(ast, { trace: true });
    const result = kpvm(program);
    // const result = kpvm(program, { trace: true });
    return result;
  },
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
  }
);
