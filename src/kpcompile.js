import { getParamPatterns, loadBuiltins } from "./builtins.js";
import { core } from "./core.js";
import * as op from "./instructions.js";
import {
  ARG_U16,
  ARG_U32,
  ARG_U8,
  opInfo,
  u16ToBytes,
  u32ToBytes,
  u8ToBytes,
} from "./instructions.js";
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
  isArray,
  isObject,
  isPlatformFunction,
  isPlatformValue,
  isType,
  nullClass,
  numberClass,
  objectClass,
  Protocol,
  protocolClass,
  sequenceProtocol,
  stringClass,
} from "./values.js";

export function kpcompileJson(
  json,
  { names = kpobject(), modules = kpobject(), trace = false } = {},
) {
  const expression = JSON.parse(json);
  return kpcompile(expression, { names, modules, trace });
}

export default function kpcompile(
  expression,
  { names = kpobject(), modules = kpobject(), trace = false } = {},
) {
  const builtins = kpoMerge(loadBuiltins(), names);
  const library = new Map([...loadCore(), ...builtins]);
  const fullLibrary = addModulesToLibrary(library, modules);
  const filteredLibrary = new LibraryFilter(fullLibrary, [
    ["<main>", "<main>", expression],
  ]).filter();
  if (trace && filteredLibrary.size > 0) {
    console.log(
      `Including library functions: ${getFullNamesFromLibrary(filteredLibrary).join(", ")}`,
    );
  }
  try {
    const compiler = new Compiler(filteredLibrary, {
      trace,
    });
    compiler.compileLibrary();
    compiler.compileMain(expression);
    return compiler.finishProgram();
  } catch (error) {
    if (isError(error)) {
      throw new KenpaliError(error, kpcallbackInNewSession);
    } else {
      throw error;
    }
  }
}

