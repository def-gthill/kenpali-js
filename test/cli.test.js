import test from "ava";
import { main } from "../src/cli.js";

const commands = ["compile", "vm", "run", "dis"];

test("Running with no arguments prints the help message", (t) => {
  const args = [];
  const fs = {};
  const result = main(args, fs);
  t.assert(result.includes("Usage"));
  t.assert(result.includes("Commands"));
});

test("Running with --help prints the help message", (t) => {
  const args = ["--help"];
  const fs = {};
  const result = main(args, fs);
  t.assert(result.includes("Usage"));
  t.assert(result.includes("Commands"));
});

test("Running with an unknown command prints the help message", (t) => {
  const args = ["unknown"];
  const fs = {};
  try {
    main(args, fs);
  } catch (error) {
    t.assert(error.message.includes("Unknown command"));
    t.assert(error.message.includes("Usage"));
    t.assert(error.message.includes("Commands"));
  }
});

for (const command of commands) {
  test(`Running the ${command} command without arguments prints the help message`, (t) => {
    const args = [command];
    const fs = {};
    const result = main(args, fs);
    t.assert(result.includes("Usage"));
    t.assert(result.includes(command));
  });

  test(`Running the ${command} command with --help prints the help message`, (t) => {
    const args = [command, "--help"];
    const fs = {};
    const result = main(args, fs);
    t.assert(result.includes("Usage"));
    t.assert(result.includes(command));
  });
}

test("The run command with no arguments after the filename evaluates an expression", (t) => {
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

test("The run command can pick a function out of a module", (t) => {
  const args = [
    "run",
    "-m",
    "greet.kpcm",
    "greet",
    "--name1",
    "Alice",
    "--name2",
    "Bob",
  ];
  const textFiles = new Map([
    [
      "greet.kpcm",
      `greet = (name1:, name2:) => ["Hello, ", name1, " and ", name2, "!"] | join;`,
    ],
  ]);
  const fs = {
    readTextFile: (file) => textFiles.get(file),
  };
  const result = main(args, fs);
  t.is(result, `"Hello, Alice and Bob!"`);
});

test("The run command can specify modules to use", (t) => {
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

test("The compile command can compile a module whose functions reference each other", (t) => {
  const args = ["compile", "-m", "greet.kpcm"];
  const textFiles = new Map([
    [
      "greet.kpcm",
      `hello = () => "Hello, world!"; ` +
        `goodbye = () => "Goodbye, world!"; ` +
        `greet = () => [hello(), goodbye()] | join(on: " ");`,
    ],
  ]);
  let fileWritten = false;
  const fs = {
    readTextFile: (file) => textFiles.get(file),
    writeBinaryFile: (file, content) => {
      t.is(file, "greet.kpbm");
      fileWritten = true;
      t.assert(content instanceof ArrayBuffer);
    },
  };
  const result = main(args, fs);
  t.is(result, "Wrote bytecode to greet.kpbm");
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

test("The compile and vm commands can process a module and then pick a function out of it", (t) => {
  const compileArgs = ["compile", "-m", "greet.kpcm"];
  const vmArgs = [
    "vm",
    "-m",
    "greet.kpbm",
    "greet",
    "--name1",
    "Alice",
    "--name2",
    "Bob",
  ];
  const textFiles = new Map([
    [
      "greet.kpcm",
      `distraction = (name1:, name2:) => [name1, " and ", name2, " are distracted!"] | join; ` +
        `greet = (name1:, name2:) => ["Hello, ", name1, " and ", name2, "!"] | join;`,
    ],
  ]);
  const binaryFiles = new Map();
  const fs = {
    readTextFile: (file) => textFiles.get(file),
    readBinaryFile: (file) => binaryFiles.get(file),
    writeBinaryFile: (file, content) => binaryFiles.set(file, content),
  };
  const compileResult = main(compileArgs, fs);
  t.is(compileResult, "Wrote bytecode to greet.kpbm");
  const vmResult = main(vmArgs, fs);
  t.is(vmResult, `"Hello, Alice and Bob!"`);
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
