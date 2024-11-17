import kpcompile from "../src/kpcompile.js";
import { catch_ } from "../src/kperror.js";
import kpeval from "../src/kpeval.js";
import kpparse from "../src/kpparse.js";
import kpvm from "../src/kpvm.js";
import { assertIsError } from "./assertIsError.js";
import { runSpecFile } from "./specRunner.js";

const specPath = "../kenpali/kenpali-bind.md";

runSpecFile(
  specPath,
  (code) =>
    catch_(() => {
      const ast = kpparse(code);
      const program = kpcompile(ast);
      // const program = kpcompile(ast, { trace: true });
      const result = kpvm(program);
      // const result = kpvm(program, { trace: true });
      return result;
    }),
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
