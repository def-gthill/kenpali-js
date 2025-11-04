import { toKpobject } from "./kpobject.js";
import { displaySimple } from "./values.js";

// ----------------------------
// -- BASIC STACK OPERATIONS --
// ----------------------------

// Push the specified value onto the stack.
export const VALUE = 0x01;
// Create an alias of the top of the stack, and push it onto the stack.
export const ALIAS = 0x02;
// Pop the top of the stack and throw it away.
export const DISCARD = 0x03;
// Reserve the specified number of empty slots at the top of the stack.
export const RESERVE = 0x04;
// Write the value at the top of the stack to the local variable at the specified index.
export const WRITE_LOCAL = 0x05;
// Read the value from the local variable at the specified index and push it onto the stack.
export const READ_LOCAL = 0x06;
// Push a new scope frame onto the scope stack.
export const PUSH_SCOPE = 0x07;
// Pop the top scope frame from the scope stack.
export const POP_SCOPE = 0x08;
// Read the value from the specified number of steps down the stack, and push it onto the stack.
// READ_RELATIVE 0 is the same as ALIAS.
export const READ_RELATIVE = 0x09;

// ----------------------------
// -- ARRAY OPERATIONS --------
// ----------------------------

// Create an empty array and push it onto the stack.
export const EMPTY_ARRAY = 0x10;
export const ARRAY_PUSH = 0x11;
export const ARRAY_EXTEND = 0x12;
export const ARRAY_REVERSE = 0x13;
export const ARRAY_POP = 0x14;
export const ARRAY_POP_OR_DEFAULT = 0x15;
export const ARRAY_CUT = 0x16;
// Replace the array at the top of the stack with a copy of it, breaking any alias relationships.
export const ARRAY_COPY = 0x17;
export const ARRAY_IS_EMPTY = 0x18;

// ----------------------------
// -- OBJECT OPERATIONS -------
// ----------------------------

export const EMPTY_OBJECT = 0x20;
export const OBJECT_PUSH = 0x21;
export const OBJECT_MERGE = 0x22;
export const OBJECT_POP = 0x23;
export const OBJECT_POP_OR_DEFAULT = 0x24;
export const OBJECT_COPY = 0x25;
export const OBJECT_KEYS = 0x26;
export const OBJECT_VALUES = 0x27;
export const OBJECT_HAS = 0x28;

// ----------------------------
// -- JUMPS -------------------
// ----------------------------

export const JUMP = 0x30;
export const JUMP_IF_TRUE = 0x31;
export const JUMP_IF_FALSE = 0x32;

// ----------------------------
// -- FUNCTIONS ---------------
// ----------------------------

export const BEGIN = 0x40;
export const FUNCTION = 0x41;
export const CLOSURE = 0x42;
export const CALL = 0x43;
export const CAPTURE = 0x44;
export const READ_UPVALUE = 0x45;
export const RETURN = 0x46;
export const CALL_BUILTIN = 0x47;
export const SELF = 0x48;

// ----------------------------
// -- CORE IMPLEMENTATION -----
// ----------------------------

export const INDEX = 0x50;
export const EQUALS = 0x51;

// ----------------------------
// -- VALIDATION AND ERRORS ---
// ----------------------------

export const THROW = 0x80;
export const CATCH = 0x81;
export const UNCATCH = 0x82;
export const IS_NULL = 0x83;
export const IS_BOOLEAN = 0x84;
export const IS_NUMBER = 0x85;
export const IS_STRING = 0x86;
export const IS_ARRAY = 0x87;
export const IS_STREAM = 0x88;
export const IS_OBJECT = 0x89;
export const IS_FUNCTION = 0x8a;
export const IS_ERROR = 0x8b;
export const IS_CLASS = 0x8c;
export const IS_PROTOCOL = 0x8d;
export const IS_SEQUENCE = 0x8e;
export const IS_TYPE = 0x8f;
export const IS_INSTANCE = 0x90;
export const ERROR_IF_INVALID = 0x91;

export function disassemble(program) {
  return new Disassembler(program).disassemble();
}