export function kpcompileModule(
  module,
  { names = kpobject(), modules = kpobject(), trace = false } = {},
) {
  const builtins = kpoMerge(loadBuiltins(), names, module);
  const library = new Map([...loadCore(), ...builtins]);
  const fullLibrary = addModulesToLibrary(library, modules);
  const filteredLibrary = new LibraryFilter(
    fullLibrary,
    module.map(([name, value]) => ["<entry>", name, value]),
  ).filter();
  if (trace && filteredLibrary.size > 0) {
    console.log(
      `Including library functions: ${getFullNamesFromLibrary(filteredLibrary).join(", ")}`,
    );
  }
  try {
    const compiler = new Compiler(filteredLibrary, {
      trace,
    });
    compiler.compileLibrary();
    compiler.compileModule(module);
    return compiler.finishProgram();
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
  constructor(library, { trace = false } = {}) {
    this.library = library;
    this.currentModuleName = "<main>";
    this.trace = trace;
    this.traceLevel = 0;

    this.activeFunctions = [];
    this.activeScopes = [];
    this.finishedFunctions = [];
    this.functionNumbersByName = new Map();

    this.constants = [];
    this.constantIndices = new Map();
    this.platformValues = [];
    this.platformValueIndices = new Map();
  }

  compileMain(expression) {
    this.beginFunction(this.createFunction("$main"));
    this.compileExpression(expression);
    this.activeFunctions.pop();
  }

  compileModule(module) {
    for (const [name, value] of module) {
      this.beginFunction(this.createFunction(`$${name}`));
      this.compileExpression(value);
      this.activeFunctions.pop();
    }
  }

  finishProgram() {
    const program = this.combineFunctions();
    if (this.trace) {
      this.log("--------------------");
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
    // Create all the functions first so that earlier functions can reference later ones.
    const functions = new Map();
    for (const [moduleName, module] of this.library) {
      this.currentModuleName = moduleName;
      for (const [name, value] of module) {
        const fullName = makeFullName(moduleName, name);
        if (isPlatformFunction(value)) {
          functions.set(fullName, this.createFunction(fullName));
          if (value.methods) {
            for (const method of value.methods) {
              const methodFullName = `${fullName}/${method.methodName}`;
              functions.set(
                methodFullName,
                this.createFunction(methodFullName),
              );
            }
          }
        } else if (value.type === "function") {
          functions.set(fullName, this.createFunction(fullName));
        } else {
          // Not a function, nothing to compile.
        }
      }
    }
    // Now compile the functions.
    for (const [moduleName, module] of this.library) {
      this.currentModuleName = moduleName;
      for (const [name, value] of module) {
        const fullName = makeFullName(moduleName, name);
        if (isPlatformFunction(value)) {
          this.compilePlatformFunction(functions.get(fullName), value);
          if (value.methods) {
            for (const method of value.methods) {
              const methodFullName = `${fullName}/${method.methodName}`;
              this.compileMethod(functions.get(methodFullName), method);
            }
          }
        } else if (value.type === "function") {
          this.compileFunction(value, fullName, functions.get(fullName));
        } else {
          // Not a function, nothing to compile.
        }
      }
    }
  }

  compilePlatformFunction(f, platformFunction) {
    if (this.trace) {
      this.log(`Compiling platform function ${f.name}`);
    }
    this.pushScope({
      reservedSlots: 3,
      functionStackIndex: this.activeFunctions.length,
    });
    this.beginFunction(f);
    const { posParamPattern, namedParamPattern } =
      getParamPatterns(platformFunction);
    if (posParamPattern.names.length > 0) {
      this.declareNames(posParamPattern);
    }
    if (namedParamPattern.entries.length > 0) {
      this.declareNames(namedParamPattern);
    }
    const numDeclaredNames = this.activeScopes.at(-1).numDeclaredNames() - 2;
    this.reserveSlots(numDeclaredNames);
    if (posParamPattern.names.length > 0) {
      this.addInstructionWithArgs(op.READ_LOCAL, [0, 1]);
      this.addDiagnostic({ name: "<posArgs>" });
      this.assignNames(posParamPattern, { isArgumentPattern: true });
    }
    if (namedParamPattern.entries.length > 0) {
      this.addInstructionWithArgs(op.READ_LOCAL, [0, 2]);
      this.addDiagnostic({ name: "<namedArgs>" });
      this.assignNames(namedParamPattern, { isArgumentPattern: true });
    }
    this.loadPlatformValue(platformFunction);
    this.addInstructionWithArgs(op.WRITE_LOCAL, [2]);
    this.addDiagnostic({ name: "<builtin>" });
    this.addInstructionWithArgs(op.PUSH_SCOPE, [numDeclaredNames]);
    const nameConstantIndex = this.getConstantIndex(f.name);
    this.addInstructionWithArgs(
      op.CALL_PLATFORM_FUNCTION,
      [nameConstantIndex],
      op.CALL_PLATFORM_FUNCTION_WIDE,
    );
    this.addInstruction(op.POP_SCOPE);
    this.addInstructionWithArgs(op.WRITE_LOCAL, [0]);
    this.addDiagnostic({ name: "<result>" });
    this.addInstruction(op.DISCARD); // The positional arguments handoff
    // (The named arguments slot already got trampled by the result)
    this.popScope();
    this.activeFunctions.pop();
  }

  compileMethod(f, method) {
    if (this.trace) {
      this.log(`Compiling method ${f.name}`);
    }
    this.pushScope({
      reservedSlots: 3,
      functionStackIndex: this.activeFunctions.length,
    });
    this.beginFunction(f);
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
      this.addInstructionWithArgs(op.READ_LOCAL, [0, 1]);
      this.addDiagnostic({ name: "<posArgs>" });
      this.assignNames(posParamPattern, { isArgumentPattern: true });
    }
    if (namedParamPattern.entries.length > 0) {
      this.addInstructionWithArgs(op.READ_LOCAL, [0, 2]);
      this.addDiagnostic({ name: "<namedArgs>" });
      this.assignNames(namedParamPattern, { isArgumentPattern: true });
    }
    this.loadPlatformValue(method);
    this.addInstructionWithArgs(op.WRITE_LOCAL, [1]);
    this.addDiagnostic({ name: "<method>" });
    this.addInstructionWithArgs(op.READ_LOCAL, [0, 0]);
    this.addDiagnostic({ name: "<boundMethod>" });
    this.addInstruction(op.SELF);
    this.addInstructionWithArgs(op.WRITE_LOCAL, [2]);
    this.addDiagnostic({ name: "<self>" });
    this.addInstructionWithArgs(op.PUSH_SCOPE, [numDeclaredNames + 1]);
    const fullNameConstantIndex = this.getConstantIndex(f.name);
    this.addInstructionWithArgs(
      op.CALL_PLATFORM_FUNCTION,
      [fullNameConstantIndex],
      op.CALL_PLATFORM_FUNCTION_WIDE,
    );
    this.addInstruction(op.POP_SCOPE);
    this.addInstructionWithArgs(op.WRITE_LOCAL, [0]);
    this.addDiagnostic({ name: "<result>" });
    this.popScope();
    this.activeFunctions.pop();
  }

  combineFunctions() {
    for (const finishedFunction of this.finishedFunctions) {
      finishedFunction.instructions.push(op.RETURN);
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
      ...this.finishedFunctions.map((f) => f.instructions),
    );
    const diagnostics = [].concat(
      ...this.finishedFunctions.map((f) => f.diagnostics),
    );
    return {
      instructions,
      constants: this.constants,
      platformValues: this.platformValues,
      diagnostics,
      functions: functionTable,
    };
  }

  compileExpression(expression, name) {
    if (
      expression === null ||
      typeof expression !== "object" ||
      !("type" in expression)
    ) {
      throw kperror("notAnExpression", ["value", deepToKpobject(expression)]);
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
        this.compileFunction(expression, name);
        break;
      case "call":
        this.compileCall(expression);
        break;
      case "index":
        this.compileIndex(expression);
        break;
      case "value":
        this.compileValue(expression);
        break;
      default:
        throw kperror("notAnExpression", ["value", deepToKpobject(expression)]);
    }
  }

  compileLiteral(expression) {
    this.loadValue(expression.value);
  }

  compileArray(expression) {
    if (this.trace) {
      this.logNodeStart("Starting array");
    }
    this.addInstruction(op.EMPTY_ARRAY);
    for (const element of expression.elements) {
      if (element.type === "spread") {
        this.compileExpression(element.value);
        this.validate(sequenceProtocol);
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
        this.validate(objectClass);
        this.addInstruction(op.OBJECT_MERGE);
      } else {
        this.compileExpression(key);
        this.validate(stringClass);
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
      if (libraryHas(this.library, expression.from, expression.name)) {
        const value = libraryGet(
          this.library,
          expression.from,
          expression.name,
        );
        const fullName = makeFullName(expression.from, expression.name);
        this.loadLibraryValue(value, fullName);
        return true;
      } else {
        throw kperror(
          "nameNotDefined",
          ["name", expression.name],
          ["from", expression.from],
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
          ].upvalue(outermostFunction.numLayers + 1, slot);
          for (let i = functionsTraversed.length - 2; i >= 0; i--) {
            upvalueIndex = this.activeFunctions[
              functionsTraversed[i].functionStackIndex
            ].upvalue(0, upvalueIndex);
          }
          this.addInstructionWithArgs(op.READ_UPVALUE, [upvalueIndex]);
          scope.setNeedsClosing(slot);
        } else {
          if (this.trace) {
            if (numLayers === 0) {
              this.log(`Resolved "${expression.name}" in current scope`);
            } else {
              this.log(
                `Resolved "${expression.name}" in scope ${numLayers} out`,
              );
            }
          }
          this.addInstructionWithArgs(op.READ_LOCAL, [numLayers, slot]);
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
    let value;
    let fullName;
    if (
      this.currentModuleName !== "<main>" &&
      libraryHas(this.library, this.currentModuleName, expression.name)
    ) {
      value = libraryGet(this.library, this.currentModuleName, expression.name);
      fullName = makeFullName(this.currentModuleName, expression.name);
    } else if (libraryHas(this.library, "<main>", expression.name)) {
      value = libraryGet(this.library, "<main>", expression.name);
      fullName = expression.name;
    } else {
      return false;
    }
    this.loadLibraryValue(value, fullName);
    return true;
  }

  loadLibraryValue(value, fullName) {
    if (value.type === "value") {
      this.loadValue(value.value);
    } else {
      this.addInstructionWithArgs(
        op.FUNCTION,
        [this.functionNumbersByName.get(fullName)],
        op.FUNCTION_WIDE,
      );
      this.addDiagnostic({
        name: fullName,
        isPlatform: true,
      });
    }
  }

  compileBlock(expression) {
    this.reserveSlots(1); // For the result
    this.pushScope();
    this.addInstructionWithArgs(op.PUSH_SCOPE, [0]);
    this.defineNames(expression.defs);
    this.compileExpression(expression.result);
    this.addInstructionWithArgs(op.WRITE_LOCAL, [0]);
    this.addDiagnostic({ name: "<result>" });
    this.clearLocals();
    this.addInstruction(op.POP_SCOPE);
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
        this.addInstructionWithArgs(op.WRITE_LOCAL, [
          activeScope.getSlot(pattern.name),
        ]);
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
              this.toNamePatternString(x),
            ),
          ]);
        }
        existingRest = element.name;
        this.addInstructionWithArgs(op.ARRAY_CUT, [
          pattern.names.length - i - 1,
        ]);
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
            : this.toNamePatternString(entry),
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

  compileFunction(expression, name, f = null) {
    const enclosingFunctionName = this.activeFunctions.at(-1)?.name;
    let functionName =
      name ?? this.activeFunctions.at(-1).nextAnonymousFunctionName();
    if (enclosingFunctionName) {
      functionName = `${enclosingFunctionName}/${functionName}`;
    }
    if (this.trace) {
      this.logNodeStart(`Starting function ${functionName}`);
    }
    this.pushScope({
      reservedSlots: 3,
      functionStackIndex: this.activeFunctions.length,
    });
    this.beginFunction(f ?? this.createFunction(functionName));
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
      this.addInstructionWithArgs(op.READ_LOCAL, [0, 1]);
      this.addDiagnostic({ name: "<posArgs>" });
      this.assignNames(paramPattern, { isArgumentPattern: true });
    }
    if (namedParamPattern.entries.length > 0) {
      this.addInstructionWithArgs(op.READ_LOCAL, [0, 2]);
      this.addDiagnostic({ name: "<namedArgs>" });
      this.assignNames(namedParamPattern, { isArgumentPattern: true });
    }
    this.compileExpression(expression.body);
    this.addInstructionWithArgs(op.WRITE_LOCAL, [0]);
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
      this.addInstructionWithArgs(
        op.FUNCTION,
        [finishedFunction.number],
        op.FUNCTION_WIDE,
      );
      this.addDiagnostic({
        name: functionName,
        number: finishedFunction.number,
        isPlatform: false,
      });
      for (const upvalue of finishedFunction.upvalues) {
        this.addInstructionWithArgs(op.CLOSURE, [
          upvalue.numLayers,
          upvalue.slot,
        ]);
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
    this.addInstructionWithArgs(op.PUSH_SCOPE, [2]);
    this.addInstruction(op.CALL);
    this.addInstruction(op.POP_SCOPE);
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
    this.loadValue(expression.value);
  }

  validate(schema, { isArgument = false, isArgumentPattern = false } = {}) {
    const kpSchema = deepToKpobject(schema);
    this.validateRecursive(kpSchema);
    this.addInstructionWithArgs(op.JUMP_IF_TRUE, [0]);
    const jumpIndex = this.nextInstructionIndex();
    this.pushSchema(kpSchema);
    this.addInstruction(op.VALIDATION_ERROR);
    this.addDiagnostic({ isArgument, isArgumentPattern });
    this.setInstruction(jumpIndex - 1, this.nextInstructionIndex() - jumpIndex);
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
      this.loadValue(true);
      return;
    }
    this.addInstruction(op.ALIAS);
    const instruction = this.getTypeValidationInstruction(schema);
    if (instruction === op.HAS_TYPE) {
      this.loadPlatformValue(schema);
    }
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
    } else if (isType(schema)) {
      return op.HAS_TYPE;
    } else {
      this.invalidSchema(schema);
    }
  }

  validateEnumSchema(schema) {
    this.validateAny(
      ...schema.get("values").map((option) => () => {
        this.addInstruction(op.ALIAS);
        this.loadValue(option);
        this.addInstruction(op.EQUALS);
      }),
    );
  }

  validateUnionSchema(schema) {
    this.validateAny(
      ...schema.get("options").map((option) => () => {
        this.validateRecursive(option);
      }),
    );
  }

  validateConditionSchema(schema) {
    this.validateEach(
      () => this.validateRecursive(schema.get("schema")),
      () => this.validateCondition(schema.get("condition")),
    );
  }

  validateCondition(condition) {
    this.loadPlatformValue(condition);
    this.addInstruction(op.EMPTY_ARRAY);
    this.addInstructionWithArgs(op.READ_RELATIVE, [2]);
    this.addInstruction(op.ARRAY_PUSH);
    this.addInstruction(op.EMPTY_OBJECT);
    this.addInstructionWithArgs(op.PUSH_SCOPE, [2]);
    this.addInstruction(op.CALL);
    this.addInstruction(op.POP_SCOPE);
  }

  validateArraySchema(schema) {
    this.validateEach(
      () => this.validateTypeSchema(arrayClass),
      () => this.validateArrayElements(schema.get("elements")),
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
      () => this.validateTupleShape(schema.get("shape")),
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
      this.addInstructionWithArgs(op.JUMP_IF_TRUE, [0]);
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
      this.addInstructionWithArgs(op.JUMP_IF_FALSE, [0]);
      failJumpIndices.push(this.nextInstructionIndex());
      this.addInstruction(op.DISCARD);
    }
    this.addInstruction(op.DISCARD);
    for (const jumpIndex of passJumpIndices) {
      const toIndex = this.nextInstructionIndex();
      this.setInstruction(jumpIndex - 1, toIndex - jumpIndex);
    }
    this.loadValue(true);
    this.addInstructionWithArgs(op.JUMP, [2]);
    for (const jumpIndex of failJumpIndices) {
      const toIndex = this.nextInstructionIndex();
      this.setInstruction(jumpIndex - 1, toIndex - jumpIndex);
    }
    this.loadValue(false);
  }

  validateObjectSchema(schema) {
    this.validateEach(
      () => this.validateTypeSchema(objectClass),
      () => this.validateObjectValues(schema.get("values")),
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
      () => this.validateRecordShape(schema.get("shape")),
    );
  }

  validateRecordShape(shape) {
    this.addInstruction(op.ALIAS);
    this.addInstruction(op.OBJECT_COPY);
    const failJumpIndices = [];
    for (const [key, valueSchema] of shape) {
      if (isObject(valueSchema) && valueSchema.get("form") === "optional") {
        this.addInstruction(op.ALIAS);
        this.loadValue(key);
        this.addInstruction(op.OBJECT_HAS);
        this.addInstructionWithArgs(op.JUMP_IF_FALSE, [0]);
        const jumpIndex = this.nextInstructionIndex();
        this.loadValue(key);
        this.addInstruction(op.OBJECT_POP);
        this.validateRecursive(valueSchema.get("schema"));
        this.addInstructionWithArgs(op.JUMP_IF_FALSE, [0]);
        failJumpIndices.push(this.nextInstructionIndex());
        this.setInstruction(
          jumpIndex - 1,
          this.nextInstructionIndex() - jumpIndex,
        );
      } else {
        this.addInstruction(op.ALIAS);
        this.loadValue(key);
        this.addInstruction(op.OBJECT_HAS);
        this.addInstructionWithArgs(op.JUMP_IF_FALSE, [0]);
        failJumpIndices.push(this.nextInstructionIndex());
        this.loadValue(key);
        this.addInstruction(op.OBJECT_POP);
        this.validateRecursive(valueSchema);
        this.addInstructionWithArgs(op.JUMP_IF_FALSE, [0]);
        failJumpIndices.push(this.nextInstructionIndex());
      }
      this.addInstruction(op.DISCARD);
    }
    this.addInstruction(op.DISCARD);
    this.loadValue(true);
    this.addInstructionWithArgs(op.JUMP, [2]);
    for (const jumpIndex of failJumpIndices) {
      const toIndex = this.nextInstructionIndex();
      this.setInstruction(jumpIndex - 1, toIndex - jumpIndex);
    }
    this.loadValue(false);
  }

  validateAny(...validators) {
    const jumpIndices = [];
    for (const validator of validators) {
      validator();
      this.addInstructionWithArgs(op.JUMP_IF_TRUE, [0]);
      jumpIndices.push(this.nextInstructionIndex());
    }
    this.loadValue(false);
    this.addInstructionWithArgs(op.JUMP, [2]);
    for (const jumpIndex of jumpIndices) {
      const toIndex = this.nextInstructionIndex();
      this.setInstruction(jumpIndex - 1, toIndex - jumpIndex);
    }
    this.loadValue(true);
  }

  validateEach(...validators) {
    const jumpIndices = [];
    for (const validator of validators) {
      validator();
      this.addInstructionWithArgs(op.JUMP_IF_FALSE, [0]);
      jumpIndices.push(this.nextInstructionIndex());
    }
    this.loadValue(true);
    this.addInstructionWithArgs(op.JUMP, [2]);
    for (const jumpIndex of jumpIndices) {
      const toIndex = this.nextInstructionIndex();
      this.setInstruction(jumpIndex - 1, toIndex - jumpIndex);
    }
    this.loadValue(false);
  }

  validateAll(schema) {
    const backwardLoopIndex = this.nextInstructionIndex();
    this.addInstruction(op.ALIAS);
    this.addInstruction(op.ARRAY_IS_EMPTY);
    this.addInstructionWithArgs(op.JUMP_IF_TRUE, [0]);
    const forwardLoopIndex = this.nextInstructionIndex();
    this.addInstruction(op.ARRAY_POP);
    this.validateRecursive(schema);
    this.addInstructionWithArgs(op.JUMP_IF_FALSE, [0]);
    const failJumpIndex = this.nextInstructionIndex();
    this.addInstruction(op.DISCARD);
    this.addInstructionWithArgs(op.JUMP_BACK, [
      this.nextInstructionIndex() - backwardLoopIndex + 5,
    ]);
    this.setInstruction(
      forwardLoopIndex - 1,
      this.nextInstructionIndex() - forwardLoopIndex,
    );
    this.addInstruction(op.DISCARD);
    this.loadValue(true);
    this.addInstructionWithArgs(op.JUMP, [4]);
    this.setInstruction(
      failJumpIndex - 1,
      this.nextInstructionIndex() - failJumpIndex,
    );
    this.addInstruction(op.DISCARD); // The value that failed
    this.addInstruction(op.DISCARD); // The working array
    this.loadValue(false);
  }

  invalidSchema(schema) {
    throw kperror("invalidSchema", ["schema", schema]);
  }

  pushSchema(schema) {
    if (isObject(schema)) {
      this.addInstruction(op.EMPTY_OBJECT);
      for (const [key, value] of schema) {
        this.loadValue(key);
        this.pushSchema(value);
        this.addInstruction(op.OBJECT_PUSH);
      }
    } else if (isArray(schema)) {
      this.addInstruction(op.EMPTY_ARRAY);
      for (const element of schema) {
        this.pushSchema(element);
        this.addInstruction(op.ARRAY_PUSH);
      }
    } else {
      this.loadValue(schema);
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
          `Starting scope for function ${functionStackIndex}, reserving ${reservedSlots}`,
        );
      }
    }
    this.activeScopes.push(
      new CompiledScope({ firstSlot: reservedSlots, functionStackIndex }),
    );
  }

  popScope() {
    if (this.trace) {
      this.logNodeEnd("Finished scope");
    }
    this.activeScopes.pop();
  }

  createFunction(name) {
    const number = this.finishedFunctions.length;
    const f = new CompiledFunction(number, name);
    this.finishedFunctions.push(f);
    this.functionNumbersByName.set(name, number);
    return f;
  }

  beginFunction(f) {
    if (this.trace) {
      this.log(`Starting function ${f.number} (${f.name})`);
    }
    this.activeFunctions.push(f);
  }

  currentFunction() {
    return this.activeFunctions.at(-1);
  }

  reserveSlots(numSlots) {
    if (numSlots > 0) {
      this.addInstructionWithArgs(op.RESERVE, [numSlots]);
    }
  }

  loadValue(value) {
    if (isPlatformValue(value)) {
      this.loadPlatformValue(value);
    } else {
      const constantIndex = this.getConstantIndex(value);
      this.addInstructionWithArgs(op.VALUE, [constantIndex], op.VALUE_WIDE);
    }
  }

  loadPlatformValue(value) {
    const index = this.getPlatformValueIndex(value);
    this.addInstructionWithArgs(
      op.PLATFORM_VALUE,
      [index],
      op.PLATFORM_VALUE_WIDE,
    );
  }

  getPlatformValueIndex(value) {
    if (this.platformValueIndices.has(value)) {
      return this.platformValueIndices.get(value);
    } else {
      const index = this.platformValues.length;
      this.platformValues.push(value);
      this.platformValueIndices.set(value, index);
      return index;
    }
  }

  getConstantIndex(constant) {
    if (this.constantIndices.has(constant)) {
      return this.constantIndices.get(constant);
    } else {
      const index = this.constants.length;
      this.constants.push(constant);
      this.constantIndices.set(constant, index);
      return index;
    }
  }

  addInstruction(...instruction) {
    this.currentFunction().instructions.push(...instruction);
  }

  addInstructionWithArgs(instruction, args, wideInstruction = null) {
    const instructions = this.currentFunction().instructions;
    const instructionInfo = opInfo[instruction];
    if (args.length < instructionInfo.args.length) {
      throw new Error(
        `Not enough arguments for instruction ${instructionInfo.name}`,
      );
    }
    let wide = false;
    for (let i = 0; i < args.length; i++) {
      const argType = instructionInfo.args[i];
      if (
        (argType === ARG_U8 && args[i] > op.MAX_U8_VALUE) ||
        (argType === ARG_U16 && args[i] > op.MAX_U16_VALUE)
      ) {
        wide = true;
        break;
      }
    }
    if (wide) {
      if (wideInstruction) {
        instructions.push(wideInstruction);
      } else {
        instructions.push(op.WIDE);
        instructions.push(instruction);
      }
      for (let i = 0; i < args.length; i++) {
        instructions.push(...u32ToBytes(args[i]));
      }
    } else {
      instructions.push(instruction);
      for (let i = 0; i < args.length; i++) {
        switch (instructionInfo.args[i]) {
          case ARG_U8:
            instructions.push(...u8ToBytes(args[i]));
            break;
          case ARG_U16:
            instructions.push(...u16ToBytes(args[i]));
            break;
          case ARG_U32:
            instructions.push(...u32ToBytes(args[i]));
            break;
        }
      }
    }
  }

  setInstruction(index, value) {
    this.currentFunction().instructions[index] = value;
  }

  nextInstructionIndex() {
    return this.currentFunction().instructions.length;
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
      (uv) => uv.numLayers === numLayers && uv.slot === slot,
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
  const result = new Map(modules);
  result.set("<main>", library);
  return result;
}

