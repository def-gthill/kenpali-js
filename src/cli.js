// Programmatic interface for the Kenpali CLI.

import { display, kpcall } from "./interop.js";
import kpeval from "./kpeval.js";
import kpparse, { kpparseModule } from "./kpparse.js";

export function main(args, fs) {
  const command = args[0];
  if (!command) {
    throw new Error("Usage: kp <command> <file>");
  }
  switch (command) {
    case "compile":
      throw new Error("Not implemented");
      break;
    case "vm":
      throw new Error("Not implemented");
      break;
    case "run":
      return run(args, fs);
      break;
    case "dis":
      throw new Error("Not implemented");
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

function run(args, fs) {
  let i = 1;
  const isModule = args[i] === "-m" || args[i] === "--module";
  if (isModule) {
    i++;
  }
  const fileName = args[i++];
  if (!fileName) {
    throw new Error("Usage: kp run <file> [arguments...]");
  }
  const code = fs.readFileSync(fileName);
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
    result = kpeval(kpparse(code));
  }
  const fArgs = args.slice(i);
  if (fArgs.length > 0) {
    const [posArgs, namedArgs] = parseFunctionArgs(fArgs);
    return display(kpcall(result, posArgs, namedArgs));
  } else {
    return display(result);
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
