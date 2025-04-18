import {
  ALIAS,
  ARRAY_COPY,
  ARRAY_CUT,
  ARRAY_EXTEND,
  ARRAY_IS_EMPTY,
  ARRAY_POP,
  ARRAY_POP_OR_DEFAULT,
  ARRAY_PUSH,
  ARRAY_REVERSE,
  CALL,
  CALL_BUILTIN,
  CAPTURE,
  CATCH,
  CLOSURE,
  DISCARD,
  EMPTY_ARRAY,
  EMPTY_OBJECT,
  ERROR_IF_INVALID,
  FUNCTION,
  INDEX,
  IS_ARRAY,
  IS_BOOLEAN,
  IS_BUILTIN,
  IS_ERROR,
  IS_FUNCTION,
  IS_GIVEN,
  IS_NULL,
  IS_NUMBER,
  IS_OBJECT,
  IS_SEQUENCE,
  IS_STRING,
  JUMP,
  JUMP_IF_FALSE,
  JUMP_IF_TRUE,
  OBJECT_COPY,
  OBJECT_MERGE,
  OBJECT_POP,
  OBJECT_POP_OR_DEFAULT,
  OBJECT_PUSH,
  POP,
  PUSH,
  READ_LOCAL,
  READ_UPVALUE,
  RESERVE,
  RETURN,
  VALUE,
  WRITE_LOCAL,
} from "./instructions.js";
import kperror, { transformError } from "./kperror.js";
import kpobject, { kpoEntries } from "./kpobject.js";
import validate, {
  argumentError,
  argumentPatternError,
  either,
} from "./validate.js";
import {
  isArray,
  isBoolean,
  isBuiltin,
  isError,
  isFunction,
  isGiven,
  isNull,
  isNumber,
  isObject,
  isSequence,
  isString,
  toString,
} from "./values.js";

export default function kpvm(
  program,
  { trace = false, timeLimitSeconds = 0 } = {}
) {
  return new Vm(program, { trace, timeLimitSeconds }).run();
}

export function kpvmCall(
  kpf,
  posArgs,
  namedArgs,
  { trace = false, timeLimitSeconds = 0 } = {}
) {
  return new Vm(kpf.program, { trace, timeLimitSeconds }).callback(
    kpf,
    posArgs,
    namedArgs
  );
}

