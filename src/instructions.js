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
// Pop the value at the top of the stack and push it onto the array now at the top of the stack.
export const ARRAY_PUSH = 0x11;
// Pop the sequence at the top of the stack and push all its values onto the array now at the top,
// preserving their order.
export const ARRAY_EXTEND = 0x12;
// Reverse the order of the values in the array now at the top of the stack.
export const ARRAY_REVERSE = 0x13;
// Pop the last value from the array at the top of the stack and push it onto the stack.
export const ARRAY_POP = 0x14;
// If there are elements in the array at the top of the stack, pop the last value and
// push it onto the stack. Otherwise, push the default value onto the stack.
export const ARRAY_POP_OR_DEFAULT = 0x15;
// Pop the sequence at the top of the stack, split it at the specified position, and push both
// parts onto the stack. After this instruction, the second value from the top of the stack
// is an array whose length is the specified position.
export const ARRAY_CUT = 0x16;
// Replace the array at the top of the stack with a copy of it, breaking any alias relationships.
export const ARRAY_COPY = 0x17;
// Pop the array at the top of the stack and push a boolean indicating whether it is empty.
export const ARRAY_IS_EMPTY = 0x18;

// ----------------------------
// -- OBJECT OPERATIONS -------
// ----------------------------

// Create an empty object and push it onto the stack.
export const EMPTY_OBJECT = 0x20;
// Pop the top two values from the stack and add them as a key-value pair to the object
// now at the top of the stack. The key is the value that was originally at the top of the stack.
export const OBJECT_PUSH = 0x21;
// Pop the object at the top of the stack and add all its key-value pairs to the object
// now at the top of the stack. The key-value pairs from the popped object take precedence
// over any existing key-value pairs in the object at the top of the stack.
export const OBJECT_MERGE = 0x22;
// Pop the value corresponding to the specified key from the object at the top of the stack
// and push it onto the stack.
export const OBJECT_POP = 0x23;
// Pop the value corresponding to the specified key from the object at the top of the stack
// and push it onto the stack. If the object does not have a value for the specified key,
// push the default value onto the stack instead.
export const OBJECT_POP_OR_DEFAULT = 0x24;
// Replace the object at the top of the stack with a copy of it, breaking any alias relationships.
export const OBJECT_COPY = 0x25;
// Pop the object at the top of the stack and push an array of all its keys.
export const OBJECT_KEYS = 0x26;
// Pop the object at the top of the stack and push an array of all its values.
export const OBJECT_VALUES = 0x27;
// Pop the object at the top of the stack and push a boolean indicating whether it has a value
// for the specified key.
export const OBJECT_HAS = 0x28;

// ----------------------------
// -- JUMPS -------------------
// ----------------------------

// Move the cursor forward by the specified number of steps.
export const JUMP = 0x30;
// Pop the value at the top of the stack and move the cursor forward by the specified number of steps
// if the value is `true`.
export const JUMP_IF_TRUE = 0x31;
// Pop the value at the top of the stack and move the cursor forward by the specified number of steps
// if the value is `false`.
export const JUMP_IF_FALSE = 0x32;

// ----------------------------
// -- FUNCTIONS ---------------
// ----------------------------

// Do nothing. This simply marks the beginning of a function.
export const BEGIN = 0x40;
// Push the function starting at the specified instruction index onto the stack.
export const FUNCTION = 0x41;
// Prepare an upvalue for the variable the specified number of scope frames out at the
// specified index. If the number of steps is -1, instead prepare a chained upvalue referring
// to the specified variable in the enclosing function's closure.
export const CLOSURE = 0x42;
// Call a function. The function is expected to be third from the top of the stack,
// with the array of positional arguments immediately above it and the object of named arguments
// above that. If the function is a natural function, this instruction just pushes a call frame
// and jumps to the start of the function; otherwise, it manages the entire lifecycle of the
// call, ending with the function's result at the top of the stack.
export const CALL = 0x43;
// Capture the value at the top of the stack into the corresponding upvalue.
export const CAPTURE = 0x44;
// Read the value from the upvalue at the specified index and push it onto the stack.
export const READ_UPVALUE = 0x45;
// Pops the current call frame and moves the cursor to the return instruction indicated
// in the frame.
export const RETURN = 0x46;
// Call a function defined using `platformFunction` or `platformClass`, with the specified
// name. The arguments are pre-bound and occupy as many slots at the top of the stack as
// there are parameters defined for the function.
export const CALL_PLATFORM_FUNCTION = 0x47;
// Pop the specified constructor function off the stack, and push its `self` value onto the stack.
export const SELF = 0x48;

