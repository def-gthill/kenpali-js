import { toAst } from "../src/kpeval.js";
import kpparse from "../src/kpparse.js";
import { runSpecFile } from "./specRunner.js";

const specPath = "../kenpali/kenpali-code.md";

runSpecFile(
  specPath,
  kpparse,
  (t, actualCode, expectedOutput) => {
    const expectedCode = toAst(JSON.parse(expectedOutput));
    t.deepEqual(actualCode, expectedCode);
  },
  (t) => t.fail("Error testing not implemented")
);
