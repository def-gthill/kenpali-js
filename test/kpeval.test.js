import test from "ava";
import {
  calling,
  defining,
  given,
  literal,
  name,
  quote,
} from "../src/kpast.js";
import kpeval from "../src/kpeval.js";
import kpobject from "../src/kpobject.js";
import { assertIsError } from "./assertIsError.js";

test("Evaluating null returns an error", (t) => {
  const expression = null;

  const result = kpeval(expression);

  assertIsError(t, result, "notAnExpression");
});

test("We can define and call a two-argument function", (t) => {
  t.is(
    kpeval(
      defining(
        [
          "funkyTimes",
          given(
            { params: ["a", "b"] },
            calling(name("times"), [
              calling(name("plus"), [name("a"), literal(2)]),
              calling(name("plus"), [name("b"), literal(3)]),
            ])
          ),
        ],
        calling(name("funkyTimes"), [literal(5), literal(3)])
      )
    ),
    42
  );
});

test("Function arguments can reference names", (t) => {
  t.is(
    kpeval(
      defining(
        [
          "add3",
          given(
            { params: ["x"] },
            calling(name("plus"), [name("x"), literal(3)])
          ),
        ],
        defining(
          ["meaning", literal(42)],
          calling(name("add3"), [name("meaning")])
        )
      )
    ),
    45
  );
});

test("Eval results are Kenpali objects, not JavaScript objects", (t) => {
  t.deepEqual(
    kpeval(
      quote(
        given({ params: ["x"] }, calling(name("plus"), [name("x"), literal(3)]))
      )
    ),
    kpobject(
      ["given", kpobject(["params", ["x"]])],
      [
        "result",
        kpobject(
          ["calling", kpobject(["name", "plus"])],
          ["args", [kpobject(["name", "x"]), kpobject(["literal", 3])]]
        ),
      ]
    )
  );
});
