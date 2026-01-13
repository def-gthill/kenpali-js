import { toKpobject } from "./kpobject.js";
import { displaySimple } from "./values.js";

// ----------------------------
// -- BASIC STACK OPERATIONS --
// ----------------------------

export const opInfo = [];

// Load the platform value at the specified index and push it onto the stack.
export const PLATFORM_VALUE = 0x00;
opInfo[PLATFORM_VALUE] = { name: "PLATFORM_VALUE", args: 1 };
// Push the specified value onto the stack. The argument must be a Kenpali primitive value
// (`null` or a Boolean, number, or string).
export const VALUE = 0x01;
opInfo[VALUE] = { name: "VALUE", args: 1 };
// Create an alias of the top of the stack, and push it onto the stack.
export const ALIAS = 0x02;
opInfo[ALIAS] = { name: "ALIAS", args: 0 };
// Pop the top of the stack and throw it away.
export const DISCARD = 0x03;
opInfo[DISCARD] = { name: "DISCARD", args: 0 };
// Reserve the specified number of empty slots at the top of the stack.
export const RESERVE = 0x04;
opInfo[RESERVE] = { name: "RESERVE", args: 1 };
// Write the value at the top of the stack to the local variable at the specified index.
export const WRITE_LOCAL = 0x05;
opInfo[WRITE_LOCAL] = { name: "WRITE_LOCAL", args: 1 };
// Read the value from the local variable at the specified index and push it onto the stack.
export const READ_LOCAL = 0x06;
opInfo[READ_LOCAL] = { name: "READ_LOCAL", args: 2 };
// Push a new scope frame onto the scope stack, whose first slot is the specified number of steps
// down the stack.
export const PUSH_SCOPE = 0x07;
opInfo[PUSH_SCOPE] = { name: "PUSH_SCOPE", args: 1 };
// Pop the top scope frame from the scope stack.
export const POP_SCOPE = 0x08;
opInfo[POP_SCOPE] = { name: "POP_SCOPE", args: 0 };
// Read the value from the specified number of steps down the stack, and push it onto the stack.
// READ_RELATIVE 0 is the same as ALIAS.
export const READ_RELATIVE = 0x09;
opInfo[READ_RELATIVE] = { name: "READ_RELATIVE", args: 1 };

// ----------------------------
// -- ARRAY OPERATIONS --------
// ----------------------------

// Create an empty array and push it onto the stack.
export const EMPTY_ARRAY = 0x10;
opInfo[EMPTY_ARRAY] = { name: "EMPTY_ARRAY", args: 0 };
// Pop the value at the top of the stack and push it onto the array now at the top of the stack.
export const ARRAY_PUSH = 0x11;
opInfo[ARRAY_PUSH] = { name: "ARRAY_PUSH", args: 0 };
// Pop the sequence at the top of the stack and push all its values onto the array now at the top,
// preserving their order.
export const ARRAY_EXTEND = 0x12;
opInfo[ARRAY_EXTEND] = { name: "ARRAY_EXTEND", args: 0 };
// Reverse the order of the values in the array now at the top of the stack.
export const ARRAY_REVERSE = 0x13;
opInfo[ARRAY_REVERSE] = { name: "ARRAY_REVERSE", args: 0 };
// Pop the last value from the array at the top of the stack and push it onto the stack.
export const ARRAY_POP = 0x14;
opInfo[ARRAY_POP] = { name: "ARRAY_POP", args: 0 };
// Pop the top value from the stack to use as the default value.
// Then, if there are elements in the array at the top of the stack, pop the last value and
// push it onto the stack. Otherwise, push the default value back onto the stack.
export const ARRAY_POP_OR_DEFAULT = 0x15;
opInfo[ARRAY_POP_OR_DEFAULT] = { name: "ARRAY_POP_OR_DEFAULT", args: 0 };
// Pop the sequence at the top of the stack, split it at the specified position, and push both
// parts onto the stack. After this instruction, the second value from the top of the stack
// is an array whose length is the specified position.
export const ARRAY_CUT = 0x16;
opInfo[ARRAY_CUT] = { name: "ARRAY_CUT", args: 1 };
// Replace the array at the top of the stack with a copy of it, breaking any alias relationships.
export const ARRAY_COPY = 0x17;
opInfo[ARRAY_COPY] = { name: "ARRAY_COPY", args: 0 };
// Pop the array at the top of the stack and push a boolean indicating whether it is empty.
export const ARRAY_IS_EMPTY = 0x18;
opInfo[ARRAY_IS_EMPTY] = { name: "ARRAY_IS_EMPTY", args: 0 };

