import test from "ava";
import { dumpBinary, fromBase64, loadBinary, toBase64 } from "../src/binary.js";
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
    name: "Natural Function",
    code: `foo = (x) => [x]; foo(729)`,
    expectedResult: [729],
  },
  {
    name: "Platform Function",
    code: "1 | add(2)",
    expectedResult: 3,
  },
  {
    name: "Constructor and Methods",
    code: `foo = newVar("Hello"); foo.set("Goodbye"); [foo.get(), ", world!"] | join`,
    expectedResult: "Goodbye, world!",
  },
  {
    name: "Nested Closure",
    code: `foo = (x) => (y) => (z) => [x, y, z]; foo(1)(2)(3)`,
    expectedResult: [1, 2, 3],
  },
];

const only = [];

for (const testProgram of testPrograms) {
  if (only.length > 0 && !only.includes(testProgram.name)) {
    continue;
  }
  test(`Round-tripping ${testProgram.name} from binary produces the same binary`, (t) => {
    const program = kpcompile(kpparse(testProgram.code));
    const originalBinary = dumpBinary(program);
    const reloadedProgram = loadBinary(originalBinary);
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

  test(`Round-tripping ${testProgram.name} to base64 and back produces the same binary`, (t) => {
    const program = kpcompile(kpparse(testProgram.code));
    const binary = dumpBinary(program);
    const base64 = toBase64(binary);
    const reloadedBinary = fromBase64(base64);
    t.deepEqual(binary, reloadedBinary);
  });
}
