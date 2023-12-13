import test from "ava";
import { array, arraySpread, literal, name } from "../src/kpast.js";
import { kpparseSugared } from "../src/kpparse.js";

test("An array spread operator parses to an arraySpread node", (t) => {
  const code = "[1, *foo, 3]";
  const result = kpparseSugared(code);
  t.deepEqual(result, array(literal(1), arraySpread(name("foo")), literal(3)));
});
