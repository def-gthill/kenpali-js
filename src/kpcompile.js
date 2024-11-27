import { loadBuiltins } from "./builtins.js";
import { core } from "./core.js";
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
  disassemble,
} from "./instructions.js";
import { defining, transformTree } from "./kpast.js";
import kperror from "./kperror.js";
import kpobject, { kpoMerge } from "./kpobject.js";
import { kpparseModule } from "./kpparse.js";
import { isObject, isString } from "./values.js";

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
  const coreAsts = new Map([...loadCore(), ...builtins]);
  return new Compiler(expression, {
    names: builtins,
    library: coreAsts,
    modules,
    trace,
  }).compile();
}

let coreAst = null;

function loadCore() {
  if (!coreAst) {
    coreAst = kpparseModule(core);
  }
  return coreAst;
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
    if (typeof expression === "function") {
      this.compileBuiltin(expression);
    } else if (expression === null || typeof expression !== "object") {
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
    } else if ("name" in pattern) {
      this.declareNames(pattern.name);
    } else if ("rest" in pattern) {
      this.declareNames(pattern.rest);
    } else {
      throw kperror("invalidPattern", ["pattern", pattern]);
    }
  }

  assignNames(pattern, { isArgumentPattern = false, isArgument = false } = {}) {
    const activeScope = this.activeScopes.at(-1);
    if (typeof pattern === "string") {
      this.addInstruction(WRITE_LOCAL, activeScope.getSlot(pattern));
      this.addDiagnostic({ name: pattern });
    } else if ("arrayPattern" in pattern) {
      this.assignNamesInArrayPattern(pattern, { isArgumentPattern });
    } else if ("objectPattern" in pattern) {
      this.assignNamesInObjectPattern(pattern, { isArgumentPattern });
    } else if ("name" in pattern) {
      if ("type" in pattern) {
        this.validate(pattern.type, { isArgument, isArgumentPattern });
      }
      this.assignNames(pattern.name);
    }
  }

  assignNamesInArrayPattern(pattern, { isArgumentPattern }) {
    this.addInstruction(ARRAY_COPY);
    this.addInstruction(ARRAY_REVERSE);
    for (let i = 0; i < pattern.arrayPattern.length; i++) {
      const element = pattern.arrayPattern[i];
      if (typeof element === "object" && "rest" in element) {
        this.addInstruction(ARRAY_CUT, pattern.arrayPattern.length - i - 1);
        this.addInstruction(ARRAY_REVERSE);
        this.assignNames(element.rest, { isArgumentPattern });
      } else if (typeof element === "object" && "defaultValue" in element) {
        this.compileExpression(element.defaultValue);
        this.addInstruction(ARRAY_POP_OR_DEFAULT);
        this.assignNames(element.name, { isArgument: isArgumentPattern });
      } else {
        this.addInstruction(ARRAY_POP);
        this.addDiagnostic({
          name: this.paramName(element),
          isArgument: isArgumentPattern,
        });
        this.assignNames(element, { isArgument: isArgumentPattern });
      }
    }
    this.addInstruction(DISCARD);
  }

  assignNamesInObjectPattern(pattern, { isArgumentPattern }) {
    this.addInstruction(OBJECT_COPY);
    let rest = null;
    for (const element of pattern.objectPattern) {
      if (typeof element === "object" && "rest" in element) {
        rest = element.rest;
      } else if (typeof element === "object" && "defaultValue" in element) {
        this.addInstruction(VALUE, element.name);
        this.compileExpression(element.defaultValue);
        this.addInstruction(OBJECT_POP_OR_DEFAULT);
        this.assignNames(element.name, { isArgument: isArgumentPattern });
      } else {
        this.addInstruction(VALUE, this.paramName(element));
        this.addInstruction(OBJECT_POP);
        this.addDiagnostic({
          name: this.paramName(element),
          isArgument: isArgumentPattern,
        });
        this.assignNames(element, { isArgument: isArgumentPattern });
      }
    }
    if (rest) {
      this.assignNames(rest, { isArgumentPattern });
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
      this.assignNames(paramPattern, { isArgumentPattern: true });
    }
    if (namedParamPattern.objectPattern.length > 0) {
      this.addInstruction(READ_LOCAL, 0, 2);
      this.addDiagnostic({ name: "<namedArgs>" });
      this.assignNames(namedParamPattern, { isArgumentPattern: true });
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
    this.addDiagnostic({ name: "<given>", isBuiltin: false });
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

  compileBuiltin(expression) {
    if (this.trace) {
      console.log(`Compiling builtin ${expression.builtinName}`);
    }
    this.pushScope({
      reservedSlots: 3,
      functionStackIndex: this.activeFunctions.length,
    });
    this.activeFunctions.push(new CompiledFunction());
    const paramPattern = { arrayPattern: expression.params ?? [] };
    const namedParamPattern = {
      objectPattern: expression.namedParams ?? [],
    };
    if (paramPattern.arrayPattern.length > 0) {
      this.declareNames(paramPattern);
    }
    if (namedParamPattern.objectPattern.length > 0) {
      this.declareNames(namedParamPattern);
    }
    const numDeclaredNames = this.activeScopes.at(-1).numDeclaredNames() - 2;
    this.addInstruction(RESERVE, numDeclaredNames);
    if (paramPattern.arrayPattern.length > 0) {
      this.addInstruction(READ_LOCAL, 0, 1);
      this.addDiagnostic({ name: "<posArgs>" });
      this.assignNames(paramPattern, { isArgumentPattern: true });
    }
    if (namedParamPattern.objectPattern.length > 0) {
      this.addInstruction(READ_LOCAL, 0, 2);
      this.addDiagnostic({ name: "<namedArgs>" });
      this.assignNames(namedParamPattern, { isArgumentPattern: true });
    }
    this.addInstruction(VALUE, expression);
    this.addInstruction(WRITE_LOCAL, 2);
    this.addDiagnostic({ name: "<builtin>" });
    this.addInstruction(PUSH, -numDeclaredNames);
    this.addInstruction(CALL_BUILTIN);
    this.addInstruction(POP);
    this.addInstruction(WRITE_LOCAL, 0);
    this.addDiagnostic({ name: "<result>" });
    this.addInstruction(DISCARD); // The positional arguments handoff
    // (The named arguments slot already got trampled by the result)
    this.popScope();
    const finishedFunction = this.activeFunctions.pop();
    this.addInstruction(FUNCTION, 0);
    this.addMark({ functionNumber: this.finishedFunctions.length });
    this.addDiagnostic({
      name: expression.builtinName ?? "<anonymous>",
      isBuiltin: true,
    });
    this.finishedFunctions.push(finishedFunction);
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

  validate(schema, { isArgument = false, isArgumentPattern = false } = {}) {
    this.validateRecursive(schema);
    this.addInstruction(VALUE, schema);
    this.addInstruction(ERROR_IF_INVALID);
    this.addDiagnostic({ isArgument, isArgumentPattern });
  }

  validateRecursive(schema) {
    if (isString(schema)) {
      this.validateTypeSchema(schema);
    } else if (isObject(schema)) {
      if (schema.has("either")) {
        this.validateEitherSchema(schema);
      } else if (schema.has("oneOf")) {
        this.validateOneOfSchema(schema);
      } else if (schema.has("type")) {
        this.validateTypeWithConditionsSchema(schema);
      } else {
        this.invalidSchema(schema);
      }
    } else {
      this.invalidSchema(schema);
    }
  }

  typeValidationInstructions = {
    null: IS_NULL,
    boolean: IS_BOOLEAN,
    number: IS_NUMBER,
    string: IS_STRING,
    array: IS_ARRAY,
    object: IS_OBJECT,
    builtin: IS_BUILTIN,
    given: IS_GIVEN,
    error: IS_ERROR,
    function: IS_FUNCTION,
    sequence: IS_SEQUENCE,
  };

  validateTypeSchema(schema) {
    if (schema === "any") {
      this.addInstruction(VALUE, true);
      return;
    }
    this.addInstruction(ALIAS);
    const instruction = this.typeValidationInstructions[schema];
    if (instruction === undefined) {
      this.invalidSchema(schema);
    }
    this.addInstruction(instruction);
  }

  validateEitherSchema(schema) {
    const jumpIndices = [];
    for (const option of schema.get("either")) {
      this.validateRecursive(option);
      this.addInstruction(JUMP_IF_TRUE, 0);
      jumpIndices.push(this.nextInstructionIndex());
    }
    this.addInstruction(VALUE, false);
    this.addInstruction(JUMP, 2);
    for (const jumpIndex of jumpIndices) {
      const toIndex = this.nextInstructionIndex();
      this.setInstruction(jumpIndex - 1, toIndex - jumpIndex);
    }
    this.addInstruction(VALUE, true);
  }

  validateOneOfSchema(schema) {
    const jumpIndices = [];
    for (const option of schema.get("oneOf")) {
      this.addInstruction(ALIAS);
      this.addInstruction(VALUE, option);
      this.addInstruction(EQUALS);
      this.addInstruction(JUMP_IF_TRUE, 0);
      jumpIndices.push(this.nextInstructionIndex());
    }
    this.addInstruction(VALUE, false);
    this.addInstruction(JUMP, 2);
    for (const jumpIndex of jumpIndices) {
      const toIndex = this.nextInstructionIndex();
      this.setInstruction(jumpIndex - 1, toIndex - jumpIndex);
    }
    this.addInstruction(VALUE, true);
  }

  validateTypeWithConditionsSchema(schema) {
    const jumpIndices = [];

    const failIfFalse = () => {
      this.addInstruction(JUMP_IF_FALSE, 0);
      jumpIndices.push(this.nextInstructionIndex());
    };

    this.validateTypeSchema(schema.get("type"));
    failIfFalse();

    if (schema.get("type") === "array") {
      if (schema.has("shape")) {
        this.validateArrayShape(schema.get("shape"));
        failIfFalse();
      }
      if (schema.has("elements")) {
        this.validateArrayElements(schema.get("elements"));
        failIfFalse();
      }
    } else if (schema.get("type") === "object") {
      if (schema.has("shape")) {
        this.validateObjectShape(schema.get("shape"));
        failIfFalse();
      }
      if (schema.has("keys")) {
        this.validateObjectKeys(schema.get("keys"));
        failIfFalse();
      }
      if (schema.has("values")) {
        this.validateObjectValues(schema.get("values"));
        failIfFalse();
      }
    }
    this.addInstruction(VALUE, true);
    this.addInstruction(JUMP, 2);
    for (const jumpIndex of jumpIndices) {
      const toIndex = this.nextInstructionIndex();
      this.setInstruction(jumpIndex - 1, toIndex - jumpIndex);
    }
    this.addInstruction(VALUE, false);
  }

  validateArrayShape(shape) {
    this.addInstruction(ALIAS);
    this.addInstruction(ARRAY_COPY);
    this.addInstruction(ARRAY_REVERSE);
    const passJumpIndices = [];
    const failJumpIndices = [];
    for (const element of shape) {
      this.addInstruction(ALIAS);
      this.addInstruction(ARRAY_IS_EMPTY);
      this.addInstruction(JUMP_IF_TRUE, 0);
      let subschema;
      if (isObject(element) && element.has("optional")) {
        subschema = element.get("optional");
        passJumpIndices.push(this.nextInstructionIndex());
      } else {
        subschema = element;
        failJumpIndices.push(this.nextInstructionIndex());
      }
      this.addInstruction(ARRAY_POP);
      this.validateRecursive(subschema);
      this.addInstruction(JUMP_IF_FALSE, 0);
      failJumpIndices.push(this.nextInstructionIndex());
      this.addInstruction(DISCARD);
    }
    this.addInstruction(DISCARD);
    for (const jumpIndex of passJumpIndices) {
      const toIndex = this.nextInstructionIndex();
      this.setInstruction(jumpIndex - 1, toIndex - jumpIndex);
    }
    this.addInstruction(VALUE, true);
    this.addInstruction(JUMP, 2);
    for (const jumpIndex of failJumpIndices) {
      const toIndex = this.nextInstructionIndex();
      this.setInstruction(jumpIndex - 1, toIndex - jumpIndex);
    }
    this.addInstruction(VALUE, false);
  }

  validateArrayElements(schema) {
    this.addInstruction(ALIAS);
    this.addInstruction(ARRAY_COPY);
    this.validateAll(schema);
  }

  validateObjectShape(shape) {
    this.addInstruction(ALIAS);
    this.addInstruction(OBJECT_COPY);
    const failJumpIndices = [];
    for (const [key, valueSchema] of shape) {
      if (isObject(valueSchema) && valueSchema.has("optional")) {
        this.addInstruction(VALUE, key);
        this.addInstruction(OBJECT_HAS);
        this.addInstruction(JUMP_IF_FALSE, 0);
        const jumpIndex = this.nextInstructionIndex();
        this.addInstruction(VALUE, key);
        this.addInstruction(OBJECT_POP);
        this.validateRecursive(valueSchema.get("optional"));
        this.addInstruction(JUMP_IF_FALSE, 0);
        failJumpIndices.push(this.nextInstructionIndex());
        this.setInstruction(
          jumpIndex - 1,
          this.nextInstructionIndex() - jumpIndex
        );
      } else {
        this.addInstruction(VALUE, key);
        this.addInstruction(OBJECT_HAS);
        this.addInstruction(JUMP_IF_FALSE, 0);
        failJumpIndices.push(this.nextInstructionIndex());
        this.addInstruction(VALUE, key);
        this.addInstruction(OBJECT_POP);
        this.validateRecursive(valueSchema);
        this.addInstruction(JUMP_IF_FALSE, 0);
        failJumpIndices.push(this.nextInstructionIndex());
      }
      this.addInstruction(DISCARD);
    }
    this.addInstruction(DISCARD);
    this.addInstruction(VALUE, true);
    this.addInstruction(JUMP, 2);
    for (const jumpIndex of failJumpIndices) {
      const toIndex = this.nextInstructionIndex();
      this.setInstruction(jumpIndex - 1, toIndex - jumpIndex);
    }
    this.addInstruction(VALUE, false);
  }

  validateObjectKeys(schema) {
    this.addInstruction(ALIAS);
    this.addInstruction(OBJECT_KEYS);
    this.validateAll(schema);
  }

  validateObjectValues(schema) {
    this.addInstruction(ALIAS);
    this.addInstruction(OBJECT_VALUES);
    this.validateAll(schema);
  }

  validateAll(schema) {
    const backwardLoopIndex = this.nextInstructionIndex();
    this.addInstruction(ALIAS);
    this.addInstruction(ARRAY_IS_EMPTY);
    this.addInstruction(JUMP_IF_TRUE, 0);
    const forwardLoopIndex = this.nextInstructionIndex();
    this.addInstruction(ARRAY_POP);
    this.validateRecursive(schema);
    this.addInstruction(JUMP_IF_FALSE, 0);
    const failJumpIndex = this.nextInstructionIndex();
    this.addInstruction(DISCARD);
    this.addInstruction(JUMP, 0);
    this.setInstruction(
      this.nextInstructionIndex() - 1,
      backwardLoopIndex - this.nextInstructionIndex()
    );
    this.setInstruction(
      forwardLoopIndex - 1,
      this.nextInstructionIndex() - forwardLoopIndex
    );
    this.addInstruction(DISCARD);
    this.addInstruction(VALUE, true);
    this.addInstruction(JUMP, 4);
    this.setInstruction(
      failJumpIndex - 1,
      this.nextInstructionIndex() - failJumpIndex
    );
    this.addInstruction(DISCARD); // The value that failed
    this.addInstruction(DISCARD); // The working array
    this.addInstruction(VALUE, false);
  }

  invalidSchema(schema) {
    throw kperror("invalidSchema", ["schema", schema]);
  }

  paramName(param) {
    return typeof param === "string" ? param : param.name;
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

  setInstruction(index, value) {
    this.currentFunction().instructions[index] = value;
  }

  nextInstructionIndex() {
    return this.currentFunction().instructions.length;
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
