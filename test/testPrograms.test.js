import test from "ava";
import fs from "fs";
import kpeval from "../src/kpeval.js";
import kpparse from "../src/kpparse.js";

const specPath = "../kenpali/test-programs.md";

test("This implementation correctly runs the test programs", (t) => {
  const spec = fs.readFileSync(specPath);

  const regex = /```\n#\s+(.*?)\n((?:.|\n)*?)\n>>\s+((?:.|\n)*?)\n```/gm;

  let match;
  while ((match = regex.exec(spec)) !== null) {
    const [_, description, program, output] = match;
    const expectedOutputValue = kpeval(kpparse(output));
    const actualOutputValue = kpeval(kpparse(program));
    t.deepEqual(
      actualOutputValue,
      expectedOutputValue,
      `Doesn't produce the correct value for the test program: ${description}`
    );
  }
});
