import {
  indexArray,
  indexInstance,
  indexMapping,
  indexString,
  toArray,
  toObject,
} from "./builtins.js";
import * as op from "./instructions.js";
import kperror, {
  isError,
  KenpaliError,
  kptry,
  transformError,
} from "./kperror.js";
import kpobject, { kpoEntries } from "./kpobject.js";
import { isStream } from "./stream.js";
import validate, {
  argumentError,
  argumentPatternError,
  either,
  wrongType,
} from "./validate.js";
import {
  display,
  equals,
  functionName,
  instanceProtocol,
  isArray,
  isBoolean,
  isClass,
  isFunction,
  isInstance,
  isNull,
  isNumber,
  isObject,
  isPlatformFunction,
  isProtocol,
  isSequence,
  isString,
  isType,
  numberClass,
  objectClass,
  sequenceProtocol,
  stringClass,
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

export function kpcallbackInNewSession(f, posArgs, namedArgs) {
  return kpvmCall(f, posArgs, namedArgs, { timeLimitSeconds: 1 });
}

export class Vm {
  constructor(
    program,
    {
      trace = false,
      timeLimitSeconds = 0,
      stepLimit = 0,
      debugLog = console.error,
    } = {}
  ) {
    const { instructions, diagnostics = [], functions = [] } = program;
    this.program = program;
    this.instructions = instructions;
    this.diagnostics = diagnostics;
    this.functions = new Map(functions.map((f) => [f.name, f.offset]));
    this.methods = extractMethods(functions);
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
    this.instructionTable[op.PUSH_SCOPE] = this.runPushScope;
    this.instructionTable[op.POP_SCOPE] = this.runPopScope;
    this.instructionTable[op.READ_RELATIVE] = this.runReadRelative;
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
    this.instructionTable[op.OBJECT_KEYS] = this.runObjectKeys;
    this.instructionTable[op.OBJECT_VALUES] = this.runObjectValues;
    this.instructionTable[op.OBJECT_HAS] = this.runObjectHas;
    this.instructionTable[op.JUMP] = this.runJump;
    this.instructionTable[op.JUMP_IF_TRUE] = this.runJumpIfTrue;
    this.instructionTable[op.JUMP_IF_FALSE] = this.runJumpIfFalse;
    this.instructionTable[op.BEGIN] = this.runBegin;
    this.instructionTable[op.FUNCTION] = this.runFunction;
    this.instructionTable[op.CLOSURE] = this.runClosure;
    this.instructionTable[op.CALL] = this.runCall;
    this.instructionTable[op.CAPTURE] = this.runCapture;
    this.instructionTable[op.READ_UPVALUE] = this.runReadUpvalue;
    this.instructionTable[op.RETURN] = this.runReturn;
    this.instructionTable[op.CALL_BUILTIN] = this.runCallBuiltin;
    this.instructionTable[op.SELF] = this.runSelf;
    this.instructionTable[op.INDEX] = this.runIndex;
    this.instructionTable[op.EQUALS] = this.runEquals;
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
    this.instructionTable[op.IS_FUNCTION] = this.runIsFunction;
    this.instructionTable[op.IS_ERROR] = this.runIsError;
    this.instructionTable[op.IS_CLASS] = this.runIsClass;
    this.instructionTable[op.IS_PROTOCOL] = this.runIsProtocol;
    this.instructionTable[op.IS_SEQUENCE] = this.runIsSequence;
    this.instructionTable[op.IS_TYPE] = this.runIsType;
    this.instructionTable[op.IS_INSTANCE] = this.runIsInstance;
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
        -1 // Make run() return when this call finishes
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
      console.log(
        `Returning ${display(result, kpcallbackInNewSession)} from callback`
      );
    }
    this.scopeFrames.pop();
    this.stack.length = frameIndex;
    return result;
  }

  run() {
    while (this.cursor >= 0) {
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
            .map((value) =>
              value === undefined ? "-" : display(value, kpcallbackInNewSession)
            )
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
      this.logInstruction(`VALUE ${display(value, kpcallbackInNewSession)}`);
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

  runPushScope() {
    const offset = this.next();
    const stackIndex = this.stack.length - 1 + offset;
    if (this.trace) {
      this.logInstruction(`PUSH_SCOPE ${offset} (at ${stackIndex})`);
    }
    this.scopeFrames.push(new ScopeFrame(stackIndex));
  }

  runPopScope() {
    const frame = this.scopeFrames.pop();
    if (this.trace) {
      this.logInstruction(`POP_SCOPE (at ${frame.stackIndex})`);
    }
    this.stack.length = frame.stackIndex + 1;
  }

  runReadRelative() {
    const stepsOut = this.next();
    if (this.trace) {
      this.logInstruction(`READ_RELATIVE ${stepsOut}`);
    }
    const value = this.stack.at(-1 - stepsOut);
    this.stack.push(value);
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
    const sequence = this.stack.pop();
    let array;
    if (isArray(sequence)) {
      array = sequence;
    } else {
      this.pushCallFrame("$extendStream");
      array = toArray(sequence);
      this.popCallFrame();
    }
    this.stack.at(-1).push(...array);
  }

  runArrayReverse() {
    if (this.trace) {
      this.logInstruction("ARRAY_REVERSE");
    }
    if (isArray(this.stack.at(-1))) {
      this.stack.at(-1).reverse();
    }
  }

  runArrayPop() {
    if (this.trace) {
      this.logInstruction("ARRAY_POP");
    }
    const array = this.stack.at(-1);
    let value;
    if (isArray(array)) {
      value = array.pop();
    } else {
      const stream = this.stack.pop();
      if (!stream.properties.isEmpty()) {
        this.pushCallFrame("$popStream");
        value = stream.properties.value();
        this.stack.push(stream.properties.next());
        this.popCallFrame();
      }
    }
    if (value === undefined) {
      const source = this.stack.at(-2);
      const diagnostic = this.getDiagnostic();
      if (diagnostic) {
        if (diagnostic.isArgument) {
          this.throw_(kperror("missingArgument", ["name", diagnostic.name]));
          return;
        } else {
          this.throw_(
            kperror(
              "missingElement",
              ["value", source],
              ["name", diagnostic.name]
            )
          );
          return;
        }
      } else {
        this.throw_(kperror("missingElement", ["value", source]));
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
    const sequence = this.stack.pop();
    if (position === 0) {
      this.stack.push([]);
      this.stack.push(sequence);
    } else {
      let array;
      if (isArray(sequence)) {
        array = sequence;
      } else {
        this.pushCallFrame("$cutStream");
        array = toArray(sequence).reverse();
        this.popCallFrame();
      }
      this.stack.push(array.slice(0, position));
      this.stack.push(array.slice(position));
    }
  }

  runArrayCopy() {
    if (this.trace) {
      this.logInstruction("ARRAY_COPY");
    }
    const array = this.stack.pop();
    if (isArray(array)) {
      this.stack.push([...array]);
    } else {
      this.stack.push(array);
    }
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
    this.stack.push(kpobject(...kpoEntries(toObject(object))));
  }

  runObjectKeys() {
    if (this.trace) {
      this.logInstruction("OBJECT_KEYS");
    }
    const object = this.stack.pop();
    this.stack.push([...object.keys()]);
  }

  runObjectValues() {
    if (this.trace) {
      this.logInstruction("OBJECT_VALUES");
    }
    const object = this.stack.pop();
    this.stack.push([...object.values()]);
  }

  runObjectHas() {
    if (this.trace) {
      this.logInstruction("OBJECT_HAS");
    }
    const key = this.stack.pop();
    const object = this.stack.pop();
    this.stack.push(object.has(key));
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

  runBegin() {
    if (this.trace) {
      this.logInstruction("BEGIN");
    }
  }

  runFunction() {
    const target = this.next();
    const diagnostic = this.getDiagnostic();
    if (this.trace) {
      this.logInstruction(`FUNCTION ${target} (${diagnostic.name})`);
    }
    this.stack.push(
      new Function(diagnostic.name, this.program, target, {
        isPlatform: diagnostic.isPlatform,
      })
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
    } else if (isPlatformFunction(callee)) {
      this.callBuiltin(callee);
    } else {
      this.throw_(kperror("notCallable", ["value", callee]));
    }
  }

  callGiven(callee) {
    this.pushCallFrame(callee.name);
    const target = callee.target;
    if (this.trace) {
      console.log(`Jump to ${target}`);
    }
    this.cursor = target;
  }

  callBuiltin(callee) {
    const calleeName = functionName(callee);
    if (this.trace) {
      console.log(`Call builtin "${calleeName}"`);
    }
    this.pushCallFrame(calleeName);
    const namedArgs = this.stack.pop();
    const posArgs = this.stack.pop();
    const kpcallback = this.kpcallback.bind(this);
    try {
      const result = callee(posArgs, namedArgs, {
        kpcallback,
        debugLog: this.debugLog,
      });
      this.stack.pop(); // Discard called function
      this.stack.push(result);
      this.popCallFrame();
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
      if (value === undefined) {
        this.throw_(
          kperror("nameUsedBeforeAssignment", [
            "name",
            this.getDiagnostic().name,
          ])
        );
        return;
      }
    }
    this.stack.push(value);
  }

  runReturn() {
    if (this.trace) {
      this.logInstruction("RETURN");
    }
    if (this.callFrames.length === 0) {
      this.cursor = -1;
    } else {
      this.popCallFrame();
    }
    if (this.trace) {
      console.log(`Return to ${this.cursor}`);
    }
  }

  runCallBuiltin() {
    const calleeName = this.next();
    if (this.trace) {
      this.logInstruction(`CALL_BUILTIN ${calleeName}`);
    }
    const frameIndex = this.scopeFrames.at(-1).stackIndex;
    const callee = this.stack[frameIndex];
    this.pushCallFrame(calleeName);
    const args = this.stack.slice(frameIndex + 1);
    this.stack.length = frameIndex;
    const kpcallback = this.kpcallback.bind(this);
    const getMethod = this.getMethod.bind(this, calleeName);
    try {
      const result = callee(args, {
        kpcallback,
        debugLog: this.debugLog,
        getMethod,
      });
      this.stack.push(result);
      this.popCallFrame();
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

  runSelf() {
    if (this.trace) {
      this.logInstruction("SELF");
    }
    this.stack.push(this.stack.pop().self);
  }

  pushCallFrame(name) {
    const frameIndex = this.scopeFrames.at(-1).stackIndex;
    this.callFrames.push(new CallFrame(name, frameIndex, this.cursor));
  }

  popCallFrame() {
    const callFrame = this.callFrames.pop();
    this.cursor = callFrame.returnIndex;
  }

  kpcallback(f, posArgs, namedArgs) {
    if (typeof f === "function") {
      return f(posArgs, namedArgs, {
        kpcallback: this.kpcallback.bind(this),
        debugLog: this.debugLog,
      });
    } else {
      return this.callback(f, posArgs, namedArgs);
    }
  }

  getMethod(constructorName, name) {
    const methods = this.methods.get(constructorName);
    if (methods && methods.has(name)) {
      const target = this.functions.get(`${constructorName}/${name}`);
      return new Function(`${constructorName}/${name}`, this.program, target, {
        isPlatform: true,
      });
    }
    throw new Error(`Method ${constructorName}/${name} not found`);
  }

  runEquals() {
    if (this.trace) {
      this.logInstruction("EQUALS");
    }
    const right = this.stack.pop();
    const left = this.stack.pop();
    this.stack.push(equals(left, right));
  }

  runIndex() {
    if (this.trace) {
      this.logInstruction("INDEX");
    }
    const index = this.stack.pop();
    const collection = this.stack.pop();
    if (isString(collection)) {
      this.indexString(collection, index);
    } else if (isArray(collection)) {
      this.indexArray(collection, index);
    } else if (isStream(collection)) {
      this.indexStream(collection, index);
    } else if (isObject(collection)) {
      this.indexObject(collection, index);
    } else if (isInstance(collection)) {
      this.indexInstance(collection, index);
    } else {
      this.throw_(
        wrongType(
          collection,
          either(sequenceProtocol, objectClass, instanceProtocol)
        )
      );
    }
  }

  indexString(string, index) {
    if (!isNumber(index)) {
      this.throw_(wrongType(index, numberClass));
      return;
    }
    kptry(
      () => indexString(string, index),
      (error) => {
        this.throw_(error);
      },
      (result) => {
        this.stack.push(result);
      }
    );
  }

  indexArray(array, index) {
    if (!isNumber(index)) {
      this.throw_(wrongType(index, numberClass));
      return;
    }
    kptry(
      () => indexArray(array, index),
      (error) => {
        this.throw_(error);
      },
      (result) => {
        this.stack.push(result);
      }
    );
  }

  indexStream(stream, index) {
    if (isNumber(index)) {
      if (this.trace) {
        console.log(`Indexing a stream with ${index}`);
      }
      this.pushCallFrame("$indexStream");
      if (index < 0) {
        kptry(
          () => indexArray(toArray(stream), index),
          (error) => {
            this.throw_(error);
          },
          (result) => {
            this.stack.push(result);
          }
        );
      } else if (index > 0) {
        let last;
        let current = stream;
        let j = 0;
        while (!current.properties.isEmpty() && j < index) {
          last = current;
          j += 1;
          if (j === index) {
            this.stack.push(last.properties.value());
            break;
          }
          current = current.properties.next();
        }
        if (j < index) {
          this.throw_(
            kperror(
              "indexOutOfBounds",
              ["value", stream],
              ["length", j],
              ["index", index]
            )
          );
          return;
        }
      } else {
        this.throw_(
          kperror("indexOutOfBounds", ["value", stream], ["index", 0])
        );
        return;
      }
      this.popCallFrame();
      if (this.trace) {
        console.log(`Return to ${this.cursor} from stream indexing`);
      }
    } else if (isString(index)) {
      return this.indexInstance(stream, index);
    } else {
      this.throw_(wrongType(index, either(numberClass, stringClass)));
    }
  }

  indexObject(object, index) {
    if (!isString(index)) {
      this.throw_(wrongType(index, stringClass));
      return;
    }
    kptry(
      () => indexMapping(object, index),
      (error) => {
        this.throw_(error);
      },
      (result) => {
        this.stack.push(result);
      }
    );
  }

  indexInstance(instance, index) {
    if (!isString(index)) {
      this.throw_(wrongType(index, stringClass));
      return;
    }
    kptry(
      () => indexInstance(instance, index),
      (error) => {
        this.throw_(error);
      },
      (result) => {
        this.stack.push(result);
      }
    );
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

  runIsFunction() {
    if (this.trace) {
      this.logInstruction("IS_FUNCTION");
    }
    const value = this.stack.pop();
    this.stack.push(isFunction(value));
  }

  runIsError() {
    if (this.trace) {
      this.logInstruction("IS_ERROR");
    }
    const value = this.stack.pop();
    this.stack.push(isError(value));
  }

  runIsClass() {
    if (this.trace) {
      this.logInstruction("IS_CLASS");
    }
    const value = this.stack.pop();
    this.stack.push(isClass(value));
  }

  runIsProtocol() {
    if (this.trace) {
      this.logInstruction("IS_PROTOCOL");
    }
    const value = this.stack.pop();
    this.stack.push(isProtocol(value));
  }

  runIsSequence() {
    if (this.trace) {
      this.logInstruction("IS_SEQUENCE");
    }
    const value = this.stack.pop();
    this.stack.push(isSequence(value));
  }

  runIsType() {
    if (this.trace) {
      this.logInstruction("IS_TYPE");
    }
    const value = this.stack.pop();
    this.stack.push(isType(value));
  }

  runIsInstance() {
    if (this.trace) {
      this.logInstruction("IS_INSTANCE");
    }
    const value = this.stack.pop();
    this.stack.push(isInstance(value));
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
      const kpcallback = this.kpcallback.bind(this);
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
      console.log(display(error, kpcallbackInNewSession));
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
        error.properties.calls.push(kpobject(["function", callFrame.name]));
        if (callFrame.returnIndex < 0) {
          // We've unwound to a callback boundary, throw the error to the caller
          throw error;
        }
      }
    }
    if (this.scopeFrames.length === 0) {
      throw new KenpaliError(error, kpcallbackInNewSession);
    }
    this.stack.push(error);
    this.cursor = this.scopeFrames.at(-1).recoveryIndex();
  }
}

function extractMethods(functions) {
  const functionSet = new Set(functions.map((f) => f.name));
  const methods = new Map();
  for (const f of functions) {
    const enclosingName = f.name.split("/").slice(0, -1).join("/");
    const methodName = f.name.split("/").at(-1);
    if (functionSet.has(enclosingName)) {
      if (!methods.has(enclosingName)) {
        methods.set(enclosingName, new Set());
      }
      methods.get(enclosingName).add(methodName);
    }
  }
  return methods;
}

class Function {
  constructor(name, program, target, { isPlatform }) {
    this.name = name;
    this.program = program;
    this.target = target;
    this.isPlatform = isPlatform;
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