// ----------------------------
// -- CORE IMPLEMENTATION -----
// ----------------------------

// Pop the top two values from the stack, use the top value as an index into the second-from-top value,
// and push the result onto the stack.
export const INDEX = 0x50;
// Pop the top two values from the stack, and push a boolean indicating whether they are equal,
// as per the core `equals` function.
export const EQUALS = 0x51;

// ----------------------------
// -- VALIDATION AND ERRORS ---
// ----------------------------

// Pop the error value at the top of the stack and throw it.
export const THROW = 0x80;
// Push a recovery handler onto the recovery stack, targeting the specified number of
// steps forward from the current cursor.
export const CATCH = 0x81;
// Pop the top recovery handler from the recovery stack.
export const UNCATCH = 0x82;
// Pop the value at the top of the stack and push a boolean indicating whether it is `null`.
export const IS_NULL = 0x83;
// Pop the value at the top of the stack and push a boolean indicating whether it is a boolean.
export const IS_BOOLEAN = 0x84;
// Pop the value at the top of the stack and push a boolean indicating whether it is a number.
export const IS_NUMBER = 0x85;
// Pop the value at the top of the stack and push a boolean indicating whether it is a string.
export const IS_STRING = 0x86;
// Pop the value at the top of the stack and push a boolean indicating whether it is an array.
export const IS_ARRAY = 0x87;
// Pop the value at the top of the stack and push a boolean indicating whether it is a stream.
export const IS_STREAM = 0x88;
// Pop the value at the top of the stack and push a boolean indicating whether it is an object.
export const IS_OBJECT = 0x89;
// Pop the value at the top of the stack and push a boolean indicating whether it is a function.
export const IS_FUNCTION = 0x8a;
// Pop the value at the top of the stack and push a boolean indicating whether it is an error.
export const IS_ERROR = 0x8b;
// Pop the value at the top of the stack and push a boolean indicating whether it is a class.
export const IS_CLASS = 0x8c;
// Pop the value at the top of the stack and push a boolean indicating whether it is a protocol.
export const IS_PROTOCOL = 0x8d;
// Pop the top two values from the stack. The top value must be a type value.
// Push a boolean indicating whether the second-from-top value belongs to the type.
export const HAS_TYPE = 0x8e;
// Pop the top two values from the stack. The top value is treated as a validation schema, and
// the second-from-top value is a boolean indicating whether the value was found to match the
// schema using fast comparison. The value now at the top of the stack is the value to validate.
// If the value does not match the schema, push an error value onto the stack indicating why.
// Otherwise, do nothing.
export const ERROR_IF_INVALID = 0x9f;

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
    this.instructionTable[CALL_PLATFORM_FUNCTION] =
      this.disassembleCallPlatformFunction;
    this.instructionTable[SELF] = this.disassembleSelf;
    this.instructionTable[INDEX] = this.disassembleIndex;
    this.instructionTable[EQUALS] = this.disassembleEquals;
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
    while (this.cursor < this.instructions.length) {
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

  disassembleCallPlatformFunction() {
    return `CALL_PLATFORM_FUNCTION ${this.next()}`;
  }

  disassembleSelf() {
    return "SELF";
  }

  disassembleIndex() {
    return "INDEX";
  }

  disassembleEquals() {
    return "EQUALS";
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
