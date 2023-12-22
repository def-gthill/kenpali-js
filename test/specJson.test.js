import { isError } from "../src/builtins.js";
import kpeval, { kpevalJson } from "../src/kpeval.js";
import { toJsObject } from "../src/kpobject.js";
import kpparse from "../src/kpparse.js";
import { runSpecFile } from "./specRunner.js";

const specPath = "../kenpali/kenpali-json.md";

runSpecFile(
  specPath,
  kpevalJson,
  (t, actualOutputValue, expectedOutput) => {
    const expectedOutputValue = kpeval(kpparse(expectedOutput));
    t.deepEqual(actualOutputValue, expectedOutputValue);
  },
  (t, actualOutputValue, expectedErrorName, expectedErrorDetails) => {
    t.assert(
      isError(actualOutputValue),
      `${actualOutputValue} isn't an error object`
    );
    t.like(toJsObject(actualOutputValue), {
      "#error": expectedErrorName,
      ...JSON.parse(expectedErrorDetails),
    });
  }
);