export class Vm {
  constructor(
    { instructions, diagnostics = [] },
    { trace = false, timeLimitSeconds = 0 } = {}
  ) {
    this.instructions = instructions;
    this.diagnostics = diagnostics;
    this.trace = trace;
    this.timeLimitSeconds = timeLimitSeconds;
    this.startTime = Date.now();

    this.cursor = 0;
    this.stack = [];
    this.scopeFrames = [new ScopeFrame(0)];
    this.callFrames = [];
    this.openUpvalues = [];

    this.instructionTable = [];
    this.instructionTable[VALUE] = this.runValue;
    this.instructionTable[ALIAS] = this.runAlias;
    this.instructionTable[DISCARD] = this.runDiscard;
    this.instructionTable[RESERVE] = this.runReserve;
    this.instructionTable[WRITE_LOCAL] = this.runWriteLocal;
    this.instructionTable[READ_LOCAL] = this.runReadLocal;
    this.instructionTable[PUSH] = this.runPush;
    this.instructionTable[POP] = this.runPop;
    this.instructionTable[EMPTY_ARRAY] = this.runEmptyArray;
    this.instructionTable[ARRAY_PUSH] = this.runArrayPush;
    this.instructionTable[ARRAY_EXTEND] = this.runArrayExtend;
    this.instructionTable[ARRAY_REVERSE] = this.runArrayReverse;
    this.instructionTable[ARRAY_POP] = this.runArrayPop;
    this.instructionTable[ARRAY_POP_OR_DEFAULT] = this.runArrayPopOrDefault;
    this.instructionTable[ARRAY_CUT] = this.runArrayCut;
    this.instructionTable[ARRAY_COPY] = this.runArrayCopy;
    this.instructionTable[ARRAY_IS_EMPTY] = this.runArrayIsEmpty;
    this.instructionTable[EMPTY_OBJECT] = this.runEmptyObject;
    this.instructionTable[OBJECT_PUSH] = this.runObjectPush;
    this.instructionTable[OBJECT_MERGE] = this.runObjectMerge;
    this.instructionTable[OBJECT_POP] = this.runObjectPop;
    this.instructionTable[OBJECT_POP_OR_DEFAULT] = this.runObjectPopOrDefault;
    this.instructionTable[OBJECT_COPY] = this.runObjectCopy;
    this.instructionTable[JUMP] = this.runJump;
    this.instructionTable[JUMP_IF_TRUE] = this.runJumpIfTrue;
    this.instructionTable[JUMP_IF_FALSE] = this.runJumpIfFalse;
    this.instructionTable[FUNCTION] = this.runFunction;
    this.instructionTable[CLOSURE] = this.runClosure;
    this.instructionTable[CALL] = this.runCall;
    this.instructionTable[CAPTURE] = this.runCapture;
    this.instructionTable[READ_UPVALUE] = this.runReadUpvalue;
    this.instructionTable[RETURN] = this.runReturn;
    this.instructionTable[CALL_BUILTIN] = this.runCallBuiltin;
    this.instructionTable[INDEX] = this.runIndex;
    this.instructionTable[CATCH] = this.runCatch;
    this.instructionTable[IS_NULL] = this.runIsNull;
    this.instructionTable[IS_BOOLEAN] = this.runIsBoolean;
    this.instructionTable[IS_NUMBER] = this.runIsNumber;
    this.instructionTable[IS_STRING] = this.runIsString;
    this.instructionTable[IS_ARRAY] = this.runIsArray;
    this.instructionTable[IS_OBJECT] = this.runIsObject;
    this.instructionTable[IS_BUILTIN] = this.runIsBuiltin;
    this.instructionTable[IS_GIVEN] = this.runIsGiven;
    this.instructionTable[IS_ERROR] = this.runIsError;
    this.instructionTable[IS_FUNCTION] = this.runIsFunction;
    this.instructionTable[IS_SEQUENCE] = this.runIsSequence;
    this.instructionTable[ERROR_IF_INVALID] = this.runErrorIfInvalid;

    for (let i = 0; i < this.instructionTable.length; i++) {
      if (this.instructionTable[i]) {
        this.instructionTable[i] = this.instructionTable[i].bind(this);
      }
    }
  }

  callback(f, posArgs, namedArgs) {
    const frameIndex = this.stack.length;
    this.scopeFrames.push(new ScopeFrame(frameIndex));
    this.callFrames.push(
      new CallFrame(
        this.stack.length,
        this.instructions.length // Make run() return when this call finishes
      )
    );
    this.stack.push(f, posArgs, namedArgs);
    const target = f.target;
    if (this.trace) {
      console.log(`Callback invoked at ${target}`);
    }
    this.cursor = target;
    const result = this.run();
    if (this.trace) {
      console.log(`Returning ${toString(result)} from callback`);
    }
    this.scopeFrames.pop();
    this.stack.length = frameIndex;
    return result;
  }

  run() {
    while (this.cursor < this.instructions.length) {
      this.runInstruction();
      if (this.trace) {
        const cutoff = this.callFrames.at(-1)?.stackIndex ?? 0;
        console.log(
          `Stack: [${cutoff > 0 ? `... (${cutoff}), ` : ""}${this.stack
            .slice(cutoff)
            .map((value) => (value === undefined ? "-" : toString(value)))
            .join(", ")}]`
        );
      }
      if (this.timeLimitSeconds > 0) {
        this.checkLimit();
      }
    }
    return this.stack.at(-1);
  }

  checkLimit() {
    const currentTime = Date.now();
    const elapsedTime = (currentTime - this.startTime) / 1000;
    if (elapsedTime > this.timeLimitSeconds) {
      throw new Error(`Time limit of ${this.timeLimitSeconds} s exceeded`);
    }
  }

  runInstruction() {
    const instructionType = this.next();
    if (!this.instructionTable[instructionType]) {
      throw new Error(`Unknown instruction ${instructionType}`);
    }
    this.instructionTable[instructionType]();
  }

  runValue() {
    const value = this.next();
    if (this.trace) {
      console.log(`VALUE ${toString(value)}`);
    }
    this.stack.push(value);
  }

  runAlias() {
    if (this.trace) {
      console.log("ALIAS");
    }
    this.stack.push(this.stack.at(-1));
  }

  runDiscard() {
    if (this.trace) {
      console.log("DISCARD");
    }
    this.stack.pop();
  }

