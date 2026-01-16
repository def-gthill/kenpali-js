import { loadBuiltins } from "./builtins.js";
import {
  ARG_NUMBER,
  ARG_U16,
  ARG_U32,
  ARG_U8,
  IS_BOOLEAN,
  IS_NULL,
  IS_NUMBER,
  IS_STRING,
  opInfo,
  WIDE,
} from "./instructions.js";
import { displaySimple } from "./values.js";

export function dumpBinary(
  program,
  { names = new Map(), modules = new Map() } = {}
) {
  const flatModules = new Map();
  for (const [moduleName, module] of modules) {
    for (const [name, value] of module) {
      flatModules.set(`${moduleName}/${name}`, value);
    }
  }
  const allNames = new Map([...loadBuiltins(), ...names, ...flatModules]);
  return new BinaryDumper(program, { names: allNames }).dump();
}

class BinaryDumper {
  constructor(program, { names }) {
    this.version = 2;
    this.program = program;
    this.out = {
      instructions: [],
      constants: [],
      platformValues: [],
      diagnostics: [],
      functions: [],
    };
    this.nameMap = new Map(
      extractPlatformNamesAndValues(names).map(([name, value]) => [value, name])
    );
  }

  dump() {
    this.dumpInstructions();
    this.dumpConstants();
    this.dumpPlatformValues();
    this.dumpDiagnostics();
    this.dumpFunctions();
    return this.makeBinary();
  }

  dumpInstructions() {
    let cursor = 0;
    let wide = false;
    while (cursor < this.program.instructions.length) {
      const instructionType = this.program.instructions[cursor];
      cursor += 1;
      if (!opInfo[instructionType]) {
        throw new Error(`Unknown instruction ${instructionType}`);
      }
      this.out.instructions.push(instructionType);
      if (instructionType === WIDE) {
        wide = true;
        continue;
      }
      const instructionInfo = opInfo[instructionType];
      if (wide) {
        for (const _ of instructionInfo.args) {
          for (let i = 0; i < 4; i++) {
            const arg = this.program.instructions[cursor];
            cursor += 1;
            this.out.instructions.push(arg);
          }
        }
        wide = false;
        continue;
      }
      for (const argInfo of instructionInfo.args) {
        switch (argInfo) {
          case ARG_NUMBER: {
            const arg = this.program.instructions[cursor];
            cursor += 1;
            this.out.instructions.push(arg);
            break;
          }
          case ARG_U8: {
            const arg = this.program.instructions[cursor];
            cursor += 1;
            this.out.instructions.push(arg);
            break;
          }
          case ARG_U16: {
            for (let i = 0; i < 2; i++) {
              const arg = this.program.instructions[cursor];
              cursor += 1;
              this.out.instructions.push(arg);
            }
            break;
          }
          case ARG_U32: {
            for (let i = 0; i < 4; i++) {
              const arg = this.program.instructions[cursor];
              cursor += 1;
              this.out.instructions.push(arg);
            }
            break;
          }
        }
      }
    }
  }

  dumpConstants() {
    this.out.constants = this.program.constants || [];
  }

  dumpPlatformValues() {
    for (const value of this.program.platformValues) {
      if (!this.nameMap.has(value)) {
        throw new Error(`Unknown platform value ${displaySimple(value)}`);
      }
      this.out.platformValues.push(this.nameMap.get(value));
    }
  }

  dumpDiagnostics() {
    for (let i = 0; i < this.program.diagnostics.length; i++) {
      if (this.program.diagnostics[i] !== undefined) {
        this.out.diagnostics.push([i, this.program.diagnostics[i]]);
      }
    }
  }

  dumpFunctions() {
    for (const { name, offset } of this.program.functions) {
      this.out.functions.push([offset, name]);
    }
  }

