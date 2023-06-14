import test from "ava";
import fs from "fs";
import kpeval, { kpevalJson } from "../src/kpeval.js";
import kpparse from "../src/kpparse.js";

const specPath = "../kenpali/kenpali-json.md";

test("This implementation follows the Kenpali JSON spec", (t) => {
  const spec = fs.readFileSync(specPath);

  const regex = /```\n#\s+(.*?)\n((?:.|\n)*?)\n>>\s+((?:.|\n)*?)\n```/gm;

  let match;
  while ((match = regex.exec(spec)) !== null) {
    const [_, description, input, output] = match;
    // const inputJson = JSON.parse(input);
    const expectedOutputValue = kpeval(kpparse(output));
    const actualOutputValue = kpevalJson(input);
    t.deepEqual(
      actualOutputValue,
      expectedOutputValue,
      `Doesn't comply with Kenpali JSON Specification: ${description}`
    );
  }
});
