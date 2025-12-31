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
        const parserModule = loadModule("parser");
        const astModule = loadModule("ast");
        const lexerModule = loadModule("lexer");
        const desugarerModule = loadModule("desugarer");
        parse = kpeval(name("parse", "parser"), {
          modules: new Map([
            ["parser", parserModule],
            ["ast", astModule],
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

function loadModule(name) {
  const code = fs.readFileSync(path.join(dirname, `${name}.kpc`));
  return kpmodule(kpparseModule(code));
}
