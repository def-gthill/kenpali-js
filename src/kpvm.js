import { indexArray, indexMapping } from "./builtins.js";
import * as op from "./instructions.js";
import kperror, { kpcatch, transformError } from "./kperror.js";
import kpobject, { kpoEntries } from "./kpobject.js";
import validate, {
  argumentError,
  argumentPatternError,
  either,
} from "./validate.js";
import {
  functionName,
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
  isStream,
  isString,
  toString,
} from "./values.js";

export default function kpvm(
  program,
  {
    trace = false,
    timeLimitSeconds = 0,
    stepLimit = 0,
    debugLog = console.error,
  } = {}
) {
  return new Vm(program, {
    trace,
    timeLimitSeconds,
    stepLimit,
    debugLog,
  }).run();
}

export function kpvmCall(
  kpf,
  posArgs,
  namedArgs,
  {
    trace = false,
    timeLimitSeconds = 0,
    stepLimit = 0,
    debugLog = console.error,
  } = {}
) {
  return new Vm(kpf.program, {
    trace,
    timeLimitSeconds,
    stepLimit,
    debugLog,
  }).callback(kpf, posArgs, namedArgs);
}

export class Vm {
  constructor(
    { instructions, diagnostics = [] },
    {
      trace = false,
      timeLimitSeconds = 0,
      stepLimit = 0,
      debugLog = console.error,
    } = {}
  ) {
    this.instructions = instructions;
    this.diagnostics = diagnostics;
    this.trace = trace;
    this.stepLimit = stepLimit;
    this.timeLimitSeconds = timeLimitSeconds;
    this.startTime = Date.now();
    this.stepNumber = 0;
    this.debugLog = debugLog;

    this.cursor = 0;
    this.instructionStart = 0;
    this.stack = [];
    this.scopeFrames = [new ScopeFrame(0)];
    this.callFrames = [];
    this.openUpvalues = [];

    this.instructionTable = [];
    this.instructionTable[op.VALUE] = this.runValue;
    this.instructionTable[op.ALIAS] = this.runAlias;
    this.instructionTable[op.DISCARD] = this.runDiscard;
    this.instructionTable[op.RESERVE] = this.runReserve;
    this.instructionTable[op.WRITE_LOCAL] = this.runWriteLocal;
    this.instructionTable[op.READ_LOCAL] = this.runReadLocal;
    this.instructionTable[op.PUSH] = this.runPush;
    this.instructionTable[op.POP] = this.runPop;
    this.instructionTable[op.EMPTY_ARRAY] = this.runEmptyArray;
    this.instructionTable[op.ARRAY_PUSH] = this.runArrayPush;
    this.instructionTable[op.ARRAY_EXTEND] = this.runArrayExtend;
    this.instructionTable[op.ARRAY_REVERSE] = this.runArrayReverse;
    this.instructionTable[op.ARRAY_POP] = this.runArrayPop;
    this.instructionTable[op.ARRAY_POP_OR_DEFAULT] = this.runArrayPopOrDefault;
    this.instructionTable[op.ARRAY_CUT] = this.runArrayCut;
    this.instructionTable[op.ARRAY_COPY] = this.runArrayCopy;
    this.instructionTable[op.ARRAY_IS_EMPTY] = this.runArrayIsEmpty;
    this.instructionTable[op.EMPTY_OBJECT] = this.runEmptyObject;
    this.instructionTable[op.OBJECT_PUSH] = this.runObjectPush;
    this.instructionTable[op.OBJECT_MERGE] = this.runObjectMerge;
    this.instructionTable[op.OBJECT_POP] = this.runObjectPop;
    this.instructionTable[op.OBJECT_POP_OR_DEFAULT] =
      this.runObjectPopOrDefault;
    this.instructionTable[op.OBJECT_COPY] = this.runObjectCopy;
    this.instructionTable[op.JUMP] = this.runJump;
    this.instructionTable[op.JUMP_IF_TRUE] = this.runJumpIfTrue;
    this.instructionTable[op.JUMP_IF_FALSE] = this.runJumpIfFalse;
    this.instructionTable[op.FUNCTION] = this.runFunction;
    this.instructionTable[op.CLOSURE] = this.runClosure;
    this.instructionTable[op.CALL] = this.runCall;
    this.instructionTable[op.CAPTURE] = this.runCapture;
    this.instructionTable[op.READ_UPVALUE] = this.runReadUpvalue;
    this.instructionTable[op.RETURN] = this.runReturn;
    this.instructionTable[op.CALL_BUILTIN] = this.runCallBuiltin;
    this.instructionTable[op.INDEX] = this.runIndex;
    this.instructionTable[op.THROW] = this.runThrow;
    this.instructionTable[op.CATCH] = this.runCatch;
    this.instructionTable[op.UNCATCH] = this.runUncatch;
    this.instructionTable[op.IS_NULL] = this.runIsNull;
    this.instructionTable[op.IS_BOOLEAN] = this.runIsBoolean;
    this.instructionTable[op.IS_NUMBER] = this.runIsNumber;
    this.instructionTable[op.IS_STRING] = this.runIsString;
    this.instructionTable[op.IS_ARRAY] = this.runIsArray;
    this.instructionTable[op.IS_STREAM] = this.runIsStream;
    this.instructionTable[op.IS_OBJECT] = this.runIsObject;
    this.instructionTable[op.IS_BUILTIN] = this.runIsBuiltin;
    this.instructionTable[op.IS_GIVEN] = this.runIsGiven;
    this.instructionTable[op.IS_ERROR] = this.runIsError;
    this.instructionTable[op.IS_FUNCTION] = this.runIsFunction;
    this.instructionTable[op.IS_SEQUENCE] = this.runIsSequence;
    this.instructionTable[op.ERROR_IF_INVALID] = this.runErrorIfInvalid;

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
        functionName(f),
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
      this.stepNumber += 1;
      if (this.stepLimit > 0 && this.stepNumber >= this.stepLimit) {
        this.throw_("stepLimitExceeded", ["stepLimit", this.stepLimit]);
      }
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
      this.throw_(
        kperror("timeLimitExceeded", [
          "timeLimitSeconds",
          this.timeLimitSeconds,
        ])
      );
    }
  }

  runInstruction() {
    if (this.trace) {
      this.instructionStart = this.cursor;
    }
    const instructionType = this.next();
    if (!this.instructionTable[instructionType]) {
      throw new Error(`Unknown instruction ${instructionType}`);
    }
    this.instructionTable[instructionType]();
  }

  logInstruction(message) {
    console.log(`${this.instructionStart} ${message}`);
  }

  runValue() {
    const value = this.next();
    if (this.trace) {
      this.logInstruction(`VALUE ${toString(value)}`);
    }
    this.stack.push(value);
  }

  runAlias() {
    if (this.trace) {
      this.logInstruction("ALIAS");
    }
    this.stack.push(this.stack.at(-1));
  }

  runDiscard() {
    if (this.trace) {
      this.logInstruction("DISCARD");
    }
    this.stack.pop();
  }

  runReserve() {
    const numSlots = this.next();
    if (this.trace) {
      this.logInstruction(`RESERVE ${numSlots}`);
    }
    for (let i = 0; i < numSlots; i++) {
      this.stack.push(undefined);
    }
  }

  runWriteLocal() {
    const localIndex = this.next();
    if (this.trace) {
      this.logInstruction(
        `WRITE_LOCAL ${localIndex} (${this.getDiagnostic().name})`
      );
    }
    const absoluteIndex = this.scopeFrames.at(-1).stackIndex + localIndex;
    const value = this.stack.pop();
    this.stack[absoluteIndex] = value;
  }

  runReadLocal() {
    const stepsOut = this.next();
    const localIndex = this.next();
    if (this.trace) {
      this.logInstruction(
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
      this.logInstruction(`PUSH ${offset} (at ${stackIndex})`);
    }
    this.scopeFrames.push(new ScopeFrame(stackIndex));
  }

  runPop() {
    const frame = this.scopeFrames.pop();
    if (this.trace) {
      this.logInstruction(`POP (at ${frame.stackIndex})`);
    }
    this.stack.length = frame.stackIndex + 1;
  }

  runEmptyArray() {
    if (this.trace) {
      this.logInstruction("EMPTY_ARRAY");
    }
    this.stack.push([]);
  }

  runArrayPush() {
    if (this.trace) {
      this.logInstruction("ARRAY_PUSH");
    }
    const value = this.stack.pop();
    this.stack.at(-1).push(value);
  }

  runArrayExtend() {
    if (this.trace) {
      this.logInstruction("ARRAY_EXTEND");
    }
    const value = this.stack.pop();
    this.stack.at(-1).push(...value);
  }

  runArrayReverse() {
    if (this.trace) {
      this.logInstruction("ARRAY_REVERSE");
    }
    this.stack.at(-1).reverse();
  }

  runArrayPop() {
    if (this.trace) {
      this.logInstruction("ARRAY_POP");
    }
    const array = this.stack.at(-1);
    const value = array.pop();
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
              ["value", array],
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
      this.logInstruction("ARRAY_POP_OR_DEFAULT");
    }
    const defaultValue = this.stack.pop();
    const value =
      this.stack.at(-1).length > 0 ? this.stack.at(-1).pop() : defaultValue;
    this.stack.push(value);
  }

  runArrayCut() {
    const position = this.next();
    if (this.trace) {
      this.logInstruction(`ARRAY_CUT ${position}`);
    }
    const array = this.stack.pop();
    this.stack.push(array.slice(0, position));
    this.stack.push(array.slice(position));
  }

  runArrayCopy() {
    if (this.trace) {
      this.logInstruction("ARRAY_COPY");
    }
    const array = this.stack.pop();
    this.stack.push([...array]);
  }

  runArrayIsEmpty() {
    if (this.trace) {
      this.logInstruction("ARRAY_IS_EMPTY");
    }
    const array = this.stack.pop();
    this.stack.push(array.length === 0);
  }

  runEmptyObject() {
    if (this.trace) {
      this.logInstruction("EMPTY_OBJECT");
    }
    this.stack.push(kpobject());
  }

  runObjectPush() {
    if (this.trace) {
      this.logInstruction("OBJECT_PUSH");
    }
    const value = this.stack.pop();
    const key = this.stack.pop();
    this.stack.at(-1).set(key, value);
  }

  runObjectMerge() {
    if (this.trace) {
      this.logInstruction("OBJECT_MERGE");
    }
    const object = this.stack.pop();
    for (const [key, value] of object) {
      this.stack.at(-1).set(key, value);
    }
  }

  runObjectPop() {
    if (this.trace) {
      this.logInstruction("OBJECT_POP");
    }
    const key = this.stack.pop();
    const collection = this.stack.at(-1);
    const value = collection.get(key);
    if (value === undefined) {
      const diagnostic = this.getDiagnostic();
      if (diagnostic) {
        if (diagnostic.isArgument) {
          this.throw_(kperror("missingArgument", ["name", key]));
          return;
        } else {
          this.throw_(
            kperror("missingProperty", ["value", collection], ["key", key])
          );
          return;
        }
      } else {
        this.throw_(
          kperror("missingProperty", ["value", collection], ["key", key])
        );
        return;
      }
    }
    this.stack.at(-1).delete(key);
    this.stack.push(value);
  }

  runObjectPopOrDefault() {
    if (this.trace) {
      this.logInstruction("OBJECT_POP_OR_DEFAULT");
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
      this.logInstruction("OBJECT_COPY");
    }
    const object = this.stack.pop();
    this.stack.push(kpobject(...kpoEntries(object)));
  }

  runJump() {
    const distance = this.next();
    if (this.trace) {
      this.logInstruction(`JUMP ${distance}`);
    }
    this.cursor += distance;
  }

  runJumpIfTrue() {
    const distance = this.next();
    if (this.trace) {
      this.logInstruction(`JUMP_IF_TRUE ${distance}`);
    }
    const condition = this.stack.pop();
    if (condition) {
      this.cursor += distance;
    }
  }

  runJumpIfFalse() {
    const distance = this.next();
    if (this.trace) {
      this.logInstruction(`JUMP_IF_FALSE ${distance}`);
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
      this.logInstruction(`FUNCTION ${target} (${diagnostic.name})`);
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
      this.logInstruction(`CLOSURE ${stepsOut} ${index}`);
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
      this.logInstruction("CALL");
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
      new CallFrame(
        callee.name,
        this.scopeFrames.at(-1).stackIndex,
        this.cursor
      )
    );
    const target = callee.target;
    if (this.trace) {
      console.log(`Jump to ${target}`);
    }
    this.cursor = target;
  }

  callBuiltin(callee) {
    if (this.trace) {
      console.log(`Call builtin "${functionName(callee)}"`);
    }
    this.callFrames.push(
      new CallFrame(
        functionName(callee),
        this.scopeFrames.at(-1).stackIndex,
        this.cursor
      )
    );
    const namedArgs = this.stack.pop();
    const posArgs = this.stack.pop();
    const kpcallback = (f, posArgs, namedArgs) => {
      if (isBuiltin(f)) {
        return f(posArgs, namedArgs, kpcallback, { debugLog: this.debugLog });
      } else {
        return this.callback(f, posArgs, namedArgs);
      }
    };
    try {
      const result = callee(posArgs, namedArgs, kpcallback, {
        debugLog: this.debugLog,
      });
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
      this.logInstruction("CAPTURE");
    }
    const value = this.stack.pop();
    this.openUpvalues[this.stack.length].close(value);
    delete this.openUpvalues[this.stack.length];
  }

  runReadUpvalue() {
    const upvalueIndex = this.next();
    if (this.trace) {
      this.logInstruction(
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
      this.logInstruction("RETURN");
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
      this.logInstruction("CALL_BUILTIN");
    }
    const frameIndex = this.scopeFrames.at(-1).stackIndex;
    const callee = this.stack[frameIndex];
    this.callFrames.push(
      new CallFrame(functionName(callee), frameIndex, this.cursor)
    );
    const args = this.stack.slice(frameIndex + 1);
    this.stack.length = frameIndex;
    const kpcallback = (f, posArgs, namedArgs) => {
      if (typeof f === "function") {
        return f(posArgs, namedArgs, kpcallback, { debugLog: this.debugLog });
      } else {
        return this.callback(f, posArgs, namedArgs);
      }
    };
    try {
      const result = callee(args, kpcallback, { debugLog: this.debugLog });
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
      this.logInstruction("INDEX");
    }
    const index = this.stack.pop();
    const collection = this.stack.pop();
    if (isString(collection) || isArray(collection)) {
      if (!isNumber(index)) {
        this.throw_(
          kperror("wrongType", ["value", index], ["expectedType", "number"])
        );
        return;
      }
      const result = kpcatch(() => indexArray(collection, index));
      if (isError(result)) {
        this.throw_(result);
        return;
      }
      this.stack.push(result);
    } else if (isObject(collection)) {
      if (!isString(index)) {
        this.throw_(
          kperror("wrongType", ["value", index], ["expectedType", "string"])
        );
        return;
      }
      const result = kpcatch(() => indexMapping(collection, index));
      if (isError(result)) {
        this.throw_(result);
        return;
      }
      this.stack.push(result);
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

  runThrow() {
    if (this.trace) {
      this.logInstruction("THROW");
    }
    this.throw_(this.stack.pop());
  }

  runCatch() {
    const recoveryOffset = this.next();
    if (this.trace) {
      this.logInstruction(`CATCH ${recoveryOffset}`);
    }
    this.scopeFrames.at(-1).pushRecovery(this.cursor + recoveryOffset);
  }

  runUncatch() {
    if (this.trace) {
      this.logInstruction("UNCATCH");
    }
    this.scopeFrames.at(-1).popRecovery();
  }

  runIsNull() {
    if (this.trace) {
      this.logInstruction("IS_NULL");
    }
    const value = this.stack.pop();
    this.stack.push(isNull(value));
  }

  runIsBoolean() {
    if (this.trace) {
      this.logInstruction("IS_BOOLEAN");
    }
    const value = this.stack.pop();
    this.stack.push(isBoolean(value));
  }

  runIsNumber() {
    if (this.trace) {
      this.logInstruction("IS_NUMBER");
    }
    const value = this.stack.pop();
    this.stack.push(isNumber(value));
  }

  runIsString() {
    if (this.trace) {
      this.logInstruction("IS_STRING");
    }
    const value = this.stack.pop();
    this.stack.push(isString(value));
  }

  runIsArray() {
    if (this.trace) {
      this.logInstruction("IS_ARRAY");
    }
    const value = this.stack.pop();
    this.stack.push(isArray(value));
  }

  runIsStream() {
    if (this.trace) {
      this.logInstruction("IS_STREAM");
    }
    const value = this.stack.pop();
    this.stack.push(isStream(value));
  }

  runIsObject() {
    if (this.trace) {
      this.logInstruction("IS_OBJECT");
    }
    const value = this.stack.pop();
    this.stack.push(isObject(value));
  }

  runIsBuiltin() {
    if (this.trace) {
      this.logInstruction("IS_BUILTIN");
    }
    const value = this.stack.pop();
    this.stack.push(isBuiltin(value));
  }

  runIsGiven() {
    if (this.trace) {
      this.logInstruction("IS_GIVEN");
    }
    const value = this.stack.pop();
    this.stack.push(isGiven(value));
  }

  runIsError() {
    if (this.trace) {
      this.logInstruction("IS_ERROR");
    }
    const value = this.stack.pop();
    this.stack.push(isError(value));
  }

  runIsFunction() {
    if (this.trace) {
      this.logInstruction("IS_FUNCTION");
    }
    const value = this.stack.pop();
    this.stack.push(isFunction(value));
  }

  runIsSequence() {
    if (this.trace) {
      this.logInstruction("IS_SEQUENCE");
    }
    const value = this.stack.pop();
    this.stack.push(isSequence(value));
  }

  runErrorIfInvalid() {
    if (this.trace) {
      this.logInstruction(
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
      this.scopeFrames.at(-1).recoveryIndex() === undefined
    ) {
      const frame = this.scopeFrames.pop();
      this.stack.length = frame.stackIndex;
      if (
        this.callFrames.length > 0 &&
        this.callFrames.at(-1).stackIndex >= frame.stackIndex
      ) {
        const callFrame = this.callFrames.pop();
        error.calls.push(kpobject(["function", callFrame.name]));
      }
    }
    if (this.scopeFrames.length === 0) {
      throw error;
    }
    this.stack.push(error);
    this.cursor = this.scopeFrames.at(-1).recoveryIndex();
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
    this.recoveryStack = [];
  }

  pushRecovery(index) {
    this.recoveryStack.push(index);
  }

  popRecovery() {
    this.recoveryStack.pop();
  }

  recoveryIndex() {
    return this.recoveryStack.at(-1);
  }
}

class CallFrame {
  constructor(name, stackIndex, returnIndex) {
    this.name = name;
    this.stackIndex = stackIndex;
    this.returnIndex = returnIndex;
  }
}
