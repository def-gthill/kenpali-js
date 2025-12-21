import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { kpcall } from "./interop.js";
import kpeval from "./kpeval.js";
import { kpparseModule } from "./kpparse.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default function kpparseBootstrap(code, options = {}) {
  const parserCode = fs.readFileSync(path.join(dirname, "parser.kpc"));
  const parserModule = kpparseModule(parserCode);
  const parser = parserModule.find(([name]) => name === "parse")[1];
  const parse = kpeval(parser);
  return kpcall(parse, [code], options);
}
