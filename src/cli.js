// Programmatic interface for the Kenpali CLI.

import path from "node:path";
import { dumpBinary, loadBinary } from "./binary.js";
import { display, kpcall } from "./interop.js";
import kpcompile from "./kpcompile.js";
import kpeval from "./kpeval.js";
import kpparse, { kpparseModule } from "./kpparse.js";
import kpvm from "./kpvm.js";

export function main(args, fs) {
  const command = args[0];
  if (!command) {
    throw new Error("Usage: kp <command> <file>");
  }
  switch (command) {
    case "compile":
      return compile(args, fs);
    case "vm":
      return vm(args, fs);
    case "run":
      return run(args, fs);
    case "dis":
      throw new Error("Not implemented");
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

function compile(args, fs) {
  const [flags, flagEnd] = parseFlags(1, args, [["-t", "--trace"]]);
  const trace = flags.includes("-t");
  let i = flagEnd;
  const fileName = args[i++];
  if (!fileName) {
    throw new Error("Usage: kp compile <file>");
  }
  const outFileName = fileName.replace(path.extname(fileName), ".kpb");
  const code = fs.readTextFile(fileName);
  const program = kpcompile(kpparse(code), { trace });
  const binary = dumpBinary(program);
  fs.writeBinaryFile(outFileName, binary);
  return `Wrote bytecode to ${outFileName}`;
}

function run(args, fs) {
  const [flags, flagEnd] = parseFlags(1, args, [
    ["-t", "--trace"],
    ["-m", "--module"],
  ]);
  const trace = flags.includes("-t");
  const isModule = flags.includes("-m");
  let i = flagEnd;
  const fileName = args[i++];
  if (!fileName) {
    throw new Error("Usage: kp run <file> [arguments...]");
  }
  const code = fs.readTextFile(fileName);
  let result;
  if (isModule) {
    const name = args[i++];
    if (!name) {
      throw new Error("Usage: kp run -m <file> <name> [arguments...]");
    }
    const module = kpparseModule(code);
    const definition = module.find(([n]) => n === name);
    if (!definition) {
      throw new Error(`Name "${name}" not found in module "${fileName}"`);
    }
    result = kpeval(definition[1]);
  } else {
    result = kpeval(kpparse(code), { trace });
  }
  const fArgs = args.slice(i);
  if (fArgs.length > 0) {
    const [posArgs, namedArgs] = parseFunctionArgs(fArgs);
    return display(kpcall(result, posArgs, namedArgs));
  } else {
    return display(result);
  }
}

function vm(args, fs) {
  const [flags, flagEnd] = parseFlags(1, args, [
    ["-t", "--trace"],
    ["-m", "--module"],
  ]);
  const trace = flags.includes("-t");
  const isModule = flags.includes("-m");
  let i = flagEnd;
  const fileName = args[i++];
  if (!fileName) {
    throw new Error("Usage: kp vm <file> [arguments...]");
  }
  const binary = fs.readBinaryFile(fileName);
  const program = loadBinary(binary);
  let result;
  if (isModule) {
    throw new Error("Modules are not supported yet for the vm command");
  } else {
    result = kpvm(program, { trace });
  }
  const fArgs = args.slice(i);
  if (fArgs.length > 0) {
    const [posArgs, namedArgs] = parseFunctionArgs(fArgs);
    return display(kpcall(result, posArgs, namedArgs));
  } else {
    return display(result);
  }
}

function parseFlags(startIndex, args, allowedFlags) {
  const flags = [];
  let i = startIndex;
  while (i < args.length && args[i].startsWith("-")) {
    const flag = allowedFlags.find(
      ([short, long]) => args[i] === short || args[i] === long
    );
    if (flag) {
      flags.push(flag[0]);
      i++;
    } else {
      throw new Error(`Unknown flag: ${args[i]}`);
    }
  }
  return [flags, i];
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
        throw new Error(`Missing value for named argument "${name}"`);
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
