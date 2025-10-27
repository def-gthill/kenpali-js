// Command line interface for Kenpali.
// The first argument to each command is the name of the file to operate on.
// Commands:
// - compile: Compiles Kenpali code to bytecode.
// - vm: Runs Kenpali bytecode.
// - run: Compiles and runs Kenpali code.
// - dis: Disassembles Kenpali bytecode to human-readable assembly.

import fs from "node:fs";
import { display, kpcall } from "./interop.js";
import kpeval from "./kpeval.js";
import kpparse, { kpparseModule } from "./kpparse.js";

const command = process.argv[2];
if (!command) {
  console.error("Usage: kp <command> <file>");
  process.exit(1);
}

function main() {
  switch (command) {
    case "compile":
      throw new Error("Not implemented");
      break;
    case "vm":
      throw new Error("Not implemented");
      break;
    case "run":
      run();
      break;
    case "dis":
      throw new Error("Not implemented");
      break;
    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

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
function run() {
  let i = 3;
  const isModule = process.argv[i] === "-m" || process.argv[i] === "--module";
  if (isModule) {
    i++;
  }
  const fileName = process.argv[i++];
  if (!fileName) {
    console.error("Usage: kp run <file> [arguments...]");
    process.exit(1);
  }
  const code = fs.readFileSync(fileName);
  let result;
  if (isModule) {
    const name = process.argv[i++];
    if (!name) {
      console.error("Usage: kp run -m <file> <name> [arguments...]");
      process.exit(1);
    }
    const module = kpparseModule(code);
    const definition = module.find(([n]) => n === name);
    if (!definition) {
      console.error(`Name "${name}" not found in module "${fileName}"`);
      process.exit(1);
    }
    result = kpeval(definition[1]);
  } else {
    result = kpeval(kpparse(code));
  }
  const args = process.argv.slice(i);
  if (args.length > 0) {
    const [posArgs, namedArgs] = parseFunctionArgs(args);
    console.log(display(kpcall(result, posArgs, namedArgs)));
  } else {
    console.log(display(result));
  }
}

function parseFunctionArgs(args) {
  const posArgs = [];
  const namedArgs = [];
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const name = args[i].slice(2);
      if (i + 1 >= args.length) {
        console.error(`Missing value for named argument "${name}"`);
        process.exit(1);
      }
      namedArgs.push([name, args[i + 1]]);
      i += 2;
    } else {
      posArgs.push(arg);
      i++;
    }
  }
  return [posArgs, Object.fromEntries(namedArgs)];
}

main();
