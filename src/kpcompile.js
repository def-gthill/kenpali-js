import { loadBuiltins } from "./builtins.js";
import { core } from "./core.js";
import * as op from "./instructions.js";
import { defining, transformTree } from "./kpast.js";
import kperror from "./kperror.js";
import kpobject, { kpoMerge } from "./kpobject.js";
import { kpparseModule } from "./kpparse.js";
import { either } from "./validate.js";
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
      this.log(
        `Including library functions: ${[...filteredLibrary.keys()].join(", ")}`
      );
    }
    this.expression = defining(...filteredLibrary, expression);
    this.names = names;
    this.modules = modules;
    this.trace = trace;
    this.traceLevel = 0;

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
      console.log(op.disassemble(program));
      console.log("--------------------");
    }
    return program;
  }

  log(message) {
    console.log(`${Array(this.traceLevel).fill("| ").join("")}${message}`);
  }

  logNodeStart(message) {
    this.log(message);
    this.traceLevel += 1;
  }

  logNodeEnd(message) {
    this.traceLevel -= 1;
    this.log(message);
  }

  combineFunctions() {
    for (const finishedFunction of this.finishedFunctions) {
      finishedFunction.instructions.push(op.RETURN);
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

  compileExpression(expression, name) {
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
      const enclosingFunctionName = this.activeFunctions.at(-1).name;
      let givenName =
        name ?? this.activeFunctions.at(-1).nextAnonymousFunctionName();
      if (enclosingFunctionName) {
        givenName = `${enclosingFunctionName}/${givenName}`;
      }
      this.compileGiven(expression, givenName);
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
    this.addInstruction(op.VALUE, expression.literal);
  }

  compileArray(expression) {
    if (this.trace) {
      this.logNodeStart("Starting array");
    }
    this.addInstruction(op.EMPTY_ARRAY);
    for (const element of expression.array) {
      if ("spread" in element) {
        this.compileExpression(element.spread);
        this.addInstruction(op.ARRAY_EXTEND);
      } else {
        this.compileExpression(element);
        this.addInstruction(op.ARRAY_PUSH);
      }
    }
    if (this.trace) {
      this.logNodeEnd("Finished array");
    }
  }

  compileObject(expression) {
    if (this.trace) {
      this.logNodeStart("Starting object");
    }
    this.addInstruction(op.EMPTY_OBJECT);
    for (const entry of expression.object) {
      if ("spread" in entry) {
        this.compileExpression(entry.spread);
        this.addInstruction(op.OBJECT_MERGE);
      } else {
        const [key, value] = entry;
        if (typeof key === "string") {
          this.addInstruction(op.VALUE, key);
        } else {
          this.compileExpression(key);
        }
        this.compileExpression(value);
        this.addInstruction(op.OBJECT_PUSH);
      }
    }
    if (this.trace) {
      this.logNodeEnd("Finished object");
    }
  }

  compileName(expression) {
    if (this.resolveLocal(expression)) {
      return;
    }
    if (this.resolveGlobal(expression)) {
      return;
    }
    throw kperror("nameNotDefined", ["name", expression.name]);
  }

  resolveLocal(expression) {
    const functionsTraversed = [];
    for (let numLayers = 0; numLayers < this.activeScopes.length; numLayers++) {
      const scope = this.activeScopes.at(-numLayers - 1);
      const slot = scope.getSlot(expression.name);
      if (slot !== undefined) {
        if (functionsTraversed.length > 0) {
          if (this.trace) {
            this.log(`Resolved "${expression.name}" in outer function`);
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
          this.addInstruction(op.READ_UPVALUE, upvalueIndex);
          scope.setNeedsClosing(slot);
        } else {
          if (this.trace) {
            if (numLayers === 0) {
              this.log(`Resolved "${expression.name}" in current scope`);
            } else {
              this.log(
                `Resolved "${expression.name}" in scope ${numLayers} out`
              );
            }
          }
          this.addInstruction(op.READ_LOCAL, numLayers, slot);
        }
        this.addDiagnostic({ name: expression.name });
        return true;
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
    return false;
  }

  resolveGlobal(expression) {
    const global = this.names.get(expression.name);
    if (global === undefined) {
      return false;
    }
    this.addInstruction(op.VALUE, global);
    return true;
  }

  compileDefining(expression) {
    this.addInstruction(op.RESERVE, 1);
    this.pushScope();
    this.addInstruction(op.PUSH, 0);
    this.defineNames(expression.defining);
    this.compileExpression(expression.result);
    this.addInstruction(op.WRITE_LOCAL, 0);
    this.addDiagnostic({ name: "<result>" });
    this.clearLocals();
    this.addInstruction(op.POP);
    this.popScope();
  }

  defineNames(statements) {
    for (const statement of statements) {
      const [pattern, _] = statement;
      this.declareNames(pattern);
    }
    this.addInstruction(
      op.RESERVE,
      this.activeScopes.at(-1).numDeclaredNames()
    );
    for (const statement of statements) {
      const [pattern, expression] = statement;
      const name = typeof pattern === "string" ? pattern : undefined;
      this.compileExpression(expression, name);
      this.assignNames(pattern);
    }
  }

  declareNames(pattern) {
    const activeScope = this.activeScopes.at(-1);
    if (pattern === null) {
      return;
    } else if (typeof pattern === "string") {
      activeScope.declareName(pattern);
      if (this.trace) {
        this.log(`Declared name "${pattern}"`);
      }
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
    if (pattern === null) {
      // Expression statement, throw away the result
      this.addInstruction(op.DISCARD);
    } else if (typeof pattern === "string") {
      this.addInstruction(op.WRITE_LOCAL, activeScope.getSlot(pattern));
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
    this.validate(either("array", "stream"));
    this.addInstruction(op.ARRAY_COPY);
    this.addInstruction(op.ARRAY_REVERSE);
    for (let i = 0; i < pattern.arrayPattern.length; i++) {
      const element = pattern.arrayPattern[i];
      if (typeof element === "object" && "rest" in element) {
        this.addInstruction(op.ARRAY_CUT, pattern.arrayPattern.length - i - 1);
        this.addInstruction(op.ARRAY_REVERSE);
        this.assignNames(element.rest, { isArgumentPattern });
      } else if (typeof element === "object" && "defaultValue" in element) {
        this.compileExpression(element.defaultValue);
        this.addInstruction(op.ARRAY_POP_OR_DEFAULT);
        this.assignNames(element.name, { isArgument: isArgumentPattern });
      } else {
        this.addInstruction(op.ARRAY_POP);
        this.addDiagnostic({
          name: this.paramName(element),
          isArgument: isArgumentPattern,
        });
        this.assignNames(element, { isArgument: isArgumentPattern });
      }
    }
    this.addInstruction(op.DISCARD);
  }

  assignNamesInObjectPattern(pattern, { isArgumentPattern }) {
    this.validate("object");
    this.addInstruction(op.OBJECT_COPY);
    let rest = null;
    for (const element of pattern.objectPattern) {
      if (typeof element === "object" && "rest" in element) {
        rest = element.rest;
      } else if (typeof element === "object" && "defaultValue" in element) {
        this.addInstruction(op.VALUE, element.name);
        this.compileExpression(element.defaultValue);
        this.addInstruction(op.OBJECT_POP_OR_DEFAULT);
        this.assignNames(element.name, { isArgument: isArgumentPattern });
      } else {
        this.addInstruction(op.VALUE, this.paramName(element));
        this.addInstruction(op.OBJECT_POP);
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
      this.addInstruction(op.DISCARD);
    }
  }

  compileGiven(expression, name) {
    if (this.trace) {
      this.logNodeStart(`Starting function ${name}`);
    }
    this.pushScope({
      reservedSlots: 3,
      functionStackIndex: this.activeFunctions.length,
    });
    this.activeFunctions.push(new CompiledFunction(name));
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
      op.RESERVE,
      this.activeScopes.at(-1).numDeclaredNames() - 2
    );
    if (paramPattern.arrayPattern.length > 0) {
      this.addInstruction(op.READ_LOCAL, 0, 1);
      this.addDiagnostic({ name: "<posArgs>" });
      this.assignNames(paramPattern, { isArgumentPattern: true });
    }
    if (namedParamPattern.objectPattern.length > 0) {
      this.addInstruction(op.READ_LOCAL, 0, 2);
      this.addDiagnostic({ name: "<namedArgs>" });
      this.assignNames(namedParamPattern, { isArgumentPattern: true });
    }
    this.compileExpression(expression.result);
    this.addInstruction(op.WRITE_LOCAL, 0);
    this.addDiagnostic({ name: "<result>" });
    this.clearLocals();
    this.popScope();
    if (this.trace) {
      this.logNodeEnd("Finished function");
    }
    const finishedFunction = this.activeFunctions.pop();
    this.addInstruction(op.FUNCTION, 0);
    this.addMark({ functionNumber: this.finishedFunctions.length });
    this.addDiagnostic({ name, isBuiltin: false });
    this.finishedFunctions.push(finishedFunction);
    for (const upvalue of finishedFunction.upvalues) {
      this.addInstruction(op.CLOSURE, upvalue.numLayers, upvalue.slot);
    }
  }

  clearLocals() {
    const scope = this.activeScopes.at(-1);
    for (let i = scope.numDeclaredNames(); i >= 1; i--) {
      if (scope.getNeedsClosing(i)) {
        this.addInstruction(op.CAPTURE);
      } else {
        this.addInstruction(op.DISCARD);
      }
    }
  }

  compileBuiltin(expression) {
    if (this.trace) {
      this.log(`Compiling builtin ${expression.builtinName}`);
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
    this.addInstruction(op.RESERVE, numDeclaredNames);
    if (paramPattern.arrayPattern.length > 0) {
      this.addInstruction(op.READ_LOCAL, 0, 1);
      this.addDiagnostic({ name: "<posArgs>" });
      this.assignNames(paramPattern, { isArgumentPattern: true });
    }
    if (namedParamPattern.objectPattern.length > 0) {
      this.addInstruction(op.READ_LOCAL, 0, 2);
      this.addDiagnostic({ name: "<namedArgs>" });
      this.assignNames(namedParamPattern, { isArgumentPattern: true });
    }
    this.addInstruction(op.VALUE, expression);
    this.addInstruction(op.WRITE_LOCAL, 2);
    this.addDiagnostic({ name: "<builtin>" });
    this.addInstruction(op.PUSH, -numDeclaredNames);
    this.addInstruction(op.CALL_BUILTIN);
    this.addInstruction(op.POP);
    this.addInstruction(op.WRITE_LOCAL, 0);
    this.addDiagnostic({ name: "<result>" });
    this.addInstruction(op.DISCARD); // The positional arguments handoff
    // (The named arguments slot already got trampled by the result)
    this.popScope();
    const finishedFunction = this.activeFunctions.pop();
    this.addInstruction(op.FUNCTION, 0);
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
    this.addInstruction(op.PUSH, -2);
    this.addInstruction(op.CALL);
    this.addInstruction(op.POP);
  }

  compileIndexing(expression) {
    if (this.tryCompilingModuleAccess(expression.indexing, expression.at)) {
      return;
    }
    this.compileExpression(expression.indexing);
    this.compileExpression(expression.at);
    this.addInstruction(op.INDEX);
  }

  tryCompilingModuleAccess(moduleName, name) {
    if (
      moduleName === null ||
      typeof moduleName !== "object" ||
      !("name" in moduleName)
    ) {
      return false;
    }
    if (name === null || typeof name !== "object" || !("name" in name)) {
      return false;
    }

    // Is the "module" actually a local?
    for (let numLayers = 0; numLayers < this.activeScopes.length; numLayers++) {
      const scope = this.activeScopes.at(-numLayers - 1);
      const slot = scope.getSlot(moduleName.name);
      if (slot !== undefined) {
        return false;
      }
    }
    // Is the "module" actually a global?
    if (this.names.get(name.name) !== undefined) {
      return false;
    }

    const module = this.modules.get(moduleName.name);
    if (!module) {
      throw kperror("unknownModule", ["name", moduleName.name]);
    }
    const global = module.get(name.name);
    if (global === undefined) {
      throw kperror(
        "nameNotDefined",
        ["name", name.name],
        ["module", moduleName.name]
      );
    }
    this.addInstruction(op.VALUE, global);
    return true;
  }

  compileCatching(expression) {
    this.addInstruction(op.CATCH, 0);
    const catchIndex = this.currentFunction().instructions.length;
    if (this.trace) {
      this.log(`Catching at ${catchIndex}`);
    }
    this.compileExpression(expression.catching);
    const jumpIndex = this.currentFunction().instructions.length;
    if (this.trace) {
      this.log(`Recovery point at ${jumpIndex}`);
    }
    this.addInstruction(op.UNCATCH);
    this.currentFunction().instructions[catchIndex - 1] =
      jumpIndex - catchIndex;
  }

  validate(schema, { isArgument = false, isArgumentPattern = false } = {}) {
    this.validateRecursive(schema);
    this.addInstruction(op.VALUE, schema);
    this.addInstruction(op.ERROR_IF_INVALID);
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
    null: op.IS_NULL,
    boolean: op.IS_BOOLEAN,
    number: op.IS_NUMBER,
    string: op.IS_STRING,
    array: op.IS_ARRAY,
    stream: op.IS_STREAM,
    object: op.IS_OBJECT,
    builtin: op.IS_BUILTIN,
    given: op.IS_GIVEN,
    error: op.IS_ERROR,
    function: op.IS_FUNCTION,
    sequence: op.IS_SEQUENCE,
  };

  validateTypeSchema(schema) {
    if (schema === "any") {
      this.addInstruction(op.VALUE, true);
      return;
    }
    this.addInstruction(op.ALIAS);
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
      this.addInstruction(op.JUMP_IF_TRUE, 0);
      jumpIndices.push(this.nextInstructionIndex());
    }
    this.addInstruction(op.VALUE, false);
    this.addInstruction(op.JUMP, 2);
    for (const jumpIndex of jumpIndices) {
      const toIndex = this.nextInstructionIndex();
      this.setInstruction(jumpIndex - 1, toIndex - jumpIndex);
    }
    this.addInstruction(op.VALUE, true);
  }

  validateOneOfSchema(schema) {
    const jumpIndices = [];
    for (const option of schema.get("oneOf")) {
      this.addInstruction(op.ALIAS);
      this.addInstruction(op.VALUE, option);
      this.addInstruction(op.EQUALS);
      this.addInstruction(op.JUMP_IF_TRUE, 0);
      jumpIndices.push(this.nextInstructionIndex());
    }
    this.addInstruction(op.VALUE, false);
    this.addInstruction(op.JUMP, 2);
    for (const jumpIndex of jumpIndices) {
      const toIndex = this.nextInstructionIndex();
      this.setInstruction(jumpIndex - 1, toIndex - jumpIndex);
    }
    this.addInstruction(op.VALUE, true);
  }

  validateTypeWithConditionsSchema(schema) {
    const jumpIndices = [];

    const failIfFalse = () => {
      this.addInstruction(op.JUMP_IF_FALSE, 0);
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
    this.addInstruction(op.VALUE, true);
    this.addInstruction(op.JUMP, 2);
    for (const jumpIndex of jumpIndices) {
      const toIndex = this.nextInstructionIndex();
      this.setInstruction(jumpIndex - 1, toIndex - jumpIndex);
    }
    this.addInstruction(op.VALUE, false);
  }

  validateArrayShape(shape) {
    this.addInstruction(op.ALIAS);
    this.addInstruction(op.ARRAY_COPY);
    this.addInstruction(op.ARRAY_REVERSE);
    const passJumpIndices = [];
    const failJumpIndices = [];
    for (const element of shape) {
      this.addInstruction(op.ALIAS);
      this.addInstruction(op.ARRAY_IS_EMPTY);
      this.addInstruction(op.JUMP_IF_TRUE, 0);
      let subschema;
      if (isObject(element) && element.has("optional")) {
        subschema = element.get("optional");
        passJumpIndices.push(this.nextInstructionIndex());
      } else {
        subschema = element;
        failJumpIndices.push(this.nextInstructionIndex());
      }
      this.addInstruction(op.ARRAY_POP);
      this.validateRecursive(subschema);
      this.addInstruction(op.JUMP_IF_FALSE, 0);
      failJumpIndices.push(this.nextInstructionIndex());
      this.addInstruction(op.DISCARD);
    }
    this.addInstruction(op.DISCARD);
    for (const jumpIndex of passJumpIndices) {
      const toIndex = this.nextInstructionIndex();
      this.setInstruction(jumpIndex - 1, toIndex - jumpIndex);
    }
    this.addInstruction(op.VALUE, true);
    this.addInstruction(op.JUMP, 2);
    for (const jumpIndex of failJumpIndices) {
      const toIndex = this.nextInstructionIndex();
      this.setInstruction(jumpIndex - 1, toIndex - jumpIndex);
    }
    this.addInstruction(op.VALUE, false);
  }

  validateArrayElements(schema) {
    this.addInstruction(op.ALIAS);
    this.addInstruction(op.ARRAY_COPY);
    this.validateAll(schema);
  }

  validateObjectShape(shape) {
    this.addInstruction(op.ALIAS);
    this.addInstruction(op.OBJECT_COPY);
    const failJumpIndices = [];
    for (const [key, valueSchema] of shape) {
      if (isObject(valueSchema) && valueSchema.has("optional")) {
        this.addInstruction(op.VALUE, key);
        this.addInstruction(op.OBJECT_HAS);
        this.addInstruction(op.JUMP_IF_FALSE, 0);
        const jumpIndex = this.nextInstructionIndex();
        this.addInstruction(op.VALUE, key);
        this.addInstruction(op.OBJECT_POP);
        this.validateRecursive(valueSchema.get("optional"));
        this.addInstruction(op.JUMP_IF_FALSE, 0);
        failJumpIndices.push(this.nextInstructionIndex());
        this.setInstruction(
          jumpIndex - 1,
          this.nextInstructionIndex() - jumpIndex
        );
      } else {
        this.addInstruction(op.VALUE, key);
        this.addInstruction(op.OBJECT_HAS);
        this.addInstruction(op.JUMP_IF_FALSE, 0);
        failJumpIndices.push(this.nextInstructionIndex());
        this.addInstruction(op.VALUE, key);
        this.addInstruction(op.OBJECT_POP);
        this.validateRecursive(valueSchema);
        this.addInstruction(op.JUMP_IF_FALSE, 0);
        failJumpIndices.push(this.nextInstructionIndex());
      }
      this.addInstruction(op.DISCARD);
    }
    this.addInstruction(op.DISCARD);
    this.addInstruction(op.VALUE, true);
    this.addInstruction(op.JUMP, 2);
    for (const jumpIndex of failJumpIndices) {
      const toIndex = this.nextInstructionIndex();
      this.setInstruction(jumpIndex - 1, toIndex - jumpIndex);
    }
    this.addInstruction(op.VALUE, false);
  }

  validateObjectKeys(schema) {
    this.addInstruction(op.ALIAS);
    this.addInstruction(op.OBJECT_KEYS);
    this.validateAll(schema);
  }

  validateObjectValues(schema) {
    this.addInstruction(op.ALIAS);
    this.addInstruction(op.OBJECT_VALUES);
    this.validateAll(schema);
  }

  validateAll(schema) {
    const backwardLoopIndex = this.nextInstructionIndex();
    this.addInstruction(op.ALIAS);
    this.addInstruction(op.ARRAY_IS_EMPTY);
    this.addInstruction(op.JUMP_IF_TRUE, 0);
    const forwardLoopIndex = this.nextInstructionIndex();
    this.addInstruction(op.ARRAY_POP);
    this.validateRecursive(schema);
    this.addInstruction(op.JUMP_IF_FALSE, 0);
    const failJumpIndex = this.nextInstructionIndex();
    this.addInstruction(op.DISCARD);
    this.addInstruction(op.JUMP, 0);
    this.setInstruction(
      this.nextInstructionIndex() - 1,
      backwardLoopIndex - this.nextInstructionIndex()
    );
    this.setInstruction(
      forwardLoopIndex - 1,
      this.nextInstructionIndex() - forwardLoopIndex
    );
    this.addInstruction(op.DISCARD);
    this.addInstruction(op.VALUE, true);
    this.addInstruction(op.JUMP, 4);
    this.setInstruction(
      failJumpIndex - 1,
      this.nextInstructionIndex() - failJumpIndex
    );
    this.addInstruction(op.DISCARD); // The value that failed
    this.addInstruction(op.DISCARD); // The working array
    this.addInstruction(op.VALUE, false);
  }

  invalidSchema(schema) {
    throw kperror("invalidSchema", ["schema", schema]);
  }

  paramName(param) {
    if (typeof param === "string") {
      return param;
    } else if ("property" in param) {
      return param.property;
    } else {
      return param.name;
    }
  }

  currentScope() {
    return this.activeScopes.at(-1);
  }

  pushScope({ reservedSlots = 1, functionStackIndex = null } = {}) {
    if (this.trace) {
      if (functionStackIndex === null) {
        this.logNodeStart(`Starting scope, reserving ${reservedSlots}`);
      } else {
        this.logNodeStart(
          `Starting scope for function ${functionStackIndex}, reserving ${reservedSlots}`
        );
      }
    }
    this.activeScopes.push(
      new CompiledScope({ firstSlot: reservedSlots, functionStackIndex })
    );
  }

  popScope() {
    if (this.trace) {
      this.logNodeEnd("Finished scope");
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
  constructor(name) {
    this.name = name;
    this.instructions = [];
    this.marks = [];
    this.diagnostics = [];
    this.upvalues = [];
    this.anonymousFunctionCount = 0;
  }

  nextAnonymousFunctionName() {
    this.anonymousFunctionCount += 1;
    return `$anon${this.anonymousFunctionCount}`;
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
    if (this.nameSlots.has(name)) {
      throw kperror("duplicateName", ["name", name]);
    }
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
