import test from "ava";
import { dumpBinary, loadBinary } from "../src/binary.js";
import { disassemble } from "../src/instructions.js";
import kpcompile from "../src/kpcompile.js";
import kpparse from "../src/kpparse.js";
import kpvm from "../src/kpvm.js";

const testPrograms = [
  {
    name: "Empty Array",
    code: "[]",
    expectedResult: [],
  },
  {
    name: "Big Number",
    code: "729",
    expectedResult: 729,
  },
  {
    name: "String",
    code: `"Hello, world!"`,
    expectedResult: "Hello, world!",
  },
  {
    name: "Function",
    code: `foo = (x) => [x]; foo(729)`,
    expectedResult: [729],
  },
];

const only = [];

for (const testProgram of testPrograms) {
  if (only.length > 0 && !only.includes(testProgram.name)) {
    continue;
  }
  test(`Round-tripping ${testProgram.name} from binary produces the same binary`, (t) => {
    const program = kpcompile(kpparse(testProgram.code));
    console.log(disassemble(program));
    const originalBinary = dumpBinary(program);
    const reloadedProgram = loadBinary(originalBinary);
    console.log(disassemble(reloadedProgram));
    const roundTrippedBinary = dumpBinary(reloadedProgram);
    t.deepEqual(originalBinary, roundTrippedBinary);
  });

  test(`Round-tripping ${testProgram.name} to binary and running it produces the expected result`, (t) => {
    const program = kpcompile(kpparse(testProgram.code));
    const originalResult = kpvm(program);
    t.deepEqual(originalResult, testProgram.expectedResult);
    const binary = dumpBinary(program);
    const reloadedProgram = loadBinary(binary);
    const roundTrippedResult = kpvm(reloadedProgram);
    t.deepEqual(roundTrippedResult, testProgram.expectedResult);
  });
}