function flattenLibrary(library) {
  const result = [];
  for (const [moduleName, module] of library) {
    for (const [name, value] of module) {
      result.push([moduleName, name, value]);
    }
  }
  return result;
}

function flattenedLibraryToIndexMap(flattened) {
  const result = new Map();
  flattened.forEach(([moduleName, name], i) => {
    if (!result.has(moduleName)) {
      result.set(moduleName, new Map());
    }
    result.get(moduleName).set(name, i);
  });
  return result;
}

function unflattenLibrary(flattened) {
  const result = new Map();
  for (const [moduleName, name, value] of flattened) {
    if (!result.has(moduleName)) {
      result.set(moduleName, new Map());
    }
    result.get(moduleName).set(name, value);
  }
  return result;
}

function getFullNamesFromLibrary(library) {
  const result = [];
  for (const [moduleName, module] of library) {
    for (const [name] of module) {
      if (moduleName === "<main>") {
        result.push(name);
      } else {
        result.push(makeFullName(moduleName, name));
      }
    }
  }
  return result;
}

function makeFullName(moduleName, name) {
  if (moduleName === "<main>") {
    return name;
  }
  return `${moduleName}/${name}`;
}

function libraryHas(library, moduleName, name) {
  return library.has(moduleName) && library.get(moduleName).has(name);
}