  runReserve() {
    const numSlots = this.next();
    if (this.trace) {
      console.log(`RESERVE ${numSlots}`);
    }
    for (let i = 0; i < numSlots; i++) {
      this.stack.push(undefined);
    }
  }

  runWriteLocal() {
    const localIndex = this.next();
    if (this.trace) {
      console.log(`WRITE_LOCAL ${localIndex} (${this.getDiagnostic().name})`);
    }
    const absoluteIndex = this.scopeFrames.at(-1).stackIndex + localIndex;
    const value = this.stack.pop();
    this.stack[absoluteIndex] = value;
  }

  runReadLocal() {
    const stepsOut = this.next();
    const localIndex = this.next();
    if (this.trace) {
      console.log(
        `READ_LOCAL ${stepsOut} ${localIndex} (${this.getDiagnostic().name})`
      );
    }
    const absoluteIndex =
      this.scopeFrames.at(-1 - stepsOut).stackIndex + localIndex;
    const value = this.stack[absoluteIndex];
    if (value === undefined) {
      this.throw_(
        kperror("nameUsedBeforeAssignment", ["name", this.getDiagnostic().name])
      );
      return;
    }
    this.stack.push(value);
  }

  runPush() {
    const offset = this.next();
    const stackIndex = this.stack.length - 1 + offset;
    if (this.trace) {
      console.log(`PUSH ${offset} (at ${stackIndex})`);
    }
    this.scopeFrames.push(new ScopeFrame(stackIndex));
  }

  runPop() {
    const frame = this.scopeFrames.pop();
    if (this.trace) {
      console.log(`POP (at ${frame.stackIndex})`);
    }
    this.stack.length = frame.stackIndex + 1;
  }

  runEmptyArray() {
    if (this.trace) {
      console.log("EMPTY_ARRAY");
    }
    this.stack.push([]);
  }

  runArrayPush() {
    if (this.trace) {
      console.log("ARRAY_PUSH");
    }
    const value = this.stack.pop();
    this.stack.at(-1).push(value);
  }

  runArrayExtend() {
    if (this.trace) {
      console.log("ARRAY_EXTEND");
    }
    const value = this.stack.pop();
    this.stack.at(-1).push(...value);
  }

  runArrayReverse() {
    if (this.trace) {
      console.log("ARRAY_REVERSE");
    }
    this.stack.at(-1).reverse();
  }

  runArrayPop() {
    if (this.trace) {
      console.log("ARRAY_POP");
    }
    const value = this.stack.at(-1).pop();
    if (value === undefined) {
      const diagnostic = this.getDiagnostic();
      if (diagnostic) {
        if (diagnostic.isArgument) {
          this.throw_(kperror("missingArgument", ["name", diagnostic.name]));
          return;
        } else {
          this.throw_(
            kperror(
              "missingElement",
              ["value", value],
              ["name", diagnostic.name]
            )
          );
          return;
        }
      } else {
        this.throw_(kperror("missingElement", ["value", value]));
        return;
      }
    }
    this.stack.push(value);
  }

  runArrayPopOrDefault() {
    if (this.trace) {
      console.log("ARRAY_POP_OR_DEFAULT");
    }
    const defaultValue = this.stack.pop();
    const value =
      this.stack.at(-1).length > 0 ? this.stack.at(-1).pop() : defaultValue;
    this.stack.push(value);
  }

  runArrayCut() {
    const position = this.next();
    if (this.trace) {
      console.log(`ARRAY_CUT ${position}`);
    }
    const array = this.stack.pop();
    this.stack.push(array.slice(0, position));
    this.stack.push(array.slice(position));
  }

  runArrayCopy() {
    if (this.trace) {
      console.log("ARRAY_COPY");
    }
    const array = this.stack.pop();
    this.stack.push([...array]);
  }

  runArrayIsEmpty() {
    if (this.trace) {
      console.log("ARRAY_IS_EMPTY");
    }
    const array = this.stack.pop();
    this.stack.push(array.length === 0);
  }

  runEmptyObject() {
    if (this.trace) {
      console.log("EMPTY_OBJECT");
    }
    this.stack.push(kpobject());
  }

  runObjectPush() {
    if (this.trace) {
      console.log("OBJECT_PUSH");
    }
    const value = this.stack.pop();
    const key = this.stack.pop();
    this.stack.at(-1).set(key, value);
  }

