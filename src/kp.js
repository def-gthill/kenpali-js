// Command line interface for Kenpali.
// The first argument to each command is the name of the file to operate on.
//
// Commands:
// - compile: Compiles Kenpali code to bytecode.
// - vm: Runs Kenpali bytecode.
// - run: Compiles and runs Kenpali code.
// - dis: Disassembles Kenpali bytecode to human-readable assembly.
//
// ## The run command
//
// Compiles and runs Kenpali code.
// If there are no arguments after the file name, the contents of the file
// are evaluated as an expression and the result is printed.
// Otherwise, the result is treated as a function, and any arguments
// after the file name are passed to the function. The value returned by
// the function is printed.
// Passing the -m/--module flag causes the file's contents to be treated as
// a module instead. In this case, the first argument after the file name is
// looked up in the module. Then the above behaviour is applied to any remaining
// arguments.

import fs from "node:fs";
import { main } from "./cli.js";

try {
  console.log(main(process.argv.slice(2), fs));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
