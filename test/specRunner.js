import test from "ava";
import fs from "fs";

import { display } from "../src/interop.js";
import { kpcatch } from "../src/kperror.js";

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
    test(description, (t) => {
      const actualOutputValue = kpcatch(() => functionToTest(input));
      if (errorName) {
        if (actualOutputValue.status === "error") {
          checkErrorOutput(t, actualOutputValue.error, errorName, errorDetails);
        } else {
          t.fail(
            `Expected error, but got success: ${display(actualOutputValue.value)}`
          );
        }
      } else {
        if (actualOutputValue.status === "success") {
          checkNormalOutput(t, actualOutputValue.value, output);
        } else {
          t.fail(
            `Expected success, but got error: ${display(actualOutputValue.error)}`
          );
        }
      }
    });
  }
}
