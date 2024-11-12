import fs from "node:fs";
import kpcompile from "./kpcompile.js";
import kpparse from "./kpparse.js";
import kpvm from "./kpvm.js";
import { toString } from "./values.js";

const fileName = process.argv[2];
const code = fs.readFileSync(fileName);
console.log(toString(kpvm(kpcompile(kpparse(code)))));