  getInstructionSectionLength() {
    let cursor = 0;
    let length = 0;
    let wide = false;
    while (cursor < this.out.instructions.length) {
      const instructionType = this.out.instructions[cursor];
      cursor += 1;
      length += 1;
      if (instructionType === WIDE) {
        wide = true;
        continue;
      }
      const instructionInfo = opInfo[instructionType];
      if (wide) {
        for (const _ of instructionInfo.args) {
          cursor += 4;
          length += 4;
        }
        wide = false;
        continue;
      }
      for (const argInfo of instructionInfo.args) {
        switch (argInfo) {
          case ARG_NUMBER:
            cursor += 1;
            length += 4;
            break;
          case ARG_U8:
            cursor += 1;
            length += 1;
            break;
          case ARG_U16:
            cursor += 2;
            length += 2;
            break;
          case ARG_U32:
            cursor += 4;
            length += 4;
            break;
        }
      }
    }
    return length;
  }

  makeBinary() {
    const constantBuffers = this.out.constants.map((constant) =>
      this.constantToBuffers(constant)
    );
    const platformValueBuffers = this.out.platformValues.map(
      (value) => new TextEncoder().encode(value).buffer
    );
    const diagnosticBuffers = this.out.diagnostics.map(
      ([index, diagnostic]) => {
        const serialized = JSON.stringify(diagnostic);
        const buffer = new TextEncoder().encode(serialized).buffer;
        return [index, buffer];
      }
    );
    const functionBuffers = this.out.functions.map(([offset, name]) => {
      const buffer = new TextEncoder().encode(name).buffer;
      return [offset, buffer];
    });

    const directoryLength =
      2 + // Version
      4 + // Instruction section start index
      4 + // Constant section start index
      4 + // Platform value section start index
      4 + // Diagnostic section start index
      4; // Function section start index
    const constantSectionLength =
      4 + // Number of constants
      4 * constantBuffers.length + // Start index of each constant
      constantBuffers.reduce(
        (acc, buffers) =>
          acc + buffers.reduce((acc, buffer) => acc + buffer.byteLength, 0),
        0
      ); // The constants themselves
    const platformValueSectionLength =
      4 + // Number of platform values
      4 * platformValueBuffers.length + // Start index of each platform value
      4 * platformValueBuffers.length + // Lengths of the platform values
      platformValueBuffers.reduce((acc, buffer) => acc + buffer.byteLength, 0); // The platform values themselves
    const diagnosticSectionLength =
      4 + // Number of diagnostics
      4 * diagnosticBuffers.length + // Start index of each diagnostic
      4 * diagnosticBuffers.length + // Instruction indices of the diagnostics
      4 * diagnosticBuffers.length + // Lengths of the diagnostics
      diagnosticBuffers.reduce(
        (acc, [_, buffer]) => acc + buffer.byteLength,
        0
      ); // The diagnostics themselves
    const functionSectionLength =
      4 + // Number of functions
      4 * functionBuffers.length + // Start index of each function
      4 * functionBuffers.length + // Function offsets
      4 * functionBuffers.length + // Lengths of the functions
      functionBuffers.reduce((acc, [_, buffer]) => acc + buffer.byteLength, 0); // The functions themselves
    const instructionSectionLength = this.getInstructionSectionLength();
    const bufferLength =
      directoryLength +
      constantSectionLength +
      platformValueSectionLength +
      diagnosticSectionLength +
      functionSectionLength +
      instructionSectionLength;
    const buffer = new ArrayBuffer(bufferLength);
    const view = new DataView(buffer);
    // Directory
    let offset = 0;
    view.setUint16(offset, this.version);
    offset += 2;
    view.setUint32(offset, bufferLength - instructionSectionLength);
    offset += 4;
    let directoryOffset = directoryLength;
    view.setUint32(offset, directoryOffset);
    offset += 4;
    directoryOffset += constantSectionLength;
    view.setUint32(offset, directoryOffset);
    offset += 4;
    directoryOffset += platformValueSectionLength;
    view.setUint32(offset, directoryOffset);
    offset += 4;
    directoryOffset += diagnosticSectionLength;
    view.setUint32(offset, directoryOffset);
    offset += 4;
    // Constant section
    view.setUint32(offset, constantBuffers.length);
    offset += 4;
    let constantOffset = offset + 4 * constantBuffers.length;
    for (let i = 0; i < constantBuffers.length; i++) {
      view.setUint32(offset, constantOffset);
      offset += 4;
      const buffers = constantBuffers[i];
      for (const buffer of buffers) {
        const constantView = new DataView(buffer);
        for (let j = 0; j < buffer.byteLength; j++) {
          view.setUint8(constantOffset + j, constantView.getUint8(j));
        }
        constantOffset += buffer.byteLength;
      }
    }
    offset = constantOffset;
    // Platform value section
    view.setUint32(offset, platformValueBuffers.length);
    offset += 4;
    let platformValueOffset = offset + 4 * platformValueBuffers.length;
    for (let i = 0; i < platformValueBuffers.length; i++) {
      view.setUint32(offset, platformValueOffset);
      offset += 4;
      const buffer = platformValueBuffers[i];
      view.setUint32(platformValueOffset, buffer.byteLength);
      platformValueOffset += 4;
      const platformValueView = new DataView(buffer);
      for (let j = 0; j < buffer.byteLength; j++) {
        view.setUint8(platformValueOffset + j, platformValueView.getUint8(j));
      }
      platformValueOffset += buffer.byteLength;
    }
    offset = platformValueOffset;
    // Diagnostic section
    view.setUint32(offset, diagnosticBuffers.length);
    offset += 4;
    let diagnosticOffset = offset + 4 * diagnosticBuffers.length;
    for (const [index, buffer] of diagnosticBuffers) {
      view.setUint32(offset, diagnosticOffset);
      offset += 4;
      view.setUint32(diagnosticOffset, index);
      diagnosticOffset += 4;
      view.setUint32(diagnosticOffset, buffer.byteLength);
      diagnosticOffset += 4;
      const diagnosticView = new DataView(buffer);
      for (let j = 0; j < buffer.byteLength; j++) {
        view.setUint8(diagnosticOffset + j, diagnosticView.getUint8(j));
      }
      diagnosticOffset += buffer.byteLength;
    }
    offset = diagnosticOffset;
    // Function section
    view.setUint32(offset, functionBuffers.length);
    offset += 4;
    let functionOffset = offset + 4 * functionBuffers.length;
    for (const [target, buffer] of functionBuffers) {
      view.setUint32(offset, functionOffset);
      offset += 4;
      view.setUint32(functionOffset, target);
      functionOffset += 4;
      view.setUint32(functionOffset, buffer.byteLength);
      functionOffset += 4;
      const functionView = new DataView(buffer);
      for (let j = 0; j < buffer.byteLength; j++) {
        view.setUint8(functionOffset + j, functionView.getUint8(j));
      }
      functionOffset += buffer.byteLength;
    }
    offset = functionOffset;
    // Instruction section
    let cursor = 0;
    let wide = false;
    while (cursor < this.out.instructions.length) {
      const instructionType = this.out.instructions[cursor];
      cursor += 1;
      view.setUint8(offset, instructionType);
      offset += 1;
      if (instructionType === WIDE) {
        wide = true;
        continue;
      }
      const instructionInfo = opInfo[instructionType];
      if (wide) {
        for (const _ of instructionInfo.args) {
          for (let i = 0; i < 4; i++) {
            const arg = this.out.instructions[cursor];
            cursor += 1;
            view.setUint8(offset + i, arg);
          }
          offset += 4;
        }
        wide = false;
        continue;
      }
      for (const argInfo of instructionInfo.args) {
        switch (argInfo) {
          case ARG_NUMBER: {
            const arg = this.out.instructions[cursor];
            cursor += 1;
            view.setUint32(offset, arg);
            offset += 4;
            break;
          }
          case ARG_U8: {
            const arg = this.out.instructions[cursor];
            cursor += 1;
            view.setUint8(offset, arg);
            offset += 1;
            break;
          }
          case ARG_U16: {
            for (let i = 0; i < 2; i++) {
              const arg = this.out.instructions[cursor];
              cursor += 1;
              view.setUint8(offset + i, arg);
            }
            offset += 2;
            break;
          }
          case ARG_U32: {
            for (let i = 0; i < 4; i++) {
              const arg = this.out.instructions[cursor];
              cursor += 1;
              view.setUint8(offset + i, arg);
            }
            offset += 4;
            break;
          }
        }
      }
    }
    return buffer;
  }

