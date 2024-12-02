import test from "ava";
import { VALUE } from "../src/instructions.js";
import { Vm } from "../src/kpvm.js";

test("The VALUE instruction pushes its argument onto the stack", (t) => {
  const vm = new Vm({ instructions: [VALUE, 42, VALUE, 97] });

  vm.run();

  t.deepEqual(vm.stack, [42, 97]);
});
