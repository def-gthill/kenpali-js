import { loadBuiltins } from "./builtins.js";
import { core } from "./core.js";
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
  INDEX,
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
  disassemble,
} from "./instructions.js";
import { defining, transformTree } from "./kpast.js";
import kperror from "./kperror.js";
import kpobject, { kpoMerge } from "./kpobject.js";
import { kpparseModule } from "./kpparse.js";

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
  const builtins = kpoMerge(loadBuiltins(), names);
  const coreAsts = new Map(loadCore());
  return new Compiler(expression, {
    names: builtins,
    library: coreAsts,
    modules,
    trace,
  }).compile();
}

function loadCore() {
  return kpparseModule(core);
}

class Compiler {
  constructor(
    expression,
    {
      names = new Map(),
      library = new Map(),
      modules = new Map(),
      trace = false,
    }
  ) {
    const filteredLibrary = new LibraryFilter(library, expression).filter();
    if (trace) {
      console.log(
        `Including library functions: ${[...filteredLibrary.keys()].join(", ")}`
      );
    }
    this.expression = defining(...filteredLibrary, expression);
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
    if (expression === null || typeof expression !== "object") {
      throw kperror("notAnExpression", ["value", expression]);
    } else if ("literal" in expression) {
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
    } else if ("indexing" in expression) {
      this.compileIndexing(expression);
    } else if ("catching" in expression) {
      this.compileCatching(expression);
    } else {
      throw kperror("notAnExpression", ["value", expression]);
    }
  }

  compileLiteral(expression) {
    this.addInstruction(VALUE, expression.literal);
  }

  compileArray(expression) {
    this.addInstruction(EMPTY_ARRAY);
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
    this.addInstruction(EMPTY_OBJECT);
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
    if ("from" in expression) {
      this.resolveNameInModule(expression);
    } else {
      this.resolvePlainName(expression);
    }
  }

  resolveNameInModule(expression) {
    const module = this.modules.get(expression.from);
    if (!module) {
      throw kperror("unknownModule", ["name", expression.from]);
    }
    const global = module.get(expression.name);
    if (global !== undefined) {
      this.addInstruction(VALUE, global);
      return;
    }
  }

  resolvePlainName(expression) {
    const functionsTraversed = [];
    for (let numLayers = 0; numLayers < this.activeScopes.length; numLayers++) {
      const scope = this.activeScopes.at(-numLayers - 1);
      const slot = scope.getSlot(expression.name);
      if (slot !== undefined) {
        if (functionsTraversed.length > 0) {
          if (this.trace) {
            console.log(`Resolved "${expression.name}" in outer function`);
          }
          const outermostFunction = functionsTraversed.at(-1);
          let upvalueIndex = this.activeFunctions[
            outermostFunction.functionStackIndex
          ].upvalue(outermostFunction.numLayers, slot);
          for (let i = functionsTraversed.length - 2; i >= 0; i--) {
            upvalueIndex = this.activeFunctions[
              functionsTraversed[i].functionStackIndex
            ].upvalue(-1, upvalueIndex);
          }
          this.addInstruction(READ_UPVALUE, upvalueIndex);
          scope.setNeedsClosing(slot);
        } else {
          if (this.trace) {
            console.log(
              `Resolved "${expression.name}" in scope ${numLayers} out`
            );
          }
          this.addInstruction(READ_LOCAL, numLayers, slot);
        }
        this.addDiagnostic({ name: expression.name });
        return;
      }
      if (scope.functionStackIndex !== null) {
        functionsTraversed.push({
          numLayers: 0,
          functionStackIndex: scope.functionStackIndex,
        });
      } else if (functionsTraversed.length > 0) {
        functionsTraversed.at(-1).numLayers += 1;
      }
    }
    this.resolveGlobal(expression);
  }

  resolveGlobal(expression) {
    const global = this.names.get(expression.name);
    if (global === undefined) {
      throw kperror("nameNotDefined", ["name", expression.name]);
    }
    this.addInstruction(VALUE, global);
  }

