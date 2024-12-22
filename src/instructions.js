import { toKpobject } from "./kpobject.js";
import { toString } from "./values.js";

export const VALUE = 1;
export const ALIAS = 43;
export const DISCARD = 10;
export const RESERVE = 8;
export const WRITE_LOCAL = 7;
export const READ_LOCAL = 2;
export const PUSH = 3;
export const POP = 5;
export const EMPTY_ARRAY = 24;
export const ARRAY_PUSH = 6;
export const ARRAY_EXTEND = 11;
export const ARRAY_REVERSE = 27;
export const ARRAY_POP = 9;
export const ARRAY_POP_OR_DEFAULT = 19;
export const ARRAY_CUT = 12;
export const ARRAY_COPY = 28;
export const ARRAY_IS_EMPTY = 47;
export const EMPTY_OBJECT = 25;
export const OBJECT_PUSH = 13;
export const OBJECT_MERGE = 14;
export const OBJECT_POP = 15;
export const OBJECT_POP_OR_DEFAULT = 26;
export const OBJECT_COPY = 29;
export const JUMP = 44;
export const JUMP_IF_TRUE = 45;
export const JUMP_IF_FALSE = 46;
export const FUNCTION = 16;
export const CLOSURE = 21;
export const CALL = 17;
export const CAPTURE = 22;
export const READ_UPVALUE = 20;
export const RETURN = 18;
export const CALL_BUILTIN = 41;
export const INDEX = 30;
export const THROW = 49;
export const CATCH = 23;
export const UNCATCH = 50;
export const IS_NULL = 48;
export const IS_BOOLEAN = 31;
export const IS_NUMBER = 32;
export const IS_STRING = 33;
export const IS_ARRAY = 34;
export const IS_OBJECT = 35;
export const IS_BUILTIN = 36;
export const IS_GIVEN = 37;
export const IS_ERROR = 38;
export const IS_FUNCTION = 39;
export const IS_SEQUENCE = 40;
export const ERROR_IF_INVALID = 42;

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
    this.instructionTable[ALIAS] = this.disassembleAlias;
    this.instructionTable[DISCARD] = this.disassembleDiscard;
    this.instructionTable[RESERVE] = this.disassembleReserve;
    this.instructionTable[WRITE_LOCAL] = this.disassembleWriteLocal;
    this.instructionTable[READ_LOCAL] = this.disassembleReadLocal;
    this.instructionTable[PUSH] = this.disassemblePush;
    this.instructionTable[POP] = this.disassemblePop;
    this.instructionTable[EMPTY_ARRAY] = this.disassembleEmptyArray;
    this.instructionTable[ARRAY_PUSH] = this.disassembleArrayPush;
    this.instructionTable[ARRAY_EXTEND] = this.disassembleArrayExtend;
    this.instructionTable[ARRAY_REVERSE] = this.disassembleArrayReverse;
    this.instructionTable[ARRAY_POP] = this.disassembleArrayPop;
    this.instructionTable[ARRAY_POP_OR_DEFAULT] =
      this.disassembleArrayPopOrDefault;
    this.instructionTable[ARRAY_CUT] = this.disassembleArrayCut;
    this.instructionTable[ARRAY_COPY] = this.disassembleArrayCopy;
    this.instructionTable[ARRAY_IS_EMPTY] = this.disassembleArrayIsEmpty;
    this.instructionTable[EMPTY_OBJECT] = this.disassembleEmptyObject;
    this.instructionTable[OBJECT_PUSH] = this.disassembleObjectPush;
    this.instructionTable[OBJECT_MERGE] = this.disassembleObjectMerge;
    this.instructionTable[OBJECT_POP] = this.disassembleObjectPop;
    this.instructionTable[OBJECT_POP_OR_DEFAULT] =
      this.disassembleObjectPopOrDefault;
    this.instructionTable[OBJECT_COPY] = this.disassembleObjectCopy;
    this.instructionTable[JUMP] = this.disassembleJump;
    this.instructionTable[JUMP_IF_TRUE] = this.disassembleJumpIfTrue;
    this.instructionTable[JUMP_IF_FALSE] = this.disassembleJumpIfFalse;
    this.instructionTable[FUNCTION] = this.disassembleFunction;
    this.instructionTable[CLOSURE] = this.disassembleClosure;
    this.instructionTable[CALL] = this.disassembleCall;
    this.instructionTable[CAPTURE] = this.disassembleCapture;
    this.instructionTable[READ_UPVALUE] = this.disassembleReadUpvalue;
    this.instructionTable[RETURN] = this.disassembleReturn;
    this.instructionTable[CALL_BUILTIN] = this.disassembleCallBuiltin;
    this.instructionTable[INDEX] = this.disassembleIndex;
    this.instructionTable[THROW] = this.disassembleThrow;
    this.instructionTable[CATCH] = this.disassembleCatch;
    this.instructionTable[UNCATCH] = this.disassembleUncatch;
    this.instructionTable[IS_NULL] = this.disassembleIsNull;
    this.instructionTable[IS_BOOLEAN] = this.disassembleIsBoolean;
    this.instructionTable[IS_NUMBER] = this.disassembleIsNumber;
    this.instructionTable[IS_STRING] = this.disassembleIsString;
    this.instructionTable[IS_ARRAY] = this.disassembleIsArray;
    this.instructionTable[IS_OBJECT] = this.disassembleIsObject;
    this.instructionTable[IS_BUILTIN] = this.disassembleIsBuiltin;
    this.instructionTable[IS_GIVEN] = this.disassembleIsGiven;
    this.instructionTable[IS_ERROR] = this.disassembleIsError;
    this.instructionTable[IS_FUNCTION] = this.disassembleIsFunction;
    this.instructionTable[IS_SEQUENCE] = this.disassembleIsSequence;
    this.instructionTable[ERROR_IF_INVALID] = this.disassembleErrorIfInvalid;

    for (let i = 0; i < this.instructionTable.length; i++) {
      if (this.instructionTable[i]) {
        this.instructionTable[i] = this.instructionTable[i].bind(this);
      }
    }
  }

  disassemble() {
    const instructionStrings = [];
    while (this.cursor < this.instructions.length) {
      const instructionStart = this.cursor;
      let instructionString = this.disassembleInstruction();
      const diagnostic = this.getDiagnostic();
      if (diagnostic) {
        instructionString = `${instructionStart} ${instructionString} ${toString(
          toKpobject(diagnostic)
        )}`;
      } else {
        instructionString = `${instructionStart} ${instructionString}`;
      }
      instructionStrings.push(instructionString);
    }
    return instructionStrings.join("\n");
  }

  disassembleInstruction() {
    const instructionType = this.next();
    if (!this.instructionTable[instructionType]) {
      return `!! UNKNOWN INSTRUCTION ${instructionType}`;
    }
    return this.instructionTable[instructionType]();
  }

  disassembleValue() {
    return `VALUE ${toString(this.next())}`;
  }

  disassembleAlias() {
    return "ALIAS";
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

  disassembleArrayReverse() {
    return "ARRAY_REVERSE";
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

  disassembleArrayCopy() {
    return "ARRAY_COPY";
  }

  disassembleArrayIsEmpty() {
    return "ARRAY_IS_EMPTY";
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

  disassembleObjectPopOrDefault() {
    return "OBJECT_POP_OR_DEFAULT";
  }

  disassembleObjectCopy() {
    return "OBJECT_COPY";
  }

  disassembleJump() {
    return `JUMP ${this.next()}`;
  }

  disassembleJumpIfTrue() {
    return `JUMP_IF_TRUE ${this.next()}`;
  }

  disassembleJumpIfFalse() {
    return `JUMP_IF_FALSE ${this.next()}`;
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

  disassembleCallBuiltin() {
    return "CALL_BUILTIN";
  }

  disassembleIndex() {
    return "INDEX";
  }

  disassembleThrow() {
    return "THROW";
  }

  disassembleCatch() {
    return `CATCH ${this.next()}`;
  }

  disassembleUncatch() {
    return "UNCATCH";
  }

  disassembleIsNull() {
    return "IS_NULL";
  }

  disassembleIsBoolean() {
    return "IS_BOOLEAN";
  }

  disassembleIsNumber() {
    return "IS_NUMBER";
  }

  disassembleIsString() {
    return "IS_STRING";
  }

  disassembleIsArray() {
    return "IS_ARRAY";
  }

  disassembleIsObject() {
    return "IS_OBJECT";
  }

  disassembleIsBuiltin() {
    return "IS_BUILTIN";
  }

  disassembleIsGiven() {
    return "IS_GIVEN";
  }

  disassembleIsError() {
    return "IS_ERROR";
  }

  disassembleIsFunction() {
    return "IS_FUNCTION";
  }

  disassembleIsSequence() {
    return "IS_SEQUENCE";
  }

  disassembleErrorIfInvalid() {
    return "ERROR_IF_INVALID";
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
