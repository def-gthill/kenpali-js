import { kpcompileJson } from "../src/kpcompile.js";
import { catch_ } from "../src/kperror.js";
import kpeval from "../src/kpeval.js";
import kpparse from "../src/kpparse.js";
import kpvm from "../src/kpvm.js";
import { assertIsError } from "./assertIsError.js";
import { runSpecFile } from "./specRunner.js";

const specPath = "../kenpali/kenpali-json.md";

runSpecFile(
  specPath,
  (json) => catch_(() => kpvm(kpcompileJson(json))),
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
  },
  [
    "Literal null",
    "Literal false",
    "Literal true",
    "Literal number",
    "Literal string",
    "Binding a name",
    "Binding multiple names",
    "Name used before assignment",
    "Scope",
    "A name from an enclosing scope",
    "Shadowing",
    "Empty array",
    "Array of literals",
    "Array with elements of mixed types",
    "Nested arrays",
    "Array containing an expression to evaluate",
    "Array with spread",
    "Array destructuring",
    "Array destructuring with rest",
    "Empty object",
    "Object with literal values",
    "Object with explicit literal keys",
    "Object with values of mixed types",
    "Nested objects",
    "Object with expression keys and values",
    "Object with spread",
    "Object destructuring",
    "Object destructuring with rest",
  ]
);
