import test from "ava";
import { calling, given, literal, name } from "../src/kpast.js";
import kpeval, { callOnValues } from "../src/kpeval.js";
import kpobject from "../src/kpobject.js";

test("We can call a given from JavaScript", (t) => {
  const f = kpeval(
    given({ params: ["x"] }, calling(name("plus"), [name("x"), literal(3)]))
  );

  const result = callOnValues(f, [42], kpobject());

  t.is(result, 45);
});

test("We can call a builtin from JavaScript", (t) => {
  const f = kpeval(name("plus"));

  const result = callOnValues(f, [42, 3], kpobject());

  t.is(result, 45);
});
