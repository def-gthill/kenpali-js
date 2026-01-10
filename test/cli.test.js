import test from "ava";
import { main } from "../src/cli.js";

test("The run command with no arguments evaluates an expression", (t) => {
  const args = ["run", "hello.kpc"];
  const fs = {
    readTextFile: () => `"Hello, world!"`,
  };
  const result = main(args, fs);
  t.is(result, `"Hello, world!"`);
});

test("The run command passes positional arguments to the function", (t) => {
  const args = ["run", "greet.kpc", "Alice", "Bob"];
  const fs = {
    readTextFile: () =>
      `(name1, name2) => ["Hello, ", name1, " and ", name2, "!"] | join`,
  };
  const result = main(args, fs);
  t.is(result, `"Hello, Alice and Bob!"`);
});

test("The run command passes named arguments to the function", (t) => {
  const args = ["run", "greet.kpc", "--name1", "Alice", "--name2", "Bob"];
  const fs = {
    readTextFile: () =>
      `(name1:, name2:) => ["Hello, ", name1, " and ", name2, "!"] | join`,
  };
  const result = main(args, fs);
  t.is(result, `"Hello, Alice and Bob!"`);
});

test("The run command specify modules to use", (t) => {
  const args = ["run", "--use", "greet.kpcm", "hello.kpc"];
  const textFiles = new Map([
    [
      "greet.kpcm",
      `greet = (name1:, name2:) => ["Hello, ", name1, " and ", name2, "!"] | join;`,
    ],
    ["hello.kpc", `greet/greet(name1: "Alice", name2: "Bob")`],
  ]);
  const fs = {
    readTextFile: (file) => textFiles.get(file),
  };
  const result = main(args, fs);
  t.is(result, `"Hello, Alice and Bob!"`);
});

test("The compile command produces a bytecode file", (t) => {
  const args = ["compile", "hello.kpc"];
  let fileWritten = false;
  const fs = {
    readTextFile: () => `"Hello, world!"`,
    writeBinaryFile: (file, content) => {
      t.is(file, "hello.kpb");
      fileWritten = true;
      t.assert(content instanceof ArrayBuffer);
    },
  };
  const result = main(args, fs);
  t.is(result, "Wrote bytecode to hello.kpb");
  t.true(fileWritten);
});

test("The compile and vm commands together produce the same result as the run command", (t) => {
  const compileArgs = ["compile", "hello.kpc"];
  const vmArgs = ["vm", "hello.kpb"];
  const files = new Map();
  const fs = {
    readTextFile: () => `"Hello, world!"`,
    readBinaryFile: (file) => files.get(file),
    writeBinaryFile: (file, content) => files.set(file, content),
  };
  const compileResult = main(compileArgs, fs);
  t.is(compileResult, "Wrote bytecode to hello.kpb");
  const vmResult = main(vmArgs, fs);
  t.is(vmResult, `"Hello, world!"`);
});

test("The compile command can bake dependencies into the binary", (t) => {
  const compileArgs = ["compile", "--use", "greet.kpcm", "hello.kpc"];
  const vmArgs = ["vm", "hello.kpb"];
  const textFiles = new Map([
    [
      "greet.kpcm",
      `greet = (name1:, name2:) => ["Hello, ", name1, " and ", name2, "!"] | join;`,
    ],
    ["hello.kpc", `greet/greet(name1: "Alice", name2: "Bob")`],
  ]);
  const binaryFiles = new Map();
  const fs = {
    readTextFile: (file) => textFiles.get(file),
    readBinaryFile: (file) => binaryFiles.get(file),
    writeBinaryFile: (file, content) => binaryFiles.set(file, content),
  };
  const compileResult = main(compileArgs, fs);
  t.is(compileResult, "Wrote bytecode to hello.kpb");
  const vmResult = main(vmArgs, fs);
  t.is(vmResult, `"Hello, Alice and Bob!"`);
});
