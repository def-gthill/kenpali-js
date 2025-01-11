import { fromString } from "../src/builtins.js";
import kpcompile from "../src/kpcompile.js";
import kpparse from "../src/kpparse.js";
import kpvm from "../src/kpvm.js";
import { runSpecFile } from "./specRunner.js";

const specPath = "../kenpali/kenpali-core.md";

runSpecFile(
  specPath,
  (code) => {
    const ast = kpparse(code);
    const program = kpcompile(ast);
    // const program = kpcompile(ast, { trace: true });
    const result = kpvm(program, { timeLimitSeconds: 0.1 });
    // const result = kpvm(program, { trace: true });
    return result;
  },
  (t, actualOutputValue, expectedOutput) => {
    const expectedOutputValue = fromString(expectedOutput);
    t.deepEqual(actualOutputValue, expectedOutputValue);
  },
  (t) => t.fail("Error testing not implemented")
);