  constantToBuffers(constant) {
    if (constant === null) {
      return [this.typeCodeBuffer(IS_NULL)];
    } else if (typeof constant === "boolean") {
      const buffer = new ArrayBuffer(1);
      const view = new DataView(buffer);
      view.setUint8(0, constant ? 1 : 0);
      return [this.typeCodeBuffer(IS_BOOLEAN), buffer];
    } else if (typeof constant === "number") {
      const buffer = new ArrayBuffer(8);
      const view = new DataView(buffer);
      view.setFloat64(0, constant);
      return [this.typeCodeBuffer(IS_NUMBER), buffer];
    } else if (typeof constant === "string") {
      const lengthBuffer = new ArrayBuffer(4);
      const view = new DataView(lengthBuffer);
      view.setUint32(0, constant.length);
      return [
        this.typeCodeBuffer(IS_STRING),
        lengthBuffer,
        new TextEncoder().encode(constant).buffer,
      ];
    } else {
      throw new Error(
        `Value ${displaySimple(constant)} cannot be stored as a constant`
      );
    }
  }

  typeCodeBuffer(typeCode) {
    const buffer = new ArrayBuffer(1);
    const view = new DataView(buffer);
    view.setUint8(0, typeCode);
    return buffer;
  }
}

export function loadBinary(
  binary,
  { names = new Map(), modules = new Map() } = {}
) {
  const flatModules = new Map();
  for (const [moduleName, module] of modules) {
    for (const [name, value] of module) {
      flatModules.set(`${moduleName}/${name}`, value);
    }
  }
  const allNames = new Map([...loadBuiltins(), ...names, ...flatModules]);
  const view = new DataView(binary);
  const version = view.getUint16(0);
  if (version === 2) {
    return new BinaryLoaderV2(binary, { names: allNames }).load();
  } else {
    throw new Error(`Binary version ${version} not supported`);
  }
}

