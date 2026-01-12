// Programmatic interface for the Kenpali CLI.

import path from "node:path";
import { dumpBinary, loadBinary, toBase64 } from "./binary.js";
import { disassemble } from "./instructions.js";
import { display, kpcall } from "./interop.js";
import kpcompile, { kpcompileModule } from "./kpcompile.js";
import kpeval from "./kpeval.js";
import kpparse, { kpparseModule } from "./kpparse.js";
import kpvm from "./kpvm.js";

const usage = "Usage: kp <command> [options...] <file> [arguments...]";

const compileCommand = {
  name: "compile",
  description: "Compiles Kenpali code to bytecode.",
  options: [
    { type: "flag", short: "-t", long: "--trace" },
    { type: "flag", short: "-m", long: "--module" },
    { type: "flag", short: "-j", long: "--javascript" },
    { type: "multi", short: "-u", long: "--use" },
  ],
  documentation: [
    "The output file is named the same as the input file, but with the approprate extension.",
    "Passing the -m/--module flag causes the file to be compiled as a module instead of a program. " +
      "The resulting binary can only be run by passing the -m/--module flag to the vm command.",
    "Passing the -j/--javascript flag causes the output binary to be embedded into a JavaScript " +
      "module that can be included in a package.",
    "Modules to be included in the binary can be specified with -u/--use; each -u/--use argument " +
      "specifies a module to include, and must be the name of a file containing a Kenpali module.",
  ],
};

const vmCommand = {
  name: "vm",
  description: "Runs Kenpali bytecode.",
  options: [
    { type: "flag", short: "-t", long: "--trace" },
    { type: "flag", short: "-m", long: "--module" },
  ],
  documentation: [
    "If there are no arguments after the file name, the contents of the file " +
      "are evaluated as an expression and the result is printed.",
    "Otherwise, the result is treated as a function, and any arguments " +
      "after the file name are passed to the function. The value returned by " +
      "the function is printed.",
    "Passing the -m/--module flag causes the file's contents to be treated as " +
      "a module instead. In this case, the first argument after the file name is " +
      "looked up in the module. Then the above behaviour is applied to any remaining " +
      "arguments.",
  ],
};

const runCommand = {
  name: "run",
  description: "Compiles and runs Kenpali code.",
  options: [
    { type: "flag", short: "-t", long: "--trace" },
    { type: "flag", short: "-m", long: "--module" },
    { type: "multi", short: "-u", long: "--use" },
  ],
  documentation: [
    ...vmCommand.documentation,
    "Modules can be made available by passing in module filenames with -u/--use.",
  ],
};

const disCommand = {
  name: "dis",
  description: "Disassembles Kenpali bytecode to human-readable assembly.",
  options: [],
  documentation: ["The output is printed to the console."],
};

const commands = [compileCommand, vmCommand, runCommand, disCommand];

export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}

export function main(args, fs) {
  const command = args[0];
  if (!command || command === "--help") {
    return makeHelp();
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
      throw new UsageError(
        [`Unknown command: ${command}`, makeHelp()].join("\n\n")
      );
  }
}

function compile(args, fs) {
  if (args.length === 1 || args[1] === "--help") {
    return makeCommandHelp(compileCommand);
  }
  const [settings, settingsEnd] = parseSettings(1, args, compileCommand);
  let i = settingsEnd;
  const fileName = args[i++];
  if (!fileName) {
    throw new UsageError(makeUsageHelp(compileCommand));
  }
  const outFileName =
    fileName.replace(
      path.extname(fileName),
      settings.module ? ".kpbm" : ".kpb"
    ) + (settings.javascript ? ".js" : "");
  const code = fs.readTextFile(fileName);
  const modules = loadModules(fs, settings.use);
  const program = settings.module
    ? kpcompileModule(kpparseModule(code), { modules, trace: settings.trace })
    : kpcompile(kpparse(code), { modules, trace: settings.trace });
  const binary = dumpBinary(program);
  if (settings.javascript) {
    fs.writeTextFile(
      outFileName,
      `export const kpBytecode = "${toBase64(binary)}"`
    );
  } else {
    fs.writeBinaryFile(outFileName, binary);
  }
  return `Wrote bytecode to ${outFileName}`;
}

function vm(args, fs) {
  if (args.length === 1 || args[1] === "--help") {
    return makeCommandHelp(vmCommand);
  }
  const [settings, settingsEnd] = parseSettings(1, args, vmCommand);
  let i = settingsEnd;
  const fileName = args[i++];
  if (!fileName) {
    throw new UsageError(makeUsageHelp(vmCommand));
  }
  const binary = fs.readBinaryFile(fileName);
  const program = loadBinary(binary);
  let result;
  if (settings.module) {
    const name = args[i++];
    if (!name) {
      throw new UsageError(makeUsageHelp(vmCommand));
    }
    result = kpvm(program, { entrypoint: `$${name}`, trace: settings.trace });
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

function run(args, fs) {
  if (args.length === 1 || args[1] === "--help") {
    return makeCommandHelp(runCommand);
  }
  const [settings, settingsEnd] = parseSettings(1, args, runCommand);
  let i = settingsEnd;
  const fileName = args[i++];
  if (!fileName) {
    throw new UsageError(makeUsageHelp(runCommand));
  }
  const code = fs.readTextFile(fileName);
  const modules = loadModules(fs, settings.use);
  let result;
  if (settings.module) {
    const name = args[i++];
    if (!name) {
      throw new UsageError(makeUsageHelp(runCommand));
    }
    const module = kpparseModule(code);
    const definition = module.find(([n]) => n === name);
    if (!definition) {
      throw new UsageError(`Name "${name}" not found in module "${fileName}"`);
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

function dis(args, fs) {
  const fileName = args[1];
  if (!fileName || fileName === "--help") {
    return makeUsageHelp(disCommand);
  }
  const binary = fs.readBinaryFile(fileName);
  const program = loadBinary(binary);
  return disassemble(program);
}

function parseSettings(startIndex, args, command) {
  const settingSpec = command.options;
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
      throw new Error(
        [`Unknown setting: ${args[i]}`, makeUsageHelp(command)].join("\n\n")
      );
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

function makeHelp() {
  return [
    usage,
    "",
    "Commands:",
    commands
      .map((command) => `- ${command.name}: ${command.description}`)
      .join("\n"),
  ].join("\n");
}

function makeCommandHelp(command) {
  return [
    makeUsageHelp(command),
    command.documentation.map(linewrap).join("\n\n"),
  ].join("\n\n");
}

function makeUsageHelp(command) {
  if (command.options.length === 0) {
    return `Usage: kp ${command.name} <file> [arguments...]`;
  } else {
    return `Usage: kp ${command.name} ${makeOptionHelp(command.options)} <file> [arguments...]`;
  }
}

function makeOptionHelp(options) {
  return options
    .map((option) => {
      switch (option.type) {
        case "flag":
          return `[${option.short}|${option.long}]`;
        case "value":
          return `[${option.short}|${option.long} <value>]`;
        case "multi":
          return `[${option.short}|${option.long} <value>...]`;
        default:
          throw new Error(`Unknown option type: ${option.type}`);
      }
    })
    .join(" ");
}

function linewrap(text) {
  const lines = [];
  let currentLine = "";
  for (const word of text.split(" ")) {
    if (currentLine.length + word.length > 80) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      if (currentLine.length > 0) {
        currentLine += " ";
      }
      currentLine += word;
    }
  }
  lines.push(currentLine);
  return lines.join("\n");
}
