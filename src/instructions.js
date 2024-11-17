import { toString } from "./values.js";

export const VALUE = 1;
export const DISCARD = 10;
export const RESERVE = 8;
export const WRITE_LOCAL = 7;
export const READ_LOCAL = 2;
export const PUSH = 3;
export const POP = 5;
export const EMPTY_ARRAY = 24;
export const ARRAY_PUSH = 6;
export const ARRAY_EXTEND = 11;
export const ARRAY_POP = 9;
export const ARRAY_POP_OR_DEFAULT = 19;
export const ARRAY_CUT = 12;
export const EMPTY_OBJECT = 25;
export const OBJECT_PUSH = 13;
export const OBJECT_MERGE = 14;
export const OBJECT_POP = 15;
export const FUNCTION = 16;
export const CLOSURE = 21;
export const CALL = 17;
export const CAPTURE = 22;
export const READ_UPVALUE = 20;
export const RETURN = 18;
export const CATCH = 23;

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
    this.instructionTable[RESERVE] = this.disassembleReserve;
    this.instructionTable[WRITE_LOCAL] = this.disassembleWriteLocal;
    this.instructionTable[READ_LOCAL] = this.disassembleReadLocal;
    this.instructionTable[PUSH] = this.disassemblePush;
    this.instructionTable[POP] = this.disassemblePop;
    this.instructionTable[EMPTY_ARRAY] = this.disassembleEmptyArray;
    this.instructionTable[ARRAY_PUSH] = this.disassembleArrayPush;
    this.instructionTable[ARRAY_EXTEND] = this.disassembleArrayExtend;
    this.instructionTable[ARRAY_POP] = this.disassembleArrayPop;
    this.instructionTable[ARRAY_POP_OR_DEFAULT] =
      this.disassembleArrayPopOrDefault;
    this.instructionTable[ARRAY_CUT] = this.disassembleArrayCut;
    this.instructionTable[EMPTY_OBJECT] = this.disassembleEmptyObject;
    this.instructionTable[OBJECT_PUSH] = this.disassembleObjectPush;
    this.instructionTable[OBJECT_MERGE] = this.disassembleObjectMerge;
    this.instructionTable[OBJECT_POP] = this.disassembleObjectPop;
    this.instructionTable[FUNCTION] = this.disassembleFunction;
    this.instructionTable[CLOSURE] = this.disassembleClosure;
    this.instructionTable[CALL] = this.disassembleCall;
    this.instructionTable[CAPTURE] = this.disassembleCapture;
    this.instructionTable[READ_UPVALUE] = this.disassembleReadUpvalue;
    this.instructionTable[RETURN] = this.disassembleReturn;
    this.instructionTable[CATCH] = this.disassembleCatch;

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

  disassembleReserve() {
    return `RESERVE ${this.next()}`;
  }

  disassembleWriteLocal() {
    return `WRITE_LOCAL ${this.next()}`;
  }

  disassembleReadLocal() {
    return `READ_LOCAL ${this.next()} ${this.next()}`;
  }

  disassemblePush() {
    return `PUSH ${this.next()}`;
  }

  disassemblePop() {
    return "POP";
  }

  disassembleEmptyArray() {
    return "EMPTY_ARRAY";
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

  disassembleEmptyObject() {
    return "EMPTY_OBJECT";
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

  disassembleClosure() {
    return `CLOSURE ${this.next()} ${this.next()}`;
  }

  disassembleCall() {
    return "CALL";
  }

  disassembleCapture() {
    return "CAPTURE";
  }

  disassembleReadUpvalue() {
    return `READ_UPVALUE ${this.next()}`;
  }

  disassembleReturn() {
    return "RETURN";
  }

  disassembleCatch() {
    return `CATCH ${this.next()}`;
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
