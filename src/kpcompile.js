import { getParamPatterns, loadBuiltins } from "./builtins.js";
import { core } from "./core.js";
import * as op from "./instructions.js";
import {
  array,
  arrayPattern,
  object,
  objectPattern,
  TreeTransformer,
} from "./kpast.js";
import kperror, { errorClass, isError, KenpaliError } from "./kperror.js";
import kpobject, { deepToKpobject, kpoMerge } from "./kpobject.js";
import { kpparseModule } from "./kpparse.js";
import { kpcallbackInNewSession } from "./kpvm.js";
import { streamClass } from "./stream.js";
import { either } from "./validate.js";
import {
  anyProtocol,
  arrayClass,
  booleanClass,
  Class,
  classClass,
  functionClass,
  instanceProtocol,
  isObject,
  isPlatformFunction,
  nullClass,
  numberClass,
  objectClass,
  Protocol,
  protocolClass,
  sequenceProtocol,
  stringClass,
  typeProtocol,
} from "./values.js";

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
  try {
    return new Compiler(expression, {
      library,
      modules,
      trace,
    }).compile();
  } catch (error) {
    if (isError(error)) {
      throw new KenpaliError(error, kpcallbackInNewSession);
    } else {
      throw error;
    }
  }
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
    for (const [name, value] of this.library) {
      if (isPlatformFunction(value)) {
        this.compileBuiltin(name, value);
        if (value.methods) {
          for (const method of value.methods) {
            this.compileMethod(name, method);
          }
        }
      } else if (value.type === "function") {
        this.compileExpression(value, name);
      } else {
        // Not a function, nothing to compile.
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
    const { posParamPattern, namedParamPattern } = getParamPatterns(expression);
    if (posParamPattern.names.length > 0) {
      this.declareNames(posParamPattern);
    }
    if (namedParamPattern.entries.length > 0) {
      this.declareNames(namedParamPattern);
    }
    const numDeclaredNames = this.activeScopes.at(-1).numDeclaredNames() - 2;
    this.reserveSlots(numDeclaredNames);
    if (posParamPattern.names.length > 0) {
      this.addInstruction(op.READ_LOCAL, 0, 1);
      this.addDiagnostic({ name: "<posArgs>" });
      this.assignNames(posParamPattern, { isArgumentPattern: true });
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
    const { posParamPattern, namedParamPattern } = getParamPatterns(method);
    if (posParamPattern.names.length > 0) {
      this.declareNames(posParamPattern);
    }
    if (namedParamPattern.entries.length > 0) {
      this.declareNames(namedParamPattern);
    }
    const numDeclaredNames = this.activeScopes.at(-1).numDeclaredNames() - 2;
    this.reserveSlots(numDeclaredNames);
    if (posParamPattern.names.length > 0) {
      this.addInstruction(op.READ_LOCAL, 0, 1);
      this.addDiagnostic({ name: "<posArgs>" });
      this.assignNames(posParamPattern, { isArgumentPattern: true });
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
      case "value":
        this.compileValue(expression);
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
    for (const [key, value] of expression.entries) {
      if (key.type === "spread") {
        this.compileExpression(value);
        this.addInstruction(op.OBJECT_MERGE);
      } else {
        this.compileExpression(key);
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
      if (this.library.has(fullName)) {
        this.addInstruction(op.FUNCTION, 0);
        this.addMark({ functionName: fullName });
        this.addDiagnostic({
          name: fullName,
          isPlatform: true,
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
    const value = this.library.get(expression.name);
    if (value === undefined) {
      return false;
    }
    if (value.type === "value") {
      this.addInstruction(op.VALUE, value.value);
    } else {
      this.addInstruction(op.FUNCTION, 0);
      this.addMark({ functionName: expression.name });
      this.addDiagnostic({
        name: expression.name,
        isPlatform: true,
      });
    }
    return true;
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
      const name = pattern.type === "name" ? pattern.name : undefined;
      this.compileExpression(expression, name);
      this.assignNames(pattern);
    }
  }

  declareNames(pattern) {
    const activeScope = this.activeScopes.at(-1);
    if (pattern === null) {
      return;
    }
    switch (pattern.type) {
      case "ignore":
        break;
      case "name":
        activeScope.declareName(pattern.name);
        if (this.trace) {
          this.log(`Declared name "${pattern.name}"`);
        }
        break;
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
    switch (pattern.type) {
      case "ignore":
        // Expression statement, throw away the result
        this.addInstruction(op.DISCARD);
        break;
      case "name":
        this.addInstruction(op.WRITE_LOCAL, activeScope.getSlot(pattern.name));
        this.addDiagnostic({ name: pattern.name });
        break;
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
    this.validate(either(arrayClass, streamClass));
    this.addInstruction(op.ALIAS);
    this.addInstruction(op.ARRAY_COPY);
    this.addInstruction(op.ARRAY_REVERSE);
    let existingRest = null;
    for (let i = 0; i < pattern.names.length; i++) {
      const element = pattern.names[i];
      if (typeof element === "object" && element.type === "rest") {
        if (existingRest !== null) {
          throw kperror("overlappingRestPatterns", [
            "names",
            [existingRest, element.name].map((x) =>
              this.toNamePatternString(x)
            ),
          ]);
        }
        existingRest = element.name;
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
          name: this.toNamePatternString(element),
          isArgument: isArgumentPattern,
        });
        this.assignNames(element, { isArgument: isArgumentPattern });
      }
    }
    this.addInstruction(op.DISCARD);
    this.addInstruction(op.DISCARD);
  }

  assignNamesInObjectPattern(pattern, { isArgumentPattern }) {
    this.validate(either(objectClass, instanceProtocol));
    this.addInstruction(op.OBJECT_COPY);
    let rest = null;
    for (const entry of pattern.entries) {
      if (entry.type === "rest") {
        throw new Error("Is anyone still using this?");
        if (rest !== null) {
          throw kperror("overlappingRestPatterns", [
            "names",
            [rest, entry.name].map((x) => this.toNamePatternString(x)),
          ]);
        }
        rest = entry.name;
      } else {
        const [key, name] = entry;
        if (key.type === "rest") {
          if (rest !== null) {
            throw kperror("overlappingRestPatterns", [
              "names",
              [rest, name].map((x) => this.toNamePatternString(x)),
            ]);
          }
          rest = name;
        } else {
          this.compileExpression(key);
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
    }
    if (rest) {
      this.assignNames(rest, { isArgumentPattern });
    } else {
      this.addInstruction(op.DISCARD);
    }
  }

  toNamePatternString(pattern) {
    switch (pattern.type) {
      case "ignore":
        return "_";
      case "name":
        return pattern.name;
      case "arrayPattern":
        return `[${pattern.names.map((x) => this.toNamePatternString(x)).join(", ")}]`;
      case "objectPattern":
        const entryStrings = pattern.entries.map((entry) =>
          Array.isArray(entry)
            ? `${entry[0]}: ${this.toNamePatternString(entry[1])}`
            : this.toNamePatternString(entry)
        );
        return `{${entryStrings.join(", ")}}`;
      case "checked":
      case "optional":
      case "rest":
        return this.toNamePatternString(pattern.name);
      default:
        throw kperror("invalidPattern", ["pattern", pattern]);
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
    const paramPattern = arrayPattern(...(expression.posParams ?? []));
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
        isPlatform: false,
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
    this.compileExpression(array(...(expression.posArgs ?? [])));
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

  compileValue(expression) {
    this.addInstruction(op.VALUE, expression.value);
  }

  validate(schema, { isArgument = false, isArgumentPattern = false } = {}) {
    this.validateRecursive(deepToKpobject(schema));
    this.addInstruction(op.VALUE, schema);
    this.addInstruction(op.ERROR_IF_INVALID);
    this.addDiagnostic({ isArgument, isArgumentPattern });
  }

  validateRecursive(schema) {
    if (schema instanceof Class || schema instanceof Protocol) {
      this.validateTypeSchema(schema);
    } else if (isObject(schema) && schema.has("form")) {
      switch (schema.get("form")) {
        case "enum":
          this.validateEnumSchema(schema);
          break;
        case "union":
          this.validateUnionSchema(schema);
          break;
        case "condition":
          this.validateConditionSchema(schema);
          break;
        case "array":
          this.validateArraySchema(schema);
          break;
        case "tuple":
          this.validateTupleSchema(schema);
          break;
        case "object":
          this.validateObjectSchema(schema);
          break;
        case "record":
          this.validateRecordSchema(schema);
          break;
        default:
          this.invalidSchema(schema);
      }
    } else {
      this.invalidSchema(schema);
    }
  }

  validateTypeSchema(schema) {
    if (schema === anyProtocol) {
      this.addInstruction(op.VALUE, true);
      return;
    }
    this.addInstruction(op.ALIAS);
    const instruction = this.getTypeValidationInstruction(schema);
    this.addInstruction(instruction);
  }

  getTypeValidationInstruction(schema) {
    if (schema === nullClass) {
      return op.IS_NULL;
    } else if (schema === booleanClass) {
      return op.IS_BOOLEAN;
    } else if (schema === numberClass) {
      return op.IS_NUMBER;
    } else if (schema === stringClass) {
      return op.IS_STRING;
    } else if (schema === arrayClass) {
      return op.IS_ARRAY;
    } else if (schema === streamClass) {
      return op.IS_STREAM;
    } else if (schema === objectClass) {
      return op.IS_OBJECT;
    } else if (schema === functionClass) {
      return op.IS_FUNCTION;
    } else if (schema === errorClass) {
      return op.IS_ERROR;
    } else if (schema === classClass) {
      return op.IS_CLASS;
    } else if (schema === protocolClass) {
      return op.IS_PROTOCOL;
    } else if (schema === sequenceProtocol) {
      return op.IS_SEQUENCE;
    } else if (schema === typeProtocol) {
      return op.IS_TYPE;
    } else if (schema === instanceProtocol) {
      return op.IS_INSTANCE;
    } else {
      this.invalidSchema(schema);
    }
  }

  validateEnumSchema(schema) {
    this.validateAny(
      ...schema.get("values").map((option) => () => {
        this.addInstruction(op.ALIAS);
        this.addInstruction(op.VALUE, option);
        this.addInstruction(op.EQUALS);
      })
    );
  }

  validateUnionSchema(schema) {
    this.validateAny(
      ...schema.get("options").map((option) => () => {
        this.validateRecursive(option);
      })
    );
  }

  validateConditionSchema(schema) {
    throw new Error("Not implemented");
  }

  validateArraySchema(schema) {
    this.validateEach(
      () => this.validateTypeSchema(arrayClass),
      () => this.validateArrayElements(schema.get("elements"))
    );
  }

  validateArrayElements(schema) {
    this.addInstruction(op.ALIAS);
    this.addInstruction(op.ARRAY_COPY);
    this.validateAll(schema);
  }

  validateTupleSchema(schema) {
    this.validateEach(
      () => this.validateTypeSchema(arrayClass),
      () => this.validateTupleShape(schema.get("shape"))
    );
  }

  validateTupleShape(shape) {
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
      if (isObject(element) && element.get("form") === "optional") {
        subschema = element.get("schema");
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

  validateObjectSchema(schema) {
    this.validateEach(
      () => this.validateTypeSchema(objectClass),
      () => this.validateObjectValues(schema.get("values"))
    );
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

  validateRecordSchema(schema) {
    this.validateEach(
      () => this.validateTypeSchema(objectClass),
      () => this.validateRecordShape(schema.get("shape"))
    );
  }

  validateRecordShape(shape) {
    this.addInstruction(op.ALIAS);
    this.addInstruction(op.OBJECT_COPY);
    const failJumpIndices = [];
    for (const [key, valueSchema] of shape) {
      if (isObject(valueSchema) && valueSchema.get("form") === "optional") {
        this.addInstruction(op.VALUE, key);
        this.addInstruction(op.OBJECT_HAS);
        this.addInstruction(op.JUMP_IF_FALSE, 0);
        const jumpIndex = this.nextInstructionIndex();
        this.addInstruction(op.VALUE, key);
        this.addInstruction(op.OBJECT_POP);
        this.validateRecursive(valueSchema.get("schema"));
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

  validateAny(...validators) {
    const jumpIndices = [];
    for (const validator of validators) {
      validator();
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

  validateEach(...validators) {
    const jumpIndices = [];
    for (const validator of validators) {
      validator();
      this.addInstruction(op.JUMP_IF_FALSE, 0);
      jumpIndices.push(this.nextInstructionIndex());
    }
    this.addInstruction(op.VALUE, true);
    this.addInstruction(op.JUMP, 2);
    for (const jumpIndex of jumpIndices) {
      const toIndex = this.nextInstructionIndex();
      this.setInstruction(jumpIndex - 1, toIndex - jumpIndex);
    }
    this.addInstruction(op.VALUE, false);
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

class LibraryFilter extends TreeTransformer {
  constructor(library, expression) {
    super();
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
      this.transformExpression(this.allExpressions[i][1]);
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

  transformName(expression) {
    this.resolveName(expression);
    return super.transformName(expression);
  }

  resolveName(expression) {
    if (expression.from) {
      const fullName = `${expression.from}/${expression.name}`;
      if (this.libraryByName.has(fullName)) {
        this.currentUsage.add(this.libraryByName.get(fullName));
      }
      return;
    }

    for (const scope of this.activeScopes) {
      if (scope.has(expression.name)) {
        return;
      }
    }

    if (this.libraryByName.has(expression.name)) {
      this.currentUsage.add(this.libraryByName.get(expression.name));
    }
  }

  transformBlock(expression) {
    const scope = new Set();
    for (const statement of expression.defs) {
      const [name, _] = statement;
      scope.add(name);
    }
    this.activeScopes.push(scope);
    const result = super.transformBlock(expression);
    this.activeScopes.pop();
    return result;
  }
}