  runObjectMerge() {
    if (this.trace) {
      console.log("OBJECT_MERGE");
    }
    const object = this.stack.pop();
    for (const [key, value] of object) {
      this.stack.at(-1).set(key, value);
    }
  }

  runObjectPop() {
    if (this.trace) {
      console.log("OBJECT_POP");
    }
    const key = this.stack.pop();
    const value = this.stack.at(-1).get(key);
    if (value === undefined) {
      const diagnostic = this.getDiagnostic();
      if (diagnostic) {
        if (diagnostic.isArgument) {
          this.throw_(kperror("missingArgument", ["name", key]));
          return;
        } else {
          this.throw_(
            kperror("missingProperty", ["value", value], ["key", key])
          );
          return;
        }
      } else {
        this.throw_(kperror("missingProperty", ["value", value], ["key", key]));
        return;
      }
    }
    this.stack.at(-1).delete(key);
    this.stack.push(value);
  }

  runObjectPopOrDefault() {
    if (this.trace) {
      console.log("OBJECT_POP_OR_DEFAULT");
    }
    const defaultValue = this.stack.pop();
    const key = this.stack.pop();
    const value = this.stack.at(-1).has(key)
      ? this.stack.at(-1).get(key)
      : defaultValue;
    this.stack.at(-1).delete(key);
    this.stack.push(value);
  }

  runObjectCopy() {
    if (this.trace) {
      console.log("OBJECT_COPY");
    }
    const object = this.stack.pop();
    this.stack.push(kpobject(...kpoEntries(object)));
  }

  runJump() {
    const distance = this.next();
    if (this.trace) {
      console.log(`JUMP ${distance}`);
    }
    this.cursor += distance;
  }

  runJumpIfTrue() {
    const distance = this.next();
    if (this.trace) {
      console.log(`JUMP_IF_TRUE ${distance}`);
    }
    const condition = this.stack.pop();
    if (condition) {
      this.cursor += distance;
    }
  }

  runJumpIfFalse() {
    const distance = this.next();
    if (this.trace) {
      console.log(`JUMP_IF_FALSE ${distance}`);
    }
    const condition = this.stack.pop();
    if (!condition) {
      this.cursor += distance;
    }
  }

  runFunction() {
    const target = this.next();
    const diagnostic = this.getDiagnostic();
    if (this.trace) {
      console.log(`FUNCTION ${target} (${diagnostic.name})`);
    }
    this.stack.push(
      new Function(
        diagnostic.name,
        { instructions: this.instructions, diagnostics: this.diagnostics },
        target,
        { isBuiltin: diagnostic.isBuiltin }
      )
    );
  }

  runClosure() {
    const stepsOut = this.next();
    const index = this.next();
    if (this.trace) {
      console.log(`CLOSURE ${stepsOut} ${index}`);
    }
    const f = this.stack.at(-1);
    let upvalue;
    if (stepsOut === -1) {
      const enclosingFunction = this.stack[this.callFrames.at(-1).stackIndex];
      const ref = enclosingFunction.closure[index];
      upvalue = new Upvalue(ref);
    } else {
      const absoluteIndex =
        this.scopeFrames.at(-1 - stepsOut).stackIndex + index;

      if (this.openUpvalues[absoluteIndex]) {
        upvalue = this.openUpvalues[absoluteIndex];
      } else {
        upvalue = new Upvalue(absoluteIndex);
        this.openUpvalues[absoluteIndex] = upvalue;
      }
    }
    f.closure.push(upvalue);
  }

  runCall() {
    if (this.trace) {
      console.log("CALL");
    }
    const callee = this.stack.at(-3);
    if (typeof callee === "object" && "target" in callee) {
      this.callGiven(callee);
    } else if (isBuiltin(callee)) {
      this.callBuiltin(callee);
    } else {
      this.throw_(kperror("notCallable", ["value", callee]));
    }
  }

  callGiven(callee) {
    this.callFrames.push(
      new CallFrame(this.scopeFrames.at(-1).stackIndex, this.cursor)
    );
    const target = callee.target;
    if (this.trace) {
      console.log(`Jump to ${target}`);
    }
    this.cursor = target;
  }