// ----------------------------
// -- OBJECT OPERATIONS -------
// ----------------------------

// Create an empty object and push it onto the stack.
export const EMPTY_OBJECT = 0x20;
opInfo[EMPTY_OBJECT] = { name: "EMPTY_OBJECT", args: 0 };
// Pop the top two values from the stack and add them as a key-value pair to the object
// now at the top of the stack. The key is the value that was originally at the top of the stack.
export const OBJECT_PUSH = 0x21;
opInfo[OBJECT_PUSH] = { name: "OBJECT_PUSH", args: 0 };
// Pop the object at the top of the stack and add all its key-value pairs to the object
// now at the top of the stack. The key-value pairs from the popped object take precedence
// over any existing key-value pairs in the object at the top of the stack.
export const OBJECT_MERGE = 0x22;
opInfo[OBJECT_MERGE] = { name: "OBJECT_MERGE", args: 0 };
// Pop the top value from the stack to use as the key, remove the corresponding value
// from the object now at the top of the stack, and push it onto the stack.
export const OBJECT_POP = 0x23;
opInfo[OBJECT_POP] = { name: "OBJECT_POP", args: 0 };
// Pop the top value from the stack to use as the default value, then the new top value
// to use as the key. Then, if the object has a value for the key, remove it from the object
// and push it onto the stack. Otherwise, push the default value back onto the stack.
export const OBJECT_POP_OR_DEFAULT = 0x24;
opInfo[OBJECT_POP_OR_DEFAULT] = { name: "OBJECT_POP_OR_DEFAULT", args: 0 };
// Replace the object at the top of the stack with a copy of it, breaking any alias relationships.
export const OBJECT_COPY = 0x25;
opInfo[OBJECT_COPY] = { name: "OBJECT_COPY", args: 0 };
// Pop the object at the top of the stack and push an array of all its keys.
export const OBJECT_KEYS = 0x26;
opInfo[OBJECT_KEYS] = { name: "OBJECT_KEYS", args: 0 };
// Pop the object at the top of the stack and push an array of all its values.
export const OBJECT_VALUES = 0x27;
opInfo[OBJECT_VALUES] = { name: "OBJECT_VALUES", args: 0 };
// Pop the top value from the stack to use as the key, then pop the object at the top of the stack.
// Push a boolean indicating whether the object has a value for the key.
export const OBJECT_HAS = 0x28;
opInfo[OBJECT_HAS] = { name: "OBJECT_HAS", args: 0 };

// ----------------------------
// -- JUMPS -------------------
// ----------------------------

// Move the cursor forward by the specified number of steps.
export const JUMP = 0x30;
opInfo[JUMP] = { name: "JUMP", args: 1 };
// Pop the value at the top of the stack and move the cursor forward by the specified number of steps
// if the value is `true`.
export const JUMP_IF_TRUE = 0x31;
opInfo[JUMP_IF_TRUE] = { name: "JUMP_IF_TRUE", args: 1 };
// Pop the value at the top of the stack and move the cursor forward by the specified number of steps
// if the value is `false`.
export const JUMP_IF_FALSE = 0x32;
opInfo[JUMP_IF_FALSE] = { name: "JUMP_IF_FALSE", args: 1 };
// Move the cursor backward by the specified number of steps.
export const JUMP_BACK = 0x33;
opInfo[JUMP_BACK] = { name: "JUMP_BACK", args: 1 };

