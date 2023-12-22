import test from "ava";
import { literal, optional } from "../src/kpast.js";
import { normalizeAllArgs, normalizeArg } from "../src/kpeval.js";
import kpobject from "../src/kpobject.js";

test("Normalizing a plain expression arg yields an arg object with defaults", (t) => {
  const arg = literal(null);
  const normalized = normalizeArg(arg);
  t.deepEqual(normalized, {
    optional: false,
    value: literal(null),
  });
});

test("Normalizing an optional arg sets the optional flag to true", (t) => {
  const arg = optional(literal(null));
  const normalized = normalizeArg(arg);
  t.deepEqual(normalized, {
    optional: true,
    value: literal(null),
  });
});

test("We can normalize all args", (t) => {
  const args = {
    args: [literal(1), optional(literal(2))],
    namedArgs: kpobject(["foo", literal(3)], ["bar", optional(literal(4))]),
  };

  const normalized = normalizeAllArgs(args);

  t.deepEqual(normalized, {
    args: [
      { optional: false, value: literal(1) },
      { optional: true, value: literal(2) },
    ],
    namedArgs: kpobject(
      ["foo", { optional: false, value: literal(3) }],
      ["bar", { optional: true, value: literal(4) }]
    ),
  });
});
