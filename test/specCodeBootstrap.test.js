import { deepToJsObject } from "../src/kpobject.js";
import kpparseBootstrap from "../src/kpparseBootstrap.js";
import { assertIsError } from "./assertions.js";
import { runSpecFile } from "./specRunner.js";

const specPath = "../kenpali/kenpali-code.md";

runSpecFile(
  specPath,
  (code) => kpparseBootstrap(code, { timeLimitSeconds: 1 }),
  (t, actualCode, expectedOutput) => {
    const expectedCode = JSON.parse(expectedOutput);
    t.deepEqual(deepToJsObject(actualCode), expectedCode);
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
    "Invalid character",
    "Literal null",
    "Literal false",
    "Literal true",
    "Literal integer",
    "Literal decimal",
    "Literal decimal in scientific notation",
    "Literal string",
    "Literal string with escapes",
    "Long Unicode escape sequence",
    "Invalid escape sequence",
    "Invalid Unicode escape sequence",
    "Unclosed string literal",
    "Raw literal string",
    "Unclosed raw string literal",
    "A comment on its own line",
    "A comment at the end of a line",
    "Name with only letters",
    "Name with uppercase letters",
    "Name with numbers",
    "Name starting with a keyword",
    "Name in a module",
    "Empty array",
    // "Single-element array",
  ]
);