  callBuiltin(callee) {
    if (this.trace) {
      console.log(`Call builtin "${callee.builtinName ?? "<anonymous>"}"`);
    }
    this.callFrames.push(
      new CallFrame(this.scopeFrames.at(-1).stackIndex, this.cursor)
    );
    const namedArgs = this.stack.pop();
    const posArgs = this.stack.pop();
    const kpcallback = (f, posArgs, namedArgs) => {
      if (isBuiltin(f)) {
        return f(posArgs, namedArgs, kpcallback);
      } else {
        return this.callback(f, posArgs, namedArgs);
      }
    };
    try {
      const result = callee(posArgs, namedArgs, kpcallback);
      this.stack.pop(); // Discard called function
      this.stack.push(result);
      const callFrame = this.callFrames.pop();
      this.cursor = callFrame.returnIndex;
      if (this.trace) {
        console.log(`Return to ${this.cursor}`);
      }
    } catch (error) {
      if (isError(error)) {
        this.throw_(error);
      } else {
        throw error;
      }
    }
  }

  runCapture() {
    if (this.trace) {
      console.log("CAPTURE");
    }
    const value = this.stack.pop();
    this.openUpvalues[this.stack.length].close(value);
    delete this.openUpvalues[this.stack.length];
  }

  runReadUpvalue() {
    const upvalueIndex = this.next();
    if (this.trace) {
      console.log(
        `READ_UPVALUE ${upvalueIndex} (${this.getDiagnostic().name})`
      );
    }
    const f = this.stack[this.callFrames.at(-1).stackIndex];
    let upvalue = f.closure[upvalueIndex];
    while (typeof upvalue.ref === "object") {
      upvalue = upvalue.ref;
    }
    let value;
    if ("value" in upvalue) {
      value = upvalue.value;
    } else {
      value = this.stack[upvalue.ref];
    }
    this.stack.push(value);
  }

  runReturn() {
    if (this.trace) {
      console.log("RETURN");
    }
    if (this.callFrames.length === 0) {
      this.cursor = this.instructions.length;
    } else {
      const callFrame = this.callFrames.pop();
      this.cursor = callFrame.returnIndex;
    }
    if (this.trace) {
      console.log(`Return to ${this.cursor}`);
    }
  }

  runCallBuiltin() {
    if (this.trace) {
      console.log("CALL_BUILTIN");
    }
    const frameIndex = this.scopeFrames.at(-1).stackIndex;
    this.callFrames.push(new CallFrame(frameIndex, this.cursor));
    const callee = this.stack[frameIndex];
    const args = this.stack.slice(frameIndex + 1);
    this.stack.length = frameIndex;
    const kpcallback = (f, posArgs, namedArgs) =>
      this.callback(f, posArgs, namedArgs);
    try {
      const result = callee(args, kpcallback);
      this.stack.push(result);
      const callFrame = this.callFrames.pop();
      this.cursor = callFrame.returnIndex;
      if (this.trace) {
        console.log(`Return to ${this.cursor}`);
      }
    } catch (error) {
      if (isError(error)) {
        this.throw_(error);
      } else {
        throw error;
      }
    }
  }

  runIndex() {
    if (this.trace) {
      console.log("INDEX");
    }
    const index = this.stack.pop();
    const collection = this.stack.pop();
    if (isString(collection) || isArray(collection)) {
      if (!isNumber(index)) {
        this.throw_(
          kperror("wrongType", ["value", index], ["expectedType", "number"])
        );
      }
      if (index < 1 || index > collection.length) {
        this.throw_(
          kperror(
            "indexOutOfBounds",
            ["value", collection],
            ["length", collection.length],
            ["index", index]
          )
        );
      }
      this.stack.push(collection[index - 1]);
    } else if (isObject(collection)) {
      if (!isString(index)) {
        this.throw_(
          kperror("wrongType", ["value", index], ["expectedType", "string"])
        );
      }
      if (collection.has(index)) {
        this.stack.push(collection.get(index));
      } else {
        this.throw_(
          kperror("missingProperty", ["value", collection], ["key", index])
        );
      }
    } else {
      this.throw_(
        kperror(
          "wrongType",
          ["value", collection],
          ["expectedType", either("string", "array", "object")]
        )
      );
    }
  }

  runCatch() {
    const recoveryOffset = this.next();
    if (this.trace) {
      console.log(`CATCH ${recoveryOffset}`);
    }
    this.scopeFrames.at(-1).setRecovery(this.cursor + recoveryOffset);
  }

