import test from "ava";
import {
  LOCAL_SLOTS,
  POP,
  PUSH,
  READ_LOCAL,
  VALUE,
  WRITE_LOCAL,
} from "../src/instructions.js";
import kpvm from "../src/kpvm.js";

test("A single VALUE instruction causes the result to be that value", (t) => {
  const program = { instructions: [VALUE, 42] };

  const result = kpvm(program);

  t.is(result, 42);
});

test("READ_LOCAL and WRITE_LOCAL interact with local name slots", (t) => {
  const program = {
    instructions: [
      PUSH,
      ...[LOCAL_SLOTS, 1],
      ...[VALUE, 42],
      ...[WRITE_LOCAL, 1],
      ...[READ_LOCAL, 1],
      POP,
    ],
  };

  const result = kpvm(program);

  t.is(result, 42);
});
