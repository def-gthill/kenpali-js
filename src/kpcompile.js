import {
  ARRAY_CUT,
  ARRAY_EXTEND,
  ARRAY_POP,
  ARRAY_POP_OR_DEFAULT,
  ARRAY_PUSH,
  CALL,
  DISCARD,
  FUNCTION,
  LOCAL_SLOTS,
  OBJECT_MERGE,
  OBJECT_POP,
  OBJECT_PUSH,
  POP,
  PUSH,
  READ_LOCAL,
  READ_OUTER_LOCAL,
  RETURN,
  VALUE,
  WRITE_LOCAL,
  disassemble,
} from "./instructions.js";
import kperror from "./kperror.js";
import kpobject from "./kpobject.js";

export function kpcompileJson(
  json,
  { names = kpobject(), modules = kpobject(), trace = false } = {}
) {
  const expression = JSON.parse(json);
  return kpcompile(expression, { names, modules, trace });
}

export default function kpcompile(
  expression,
  { names = kpobject(), modules = kpobject(), trace = false } = {}
) {
  return new Compiler(expression, { names, modules, trace }).compile();
}

class Compiler {
  constructor(
    expression,
    { names = kpobject(), modules = kpobject(), trace = false }
  ) {
    this.expression = expression;
    this.names = names;
    this.modules = modules;
    this.trace = trace;

    this.activeFunctions = [new CompiledFunction()];
    this.activeScopes = [];
    this.finishedFunctions = [];
  }

  compile() {
    this.compileExpression(this.expression);
    this.finishedFunctions.push(this.currentFunction());
    const program = this.combineFunctions();
    if (this.trace) {
      console.log("--- Instructions ---");
      console.log(disassemble(program));
      console.log("--------------------");
    }
    return program;
  }

  combineFunctions() {
    for (const finishedFunction of this.finishedFunctions) {
      finishedFunction.instructions.push(RETURN);
      finishedFunction.marks.length = finishedFunction.instructions.length;
      finishedFunction.diagnostics.length =
        finishedFunction.instructions.length;
    }
    const functionOffsets = [];
    let totalLength = 0;
    for (let i = this.finishedFunctions.length - 1; i >= 0; i--) {
      functionOffsets[i] = totalLength;
      totalLength += this.finishedFunctions[i].instructions.length;
    }
    this.finishedFunctions.reverse();
    const instructions = [].concat(
      ...this.finishedFunctions.map((f) => f.instructions)
    );
    const marks = [].concat(...this.finishedFunctions.map((f) => f.marks));
    const diagnostics = [].concat(
      ...this.finishedFunctions.map((f) => f.diagnostics)
    );
    for (let i = 0; i < instructions.length; i++) {
      if (marks[i] && "functionNumber" in marks[i]) {
        instructions[i] = functionOffsets[marks[i].functionNumber];
      }
    }
    return { instructions, diagnostics };
  }

  compileExpression(expression) {
    if ("literal" in expression) {
      this.compileLiteral(expression);
    } else if ("array" in expression) {
      this.compileArray(expression);
    } else if ("object" in expression) {
      this.compileObject(expression);
    } else if ("name" in expression) {
      this.compileName(expression);
    } else if ("defining" in expression) {
      this.compileDefining(expression);
    } else if ("given" in expression) {
      this.compileGiven(expression);
    } else if ("calling" in expression) {
      this.compileCalling(expression);
    } else {
      throw kperror("notAnExpression", ["value", expression]);
    }
  }

  compileLiteral(expression) {
    this.addInstruction(VALUE, expression.literal);
  }

  compileArray(expression) {
    this.addInstruction(VALUE, []);
    for (const element of expression.array) {
      if ("spread" in element) {
        this.compileExpression(element.spread);
        this.addInstruction(ARRAY_EXTEND);
      } else {
        this.compileExpression(element);
        this.addInstruction(ARRAY_PUSH);
      }
    }
  }

  compileObject(expression) {
    this.addInstruction(VALUE, kpobject());
    for (const entry of expression.object) {
      if ("spread" in entry) {
        this.compileExpression(entry.spread);
        this.addInstruction(OBJECT_MERGE);
      } else {
        const [key, value] = entry;
        if (typeof key === "string") {
          this.addInstruction(VALUE, key);
        } else {
          this.compileExpression(key);
        }
        this.compileExpression(value);
        this.addInstruction(OBJECT_PUSH);
      }
    }
  }

  compileName(expression) {
    const slot = this.activeScopes.at(-1).getSlot(expression.name);
    if (slot === undefined) {
      this.compileNameFromOuterScope(expression);
    } else {
      this.addInstruction(READ_LOCAL, slot);
      this.addDiagnostic({ name: expression.name });
    }
  }

  compileNameFromOuterScope(expression) {
    for (let numLayers = 1; numLayers < this.activeScopes.length; numLayers++) {
      const slot = this.activeScopes
        .at(-numLayers - 1)
        .getSlot(expression.name);
      if (slot !== undefined) {
        this.addInstruction(READ_OUTER_LOCAL, numLayers, slot);
        this.addDiagnostic({ name: expression.name });
        return;
      }
    }
    throw kperror("nameNotDefined", ["name", expression.name]);
  }

  compileDefining(expression) {
    this.pushScope();
    this.addInstruction(PUSH);
    this.defineNames(expression.defining);
    this.compileExpression(expression.result);
    this.addInstruction(POP);
    this.popScope();
  }

  defineNames(definitions) {
    for (const [pattern, _] of definitions) {
      this.declareNames(pattern);
    }
    this.addInstruction(
      LOCAL_SLOTS,
      this.activeScopes.at(-1).numDeclaredNames()
    );
    for (const [pattern, expression] of definitions) {
      this.compileExpression(expression);
      this.assignNames(pattern);
    }
  }