class BinaryLoaderV2 {
  constructor(binary, { names }) {
    this.binary = binary;
    this.view = new DataView(binary);
    this.names = new Map(extractPlatformNamesAndValues(names));
    this.instructions = [];
    this.constants = [];
    this.platformValues = [];
    this.diagnostics = [];
    this.functions = [];
  }

  load() {
    this.loadInstructions();
    this.loadConstants();
    this.loadPlatformValues();
    this.loadDiagnostics();
    this.loadFunctions();
    return {
      instructions: this.instructions,
      constants: this.constants,
      platformValues: this.platformValues,
      diagnostics: this.diagnostics,
      functions: this.functions,
    };
  }

  loadInstructions() {
    const instructionSectionStart = this.view.getUint32(2);
    let cursor = instructionSectionStart;
    let wide = false;
    while (cursor < this.binary.byteLength) {
      const type = this.view.getUint8(cursor);
      cursor += 1;
      if (!opInfo[type]) {
        throw new Error(`Unknown instruction type ${type}`);
      }
      this.instructions.push(type);
      if (type === WIDE) {
        wide = true;
        continue;
      }
      if (wide) {
        for (const _ of opInfo[type].args) {
          for (let i = 0; i < 4; i++) {
            const arg = this.view.getUint8(cursor);
            cursor += 1;
            this.instructions.push(arg);
          }
        }
        wide = false;
        continue;
      }
      for (const argInfo of opInfo[type].args) {
        switch (argInfo) {
          case ARG_NUMBER: {
            const arg = this.view.getUint32(cursor);
            cursor += 4;
            this.instructions.push(arg);
            break;
          }
          case ARG_U8: {
            const arg = this.view.getUint8(cursor);
            cursor += 1;
            this.instructions.push(arg);
            break;
          }
          case ARG_U16: {
            for (let i = 0; i < 2; i++) {
              const arg = this.view.getUint8(cursor);
              cursor += 1;
              this.instructions.push(arg);
            }
            break;
          }
          case ARG_U32: {
            for (let i = 0; i < 4; i++) {
              const arg = this.view.getUint8(cursor);
              cursor += 1;
              this.instructions.push(arg);
            }
            break;
          }
        }
      }
    }
  }

