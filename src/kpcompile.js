import {
  ARRAY_EXTEND,
  ARRAY_POP,
  ARRAY_PUSH,
  DISCARD,
  LOCAL_SLOTS,
  POP,
  PUSH,
  READ_LOCAL,
  READ_OUTER_LOCAL,
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

    this.instructions = [];
    this.diagnostics = [];
    this.activeScopes = [];
  }

  compile() {
    this.compileExpression(this.expression);
    if (this.trace) {
      console.log("--- Instructions ---");
      console.log(disassemble(this.instructions));
      console.log("--------------------");
    }
    return { instructions: this.instructions, diagnostics: this.diagnostics };
  }

  compileExpression(expression) {
    if ("literal" in expression) {
      this.compileLiteral(expression);
    } else if ("array" in expression) {
      this.compileArray(expression);
    } else if ("name" in expression) {
      this.compileName(expression);
    } else if ("defining" in expression) {
      this.compileDefining(expression);
    } else {
      throw kperror("notAnExpression", ["value", expression]);
    }
  }

  compileLiteral(expression) {
    this.instructions.push(VALUE, expression.literal);
  }

  compileArray(expression) {
    this.instructions.push(VALUE, []);
    for (const element of expression.array) {
      if ("spread" in element) {
        this.compileExpression(element.spread);
        this.instructions.push(ARRAY_EXTEND);
      } else {
        this.compileExpression(element);
        this.instructions.push(ARRAY_PUSH);
      }
    }
  }

  // compileArrayWithSpread(expression) {
  //   for (const element of expression.array) {
  //     if ("spread" in element) {
  //       this.compileExpression(element.spread);
  //     } else {
  //       this.compileExpression(element);
  //       this.instructions.push(ARRAY, 1);
  //     }
  //   }
  //   this.instructions.push(FLAT_ARRAY, expression.array.length);
  // }

  // compileSimpleArray(expression) {
  //   for (const element of expression.array) {
  //     this.compileExpression(element);
  //   }
  //   this.instructions.push(ARRAY, expression.array.length);
  // }

  compileName(expression) {
    const slot = this.activeScopes.at(-1).getSlot(expression.name);
    if (slot === undefined) {
      this.compileNameFromOuterScope(expression);
    } else {
      this.instructions.push(READ_LOCAL, slot);
      this.addDiagnostic({ name: expression.name });
    }
  }

  compileNameFromOuterScope(expression) {
    for (let numLayers = 1; numLayers < this.activeScopes.length; numLayers++) {
      const slot = this.activeScopes
        .at(-numLayers - 1)
        .getSlot(expression.name);
      if (slot !== undefined) {
        this.instructions.push(READ_OUTER_LOCAL, numLayers, slot);
        this.addDiagnostic({ name: expression.name });
        return;
      }
    }
    throw kperror("nameNotDefined", ["name", expression.name]);
  }

  compileDefining(expression) {
    this.pushScope();
    this.defineNames(expression.defining);
    this.compileExpression(expression.result);
    this.popScope();
  }

  defineNames(definitions) {
    for (const [pattern, _] of definitions) {
      this.declareNames(pattern);
    }
    this.instructions.push(
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
    } else {
      throw kperror("invalidPattern", ["pattern", pattern]);
    }
  }

  assignNames(pattern) {
    const activeScope = this.activeScopes.at(-1);
    if (typeof pattern === "string") {
      this.instructions.push(WRITE_LOCAL, activeScope.getSlot(pattern));
      this.addDiagnostic({ name: pattern });
    } else if ("arrayPattern" in pattern) {
      for (let i = pattern.arrayPattern.length - 1; i >= 0; i--) {
        this.instructions.push(ARRAY_POP);
        this.assignNames(pattern.arrayPattern[i]);
      }
      this.instructions.push(DISCARD);
    } else if ("objectPattern" in pattern) {
      throw kperror("notImplemented");
    }
  }

  pushScope() {
    if (this.trace) {
      console.log("Push");
    }
    this.activeScopes.push(new CompiledScope());
    this.instructions.push(PUSH);
  }

  popScope() {
    this.activeScopes.pop();
    this.instructions.push(POP);
  }

  addDiagnostic(diagnostic) {
    this.diagnostics[this.instructions.length - 1] = diagnostic;
  }
}

class CompiledScope {
  constructor() {
    this.nameSlots = new Map();
    this.nextSlot = 1;
  }

  declareName(name) {
    this.nameSlots.set(name, this.nextSlot);
    this.nextSlot += 1;
  }

  getSlot(name) {
    return this.nameSlots.get(name);
  }

  numDeclaredNames() {
    return this.nameSlots.size;
  }
}
