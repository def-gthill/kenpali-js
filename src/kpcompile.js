import { getParamPatterns, loadBuiltins } from "./builtins.js";
import { core } from "./core.js";
import * as op from "./instructions.js";
import {
  array,
  arrayPattern,
  object,
  objectPattern,
  transformTree,
} from "./kpast.js";
import kperror from "./kperror.js";
import kpobject, { kpoMerge } from "./kpobject.js";
import { kpparseModule } from "./kpparse.js";
import { either } from "./validate.js";
import { isBuiltin, isObject, isString } from "./values.js";

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
  const library = new Map([...loadCore(), ...builtins]);
  return new Compiler(expression, {
    library,
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
    { library = new Map(), modules = new Map(), trace = false }
  ) {
    const fullLibrary = addModulesToLibrary(library, modules);
    const filteredLibrary = new LibraryFilter(fullLibrary, expression).filter();
    if (trace && filteredLibrary.size > 0) {
      this.log(
        `Including library functions: ${[...filteredLibrary.keys()].join(", ")}`
      );
    }
    this.expression = expression;
    this.library = filteredLibrary;
    this.libraryNames = new Set(filteredLibrary.keys());
    this.modules = modules;
    this.trace = trace;
    this.traceLevel = 0;

    this.activeFunctions = [];
    this.activeScopes = [];
    this.finishedFunctions = [];
  }

  compile() {
    this.beginFunction("$main");
    this.compileExpression(this.expression);
    this.activeFunctions.pop();
    this.compileLibrary();
    const program = this.combineFunctions();
    if (this.trace) {
      this.log("--- Instructions ---");
      this.log(op.disassemble(program));
      this.log("--------------------");
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

  compileLibrary() {
    for (const [name, libraryFunction] of this.library) {
      if (isBuiltin(libraryFunction)) {
        this.compileBuiltin(name, libraryFunction);
        if (libraryFunction.methods) {
          for (const method of libraryFunction.methods) {
            this.compileMethod(name, method);
          }
        }
      } else {
        this.compileExpression(libraryFunction, name);
      }
    }
  }

  compileBuiltin(name, expression) {
    if (this.trace) {
      this.log(`Compiling builtin ${name}`);
    }
    this.pushScope({
      reservedSlots: 3,
      functionStackIndex: this.activeFunctions.length,
    });
    this.beginFunction(name);
    const { paramPattern, namedParamPattern } = getParamPatterns(expression);
    if (paramPattern.names.length > 0) {
      this.declareNames(paramPattern);
    }
    if (namedParamPattern.entries.length > 0) {
      this.declareNames(namedParamPattern);
    }
    const numDeclaredNames = this.activeScopes.at(-1).numDeclaredNames() - 2;
    this.reserveSlots(numDeclaredNames);
    if (paramPattern.names.length > 0) {
      this.addInstruction(op.READ_LOCAL, 0, 1);
      this.addDiagnostic({ name: "<posArgs>" });
      this.assignNames(paramPattern, { isArgumentPattern: true });
    }
    if (namedParamPattern.entries.length > 0) {
      this.addInstruction(op.READ_LOCAL, 0, 2);
      this.addDiagnostic({ name: "<namedArgs>" });
      this.assignNames(namedParamPattern, { isArgumentPattern: true });
    }
    this.addInstruction(op.VALUE, expression);
    this.addInstruction(op.WRITE_LOCAL, 2);
    this.addDiagnostic({ name: "<builtin>" });
    this.addInstruction(op.PUSH, -numDeclaredNames);
    this.addInstruction(op.CALL_BUILTIN, name);
    this.addInstruction(op.POP);
    this.addInstruction(op.WRITE_LOCAL, 0);
    this.addDiagnostic({ name: "<result>" });
    this.addInstruction(op.DISCARD); // The positional arguments handoff
    // (The named arguments slot already got trampled by the result)
    this.popScope();
    this.activeFunctions.pop();
  }

  compileMethod(constructorName, method) {
    const fullName = `${constructorName}/${method.methodName}`;
    if (this.trace) {
      this.log(`Compiling method ${fullName}`);
    }
    this.pushScope({
      reservedSlots: 3,
      functionStackIndex: this.activeFunctions.length,
    });
    this.beginFunction(fullName);
    const { paramPattern, namedParamPattern } = getParamPatterns(method);
    if (paramPattern.names.length > 0) {
      this.declareNames(paramPattern);
    }
    if (namedParamPattern.entries.length > 0) {
      this.declareNames(namedParamPattern);
    }
    const numDeclaredNames = this.activeScopes.at(-1).numDeclaredNames() - 2;
    this.reserveSlots(numDeclaredNames);
    if (paramPattern.names.length > 0) {
      this.addInstruction(op.READ_LOCAL, 0, 1);
      this.addDiagnostic({ name: "<posArgs>" });
      this.assignNames(paramPattern, { isArgumentPattern: true });
    }
    if (namedParamPattern.entries.length > 0) {
      this.addInstruction(op.READ_LOCAL, 0, 2);
      this.addDiagnostic({ name: "<namedArgs>" });
      this.assignNames(namedParamPattern, { isArgumentPattern: true });
    }
    this.addInstruction(op.VALUE, method);
    this.addInstruction(op.WRITE_LOCAL, 1);
    this.addDiagnostic({ name: "<method>" });
    this.addInstruction(op.READ_LOCAL, 0, 0);
    this.addDiagnostic({ name: "<boundMethod>" });
    this.addInstruction(op.SELF);
    this.addInstruction(op.WRITE_LOCAL, 2);
    this.addDiagnostic({ name: "<self>" });
    this.addInstruction(op.PUSH, -numDeclaredNames - 1);
    this.addInstruction(op.CALL_BUILTIN, fullName);
    this.addInstruction(op.POP);
    this.addInstruction(op.WRITE_LOCAL, 0);
    this.addDiagnostic({ name: "<result>" });
    this.popScope();
    this.activeFunctions.pop();
  }

  combineFunctions() {
    for (const finishedFunction of this.finishedFunctions) {
      finishedFunction.instructions.push(op.RETURN);
      finishedFunction.marks.length = finishedFunction.instructions.length;
      finishedFunction.diagnostics.length =
        finishedFunction.instructions.length;
    }
    const functionOffsets = [];
    const functionTable = [];
    const functionNumbersByName = new Map();
    let totalLength = 0;
    for (let i = 0; i < this.finishedFunctions.length; i++) {
      functionOffsets[i] = totalLength;
      functionTable.push({
        name: this.finishedFunctions[i].name,
        offset: totalLength,
      });
      functionNumbersByName.set(this.finishedFunctions[i].name, i);
      totalLength += this.finishedFunctions[i].instructions.length;
    }

    const instructions = [].concat(
      ...this.finishedFunctions.map((f) => f.instructions)
    );
    const marks = [].concat(...this.finishedFunctions.map((f) => f.marks));
    const diagnostics = [].concat(
      ...this.finishedFunctions.map((f) => f.diagnostics)
    );
    for (let i = 0; i < instructions.length; i++) {
      if (marks[i + 1] && "functionNumber" in marks[i + 1]) {
        const functionNumber = marks[i + 1].functionNumber;
        if (this.trace) {
          this.log(
            `Injecting offset ${functionOffsets[functionNumber]} for function ${functionNumber}`
          );
        }
        instructions[i + 1] = functionOffsets[functionNumber];
      }
      if (marks[i + 1] && "functionName" in marks[i + 1]) {
        const functionName = marks[i + 1].functionName;
        const functionNumber = functionNumbersByName.get(functionName);
        const functionOffset = functionOffsets[functionNumber];
        if (this.trace) {
          this.log(
            `Injecting offset ${functionOffset} for function ${functionName}`
          );
        }
        instructions[i + 1] = functionOffset;
        diagnostics[i + 1].number = functionNumber;
      }
    }
    return { instructions, diagnostics, functions: functionTable };
  }

  compileExpression(expression, name) {
    if (
      expression === null ||
      typeof expression !== "object" ||
      !("type" in expression)
    ) {
      throw kperror("notAnExpression", ["value", expression]);
    } else {
      this.compileExpressionByType(expression, name);
    }
  }

  compileExpressionByType(expression, name) {
    switch (expression.type) {
      case "literal":
        this.compileLiteral(expression);
        break;
      case "array":
        this.compileArray(expression);
        break;
      case "object":
        this.compileObject(expression);
        break;
      case "name":
        this.compileName(expression);
        break;
      case "block":
        this.compileBlock(expression);
        break;
      case "function":
        const enclosingFunctionName = this.activeFunctions.at(-1)?.name;
        let functionName =
          name ?? this.activeFunctions.at(-1).nextAnonymousFunctionName();
        if (enclosingFunctionName) {
          functionName = `${enclosingFunctionName}/${functionName}`;
        }
        this.compileFunction(expression, functionName);
        break;
      case "call":
        this.compileCall(expression);
        break;
      case "index":
        this.compileIndex(expression);
        break;
      case "catch":
        this.compileCatch(expression);
        break;
      default:
        throw kperror("notAnExpression", ["value", expression]);
    }
  }

  compileLiteral(expression) {
    this.addInstruction(op.VALUE, expression.value);
  }

  compileArray(expression) {
    if (this.trace) {
      this.logNodeStart("Starting array");
    }
    this.addInstruction(op.EMPTY_ARRAY);
    for (const element of expression.elements) {
      if (element.type === "spread") {
        this.compileExpression(element.value);
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
    for (const entry of expression.entries) {
      if (entry.type === "spread") {
        this.compileExpression(entry.value);
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
    if (this.resolveInModule(expression)) {
      return;
    }
    if (this.resolveLocal(expression)) {
      return;
    }
    if (this.resolveInLibrary(expression)) {
      return;
    }
    const errorDetails = [["name", expression.name]];
    if (expression.from) {
      errorDetails.push(["moduleName", expression.from]);
    }
    throw kperror("nameNotDefined", ...errorDetails);
  }

  resolveInModule(expression) {
    if (expression.from) {
      const fullName = `${expression.from}/${expression.name}`;
      if (this.libraryNames.has(fullName)) {
        this.addInstruction(op.FUNCTION, 0);
        this.addMark({ functionName: fullName });
        this.addDiagnostic({
          name: fullName,
          isBuiltin: true,
        });
        return true;
      } else {
        throw kperror(
          "nameNotDefined",
          ["name", expression.name],
          ["from", expression.from]
        );
      }
    } else {
      return false;
    }
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

  resolveInLibrary(expression) {
    if (this.libraryNames.has(expression.name)) {
      this.addInstruction(op.FUNCTION, 0);
      this.addMark({ functionName: expression.name });
      this.addDiagnostic({
        name: expression.name,
        isBuiltin: true,
      });
      return true;
    } else {
      return false;
    }
  }

  compileBlock(expression) {
    this.reserveSlots(1); // For the result
    this.pushScope();
    this.addInstruction(op.PUSH, 0);
    this.defineNames(expression.defs);
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
    this.reserveSlots(this.activeScopes.at(-1).numDeclaredNames());
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
      return;
    }
    switch (pattern.type) {
      case "arrayPattern":
        for (const element of pattern.names) {
          this.declareNames(element);
        }
        break;
      case "objectPattern":
        for (const entry of pattern.entries) {
          if (entry.type === "rest") {
            this.declareNames(entry.name);
          } else {
            this.declareNames(entry[1]);
          }
        }
        break;
      case "checked":
      case "optional":
      case "rest":
        this.declareNames(pattern.name);
        break;
      default:
        throw kperror("invalidPattern", ["pattern", pattern]);
    }
  }

  assignNames(pattern, { isArgumentPattern = false, isArgument = false } = {}) {
    const activeScope = this.activeScopes.at(-1);
    if (pattern === null) {
      // Expression statement, throw away the result
      this.addInstruction(op.DISCARD);
      return;
    } else if (typeof pattern === "string") {
      this.addInstruction(op.WRITE_LOCAL, activeScope.getSlot(pattern));
      this.addDiagnostic({ name: pattern });
      return;
    }
    switch (pattern.type) {
      case "arrayPattern":
        this.assignNamesInArrayPattern(pattern, { isArgumentPattern });
        break;
      case "objectPattern":
        this.assignNamesInObjectPattern(pattern, { isArgumentPattern });
        break;
      case "checked":
        this.validate(pattern.schema, { isArgument, isArgumentPattern });
        this.assignNames(pattern.name, { isArgument });
        break;
      default:
        throw kperror("invalidPattern", ["pattern", pattern]);
    }
  }

  assignNamesInArrayPattern(pattern, { isArgumentPattern }) {
    this.validate(either("array", "stream"));
    this.addInstruction(op.ARRAY_COPY);
    this.addInstruction(op.ARRAY_REVERSE);
    for (let i = 0; i < pattern.names.length; i++) {
      const element = pattern.names[i];
      if (typeof element === "object" && element.type === "rest") {
        this.addInstruction(op.ARRAY_CUT, pattern.names.length - i - 1);
        this.addInstruction(op.ARRAY_REVERSE);
        this.assignNames(element.name, { isArgumentPattern });
      } else if (typeof element == "object" && element.type === "optional") {
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
    for (const entry of pattern.entries) {
      if (entry.type === "rest") {
        rest = entry.name;
      } else {
        const [key, name] = entry;
        this.addInstruction(op.VALUE, key);
        if (typeof name === "object" && name.type === "optional") {
          this.compileExpression(name.defaultValue);
          this.addInstruction(op.OBJECT_POP_OR_DEFAULT);
          this.assignNames(name.name, { isArgument: isArgumentPattern });
        } else {
          this.addInstruction(op.OBJECT_POP);
          this.addDiagnostic({
            name: key,
            isArgument: isArgumentPattern,
          });
          this.assignNames(name, { isArgument: isArgumentPattern });
        }
      }
    }
    if (rest) {
      this.assignNames(rest, { isArgumentPattern });
    } else {
      this.addInstruction(op.DISCARD);
    }
  }

  compileFunction(expression, name) {
    if (this.trace) {
      this.logNodeStart(`Starting function ${name}`);
    }
    this.pushScope({
      reservedSlots: 3,
      functionStackIndex: this.activeFunctions.length,
    });
    this.beginFunction(name);
    const paramPattern = arrayPattern(...(expression.params ?? []));
    const namedParamPattern = objectPattern(...(expression.namedParams ?? []));
    if (paramPattern.names.length > 0) {
      this.declareNames(paramPattern);
    }
    if (namedParamPattern.entries.length > 0) {
      this.declareNames(namedParamPattern);
    }
    this.reserveSlots(this.activeScopes.at(-1).numDeclaredNames() - 2);
    if (paramPattern.names.length > 0) {
      this.addInstruction(op.READ_LOCAL, 0, 1);
      this.addDiagnostic({ name: "<posArgs>" });
      this.assignNames(paramPattern, { isArgumentPattern: true });
    }
    if (namedParamPattern.entries.length > 0) {
      this.addInstruction(op.READ_LOCAL, 0, 2);
      this.addDiagnostic({ name: "<namedArgs>" });
      this.assignNames(namedParamPattern, { isArgumentPattern: true });
    }
    this.compileExpression(expression.body);
    this.addInstruction(op.WRITE_LOCAL, 0);
    this.addDiagnostic({ name: "<result>" });
    this.clearLocals();
    this.popScope();
    if (this.trace) {
      this.logNodeEnd("Finished function");
    }
    const finishedFunction = this.activeFunctions.pop();
    if (this.activeFunctions.length > 0) {
      // This function is defined inside another function, so we need to
      // add it to the stack and deal with closures.
      this.addInstruction(op.FUNCTION, 0);
      this.addMark({ functionNumber: finishedFunction.number });
      this.addDiagnostic({
        name,
        number: finishedFunction.number,
        isBuiltin: false,
      });
      for (const upvalue of finishedFunction.upvalues) {
        this.addInstruction(op.CLOSURE, upvalue.numLayers, upvalue.slot);
      }
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

  compileCall(expression) {
    if (this.trace) {
      this.logNodeStart("Starting call");
    }
    this.compileExpression(expression.callee);
    this.compileExpression(array(...(expression.args ?? [])));
    this.compileExpression(object(...(expression.namedArgs ?? [])));
    this.addInstruction(op.PUSH, -2);
    this.addInstruction(op.CALL);
    this.addInstruction(op.POP);
    if (this.trace) {
      this.logNodeEnd("Finished call");
    }
  }

  compileIndex(expression) {
    this.compileExpression(expression.collection);
    this.compileExpression(expression.index);
    this.addInstruction(op.INDEX);
  }

  compileCatch(expression) {
    this.addInstruction(op.CATCH, 0);
    const catchIndex = this.currentFunction().instructions.length;
    if (this.trace) {
      this.log(`Catching at ${catchIndex}`);
    }
    this.compileExpression(expression.expression);
    const jumpIndex = this.currentFunction().instructions.length;
    if (this.trace) {
      this.log(`Recovery point at ${jumpIndex}`);
    }
    this.addInstruction(op.UNCATCH);
    this.setInstruction(catchIndex - 1, jumpIndex - catchIndex);
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

  beginFunction(name) {
    if (this.trace) {
      this.log(`Starting function ${this.finishedFunctions.length} (${name})`);
    }
    const f = new CompiledFunction(this.finishedFunctions.length, name);
    this.activeFunctions.push(f);
    this.finishedFunctions.push(f);
  }

  currentFunction() {
    return this.activeFunctions.at(-1);
  }

  reserveSlots(numSlots) {
    if (numSlots > 0) {
      this.addInstruction(op.RESERVE, numSlots);
    }
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
    const f = this.currentFunction();
    f.marks[f.instructions.length - 1] = {
      ...f.marks[f.instructions.length - 1],
      ...mark,
    };
  }

  addDiagnostic(diagnostic) {
    const f = this.currentFunction();
    f.diagnostics[f.instructions.length - 1] = {
      ...f.diagnostics[f.instructions.length - 1],
      ...diagnostic,
    };
  }
}

class CompiledFunction {
  constructor(number, name) {
    this.number = number;
    this.name = name;
    this.instructions = [op.BEGIN];
    this.marks = [];
    this.diagnostics = [{ name, number }];
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

function addModulesToLibrary(library, modules) {
  const result = new Map(library);
  for (const [moduleName, module] of modules) {
    for (const [name, value] of module) {
      result.set(`${moduleName}/${name}`, value);
    }
  }
  return result;
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
        if (node.from) {
          const fullName = `${node.from}/${node.name}`;
          if (outerThis.libraryByName.has(fullName)) {
            outerThis.currentUsage.add(outerThis.libraryByName.get(fullName));
          }
          return;
        }

        for (const scope of outerThis.activeScopes) {
          if (scope.has(node.name)) {
            return;
          }
        }

        if (outerThis.libraryByName.has(node.name)) {
          outerThis.currentUsage.add(outerThis.libraryByName.get(node.name));
        }
      },
      handleBlock(node, transformExpression) {
        const scope = new Set();
        for (const statement of node.defs) {
          if (Array.isArray(statement)) {
            const [name, _] = statement;
            scope.add(name);
          }
        }
        outerThis.activeScopes.push(scope);
        for (const statement of node.defs) {
          if (Array.isArray(statement)) {
            const [_, value] = statement;
            transformExpression(value);
          }
        }
        transformExpression(node.result);
        outerThis.activeScopes.pop();
      },
    });
  }
}
