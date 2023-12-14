import test from "ava";

import kpeval from "../src/kpeval.js";
import kpobject from "../src/kpobject.js";
import kpparse from "../src/kpparse.js";

test("The object spread operator merges objects", (t) => {
  const code = "o1 = {foo: 1, bar: 2}; o2 = {bar: 3, baz: 4}; {**o1, **o2}";
  const result = kpeval(kpparse(code));
  t.deepEqual(result, kpobject(["foo", 1], ["bar", 3], ["baz", 4]));
});
