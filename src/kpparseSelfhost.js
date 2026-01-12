import { fromBase64, loadBinary } from "./binary.js";
import { kpcall } from "./interop.js";
import kpvm from "./kpvm.js";
import { kpBytecode } from "./parser.kpbm.js";

let parse = null;

export default function kpparseSelfhost(code, options = {}) {
  if (!parse) {
    const binary = fromBase64(kpBytecode);
    const program = loadBinary(binary);
    parse = kpvm(program, { entrypoint: "parse" });
  }
  return kpcall(parse, [code], options);
}
