import kpeval from "../src/kpeval.js";
import kpparse from "../src/kpparse.js";
import { runSpecFile } from "./specRunner.js";

const specPath = "../kenpali/test-programs.md";

runSpecFile(
  specPath,
  (input) => kpeval(kpparse(input)),
  (t, actualOutputValue, expectedOutput) => {
    console.log(actualOutputValue[0]);
    console.log(actualOutputValue[0].get("value").get("reason"));
    const expectedOutputValue = kpeval(kpparse(expectedOutput));
    t.deepEqual(actualOutputValue, expectedOutputValue);
  },
  (t) => t.fail("Error testing not implemented"),
  "Fizzbuzz"
);
