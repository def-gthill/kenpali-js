import test from "ava";
import fs from "fs";
import kpeval, { kpevalJson } from "../src/kpeval.js";
import { toJsObject } from "../src/kpobject.js";
import kpparse from "../src/kpparse.js";

const specPath = "../kenpali/kenpali-json.md";

test("This implementation follows the Kenpali JSON spec", (t) => {
  const spec = fs.readFileSync(specPath);

  const regex =
    /```\n#\s+(.*?)\n((?:.|\n)*?)\n(?:>>\s+((?:.|\n)*?)|!!\s+(.*?)\s+(.*?))\n```/gm;

  let match;
  while ((match = regex.exec(spec)) !== null) {
    const [_, description, input, output, errorName, errorDetails] = match;
    const actualOutputValue = kpevalJson(input);
    if (errorName) {
      t.like(toJsObject(actualOutputValue), {
        "!!error": errorName,
        ...JSON.parse(errorDetails),
      });
    } else {
      const expectedOutputValue = kpeval(kpparse(output));
      t.deepEqual(
        actualOutputValue,
        expectedOutputValue,
        `Doesn't comply with Kenpali JSON Specification: ${description}`
      );
    }
  }
});
