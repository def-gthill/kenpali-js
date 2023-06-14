import test from "ava";
import fs from "fs";
import kpparse from "../src/kpparse.js";

const specPath = "../kenpali/kenpali-code.md";

test("This implementation follows the Kenpali Code spec", (t) => {
  const spec = fs.readFileSync(specPath);

  const regex = /```\n#\s+(.*?)\n((?:.|\n)*?)\n>>\s+((?:.|\n)*?)\n```/gm;

  let match;
  while ((match = regex.exec(spec)) !== null) {
    const [_, description, input, output] = match;
    const expectedCode = JSON.parse(output);
    const actualCode = kpparse(input);
    t.deepEqual(
      actualCode,
      expectedCode,
      `Doesn't comply with Kenpali Code Specification: ${description}`
    );
  }
});
