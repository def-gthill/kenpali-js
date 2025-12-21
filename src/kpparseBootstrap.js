import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { kpcall } from "./interop.js";
import kpeval from "./kpeval.js";
import kpobject from "./kpobject.js";
import { kpparseModule } from "./kpparse.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default function kpparseBootstrap(code, options = {}) {
  const lexerModule = loadLexerModule();
  const desugarerModule = loadDesugarerModule();
  const parserModule = loadParserModule();
  const parser = parserModule.find(([name]) => name === "parse")[1];
  const parse = kpeval(parser, {
    modules: kpobject(["lexer", lexerModule], ["desugarer", desugarerModule]),
  });
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
