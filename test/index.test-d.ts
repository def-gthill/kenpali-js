import { expectError } from "tsd";
import { platformFunction, stringClass } from "..";

expectError(
  platformFunction<{ pos: [number] }>(
    "bar",
    { params: [{ name: "n", type: stringClass }] },
    ([n]) => n + 1
  )
);
