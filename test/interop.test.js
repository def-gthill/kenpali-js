import test from "ava";
import { toJsFunction, toKpFunction } from "../src/interop.js";
import { calling, given, literal, name } from "../src/kpast.js";
import kpeval from "../src/kpeval.js";
import kpobject from "../src/kpobject.js";

test("We can convert a Kenpali function into a JavaScript function", (t) => {
  const kpf = kpeval(given({}, literal(42)));

  const jsf = toJsFunction(kpf);

  t.is(jsf(), 42);
});

test("Kenpali positional parameters become JavaScript positional parameters", (t) => {
  const kpf = kpeval(
    given(
      { params: ["x", "y"] },
      calling(name("times"), [
        name("x"),
        calling(name("increment"), [name("y")]),
      ])
    )
  );

  const jsf = toJsFunction(kpf);

  t.is(jsf(3, 4), 15);
});

// test("Kenpali rest parameters become JavaScript rest parameters", (t) => {
//   const kpf = kpeval(
//     given({ restParam: "rest" }, calling(name("length"), [name("rest")]))
//   );

//   const jsf = toJsFunction(kpf);

//   t.is(jsf(1, "a", [], null), 4);
// });

test("Kenpali named parameters become an extra object argument in the JavaScript version", (t) => {
  const kpf = kpeval(
    given(
      { params: ["base"], namedParams: ["multiplier", "bonus"] },
      calling(name("plus"), [
        calling(name("times"), [name("base"), name("multiplier")]),
        name("bonus"),
      ])
    )
  );

  const jsf = toJsFunction(kpf);

  t.is(jsf(3, { bonus: 4, multiplier: 5 }), 19);
});

test("We can pass a JavaScript callback to a Kenpali function", (t) => {
  const kpf = kpeval(
    given({ params: ["callback"] }, calling(name("callback")))
  );
  const jsf = toJsFunction(kpf);

  const callback = toKpFunction(() => 42);

  t.is(callback.builtinName, "<anonymous>");
  t.is(jsf(callback), 42);
});

test("A JavaScript callback can accept positional arguments", (t) => {
  const kpf = kpeval(
    given(
      { params: ["callback"] },
      calling(name("callback"), [literal(3), literal(4)])
    )
  );
  const jsf = toJsFunction(kpf);

  const callback = toKpFunction((x, y) => x * (y + 1));

  t.is(jsf(callback), 15);
});

test("A JavaScript callback converts named arguments into a final object argument", (t) => {
  const kpf = kpeval(
    given(
      { params: ["callback"] },
      calling(
        name("callback"),
        [literal(3)],
        kpobject(["bonus", literal(4)], ["multiplier", literal(5)])
      )
    )
  );
  const jsf = toJsFunction(kpf);

  const callback = toKpFunction(
    (base, { multiplier, bonus }) => base * multiplier + bonus
  );

  t.is(jsf(callback), 19);
});
