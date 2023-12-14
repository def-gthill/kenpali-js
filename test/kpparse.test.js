import test from "ava";
import {
  access,
  array,
  arraySpread,
  group,
  literal,
  name,
} from "../src/kpast.js";
import { kpparseSugared } from "../src/kpparse.js";

test("An expression in parentheses parses to a group node", (t) => {
  const code = "(42)";
  const result = kpparseSugared(code);
  t.deepEqual(result, group(literal(42)));
});

test("Property access parses to an access node", (t) => {
  const code = "a.b";
  const result = kpparseSugared(code);
  t.deepEqual(result, access(name("a"), name("b")));
});

test("An array spread operator parses to an arraySpread node", (t) => {
  const code = "[1, *foo, 3]";
  const result = kpparseSugared(code);
  t.deepEqual(result, array(literal(1), arraySpread(name("foo")), literal(3)));
});
