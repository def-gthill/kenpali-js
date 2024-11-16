import kpcompile from "../src/kpcompile.js";
import kpeval from "../src/kpeval.js";
import kpparse from "../src/kpparse.js";
import kpvm from "../src/kpvm.js";
import { runSpecFile } from "./specRunner.js";

const specPath = "../kenpali/kenpali-builtins.md";

runSpecFile(
  specPath,
  // (input) => kpeval(kpparse(input)),
  (code) => {
    const ast = kpparse(code);
    const program = kpcompile(ast);
    // const program = kpcompile(ast, { trace: true });
    const result = kpvm(program);
    // const result = kpvm(program, { trace: true });
    return result;
  },
  (t, actualOutputValue, expectedOutput) => {
    const expectedOutputValue = kpeval(kpparse(expectedOutput));
    t.deepEqual(actualOutputValue, expectedOutputValue);
  },
  (t) => t.fail("Error testing not implemented")
  // ["Indexing strings"]
);