  runIsNull() {
    if (this.trace) {
      console.log("IS_NULL");
    }
    const value = this.stack.pop();
    this.stack.push(isNull(value));
  }

  runIsBoolean() {
    if (this.trace) {
      console.log("IS_BOOLEAN");
    }
    const value = this.stack.pop();
    this.stack.push(isBoolean(value));
  }

  runIsNumber() {
    if (this.trace) {
      console.log("IS_NUMBER");
    }
    const value = this.stack.pop();
    this.stack.push(isNumber(value));
  }

  runIsString() {
    if (this.trace) {
      console.log("IS_STRING");
    }
    const value = this.stack.pop();
    this.stack.push(isString(value));
  }

  runIsArray() {
    if (this.trace) {
      console.log("IS_ARRAY");
    }
    const value = this.stack.pop();
    this.stack.push(isArray(value));
  }

  runIsObject() {
    if (this.trace) {
      console.log("IS_OBJECT");
    }
    const value = this.stack.pop();
    this.stack.push(isObject(value));
  }

  runIsBuiltin() {
    if (this.trace) {
      console.log("IS_BUILTIN");
    }
    const value = this.stack.pop();
    this.stack.push(isBuiltin(value));
  }

  runIsGiven() {
    if (this.trace) {
      console.log("IS_GIVEN");
    }
    const value = this.stack.pop();
    this.stack.push(isGiven(value));
  }

  runIsError() {
    if (this.trace) {
      console.log("IS_ERROR");
    }
    const value = this.stack.pop();
    this.stack.push(isError(value));
  }

  runIsFunction() {
    if (this.trace) {
      console.log("IS_FUNCTION");
    }
    const value = this.stack.pop();
    this.stack.push(isFunction(value));
  }

  runIsSequence() {
    if (this.trace) {
      console.log("IS_SEQUENCE");
    }
    const value = this.stack.pop();
    this.stack.push(isSequence(value));
  }

  runErrorIfInvalid() {
    if (this.trace) {
      console.log(
        `ERROR_IF_INVALID isArgument=${this.getDiagnostic().isArgument}`
      );
    }
    const schema = this.stack.pop();
    const isValid = this.stack.pop();
    const value = this.stack.at(-1);
    if (!isValid) {
      const kpcallback = (f, posArgs, namedArgs) =>
        this.callback(f, posArgs, namedArgs);
      try {
        if (this.getDiagnostic().isArgument) {
          transformError(
            () => validate(value, schema, kpcallback),
            argumentError
          );
        } else if (this.getDiagnostic().isArgumentPattern) {
          transformError(
            () => validate(value, schema, kpcallback),
            argumentPatternError
          );
        } else {
          validate(value, schema, kpcallback);
        }
      } catch (error) {
        if (isError(error)) {
          this.throw_(error);
        } else {
          throw error;
        }
      }
    }
  }

  next() {
    const value = this.instructions[this.cursor];
    this.cursor += 1;
    return value;
  }

  getDiagnostic() {
    return this.diagnostics[this.cursor - 1];
  }

  throw_(error) {
    if (this.trace) {
      console.log(toString(error));
    }
    while (
      this.scopeFrames.length > 0 &&
      this.scopeFrames.at(-1).recoveryIndex === undefined
    ) {
      const frame = this.scopeFrames.pop();
      this.stack.length = frame.stackIndex;
      if (
        this.callFrames.length > 0 &&
        this.callFrames.at(-1).stackIndex >= frame.stackIndex
      ) {
        this.callFrames.pop();
      }
    }
    if (this.scopeFrames.length === 0) {
      throw error;
    }
    this.stack.push(error);
    this.cursor = this.scopeFrames.at(-1).recoveryIndex;
  }
}

class Function {
  constructor(name, program, target, { isBuiltin }) {
    this.name = name;
    this.program = program;
    this.target = target;
    this.isBuiltin = isBuiltin;
    this.closure = [];
  }
}

class Upvalue {
  constructor(ref) {
    this.ref = ref;
  }

  close(value) {
    this.value = value;
  }
}

class ScopeFrame {
  constructor(stackIndex) {
    this.stackIndex = stackIndex;
  }

  setRecovery(index) {
    this.recoveryIndex = index;
  }
}

class CallFrame {
  constructor(stackIndex, returnIndex) {
    this.stackIndex = stackIndex;
    this.returnIndex = returnIndex;
  }
}
