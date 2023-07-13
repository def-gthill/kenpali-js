import test from "ava";
import fs from "fs";

export function runSpecFile(
  specPath,
  functionToTest,
  checkNormalOutput,
  checkErrorOutput,
  only = null
) {
  const spec = fs.readFileSync(specPath);

  const regex =
    /```\n#\s+(.*?)\n((?:.|\n)*?)\n(?:>>\s+((?:.|\n)*?)|!!\s+(.*?)\s+(.*?))\n```/gm;

  let match;
  while ((match = regex.exec(spec)) !== null) {
    const [_, description, input, output, errorName, errorDetails] = match;
    if (only && description !== only) {
      continue;
    }
    const actualOutputValue = functionToTest(input);
    test(description, (t) => {
      if (errorName) {
        checkErrorOutput(t, actualOutputValue, errorName, errorDetails);
      } else {
        checkNormalOutput(t, actualOutputValue, output);
      }
    });
  }
}
