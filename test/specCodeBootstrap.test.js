import kpparseBootstrap from "../src/kpparseBootstrap.js";
import { assertIsError } from "./assertions.js";
import { runSpecFile } from "./specRunner.js";

const specPath = "../kenpali/kenpali-code.md";

runSpecFile(
  specPath,
  (code) => kpparseBootstrap(code, { timeLimitSeconds: 1 }),
  (t, actualCode, expectedOutput) => {
    const expectedCode = JSON.parse(expectedOutput);
    t.deepEqual(stripIndices(actualCode), expectedCode);
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

function stripIndices(node) {
  if (node === null) {
    return null;
  } else if (Array.isArray(node)) {
    return node.map(stripIndices);
  } else if (typeof node === "object") {
    return Object.fromEntries(
      Object.entries(node)
        .filter(([key]) => key !== "start" && key !== "end")
        .map(([key, value]) => [key, stripIndices(value)])
    );
  } else {
    return node;
  }
}
