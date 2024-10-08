import kpparse from "../src/kpparse.js";
import { runSpecFile } from "./specRunner.js";

const specPath = "../kenpali/kenpali-code.md";

runSpecFile(
  specPath,
  kpparse,
  (t, actualCode, expectedOutput) => {
    const expectedCode = JSON.parse(expectedOutput);
    t.deepEqual(actualCode, expectedCode);
  },
  (t) => t.fail("Error testing not implemented")
);
