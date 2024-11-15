import {
  ARRAY_CUT,
  ARRAY_EXTEND,
  ARRAY_POP,
  ARRAY_POP_OR_DEFAULT,
  ARRAY_PUSH,
  CALL,
  CAPTURE,
  CLOSURE,
  DISCARD,
  FUNCTION,
  OBJECT_MERGE,
  OBJECT_POP,
  OBJECT_PUSH,
  POP,
  PUSH,
  READ_LOCAL,
  READ_OUTER_LOCAL,
  READ_UPVALUE,
  RESERVE,
  RETURN,
  VALUE,
  WRITE_LOCAL,
} from "./instructions.js";
import kperror from "./kperror.js";
import { toString } from "./values.js";

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
    this.scopeFrames = [];
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
    this.instructionTable[READ_OUTER_LOCAL] = this.runReadOuterLocal;
    this.instructionTable[ARRAY_PUSH] = this.runArrayPush;
    this.instructionTable[ARRAY_EXTEND] = this.runArrayExtend;
    this.instructionTable[ARRAY_POP] = this.runArrayPop;
    this.instructionTable[ARRAY_POP_OR_DEFAULT] = this.runArrayPopOrDefault;
    this.instructionTable[ARRAY_CUT] = this.runArrayCut;
    this.instructionTable[OBJECT_PUSH] = this.runObjectPush;
    this.instructionTable[OBJECT_MERGE] = this.runObjectMerge;
    this.instructionTable[OBJECT_POP] = this.runObjectPop;
    this.instructionTable[FUNCTION] = this.runFunction;
    this.instructionTable[CLOSURE] = this.runClosure;
    this.instructionTable[CALL] = this.runCall;
    this.instructionTable[CAPTURE] = this.runCapture;
    this.instructionTable[READ_UPVALUE] = this.runReadUpvalue;
    this.instructionTable[RETURN] = this.runReturn;

    for (let i = 0; i < this.instructionTable.length; i++) {
      if (this.instructionTable[i]) {
        this.instructionTable[i] = this.instructionTable[i].bind(this);
      }
    }
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
    return this.stack[0];
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
    const localIndex = this.next();
    if (this.trace) {
      console.log(`READ_LOCAL ${localIndex} (${this.getDiagnostic().name})`);
    }
    const absoluteIndex = this.scopeFrames.at(-1).stackIndex + localIndex;
    const value = this.stack[absoluteIndex];
    if (value === undefined) {
      this.throw_(
        kperror("nameUsedBeforeAssignment", ["name", this.getDiagnostic().name])
      );
    }
    this.stack.push(value);
  }

  runPush() {
    const stackIndex = this.stack.length - 1;
    if (this.trace) {
      console.log(`PUSH (at ${stackIndex})`);
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

  runReadOuterLocal() {
    const stepsOut = this.next();
    const localIndex = this.next();
    if (this.trace) {
      console.log(
        `READ_OUTER_LOCAL ${stepsOut} ${localIndex} (${
          this.getDiagnostic().name
        })`
      );
    }
    const absoluteIndex =
      this.scopeFrames.at(-1 - stepsOut).stackIndex + localIndex;
    const value = this.stack[absoluteIndex];
    if (value === undefined) {
      this.throw_(
        kperror("nameUsedBeforeAssignment", ["name", this.getDiagnostic().name])
      );
    }
    this.stack.push(value);
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
        } else {
          this.throw_(kperror("missingElement", ["name", diagnostic.name]));
        }
      } else {
        this.throw_(kperror("missingElement"));
      }
    }
    this.stack.push(value);
  }

  runArrayPopOrDefault() {
    if (this.trace) {
      console.log("ARRAY_POP_OR_DEFAULT");
    }
    const defaultValue = this.stack.pop();
    const value = this.stack.at(-1).pop() ?? defaultValue;
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

  runFunction() {
    const target = this.next();
    if (this.trace) {
      console.log(`FUNCTION ${target}`);
    }
    this.stack.push(new Function(target));
  }

  runClosure() {
    const stepsOut = this.next();
    const localIndex = this.next();
    if (this.trace) {
      console.log(`CLOSURE ${stepsOut} ${localIndex}`);
    }
    const f = this.stack.at(-1);
    const absoluteIndex =
      this.scopeFrames.at(-1 - stepsOut).stackIndex + localIndex;
    let upvalue;
    if (this.openUpvalues[absoluteIndex]) {
      upvalue = this.openUpvalues[absoluteIndex];
    } else {
      upvalue = new Upvalue(absoluteIndex);
      this.openUpvalues[absoluteIndex] = upvalue;
    }
    f.closure.push(upvalue);
  }

  runCall() {
    if (this.trace) {
      console.log("CALL");
    }
    this.callFrames.push({
      stackIndex: this.scopeFrames.at(-1).stackIndex,
      returnIndex: this.cursor,
    });
    const callee = this.stack.at(-3);
    if (typeof callee !== "object" || !("target" in callee)) {
      this.throw_(kperror("notCallable", ["value", callee]));
    }
    const target = callee.target;
    if (this.trace) {
      console.log(`Jump to ${target}`);
    }
    this.cursor = target;
  }

  runCapture() {
    if (this.trace) {
      console.log("CAPTURE");
    }
    const value = this.stack.pop();
    this.openUpvalues[this.stack.length].close(value);
    delete this.openUpvalues[this.stack.length - 1];
  }

  runReadUpvalue() {
    const upvalueIndex = this.next();
    if (this.trace) {
      console.log(
        `READ_UPVALUE ${upvalueIndex} (${this.getDiagnostic().name})`
      );
    }
    const f = this.stack[this.callFrames.at(-1).stackIndex];
    const upvalue = f.closure[upvalueIndex];
    let value;
    if ("value" in upvalue) {
      value = upvalue.value;
    } else {
      value = this.stack[upvalue.absoluteIndex];
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
    throw error;
  }
}

class Function {
  constructor(target) {
    this.target = target;
    this.closure = [];
  }
}

class Upvalue {
  constructor(absoluteIndex) {
    this.absoluteIndex = absoluteIndex;
  }

  close(value) {
    this.value = value;
  }
}

class ScopeFrame {
  constructor(stackIndex) {
    this.stackIndex = stackIndex;
  }
}
