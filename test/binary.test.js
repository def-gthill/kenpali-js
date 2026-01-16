import test from "ava";
import {
  kpcompile,
  kpmodule,
  kpparse,
  kpvm,
  platformFunction,
} from "../index.js";
import { dumpBinary, fromBase64, loadBinary, toBase64 } from "../src/binary.js";
import { disassemble } from "../src/instructions.js";

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
  {
    name: "Many Platform Values",
    code: `[${bigArrayOf((i) => `m/n${i}()`).join(", ")}]`,
    modules: new Map([
      [
        "m",
        kpmodule(bigArrayOf((i) => platformFunction(`n${i}`, {}, () => i))),
      ],
    ]),
    expectedResult: bigArrayOf((i) => i),
  },
  {
    name: "Many Constants",
    code: `[${bigArrayOf((i) => `${i}`).join(", ")}]`,
    expectedResult: bigArrayOf((i) => i),
  },
  {
    name: "Many Variables",
    code: [
      ...bigArrayOf((i) => `x${i} = ${i}`),
      `[${bigArrayOf((i) => `x${i}`).join(", ")}]`,
    ].join("; "),
    expectedResult: bigArrayOf((i) => i),
  },
  {
    name: "Many Platform Function Parameters",
    code: `m/foo(${bigArrayOf((i) => `${i}`).join(", ")})`,
    modules: new Map([
      [
        "m",
        kpmodule([
          platformFunction(
            "foo",
            {
              posParams: bigArrayOf((i) => `x${i}`),
            },
            (args) => args
          ),
        ]),
      ],
    ]),
    expectedResult: bigArrayOf((i) => i),
  },
  {
    name: "Many Array Destructures with Rest",
    code: `[*rest, ${bigArrayOf((i) => `x${i}`).join(", ")}] = [${bigArrayOf((i) => i).join(", ")}, 256, 257]; rest`,
    expectedResult: [0, 1],
  },
];

function bigArrayOf(f) {
  return Array(257)
    .fill(0)
    .map((_, i) => f(i));
}

const only = ["Many Array Destructures with Rest"];

for (const testProgram of testPrograms) {
  if (only.length > 0 && !only.includes(testProgram.name)) {
    continue;
  }
  function compile() {
    return kpcompile(kpparse(testProgram.code), {
      modules: testProgram.modules,
    });
  }
  function toBinary(program) {
    return dumpBinary(program, { modules: testProgram.modules });
  }
  function fromBinary(binary) {
    return loadBinary(binary, { modules: testProgram.modules });
  }
  test(`Round-tripping ${testProgram.name} from binary produces the same binary`, (t) => {
    const program = compile();
    console.log(disassemble(program));
    const originalBinary = toBinary(program);
    const reloadedProgram = fromBinary(originalBinary);
    const roundTrippedBinary = toBinary(reloadedProgram);
    t.deepEqual(originalBinary, roundTrippedBinary);
  });

  test(`Round-tripping ${testProgram.name} to binary and running it produces the expected result`, (t) => {
    const program = compile();
    const originalResult = kpvm(program);
    t.deepEqual(originalResult, testProgram.expectedResult);
    const binary = toBinary(program);
    const reloadedProgram = fromBinary(binary);
    const roundTrippedResult = kpvm(reloadedProgram);
    t.deepEqual(roundTrippedResult, testProgram.expectedResult);
  });

  test(`Round-tripping ${testProgram.name} to base64 and back produces the same binary`, (t) => {
    const program = compile();
    const binary = toBinary(program);
    const base64 = toBase64(binary);
    const reloadedBinary = fromBase64(base64);
    t.deepEqual(binary, reloadedBinary);
  });
}