class Disassembler {
  constructor({ instructions, diagnostics, functions }) {
    this.instructions = instructions;
    this.diagnostics = diagnostics;
    this.functions = functions;
    this.cursor = 0;

    this.instructionTable = [];
    this.instructionTable[VALUE] = this.disassembleValue;
    this.instructionTable[ALIAS] = this.disassembleAlias;
    this.instructionTable[DISCARD] = this.disassembleDiscard;
    this.instructionTable[RESERVE] = this.disassembleReserve;
    this.instructionTable[WRITE_LOCAL] = this.disassembleWriteLocal;
    this.instructionTable[READ_LOCAL] = this.disassembleReadLocal;
    this.instructionTable[PUSH_SCOPE] = this.disassemblePushScope;
    this.instructionTable[POP_SCOPE] = this.disassemblePopScope;
    this.instructionTable[READ_RELATIVE] = this.disassembleReadRelative;
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
    this.instructionTable[OBJECT_KEYS] = this.disassembleObjectKeys;
    this.instructionTable[OBJECT_VALUES] = this.disassembleObjectValues;
    this.instructionTable[OBJECT_HAS] = this.disassembleObjectHas;
    this.instructionTable[JUMP] = this.disassembleJump;
    this.instructionTable[JUMP_IF_TRUE] = this.disassembleJumpIfTrue;
    this.instructionTable[JUMP_IF_FALSE] = this.disassembleJumpIfFalse;
    this.instructionTable[BEGIN] = this.disassembleBegin;
    this.instructionTable[FUNCTION] = this.disassembleFunction;
    this.instructionTable[CLOSURE] = this.disassembleClosure;
    this.instructionTable[CALL] = this.disassembleCall;
    this.instructionTable[CAPTURE] = this.disassembleCapture;
    this.instructionTable[READ_UPVALUE] = this.disassembleReadUpvalue;
    this.instructionTable[RETURN] = this.disassembleReturn;
    this.instructionTable[CALL_BUILTIN] = this.disassembleCallBuiltin;
    this.instructionTable[SELF] = this.disassembleSelf;
    this.instructionTable[EQUALS] = this.disassembleEquals;
    this.instructionTable[INDEX] = this.disassembleIndex;
    this.instructionTable[THROW] = this.disassembleThrow;
    this.instructionTable[CATCH] = this.disassembleCatch;
    this.instructionTable[UNCATCH] = this.disassembleUncatch;
    this.instructionTable[IS_NULL] = this.disassembleIsNull;
    this.instructionTable[IS_BOOLEAN] = this.disassembleIsBoolean;
    this.instructionTable[IS_NUMBER] = this.disassembleIsNumber;
    this.instructionTable[IS_STRING] = this.disassembleIsString;
    this.instructionTable[IS_ARRAY] = this.disassembleIsArray;
    this.instructionTable[IS_STREAM] = this.disassembleIsStream;
    this.instructionTable[IS_OBJECT] = this.disassembleIsObject;
    this.instructionTable[IS_FUNCTION] = this.disassembleIsFunction;
    this.instructionTable[IS_ERROR] = this.disassembleIsError;
    this.instructionTable[IS_CLASS] = this.disassembleIsClass;
    this.instructionTable[IS_PROTOCOL] = this.disassembleIsProtocol;
    this.instructionTable[IS_SEQUENCE] = this.disassembleIsSequence;
    this.instructionTable[IS_TYPE] = this.disassembleIsType;
    this.instructionTable[IS_INSTANCE] = this.disassembleIsInstance;
    this.instructionTable[ERROR_IF_INVALID] = this.disassembleErrorIfInvalid;

    for (let i = 0; i < this.instructionTable.length; i++) {
      if (this.instructionTable[i]) {
        this.instructionTable[i] = this.instructionTable[i].bind(this);
      }
    }
  }

  disassemble() {
    const instructionStrings = [];
    for (const { name, offset } of this.functions) {
      instructionStrings.push(`Function ${name} at ${offset}`);
    }
    while (this.cursor >= 0) {
      const instructionStart = this.cursor;
      let instructionString = this.disassembleInstruction();
      const diagnostic = this.getDiagnostic();
      if (diagnostic) {
        instructionString = `${instructionStart} ${instructionString} ${displaySimple(
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
    return `VALUE ${displaySimple(this.next())}`;
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

  disassemblePushScope() {
    return `PUSH_SCOPE ${this.next()}`;
  }

  disassemblePopScope() {
    return "POP_SCOPE";
  }

  disassembleReadRelative() {
    return `READ_RELATIVE ${this.next()}`;
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

  disassembleObjectKeys() {
    return "OBJECT_KEYS";
  }

  disassembleObjectValues() {
    return "OBJECT_VALUES";
  }

  disassembleObjectHas() {
    return "OBJECT_HAS";
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

  disassembleBegin() {
    return "BEGIN";
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
    return `CALL_BUILTIN ${this.next()}`;
  }

  disassembleSelf() {
    return "SELF";
  }

  disassembleEquals() {
    return "EQUALS";
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

  disassembleIsStream() {
    return "IS_STREAM";
  }

  disassembleIsObject() {
    return "IS_OBJECT";
  }

  disassembleIsFunction() {
    return "IS_FUNCTION";
  }

  disassembleIsError() {
    return "IS_ERROR";
  }

  disassembleIsClass() {
    return "IS_CLASS";
  }

  disassembleIsProtocol() {
    return "IS_PROTOCOL";
  }

  disassembleIsSequence() {
    return "IS_SEQUENCE";
  }

  disassembleIsType() {
    return "IS_TYPE";
  }

  disassembleIsInstance() {
    return "IS_INSTANCE";
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
