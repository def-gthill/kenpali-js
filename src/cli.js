// Programmatic interface for the Kenpali CLI.

import path from "node:path";
import { dumpBinary, loadBinary, toBase64 } from "./binary.js";
import { disassemble } from "./instructions.js";
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
      return dis(args, fs);
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

function compile(args, fs) {
  const [settings, settingsEnd] = parseSettings(1, args, [
    { type: "flag", short: "-t", long: "--trace" },
    { type: "flag", short: "-j", long: "--javascript" },
    { type: "multi", short: "-u", long: "--use" },
  ]);
  let i = settingsEnd;
  const fileName = args[i++];
  if (!fileName) {
    throw new Error("Usage: kp compile <file>");
  }
  const outFileName =
    fileName.replace(path.extname(fileName), ".kpb") +
    (settings.isJavaScript ? ".js" : "");
  const code = fs.readTextFile(fileName);
  const modules = loadModules(fs, settings.use);
  const program = kpcompile(kpparse(code), {
    modules,
    trace: settings.trace,
  });
  const binary = dumpBinary(program);
  if (settings.isJavaScript) {
    fs.writeTextFile(
      outFileName,
      `export const kpBytecode = "${toBase64(binary)}"`
    );
  } else {
    fs.writeBinaryFile(outFileName, binary);
  }
  return `Wrote bytecode to ${outFileName}`;
}

function run(args, fs) {
  const [settings, settingsEnd] = parseSettings(1, args, [
    { type: "flag", short: "-t", long: "--trace" },
    { type: "flag", short: "-m", long: "--module" },
    { type: "multi", short: "-u", long: "--use" },
  ]);
  let i = settingsEnd;
  const fileName = args[i++];
  if (!fileName) {
    throw new Error("Usage: kp run <file> [arguments...]");
  }
  const code = fs.readTextFile(fileName);
  const modules = loadModules(fs, settings.use);
  let result;
  if (settings.isModule) {
    const name = args[i++];
    if (!name) {
      throw new Error("Usage: kp run -m <file> <name> [arguments...]");
    }
    const module = kpparseModule(code);
    const definition = module.find(([n]) => n === name);
    if (!definition) {
      throw new Error(`Name "${name}" not found in module "${fileName}"`);
    }
    result = kpeval(definition[1], { modules });
  } else {
    result = kpeval(kpparse(code), { modules, trace: settings.trace });
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
  const [settings, settingsEnd] = parseSettings(1, args, [
    { type: "flag", short: "-t", long: "--trace" },
    { type: "flag", short: "-m", long: "--module" },
  ]);
  let i = settingsEnd;
  const fileName = args[i++];
  if (!fileName) {
    throw new Error("Usage: kp vm <file> [arguments...]");
  }
  const binary = fs.readBinaryFile(fileName);
  const program = loadBinary(binary);
  let result;
  if (settings.isModule) {
    throw new Error("Modules are not supported yet for the vm command");
  } else {
    result = kpvm(program, { trace: settings.trace });
  }
  const fArgs = args.slice(i);
  if (fArgs.length > 0) {
    const [posArgs, namedArgs] = parseFunctionArgs(fArgs);
    return display(kpcall(result, posArgs, namedArgs));
  } else {
    return display(result);
  }
}

function dis(args, fs) {
  const fileName = args[1];
  if (!fileName) {
    throw new Error("Usage: kp dis <file>");
  }
  const binary = fs.readBinaryFile(fileName);
  const program = loadBinary(binary);
  return disassemble(program);
}

function parseSettings(startIndex, args, settingSpec) {
  const settings = Object.fromEntries(
    settingSpec.map((spec) => [settingName(spec), settingDefault(spec)])
  );
  let i = startIndex;
  while (i < args.length && args[i].startsWith("-")) {
    const setting = settingSpec.find(
      ({ short, long }) => args[i] === short || args[i] === long
    );
    if (setting) {
      i = parseSetting(i, args, setting, settings);
    } else {
      throw new Error(`Unknown setting: ${args[i]}`);
    }
  }
  return [settings, i];
}

function settingName(settingSpec) {
  return settingSpec.long.slice(2);
}

function settingDefault(settingSpec) {
  switch (settingSpec.type) {
    case "flag":
      return false;
    case "value":
      return null;
    case "multi":
      return [];
    default:
      throw new Error(`Unknown setting type: ${settingSpec.type}`);
  }
}

function parseSetting(i, args, setting, settings) {
  switch (setting.type) {
    case "flag":
      settings[settingName(setting)] = true;
      return i + 1;
    case "value":
      settings[settingName(setting)] = args[i + 1];
      return i + 2;
    case "multi":
      settings[settingName(setting)].push(args[i + 1]);
      return i + 2;
    default:
      throw new Error(`Unknown setting type: ${setting.type}`);
  }
}

function loadModules(fs, use) {
  return new Map(
    use.map((module) => [
      module.split(".")[0],
      kpparseModule(fs.readTextFile(module)),
    ])
  );
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
