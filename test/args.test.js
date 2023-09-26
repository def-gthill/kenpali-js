import test from "ava";
import { errorPassing, literal, optional } from "../src/kpast.js";
import { normalizeAllArgs, normalizeArg } from "../src/kpeval.js";
import kpobject from "../src/kpobject.js";

test("Normalizing a plain expression arg yields an arg object with defaults", (t) => {
  const arg = literal(null);
  const normalized = normalizeArg(arg);
  t.deepEqual(normalized, {
    optional: false,
    errorPassing: false,
    value: literal(null),
  });
});

test("Normalizing an optional arg sets the optional flag to true", (t) => {
  const arg = optional(literal(null));
  const normalized = normalizeArg(arg);
  t.deepEqual(normalized, {
    optional: true,
    errorPassing: false,
    value: literal(null),
  });
});

test("Normalizing an error-passing arg sets the error-passing flag to true", (t) => {
  const arg = errorPassing(literal(null));
  const normalized = normalizeArg(arg);
  t.deepEqual(normalized, {
    optional: false,
    errorPassing: true,
    value: literal(null),
  });
});

test("Normalizing an optional error-passing arg sets both flags to true", (t) => {
  const arg = optional(errorPassing(literal(null)));
  const normalized = normalizeArg(arg);
  t.deepEqual(normalized, {
    optional: true,
    errorPassing: true,
    value: literal(null),
  });
});

test("We can normalize all args", (t) => {
  const args = {
    args: [literal(1), optional(literal(2))],
    namedArgs: kpobject(
      ["foo", errorPassing(literal(3))],
      ["bar", optional(errorPassing(literal(4)))]
    ),
  };

  const normalized = normalizeAllArgs(args);

  t.deepEqual(normalized, {
    args: [
      { optional: false, errorPassing: false, value: literal(1) },
      { optional: true, errorPassing: false, value: literal(2) },
    ],
    namedArgs: kpobject(
      ["foo", { optional: false, errorPassing: true, value: literal(3) }],
      ["bar", { optional: true, errorPassing: true, value: literal(4) }]
    ),
  });
});
