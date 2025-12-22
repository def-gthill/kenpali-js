import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { kpcall, kpcallbackInNewSession } from "./interop.js";
import { KenpaliError, kptry } from "./kperror.js";
import kpeval from "./kpeval.js";
import kpobject from "./kpobject.js";
import { kpparseModule } from "./kpparse.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));

let parse = null;

export default function kpparseBootstrap(code, options = {}) {
  function loadSavingError(moduleName, f) {
    return kptry(f, (error) => {
      parse = new KenpaliError(
        error,
        kpcallbackInNewSession,
        `Error loading ${moduleName} module`
      );
      throw parse;
    });
  }
  if (!parse) {
    const lexerModule = loadSavingError("lexer", loadLexerModule);
    console.log("Lexer module loaded");
    const desugarerModule = loadSavingError("desugarer", loadDesugarerModule);
    console.log("Desugarer module loaded");
    const parserModule = loadSavingError("parser", loadParserModule);
    console.log("Parser module loaded");
    const parser = parserModule.find(([name]) => name === "parse")[1];
    parse = kpeval(parser, {
      modules: kpobject(["lexer", lexerModule], ["desugarer", desugarerModule]),
    });
  }
  if (parse instanceof KenpaliError) {
    throw parse;
  }
  return kpcall(parse, [code], options);
}

function loadLexerModule() {
  const lexerCode = fs.readFileSync(path.join(dirname, "lexer.kpc"));
  const lexerModule = kpparseModule(lexerCode);
  return lexerModule;
}

function loadDesugarerModule() {
  const desugarerCode = fs.readFileSync(path.join(dirname, "desugarer.kpc"));
  const desugarerModule = kpparseModule(desugarerCode);
  return desugarerModule;
}

function loadParserModule() {
  const parserCode = fs.readFileSync(path.join(dirname, "parser.kpc"));
  const parserModule = kpparseModule(parserCode);
  return parserModule;
}