function libraryGet(library, moduleName, name) {
  return library.get(moduleName).get(name);
}

class LibraryFilter extends TreeTransformer {
  constructor(library, rootExpressions) {
    super();
    this.libraryExpressions = flattenLibrary(library);
    this.rootExpressions = rootExpressions;
    this.allExpressions = [...this.libraryExpressions, ...this.rootExpressions];
    this.libraryIndexMap = flattenedLibraryToIndexMap(this.libraryExpressions);
    this.activeScopes = [];
    this.usage = this.allExpressions.map(() => new Set());
  }

  filter() {
    for (let i = 0; i < this.allExpressions.length; i++) {
      const [moduleName, _name, expression] = this.allExpressions[i];
      this.currentUsage = this.usage[i];
      this.currentModuleName = moduleName;
      this.transformExpression(expression);
    }
    const grey = new Set(
      this.rootExpressions.map((_, i) => this.allExpressions.length - i - 1),
    );
    const black = new Set();
    while (grey.size > 0) {
      for (const expression of grey) {
        for (const usage of this.usage[expression]) {
          if (!black.has(usage)) {
            grey.add(usage);
          }
        }
        grey.delete(expression);
        black.add(expression);
        break;
      }
    }
    return unflattenLibrary(
      this.libraryExpressions.filter((_, i) => black.has(i)),
    );
  }

  transformName(expression) {
    this.resolveName(expression);
    return super.transformName(expression);
  }

  hasInLibrary(moduleName, name) {
    return libraryHas(this.libraryIndexMap, moduleName, name);
  }

  getLibraryIndex(moduleName, name) {
    return libraryGet(this.libraryIndexMap, moduleName, name);
  }

  resolveName(expression) {
    if (expression.from) {
      if (this.hasInLibrary(expression.from, expression.name)) {
        this.currentUsage.add(
          this.getLibraryIndex(expression.from, expression.name),
        );
      }
      return;
    }

    for (const scope of this.activeScopes) {
      if (scope.has(expression.name)) {
        return;
      }
    }

    if (this.currentModuleName !== "<main>") {
      if (this.hasInLibrary(this.currentModuleName, expression.name)) {
        this.currentUsage.add(
          this.getLibraryIndex(this.currentModuleName, expression.name),
        );
        return;
      }
    }

    if (this.hasInLibrary("<main>", expression.name)) {
      this.currentUsage.add(this.getLibraryIndex("<main>", expression.name));
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