  declareNames(pattern) {
    const activeScope = this.activeScopes.at(-1);
    if (typeof pattern === "string") {
      if (this.trace) {
        console.log(`Declare name "${pattern}"`);
      }
      activeScope.declareName(pattern);
    } else if ("arrayPattern" in pattern) {
      for (const element of pattern.arrayPattern) {
        this.declareNames(element);
      }
    } else if ("objectPattern" in pattern) {
      for (const element of pattern.objectPattern) {
        this.declareNames(element);
      }
    } else if ("defaultValue" in pattern) {
      this.declareNames(pattern.name);
    } else if ("rest" in pattern) {
      this.declareNames(pattern.rest);
    } else {
      throw kperror("invalidPattern", ["pattern", pattern]);
    }
  }

  assignNames(pattern, { isArgument = false } = {}) {
    const activeScope = this.activeScopes.at(-1);
    if (typeof pattern === "string") {
      this.addInstruction(WRITE_LOCAL, activeScope.getSlot(pattern));
      this.addDiagnostic({ name: pattern });
    } else if ("arrayPattern" in pattern) {
      this.assignNamesInArrayPattern(pattern, { isArgument });
    } else if ("objectPattern" in pattern) {
      this.assignNamesInObjectPattern(pattern, { isArgument });
    }
  }

  assignNamesInArrayPattern(pattern, { isArgument }) {
    for (let i = pattern.arrayPattern.length - 1; i >= 0; i--) {
      const element = pattern.arrayPattern[i];
      if (typeof element === "object" && "rest" in element) {
        this.addInstruction(ARRAY_CUT, i);
        this.assignNames(element.rest);
      } else if (typeof element === "object" && "defaultValue" in element) {
        this.compileExpression(element.defaultValue);
        this.addInstruction(ARRAY_POP_OR_DEFAULT);
        this.assignNames(element.name);
      } else {
        this.addInstruction(ARRAY_POP);
        this.addDiagnostic({ name: element, isArgument });
        this.assignNames(element);
      }
    }
    this.addInstruction(DISCARD);
  }

  assignNamesInObjectPattern(pattern, { isArgument }) {
    let rest = null;
    for (const element of pattern.objectPattern) {
      if (typeof element === "object" && "rest" in element) {
        rest = element.rest;
      } else {
        this.addInstruction(VALUE, element);
        this.addInstruction(OBJECT_POP);
        this.addDiagnostic({ name: element, isArgument });
        this.assignNames(element);
      }
    }
    if (rest) {
      this.assignNames(rest);
    } else {
      this.addInstruction(DISCARD);
    }
  }

  compileGiven(expression) {
    if (this.trace) {
      console.log(
        `New function of ${JSON.stringify(
          expression.given.params ?? []
        )} ${JSON.stringify(expression.given.namedParams ?? [])}`
      );
    }
    this.activeFunctions.push(new CompiledFunction());
    this.pushScope(3);
    const paramPattern = { arrayPattern: expression.given.params ?? [] };
    const namedParamPattern = {
      objectPattern: expression.given.namedParams ?? [],
    };
    this.declareNames(paramPattern);
    this.declareNames(namedParamPattern);
    this.addInstruction(
      LOCAL_SLOTS,
      this.activeScopes.at(-1).numDeclaredNames() - 2
    );
    this.addInstruction(READ_LOCAL, 1);
    this.addDiagnostic({ name: "<posArgs>" });
    this.assignNames(paramPattern, { isArgument: true });
    this.addInstruction(READ_LOCAL, 2);
    this.addDiagnostic({ name: "<namedArgs>" });
    this.assignNames(namedParamPattern, { isArgument: true });
    this.compileExpression(expression.result);
    this.popScope();
    if (this.trace) {
      console.log("Finished function");
    }
    const finishedFunction = this.activeFunctions.pop();
    this.addInstruction(FUNCTION, 0);
    this.addMark({ functionNumber: this.finishedFunctions.length });
    this.finishedFunctions.push(finishedFunction);
  }

  compileCalling(expression) {
    this.compileExpression(expression.calling);
    this.addInstruction(PUSH);
    this.compileExpression({ array: expression.args ?? [] });
    this.compileExpression({ object: expression.namedArgs ?? [] });
    this.addInstruction(CALL);
    this.addInstruction(POP);
  }

  currentScope() {
    return this.activeScopes.at(-1);
  }

  pushScope(reservedSlots = 1) {
    if (this.trace) {
      console.log(`Push ${reservedSlots}`);
    }
    this.activeScopes.push(new CompiledScope(reservedSlots));
  }

  popScope() {
    if (this.trace) {
      console.log("Pop");
    }
    this.activeScopes.pop();
  }

  currentFunction() {
    return this.activeFunctions.at(-1);
  }

  addInstruction(...instruction) {
    this.currentFunction().instructions.push(...instruction);
  }

  addMark(mark) {
    this.currentFunction().marks[
      this.currentFunction().instructions.length - 1
    ] = mark;
  }

  addDiagnostic(diagnostic) {
    this.currentFunction().diagnostics[
      this.currentFunction().instructions.length - 1
    ] = diagnostic;
  }
}

class CompiledFunction {
  constructor() {
    this.instructions = [];
    this.marks = [];
    this.diagnostics = [];
  }
}

class CompiledScope {
  constructor(firstSlot = 1) {
    this.nameSlots = new Map();
    this.nextSlot = firstSlot;
  }

  declareName(name) {
    this.nameSlots.set(name, this.nextSlot);
    this.nextSlot += 1;
  }

  getSlot(name) {
    return this.nameSlots.get(name);
  }

  numDeclaredNames() {
    return this.nextSlot - 1;
  }
}
