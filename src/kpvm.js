import {
  ARRAY_CUT,
  ARRAY_EXTEND,
  ARRAY_POP,
  ARRAY_PUSH,
  DISCARD,
  LOCAL_SLOTS,
  OBJECT_MERGE,
  OBJECT_POP,
  OBJECT_PUSH,
  POP,
  PUSH,
  READ_LOCAL,
  READ_OUTER_LOCAL,
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

    this.instructionTable = [];
    this.instructionTable[VALUE] = this.runValue;
    this.instructionTable[DISCARD] = this.runDiscard;
    this.instructionTable[LOCAL_SLOTS] = this.runLocalSlots;
    this.instructionTable[WRITE_LOCAL] = this.runWriteLocal;
    this.instructionTable[READ_LOCAL] = this.runReadLocal;
    this.instructionTable[PUSH] = this.runPush;
    this.instructionTable[POP] = this.runPop;
    this.instructionTable[READ_OUTER_LOCAL] = this.runReadOuterLocal;
    this.instructionTable[ARRAY_PUSH] = this.runArrayPush;
    this.instructionTable[ARRAY_EXTEND] = this.runArrayExtend;
    this.instructionTable[ARRAY_POP] = this.runArrayPop;
    this.instructionTable[ARRAY_CUT] = this.runArrayCut;
    this.instructionTable[OBJECT_PUSH] = this.runObjectPush;
    this.instructionTable[OBJECT_MERGE] = this.runObjectMerge;
    this.instructionTable[OBJECT_POP] = this.runObjectPop;

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

  runLocalSlots() {
    const numSlots = this.next();
    if (this.trace) {
      console.log(`LOCAL_SLOTS ${numSlots}`);
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
      console.log(`Push frame at ${stackIndex}`);
    }
    this.scopeFrames.push({ stackIndex });
  }

  runPop() {
    const value = this.stack.pop();
    const frame = this.scopeFrames.pop();
    if (this.trace) {
      console.log(`Pop frame at ${frame.stackIndex}`);
    }
    this.stack.length = frame.stackIndex + 1;
    this.stack.push(value);
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
