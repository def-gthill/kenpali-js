import test from "ava";
import fs from "fs";

const r = String.raw;

export function runSpecFile(
  specPath,
  functionToTest,
  checkNormalOutput,
  checkErrorOutput,
  only = null
) {
  const spec = fs.readFileSync(specPath, { encoding: "utf-8" });

  const newline = r`(?:\r\n|\r|\n)`;
  const descriptionPattern = r`#\s+(.*?)`;
  const inputPattern = r`((?:.|${newline})*?)`;
  const outputPattern = r`(?:>>\s+((?:.|${newline})*?)|!!\s+(.*?)\s+(.*?))`;
  const regexPattern =
    "```" +
    r`${newline}${descriptionPattern}${newline}${inputPattern}${newline}${outputPattern}${newline}` +
    "```";

  const regex = new RegExp(regexPattern, "gm");

  let match;
  while ((match = regex.exec(spec)) !== null) {
    const [_, description, input, output, errorName, errorDetails] = match;
    if (only && !only.includes(description)) {
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
