import { callBuiltin } from "./evalClean.js";
import {
  ARRAY_COPY,
  ARRAY_CUT,
  ARRAY_EXTEND,
  ARRAY_POP,
  ARRAY_POP_OR_DEFAULT,
  ARRAY_PUSH,
  ARRAY_REVERSE,
  CALL,
  CAPTURE,
  CATCH,
  CLOSURE,
  DISCARD,
  EMPTY_ARRAY,
  EMPTY_OBJECT,
  FUNCTION,
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
import kperror from "./kperror.js";
import kpobject, { kpoEntries } from "./kpobject.js";
import { isBuiltin, isError, toString } from "./values.js";

export default function kpvm(program, { trace = false } = {}) {
  return new Vm(program, { trace }).run();
}

class Vm {
  constructor({ instructions, diagnostics = [] }, { trace = false } = {}) {
    this.instructions = instructions;
    this.diagnostics = diagnostics;
    this.trace = trace;
    this.cursor = 0;
    this.stack = [];
    this.scopeFrames = [new ScopeFrame(0)];
    this.callFrames = [];
    this.openUpvalues = [];

    this.instructionTable = [];
    this.instructionTable[VALUE] = this.runValue;
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
    this.instructionTable[EMPTY_OBJECT] = this.runEmptyObject;
    this.instructionTable[OBJECT_PUSH] = this.runObjectPush;
    this.instructionTable[OBJECT_MERGE] = this.runObjectMerge;
    this.instructionTable[OBJECT_POP] = this.runObjectPop;
    this.instructionTable[OBJECT_POP_OR_DEFAULT] = this.runObjectPopOrDefault;
    this.instructionTable[OBJECT_COPY] = this.runObjectCopy;
    this.instructionTable[FUNCTION] = this.runFunction;
    this.instructionTable[CLOSURE] = this.runClosure;
    this.instructionTable[CALL] = this.runCall;
    this.instructionTable[CAPTURE] = this.runCapture;
    this.instructionTable[READ_UPVALUE] = this.runReadUpvalue;
    this.instructionTable[RETURN] = this.runReturn;
    this.instructionTable[CATCH] = this.runCatch;

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
        console.log(
          `Stack: [${this.stack
            .map((value) => (value === undefined ? "-" : toString(value)))
            .join(", ")}]`
        );
      }
    }
    return this.stack.at(-1);
  }

  runInstruction() {
    const instructionType = this.next();
    this.instructionTable[instructionType]();
  }

  runValue() {
    const value = this.next();
    if (this.trace) {
      console.log(`VALUE ${toString(value)}`);
    }
    this.stack.push(value);
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
          this.throw_(kperror("missingElement", ["name", diagnostic.name]));
          return;
        }
      } else {
        this.throw_(kperror("missingElement"));
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
    this.stack.at(-1).delete(key);
    this.stack.push(value);
  }

  runObjectPopOrDefault() {
    if (this.trace) {
      console.log("OBJECT_POP");
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

  runFunction() {
    const target = this.next();
    if (this.trace) {
      console.log(`FUNCTION ${target}`);
    }
    this.stack.push(new Function(target));
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
      console.log(`Call builtin "${callee.builtinName}"`);
    }
    this.callFrames.push(
      new CallFrame(this.scopeFrames.at(-1).stackIndex, this.cursor)
    );
    const namedArgs = this.stack.pop();
    const posArgs = this.stack.pop();
    const kpcallback = (f, posArgs, namedArgs) => {
      if (isBuiltin(f)) {
        return callBuiltin(f, posArgs, namedArgs, kpcallback);
      } else {
        return this.callback(f, posArgs, namedArgs);
      }
    };
    try {
      const result = callBuiltin(callee, posArgs, namedArgs, kpcallback);
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

  runCatch() {
    const recoveryOffset = this.next();
    if (this.trace) {
      console.log(`CATCH ${recoveryOffset}`);
    }
    this.scopeFrames.at(-1).setRecovery(this.cursor + recoveryOffset);
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
  constructor(target) {
    this.target = target;
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