// ----------------------------
// -- FUNCTIONS ---------------
// ----------------------------

// Do nothing. This simply marks the beginning of a function.
export const BEGIN = 0x40;
opInfo[BEGIN] = { name: "BEGIN", args: 0 };
// Push the function starting at the specified instruction index onto the stack.
export const FUNCTION = 0x41;
opInfo[FUNCTION] = { name: "FUNCTION", args: 1 };
// Prepare an upvalue for the variable the specified number of scope frames out,
// starting at 1, at the specified index. If the number of steps is 0, instead
// prepare a chained upvalue referring to the specified variable in the enclosing
// function's closure.
export const CLOSURE = 0x42;
opInfo[CLOSURE] = { name: "CLOSURE", args: 2 };
// Call a function. The function is expected to be third from the top of the stack,
// with the array of positional arguments immediately above it and the object of named arguments
// above that. If the function is a natural function, this instruction just pushes a call frame
// and jumps to the start of the function; otherwise, it manages the entire lifecycle of the
// call, ending with the function's result at the top of the stack.
export const CALL = 0x43;
opInfo[CALL] = { name: "CALL", args: 0 };
// Capture the value at the top of the stack into the corresponding upvalue.
export const CAPTURE = 0x44;
opInfo[CAPTURE] = { name: "CAPTURE", args: 0 };
// Read the value from the upvalue at the specified index and push it onto the stack.
export const READ_UPVALUE = 0x45;
opInfo[READ_UPVALUE] = { name: "READ_UPVALUE", args: 1 };
// Pops the current call frame and moves the cursor to the return instruction indicated
// in the frame.
export const RETURN = 0x46;
opInfo[RETURN] = { name: "RETURN", args: 0 };
// Call a function defined using `platformFunction` or `platformClass`, with the specified
// name. The arguments are pre-bound and occupy as many slots at the top of the stack as
// there are parameters defined for the function.
export const CALL_PLATFORM_FUNCTION = 0x47;
opInfo[CALL_PLATFORM_FUNCTION] = { name: "CALL_PLATFORM_FUNCTION", args: 1 };
// Pop the specified constructor function off the stack, and push its `self` value onto the stack.
export const SELF = 0x48;
opInfo[SELF] = { name: "SELF", args: 0 };

// ----------------------------
// -- CORE IMPLEMENTATION -----
// ----------------------------

// Pop the top two values from the stack, use the top value as an index into the second-from-top value,
// and push the result onto the stack.
export const INDEX = 0x50;
opInfo[INDEX] = { name: "INDEX", args: 0 };
// Pop the top two values from the stack, and push a boolean indicating whether they are equal,
// as per the core `equals` function.
export const EQUALS = 0x51;
opInfo[EQUALS] = { name: "EQUALS", args: 0 };

// ----------------------------
// -- VALIDATION AND ERRORS ---
// ----------------------------

