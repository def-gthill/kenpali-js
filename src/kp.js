// Command line interface for Kenpali.

import { Buffer } from "node:buffer";
import fs from "node:fs";
import { main } from "./cli.js";
import { display } from "./interop.js";
import { KenpaliError } from "./kperror.js";

const help = `
Usage: kp <command> <file> [arguments...]

Commands:
- compile: Compiles Kenpali code to bytecode.
- vm: Runs Kenpali bytecode.
- run: Compiles and runs Kenpali code.
- dis: Disassembles Kenpali bytecode to human-readable assembly.
`;

const compileHelp = [
  "Compiles Kenpali code to bytecode.",
  "Usage: kp compile [-t|--trace] [-j|--javascript] <file>",
  "The output file is named the same as the input file, but with the .kpb extension.",
  "Passing the -j/--javascript flag causes the output binary to be embedded into a JavaScript " +
    "module that can be included in a package.",
].join("\n\n");

const vmHelp = [
  "Runs Kenpali bytecode.",
  "Usage: kp vm [-t|--trace] [-m|--module] <file> [arguments...]",
  "If there are no arguments after the file name, the contents of the file " +
    "are evaluated as an expression and the result is printed.",
  "Otherwise, the result is treated as a function, and any arguments " +
    "after the file name are passed to the function. The value returned by " +
    "the function is printed.",
  "Passing the -m/--module flag causes the file's contents to be treated as " +
    "a module instead. In this case, the first argument after the file name is " +
    "looked up in the module. Then the above behaviour is applied to any remaining " +
    "arguments.",
].join("\n\n");

const runHelp = [
  "Compiles and runs Kenpali code.",
  "Usage: kp run [-t|--trace] [-m|--module] <file> [arguments...]",
  "The arguments after the file name are treated the same as for the vm command.",
].join("\n\n");

const disHelp = [
  "Disassembles Kenpali bytecode to human-readable assembly.",
  "Usage: kp dis <file>",
  "The output is printed to the console.",
].join("\n\n");

const commandHelps = {
  compile: compileHelp,
  vm: vmHelp,
  run: runHelp,
  dis: disHelp,
};

if (process.argv.length === 2 || process.argv[2] === "--help") {
  console.log(help);
} else if (process.argv.length === 3 || process.argv[3] === "--help") {
  if (!commandHelps[process.argv[2]]) {
    console.error(`Unknown command: ${process.argv[2]}`);
    process.exit(1);
  }
  console.log(commandHelps[process.argv[2]]);
} else {
  try {
    console.log(
      main(process.argv.slice(2), {
        readTextFile: (file) => fs.readFileSync(file, "utf8"),
        writeTextFile: (file, content) => fs.writeFileSync(file, content),
        readBinaryFile: (file) => fs.readFileSync(file).buffer,
        writeBinaryFile: (file, content) =>
          fs.writeFileSync(file, Buffer.from(content)),
      })
    );
  } catch (error) {
    if (error instanceof KenpaliError) {
      console.error(display(error.error));
    } else {
      throw error;
    }
    process.exit(1);
  }
}