  loadConstants() {
    const constantSectionStart = this.view.getUint32(6);
    const numConstants = this.view.getUint32(constantSectionStart);
    for (let i = 0; i < numConstants; i++) {
      const constant = this.loadConstant(i);
      this.constants.push(constant);
    }
  }

  loadConstant(index) {
    const constantSectionStart = this.view.getUint32(6);
    const constantOffset = this.view.getUint32(
      constantSectionStart + 4 + 4 * index
    );
    const type = this.view.getUint8(constantOffset);
    switch (type) {
      case IS_NULL:
        return null;
      case IS_BOOLEAN:
        return this.view.getUint8(constantOffset + 1) === 1;
      case IS_NUMBER:
        return this.view.getFloat64(constantOffset + 1);
      case IS_STRING:
        const length = this.view.getUint32(constantOffset + 1);
        return new TextDecoder().decode(
          this.binary.slice(constantOffset + 5, constantOffset + 5 + length)
        );
      default:
        throw new Error(`Unknown constant type ${type}`);
    }
  }

  loadPlatformValues() {
    const platformValueSectionStart = this.view.getUint32(10);
    const numPlatformValues = this.view.getUint32(platformValueSectionStart);
    for (let i = 0; i < numPlatformValues; i++) {
      const index = this.view.getUint32(platformValueSectionStart + 4 + 4 * i);
      const length = this.view.getUint32(index);
      const buffer = this.binary.slice(index + 4, index + 4 + length);
      const platformValue = new TextDecoder().decode(buffer);
      this.platformValues.push(this.names.get(platformValue));
    }
  }

  loadDiagnostics() {
    const diagnosticSectionStart = this.view.getUint32(14);
    const numDiagnostics = this.view.getUint32(diagnosticSectionStart);
    for (let i = 0; i < numDiagnostics; i++) {
      const index = this.view.getUint32(diagnosticSectionStart + 4 + 4 * i);
      const instructionIndex = this.view.getUint32(index);
      const length = this.view.getUint32(index + 4);
      const buffer = this.binary.slice(index + 8, index + 8 + length);
      const diagnostic = JSON.parse(new TextDecoder().decode(buffer));
      this.diagnostics[instructionIndex] = diagnostic;
    }
  }

  loadFunctions() {
    const functionSectionStart = this.view.getUint32(18);
    const numFunctions = this.view.getUint32(functionSectionStart);
    for (let i = 0; i < numFunctions; i++) {
      const index = this.view.getUint32(functionSectionStart + 4 + 4 * i);
      const target = this.view.getUint32(index);
      const length = this.view.getUint32(index + 4);
      const buffer = this.binary.slice(index + 8, index + 8 + length);
      const functionName = new TextDecoder().decode(buffer);
      this.functions.push({ name: functionName, offset: target });
    }
  }
}

function extractPlatformNamesAndValues(names) {
  const result = [];
  for (const [name, value] of names) {
    result.push([name, value.type === "value" ? value.value : value]);
    if (value.methods) {
      for (const method of value.methods) {
        result.push([`${name}/${method.methodName}`, method]);
      }
    }
  }
  return result;
}

export function toBase64(binary) {
  const array = new Uint8Array(binary);
  const chars = [];
  for (let i = 0; i < array.length; i++) {
    chars.push(String.fromCharCode(array[i]));
  }
  return btoa(chars.join(""));
}

export function fromBase64(base64) {
  return Uint8Array.from(
    atob(base64)
      .split("")
      .map((c) => c.charCodeAt(0))
  ).buffer;
}
