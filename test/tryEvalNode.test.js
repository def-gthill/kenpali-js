import test from "ava";
import { assert, calling, if_, literal, name, object } from "../src/kpast.js";
import { expansion, tryEvalNode } from "../src/kpeval.js";
import { assertExpansionIs } from "./assertExpansionIs.js";

test("An if node expands to its then branch if the condition is true", (t) => {
  const node = if_(literal(true), name("ifTrue"), name("ifFalse"));

  const result = tryEvalNode("x", node);

  t.deepEqual(result, expansion(name("ifTrue")));
});

test("An if node expands to its else branch if its condition is false", (t) => {
  const node = if_(literal(false), name("ifTrue"), name("ifFalse"));

  const result = tryEvalNode("x", node);

  t.deepEqual(result, expansion(name("ifFalse")));
});

test("An assert node expands to a conditional throw", (t) => {
  const node = assert(name("foo"), literal("<predicate>"));

  const result = tryEvalNode("x", node);

  const expected = expansion(
    if_(name("x.$assert.passed"), name("foo"), name("x.$assert.error")),
    [
      {
        find: "x.$assert.passed",
        as: calling(literal("<predicate>"), [name("foo")]),
      },
      {
        find: "x.$assert.error",
        as: object(
          ["#thrown", literal("badValue")],
          ["value", name("foo")],
          ["condition", literal("<predicate>")]
        ),
      },
    ]
  );
  assertExpansionIs(t, result, expected);
});

// test("A bind node with a type schema expands to a type check", (t) => {
//   const node = bind(name("foo"), literal("number"));

//   const result = tryEvalNode("x", node);

//   t.deepEqual(
//     result,
//     expansion(object(["all", name("x.$bind.all")]), [
//       { find: "x.$bind.all", as: checkType(name("foo"), literal("number")) },
//     ])
//   );
// });

// test("A bind node with a type-and-predicate schema expands to a type check and an assert", (t) => {
//   const computed = new Map([
//     ["schema", kpobject(["#type", "number"], ["where", "<predicate>"])],
//   ]);
//   const node = bind(name("foo"), name("schema"));

//   const result = tryEvalNode("x", node, computed);

//   const expected = expansion(object(["all", name("x.$bind.all")]), [
//     {
//       find: "x.$bind.all",
//       as: assert(name("x.$bind.typeChecked"), literal("<predicate>")),
//     },
//     {
//       find: "x.$bind.typeChecked",
//       as: checkType(name("foo"), literal("number")),
//     },
//   ]);
//   assertExpansionIs(t, result, expected);
// });

// test("A bind node with a union schema expands to a check on the first defaulting to a check on the rest", (t) => {
//   const computed = new Map([
//     ["schema", kpobject(["#either", ["<schema1>", "<schema2>", "<schema3>"]])],
//   ]);
//   const node = bind(name("foo"), name("schema"));

//   const result = tryEvalNode("x", node, computed);

//   const expected = expansion(
//     if_("x.$bind.firstPassed", "x.$bind.firstResult", "x.$bind.bindRest"),
//     [
//       {
//         find: "x.$bind.firstPassed",
//         as: bind(name("foo"), literal("<schema1>")),
//       },
//       {
//         find: "",
//       },
//     ]
//   );
//   assertExpansionIs(t, result, expected);
// });

function byFind(a, b) {
  if (a.find < b.find) {
    return -1;
  } else if (a.find > b.find) {
    return 1;
  } else {
    return 0;
  }
}
