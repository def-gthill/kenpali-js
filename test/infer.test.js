import test from "ava";
import { arrayOf, oneOf } from "../src/bind.js";
import { cast, infer } from "../src/infer.js";
import { kpoMap } from "../src/kpobject.js";

// Two main operations:
// - infer: given an operation and schemas for all inputs, what's the output schema?
// - cast: given a known schema and a target schema, what further checks are necessary to guarantee reaching the target schema?
//   - "any" means the cast is already guaranteed to succeed, "no" means the cast can't possibly succeed

// #region infer

test("Inferring a literal yields a single-element oneOf", (t) => {
  const node = { type: "literal", value: 42 };
  const result = infer(node);
  t.deepEqual(result, oneOf([42]));
});

test("Inferring a name yields the name's schema", (t) => {
  const node = { type: "name", name: "foo", schema: "number" };
  const result = infer(node);
  t.is(result, "number");
});

test("Inferring a name with no schema yields any", (t) => {
  const node = { type: "name", name: "foo" };
  const result = infer(node);
  t.is(result, "any");
});

test("Inferring an array yields an array schema", (t) => {
  const node = {
    type: "array",
    elements: [
      { type: "name", name: "foo", schema: "number" },
      { type: "name", name: "bar", schema: "string" },
    ],
  };
  const result = infer(node);
  t.deepEqual(result, ["number", "string"]);
});

// #endregion

// #region cast

const schemas = [
  { name: "a number", schema: "number" },
  { name: "a string", schema: "string" },
  { name: "an array", schema: ["number", "string"] },
  { name: "a uniform array", schema: arrayOf("number") },
  { name: "specific values", schema: oneOf("red", "green", "blue") },
];

for (const { name, schema } of schemas) {
  test(`Casting ${name} to itself requires no checks`, (t) => {
    const known = schema;
    const target = copy(schema);
    const result = cast(known, target);
    t.is(result, "any");
  });
}

for (const { name, schema } of schemas) {
  test(`Casting ${name} to any requires no checks`, (t) => {
    const known = schema;
    const result = cast(known, "any");
    t.is(result, "any");
  });
}

for (const { name, schema } of schemas) {
  test(`Casting any to ${name} requires checking the whole thing`, (t) => {
    const target = schema;
    const result = cast("any", target);
    t.deepEqual(result, target);
  });
}

test("Casting a primitive to a different primitive is impossible", (t) => {
  const known = "number";
  const target = "string";
  const result = cast(known, target);
  t.is(result, "no");
});

function copy(schema) {
  if (Array.isArray(schema)) {
    return schema.map(copy);
  } else if (schema instanceof Map) {
    return kpoMap(schema, ([key, value]) => [key, copy(value)]);
  } else {
    return schema;
  }
}

// #endregion