// Pop the error value at the top of the stack and throw it.
export const THROW = 0x80;
opInfo[THROW] = { name: "THROW", args: 0 };
// Push a recovery handler onto the recovery stack, targeting the specified number of
// steps forward from the current cursor.
export const CATCH = 0x81;
opInfo[CATCH] = { name: "CATCH", args: 1 };
// Pop the top recovery handler from the recovery stack.
export const UNCATCH = 0x82;
opInfo[UNCATCH] = { name: "UNCATCH", args: 0 };
// Pop the value at the top of the stack and push a boolean indicating whether it is `null`.
export const IS_NULL = 0x83;
opInfo[IS_NULL] = { name: "IS_NULL", args: 0 };
// Pop the value at the top of the stack and push a boolean indicating whether it is a boolean.
export const IS_BOOLEAN = 0x84;
opInfo[IS_BOOLEAN] = { name: "IS_BOOLEAN", args: 0 };
// Pop the value at the top of the stack and push a boolean indicating whether it is a number.
export const IS_NUMBER = 0x85;
opInfo[IS_NUMBER] = { name: "IS_NUMBER", args: 0 };
// Pop the value at the top of the stack and push a boolean indicating whether it is a string.
export const IS_STRING = 0x86;
opInfo[IS_STRING] = { name: "IS_STRING", args: 0 };
// Pop the value at the top of the stack and push a boolean indicating whether it is an array.
export const IS_ARRAY = 0x87;
opInfo[IS_ARRAY] = { name: "IS_ARRAY", args: 0 };
// Pop the value at the top of the stack and push a boolean indicating whether it is a stream.
export const IS_STREAM = 0x88;
opInfo[IS_STREAM] = { name: "IS_STREAM", args: 0 };
// Pop the value at the top of the stack and push a boolean indicating whether it is an object.
export const IS_OBJECT = 0x89;
opInfo[IS_OBJECT] = { name: "IS_OBJECT", args: 0 };
// Pop the value at the top of the stack and push a boolean indicating whether it is a function.
export const IS_FUNCTION = 0x8a;
opInfo[IS_FUNCTION] = { name: "IS_FUNCTION", args: 0 };
// Pop the value at the top of the stack and push a boolean indicating whether it is an error.
export const IS_ERROR = 0x8b;
opInfo[IS_ERROR] = { name: "IS_ERROR", args: 0 };
// Pop the value at the top of the stack and push a boolean indicating whether it is a class.
export const IS_CLASS = 0x8c;
opInfo[IS_CLASS] = { name: "IS_CLASS", args: 0 };
// Pop the value at the top of the stack and push a boolean indicating whether it is a protocol.
export const IS_PROTOCOL = 0x8d;
opInfo[IS_PROTOCOL] = { name: "IS_PROTOCOL", args: 0 };
// Pop the top two values from the stack. The top value must be a type value.
// Push a boolean indicating whether the second-from-top value belongs to the type.
export const HAS_TYPE = 0x8e;
opInfo[HAS_TYPE] = { name: "HAS_TYPE", args: 0 };
// Pop the top value from the stack to use as a validation schema. The value now at the top
// of the stack is the value that failed validation. Push an error value onto the stack
// indicating why the validation failed.
export const VALIDATION_ERROR = 0x9f;
opInfo[VALIDATION_ERROR] = { name: "VALIDATION_ERROR", args: 0 };

for (const op of opInfo) {
  if (op && typeof op.args === "number") {
    op.args = Array(op.args).fill(0);
  }
}

export function disassemble(program) {
  return new Disassembler(program).disassemble();
}

class Disassembler {
  constructor({ instructions, platformValues, diagnostics, functions }) {
    this.instructions = instructions;
    this.platformValues = platformValues;
    this.diagnostics = diagnostics;
    this.functions = functions;
    this.cursor = 0;
  }

  disassemble() {
    const instructionStrings = [];
    this.disassemblePlatformValues(instructionStrings);
    this.disassembleFunctions(instructionStrings);
    this.disassembleInstructions(instructionStrings);
    return instructionStrings.join("\n");
  }

  disassemblePlatformValues(instructionStrings) {
    instructionStrings.push("--- Platform Values ---");
    if (this.platformValues.length === 0) {
      instructionStrings.push("<none>");
    }
    for (let i = 0; i < this.platformValues.length; i++) {
      instructionStrings.push(
        `${i} = ${displaySimple(this.platformValues[i])}`
      );
    }
  }

  disassembleFunctions(instructionStrings) {
    instructionStrings.push("--- Functions ---");
    for (const { name, offset } of this.functions) {
      instructionStrings.push(`Function ${name} at ${offset}`);
    }
  }

  disassembleInstructions(instructionStrings) {
    instructionStrings.push("--- Instructions ---");
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
    if (!opInfo[instructionType]) {
      return `!! UNKNOWN INSTRUCTION ${instructionType}`;
    }
    const instructionInfo = opInfo[instructionType];
    const args = [];
    for (let i = 0; i < instructionInfo.args; i++) {
      args.push(this.next());
    }
    return `${instructionInfo.name} ${args.join(" ")}`;
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
