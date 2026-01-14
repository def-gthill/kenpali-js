import test from "ava";
import * as op from "../src/instructions.js";
import kperror from "../src/kperror.js";
import { Vm } from "../src/kpvm.js";
import { assertIsError, assertThrows } from "./assertions.js";

test("The VALUE instruction pushes its argument onto the stack", (t) => {
  const vm = new Vm({
    instructions: [op.VALUE, 0, op.VALUE, 1, op.RETURN],
    constants: [42, 97],
  });

  vm.run();

  t.deepEqual(vm.stack, [42, 97]);
});

test("The ALIAS instruction pushes another reference to the top of the stack", (t) => {
  const vm = new Vm({
    instructions: [op.VALUE, 0, op.ALIAS, op.RETURN],
    constants: [42],
  });

  vm.run();

  t.deepEqual(vm.stack, [42, 42]);
});

test("The DISCARD instruction throws away the top of the stack", (t) => {
  const vm = new Vm({
    instructions: [op.VALUE, 0, op.VALUE, 1, op.DISCARD, op.RETURN],
    constants: [42, 97],
  });

  vm.run();

  t.deepEqual(vm.stack, [42]);
});

test("The RESERVE instruction reserves space on the stack without putting any values there", (t) => {
  const vm = new Vm({
    instructions: [op.VALUE, 0, op.RESERVE, 2, op.VALUE, 1, op.RETURN],
    constants: [42, 97],
  });

  vm.run();

  t.deepEqual(vm.stack, [42, undefined, undefined, 97]);
});

test("The WRITE_LOCAL instruction moves the top of the stack to the specified local slot", (t) => {
  const vm = new Vm({
    instructions: [
      ...[op.VALUE, 0],
      ...[op.VALUE, 1],
      ...[op.VALUE, 2],
      ...[op.VALUE, 3],
      ...[op.WRITE_LOCAL, 1],
      op.RETURN,
    ],
    constants: [42, 97, 73, 216],
  });

  vm.run();

  t.deepEqual(vm.stack, [42, 216, 73]);
});

test("The READ_LOCAL 0 instruction aliases the specified local slot to the top of the stack", (t) => {
  const vm = new Vm({
    instructions: [
      ...[op.VALUE, 0],
      ...[op.VALUE, 1],
      ...[op.VALUE, 2],
      ...[op.READ_LOCAL, 0, 1],
      op.RETURN,
    ],
    constants: [42, 216, 73],
  });

  vm.run();

  t.deepEqual(vm.stack, [42, 216, 73, 216]);
});

test("The PUSH_SCOPE 0 instruction adds a new stack frame with slot 0 at the top of the stack", (t) => {
  const vm = new Vm({
    instructions: [
      ...[op.VALUE, 0],
      ...[op.VALUE, 1],
      ...[op.PUSH_SCOPE, 0],
      ...[op.VALUE, 2],
      ...[op.READ_LOCAL, 0, 0],
      op.RETURN,
    ],
    constants: [42, 216, 73],
  });

  vm.run();

  t.deepEqual(vm.stack, [42, 216, 73, 216]);
});

test("With a positive argument, PUSH_SCOPE puts slot 0 below the current top of the stack", (t) => {
  const vm = new Vm({
    instructions: [
      ...[op.VALUE, 0],
      ...[op.VALUE, 1],
      ...[op.PUSH_SCOPE, 1],
      ...[op.VALUE, 2],
      ...[op.READ_LOCAL, 0, 0],
      op.RETURN,
    ],
    constants: [42, 216, 73],
  });

  vm.run();

  t.deepEqual(vm.stack, [42, 216, 73, 42]);
});

// POP through INDEX

test("The THROW instruction throws the value on the top of the stack", (t) => {
  const vm = new Vm({
    instructions: [
      ...[op.VALUE, 0],
      ...[op.THROW],
      ...[op.VALUE, 1],
      op.RETURN,
    ],
    constants: [kperror("bad"), 42],
  });

  assertThrows(t, () => vm.run(), "bad");
  t.deepEqual(vm.stack, []);
});

test("The CATCH instruction causes the next error to jump to the specified offset", (t) => {
  const vm = new Vm({
    instructions: [
      ...[op.CATCH, 5],
      ...[op.VALUE, 0],
      ...[op.THROW],
      ...[op.VALUE, 1],
      ...[op.VALUE, 2],
      op.RETURN,
    ],
    constants: [kperror("bad"), 42, 73],
  });

  vm.run();

  t.is(vm.stack.length, 2);
  assertIsError(t, vm.stack[0], "bad", {});
  t.is(vm.stack[1], 73);
});

test("The UNCATCH instruction cancels the last CATCH", (t) => {
  const vm = new Vm({
    instructions: [
      ...[op.CATCH, 6],
      ...[op.UNCATCH],
      ...[op.VALUE, 0],
      ...[op.THROW],
      ...[op.VALUE, 1],
      ...[op.VALUE, 2],
      op.RETURN,
    ],
    constants: [kperror("bad"), 42, 73],
  });

  assertThrows(t, () => vm.run(), "bad");
  t.deepEqual(vm.stack, []);
});
