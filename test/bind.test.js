import test from "ava";
import { bind, recordLike } from "../src/bind.js";
import { kpcatch } from "../src/kperror.js";
import kpobject from "../src/kpobject.js";
import { assertIsError } from "./assertIsError.js";

test("The reason given for a bad object property is an error object", (t) => {
  const value = kpobject(["foo", "bar"]);
  const schema = recordLike(kpobject(["foo", "number"]));

  const result = kpcatch(() => bind(value, schema));

  assertIsError(t, result, "badProperty");
  assertIsError(t, result.details.get("reason"), "wrongType");
});
