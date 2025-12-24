import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { kpcall, kpcallbackInNewSession } from "./interop.js";
import { name } from "./kpast.js";
import { KenpaliError, kptry } from "./kperror.js";
import kpeval from "./kpeval.js";
import kpmodule from "./kpmodule.js";
import { kpparseModule } from "./kpparse.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));

let parse = null;

export default function kpparseBootstrap(code, options = {}) {
  if (!parse) {
    kptry(
      () => {
        const lexerModule = loadLexerModule();
        const desugarerModule = loadDesugarerModule();
        const parserModule = loadParserModule();
        parse = kpeval(name("parse", "parser"), {
          modules: new Map([
            ["parser", parserModule],
            ["lexer", lexerModule],
            ["desugarer", desugarerModule],
          ]),
        });
      },
      (error) => {
        parse = new KenpaliError(
          error,
          kpcallbackInNewSession,
          "Error compiling parser"
        );
        throw parse;
      }
    );
  }
  if (parse instanceof KenpaliError) {
    throw parse;
  }
  return kpcall(parse, [code], options);
}

function loadLexerModule() {
  const lexerCode = fs.readFileSync(path.join(dirname, "lexer.kpc"));
  const lexerModule = kpmodule(kpparseModule(lexerCode));
  return lexerModule;
}

function loadDesugarerModule() {
  const desugarerCode = fs.readFileSync(path.join(dirname, "desugarer.kpc"));
  const desugarerModule = kpmodule(kpparseModule(desugarerCode));
  return desugarerModule;
}

function loadParserModule() {
  const parserCode = fs.readFileSync(path.join(dirname, "parser.kpc"));
  const parserModule = kpmodule(kpparseModule(parserCode));
  return parserModule;
}
