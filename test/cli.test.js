import test from "ava";
import { main } from "../src/cli.js";

test("The run command with no arguments evaluates an expression", (t) => {
  const args = ["run", "hello.kpc"];
  const fs = {
    readFileSync: () => `"Hello, world!"`,
  };
  const result = main(args, fs);
  t.is(result, `"Hello, world!"`);
});

test("The run command passes positional arguments to the function", (t) => {
  const args = ["run", "greet.kpc", "Alice", "Bob"];
  const fs = {
    readFileSync: () =>
      `(name1, name2) => ["Hello, ", name1, " and ", name2, "!"] | join`,
  };
  const result = main(args, fs);
  t.is(result, `"Hello, Alice and Bob!"`);
});

test("The run command passes named arguments to the function", (t) => {
  const args = ["run", "greet.kpc", "--name1", "Alice", "--name2", "Bob"];
  const fs = {
    readFileSync: () =>
      `(name1:, name2:) => ["Hello, ", name1, " and ", name2, "!"] | join`,
  };
  const result = main(args, fs);
  t.is(result, `"Hello, Alice and Bob!"`);
});

test("The compile command produces a bytecode file", (t) => {
  const args = ["compile", "hello.kpc"];
  let fileWritten = false;
  const fs = {
    readFileSync: () => `"Hello, world!"`,
    writeFileSync: (file) => {
      t.is(file, "hello.kpb");
      fileWritten = true;
    },
  };
  const result = main(args, fs);
  t.is(result, "Wrote bytecode to hello.kpb");
  t.true(fileWritten);
});
