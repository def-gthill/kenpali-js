import { toString } from "./values.js";

export const VALUE = 1;
export const DISCARD = 10;
export const LOCAL_SLOTS = 8;
export const WRITE_LOCAL = 7;
export const READ_LOCAL = 2;
export const PUSH = 3;
export const POP = 5;
export const READ_OUTER_LOCAL = 4;
export const ARRAY_PUSH = 6;
export const ARRAY_EXTEND = 11;
export const ARRAY_POP = 9;
export const ARRAY_POP_OR_DEFAULT = 19;
export const ARRAY_CUT = 12;
export const OBJECT_PUSH = 13;
export const OBJECT_MERGE = 14;
export const OBJECT_POP = 15;
export const FUNCTION = 16;
export const CALL = 17;
export const RETURN = 18;

export function disassemble(program) {
  return new Disassembler(program).disassemble();
}

class Disassembler {
  constructor({ instructions, diagnostics }) {
    this.instructions = instructions;
    this.diagnostics = diagnostics;
    this.cursor = 0;

    this.instructionTable = [];
    this.instructionTable[VALUE] = this.disassembleValue;
    this.instructionTable[DISCARD] = this.disassembleDiscard;
    this.instructionTable[LOCAL_SLOTS] = this.disassembleLocalSlots;
    this.instructionTable[WRITE_LOCAL] = this.disassembleWriteLocal;
    this.instructionTable[READ_LOCAL] = this.disassembleReadLocal;
    this.instructionTable[PUSH] = this.disassemblePush;
    this.instructionTable[POP] = this.disassemblePop;
    this.instructionTable[READ_OUTER_LOCAL] = this.disassembleReadOuterLocal;
    this.instructionTable[ARRAY_PUSH] = this.disassembleArrayPush;
    this.instructionTable[ARRAY_EXTEND] = this.disassembleArrayExtend;
    this.instructionTable[ARRAY_POP] = this.disassembleArrayPop;
    this.instructionTable[ARRAY_POP_OR_DEFAULT] =
      this.disassembleArrayPopOrDefault;
    this.instructionTable[ARRAY_CUT] = this.disassembleArrayCut;
    this.instructionTable[OBJECT_PUSH] = this.disassembleObjectPush;
    this.instructionTable[OBJECT_MERGE] = this.disassembleObjectMerge;
    this.instructionTable[OBJECT_POP] = this.disassembleObjectPop;
    this.instructionTable[FUNCTION] = this.disassembleFunction;
    this.instructionTable[CALL] = this.disassembleCall;
    this.instructionTable[RETURN] = this.disassembleReturn;

    for (let i = 0; i < this.instructionTable.length; i++) {
      if (this.instructionTable[i]) {
        this.instructionTable[i] = this.instructionTable[i].bind(this);
      }
    }
  }

  disassemble() {
    const instructionStrings = [];
    while (this.cursor < this.instructions.length) {
      let instructionString = this.disassembleInstruction();
      const diagnostic = this.getDiagnostic();
      if (diagnostic) {
        instructionString = `${instructionString} ${JSON.stringify(
          diagnostic
        )}`;
      }
      instructionStrings.push(instructionString);
    }
    return instructionStrings.join("\n");
  }

  disassembleInstruction() {
    const instructionType = this.next();
    return this.instructionTable[instructionType]();
  }

  disassembleValue() {
    return `VALUE ${toString(this.next())}`;
  }

  disassembleDiscard() {
    return "DISCARD";
  }

  disassembleLocalSlots() {
    return `LOCAL_SLOTS ${this.next()}`;
  }

  disassembleWriteLocal() {
    return `WRITE_LOCAL ${this.next()}`;
  }

  disassembleReadLocal() {
    return `READ_LOCAL ${this.next()}`;
  }

  disassemblePush() {
    return "PUSH";
  }

  disassemblePop() {
    return "POP";
  }

  disassembleReadOuterLocal() {
    return `READ_OUTER_LOCAL ${this.next()} ${this.next()}`;
  }

  disassembleArrayPush() {
    return "ARRAY_PUSH";
  }

  disassembleArrayExtend() {
    return "ARRAY_EXTEND";
  }

  disassembleArrayPop() {
    return "ARRAY_POP";
  }

  disassembleArrayPopOrDefault() {
    return "ARRAY_POP_OR_DEFAULT";
  }

  disassembleArrayCut() {
    return `ARRAY_CUT ${this.next()}`;
  }

  disassembleObjectPush() {
    return "OBJECT_PUSH";
  }

  disassembleObjectMerge() {
    return "OBJECT_MERGE";
  }

  disassembleObjectPop() {
    return "OBJECT_POP";
  }

  disassembleFunction() {
    return `FUNCTION ${this.next()}`;
  }

  disassembleCall() {
    return "CALL";
  }

  disassembleReturn() {
    return "RETURN";
  }

  next() {
    const value = this.instructions[this.cursor];
    this.cursor += 1;
    return value;
  }

  getDiagnostic() {
    return this.diagnostics[this.cursor - 1];
  }
}
