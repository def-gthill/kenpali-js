import { expectError, expectNotAssignable } from "tsd";
import { KpProtocol, platformFunction, stringClass } from "..";

// Assigning a class to a protocol.
expectNotAssignable<KpProtocol<string>>(stringClass);

// Using a param spec type that doesn't match the actual param type.
expectError(
  platformFunction<{ pos: [number] }>(
    "bar",
    { posParams: [{ name: "n", type: stringClass }] },
    ([n]) => n + 1
  )
);
