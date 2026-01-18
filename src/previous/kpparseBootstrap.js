import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { kpcall, kpcallbackInNewSession } from "./interop.js";
import { name } from "./kpast.js";
import { KenpaliError, kptry } from "./kperror.js";
import kpeval from "./kpeval.js";
import kpmodule from "./kpmodule.js";
import { deepToJsObject } from "./kpobject.js";
import { kpparseModule } from "./kpparse.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));

let parse = null;

export default function kpparseBootstrap(code, options = {}) {
  if (!parse) {
    kptry(
      () => {
        parse = kpeval(name("parse", "parser"), loadParser());
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
  return deepToJsObject(
    kptry(
      () => {
        return kpcall(parse, [code], options);
      },
      (error) => {
        throw new KenpaliError(
          error,
          kpcallbackInNewSession,
          "Error parsing code"
        );
      }
    )
  );
}

let parseModule = null;

export function kpparseModuleBootstrap(code, options = {}) {
  if (!parseModule) {
    kptry(
      () => {
        parseModule = kpeval(name("parseModule", "parser"), loadParser());
      },
      (error) => {
        parseModule = new KenpaliError(
          error,
          kpcallbackInNewSession,
          "Error compiling parser"
        );
        throw parseModule;
      }
    );
  }
  if (parseModule instanceof KenpaliError) {
    throw parseModule;
  }
  return deepToJsObject(
    kptry(
      () => {
        return kpcall(parseModule, [code], options);
      },
      (error) => {
        throw new KenpaliError(
          error,
          kpcallbackInNewSession,
          "Error parsing module"
        );
      }
    )
  );
}

function loadParser() {
  const parserModule = loadModule("parser");
  const astModule = loadModule("ast");
  const lexerModule = loadModule("lexer");
  const desugarerModule = loadModule("desugarer");
  return {
    modules: new Map([
      ["parser", parserModule],
      ["ast", astModule],
      ["lexer", lexerModule],
      ["desugarer", desugarerModule],
    ]),
  };
}

function loadModule(name) {
  const code = fs.readFileSync(path.join(dirname, `${name}.kpcm`));
  return kpmodule(kpparseModule(code));
}