  compileDefining(expression) {
    this.addInstruction(RESERVE, 1);
    this.pushScope();
    this.addInstruction(PUSH, 0);
    this.defineNames(expression.defining);
    this.compileExpression(expression.result);
    this.addInstruction(WRITE_LOCAL, 0);
    this.addDiagnostic({ name: "<result>" });
    this.clearLocals();
    this.addInstruction(POP);
    this.popScope();
  }

  defineNames(statements) {
    for (const statement of statements) {
      if (Array.isArray(statement)) {
        const [pattern, _] = statement;
        this.declareNames(pattern);
      }
    }
    this.addInstruction(RESERVE, this.activeScopes.at(-1).numDeclaredNames());
    for (const statement of statements) {
      if (Array.isArray(statement)) {
        const [pattern, expression] = statement;
        this.compileExpression(expression);
        this.assignNames(pattern);
      }
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
    this.addInstruction(ARRAY_REVERSE);
    this.addInstruction(ARRAY_COPY);
    for (let i = 0; i < pattern.arrayPattern.length; i++) {
      const element = pattern.arrayPattern[i];
      if (typeof element === "object" && "rest" in element) {
        this.addInstruction(ARRAY_CUT, pattern.arrayPattern.length - i - 1);
        this.addInstruction(ARRAY_REVERSE);
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
    this.addInstruction(OBJECT_COPY);
    let rest = null;
    for (const element of pattern.objectPattern) {
      if (typeof element === "object" && "rest" in element) {
        rest = element.rest;
      } else if (typeof element === "object" && "defaultValue" in element) {
        this.addInstruction(VALUE, element.name);
        this.compileExpression(element.defaultValue);
        this.addInstruction(OBJECT_POP_OR_DEFAULT);
        this.assignNames(element.name);
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
    this.pushScope({
      reservedSlots: 3,
      functionStackIndex: this.activeFunctions.length,
    });
    this.activeFunctions.push(new CompiledFunction());
    const paramPattern = { arrayPattern: expression.given.params ?? [] };
    const namedParamPattern = {
      objectPattern: expression.given.namedParams ?? [],
    };
    if (paramPattern.arrayPattern.length > 0) {
      this.declareNames(paramPattern);
    }
    if (namedParamPattern.objectPattern.length > 0) {
      this.declareNames(namedParamPattern);
    }
    this.addInstruction(
      RESERVE,
      this.activeScopes.at(-1).numDeclaredNames() - 2
    );
    if (paramPattern.arrayPattern.length > 0) {
      this.addInstruction(READ_LOCAL, 0, 1);
      this.addDiagnostic({ name: "<posArgs>" });
      this.assignNames(paramPattern, { isArgument: true });
    }
    if (namedParamPattern.objectPattern.length > 0) {
      this.addInstruction(READ_LOCAL, 0, 2);
      this.addDiagnostic({ name: "<namedArgs>" });
      this.assignNames(namedParamPattern, { isArgument: true });
    }
    this.compileExpression(expression.result);
    this.addInstruction(WRITE_LOCAL, 0);
    this.addDiagnostic({ name: "<result>" });
    this.clearLocals();
    this.popScope();
    if (this.trace) {
      console.log("Finished function");
    }
    const finishedFunction = this.activeFunctions.pop();
    this.addInstruction(FUNCTION, 0);
    this.addMark({ functionNumber: this.finishedFunctions.length });
    this.finishedFunctions.push(finishedFunction);
    for (const upvalue of finishedFunction.upvalues) {
      this.addInstruction(CLOSURE, upvalue.numLayers, upvalue.slot);
    }
  }

  clearLocals() {
    const scope = this.activeScopes.at(-1);
    for (let i = scope.numDeclaredNames(); i >= 1; i--) {
      if (scope.getNeedsClosing(i)) {
        this.addInstruction(CAPTURE);
      } else {
        this.addInstruction(DISCARD);
      }
    }
  }

  compileCalling(expression) {
    this.compileExpression(expression.calling);
    this.compileExpression({ array: expression.args ?? [] });
    this.compileExpression({ object: expression.namedArgs ?? [] });
    this.addInstruction(PUSH, -2);
    this.addInstruction(CALL);
    this.addInstruction(POP);
  }

  compileIndexing(expression) {
    this.compileExpression(expression.indexing);
    this.compileExpression(expression.at);
    this.addInstruction(INDEX);
  }

  compileCatching(expression) {
    this.addInstruction(CATCH, 0);
    const catchIndex = this.currentFunction().instructions.length;
    if (this.trace) {
      console.log(`Catching at ${catchIndex}`);
    }
    this.compileExpression(expression.catching);
    const jumpIndex = this.currentFunction().instructions.length;
    if (this.trace) {
      console.log(`Recovery point at ${jumpIndex}`);
    }
    this.currentFunction().instructions[catchIndex - 1] =
      jumpIndex - catchIndex;
  }

  currentScope() {
    return this.activeScopes.at(-1);
  }

  pushScope({ reservedSlots = 1, functionStackIndex = null } = {}) {
    if (this.trace) {
      if (functionStackIndex === null) {
        console.log(`Push ${reservedSlots}`);
      } else {
        console.log(`Push ${reservedSlots} (function ${functionStackIndex})`);
      }
    }
    this.activeScopes.push(
      new CompiledScope({ firstSlot: reservedSlots, functionStackIndex })
    );
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
    this.upvalues = [];
  }

  upvalue(numLayers, slot) {
    const existing = this.upvalues.findIndex(
      (uv) => uv.numLayers === numLayers && uv.slot === slot
    );
    if (existing >= 0) {
      return existing;
    }
    this.upvalues.push(new CompiledUpvalue(numLayers, slot));
    return this.upvalues.length - 1;
  }
}

class CompiledUpvalue {
  constructor(numLayers, slot) {
    this.numLayers = numLayers;
    this.slot = slot;
  }
}

class CompiledScope {
  constructor({ firstSlot = 1, functionStackIndex = null } = {}) {
    this.nameSlots = new Map();
    this.nextSlot = firstSlot;
    this.functionStackIndex = functionStackIndex;
    this.slotsNeedClosing = [];
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

  setNeedsClosing(slot) {
    this.slotsNeedClosing[slot] = true;
  }

  getNeedsClosing(slot) {
    return this.slotsNeedClosing[slot] ?? false;
  }
}

class LibraryFilter {
  constructor(library, expression) {
    this.libraryExpressions = [...library];
    this.allExpressions = [...library, ["<main>", expression]];
    this.libraryByName = new Map(
      this.libraryExpressions.map(([name, _], i) => [name, i])
    );
    this.activeScopes = [];
    this.usage = this.allExpressions.map(() => new Set());
  }

  filter() {
    for (let i = 0; i < this.allExpressions.length; i++) {
      this.currentUsage = this.usage[i];
      this.resolveExpression(this.allExpressions[i][1]);
    }
    const grey = new Set([this.allExpressions.length - 1]);
    const black = new Set();
    while (grey.size > 0) {
      for (const expression of grey) {
        for (const usage of this.usage[expression]) {
          grey.add(usage);
        }
        grey.delete(expression);
        black.add(expression);
        break;
      }
    }
    return new Map(this.libraryExpressions.filter((_, i) => black.has(i)));
  }

  resolveExpression(expression) {
    const outerThis = this;
    transformTree(expression, {
      handleName(node) {
        for (const scope of outerThis.activeScopes) {
          if (scope.has(node.name)) {
            return;
          }
        }
        if (outerThis.libraryByName.has(node.name)) {
          outerThis.currentUsage.add(outerThis.libraryByName.get(node.name));
        }
      },
      handleDefining(node, recurse) {
        const scope = new Set();
        for (const statement of node.defining) {
          if (Array.isArray(statement)) {
            const [name, _] = statement;
            scope.add(name);
          }
        }
        outerThis.activeScopes.push(scope);
        for (const statement of node.defining) {
          if (Array.isArray(statement)) {
            const [_, value] = statement;
            recurse(value);
          }
        }
        recurse(node.result);
        outerThis.activeScopes.pop();
      },
    });
  }
}