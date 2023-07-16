import test from "ava";
import { calling, defining, given, literal, name } from "../src/kpast.js";
import kpeval from "../src/kpeval.js";

// TODO Expressions that evaluate to non-strings can't be keys.

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
