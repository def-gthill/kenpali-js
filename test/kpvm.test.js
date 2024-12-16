import test from "ava";
import * as op from "../src/instructions.js";
import { Vm } from "../src/kpvm.js";

test("The VALUE instruction pushes its argument onto the stack", (t) => {
  const vm = new Vm({ instructions: [op.VALUE, 42, op.VALUE, 97] });

  vm.run();

  t.deepEqual(vm.stack, [42, 97]);
});

test("The ALIAS instruction pushes another reference to the top of the stack", (t) => {
  const vm = new Vm({ instructions: [op.VALUE, 42, op.ALIAS] });

  vm.run();

  t.deepEqual(vm.stack, [42, 42]);
});

test("The DISCARD instruction throws away the top of the stack", (t) => {
  const vm = new Vm({ instructions: [op.VALUE, 42, op.VALUE, 97, op.DISCARD] });

  vm.run();

  t.deepEqual(vm.stack, [42]);
});

test("The RESERVE instruction reserves space on the stack without putting any values there", (t) => {
  const vm = new Vm({
    instructions: [op.VALUE, 42, op.RESERVE, 2, op.VALUE, 97],
  });

  vm.run();

  t.deepEqual(vm.stack, [42, undefined, undefined, 97]);
});

test("The WRITE_LOCAL instruction moves the top of the stack to the specified local slot", (t) => {
  const vm = new Vm({
    instructions: [
      ...[op.VALUE, 42],
      ...[op.VALUE, 97],
      ...[op.VALUE, 73],
      ...[op.VALUE, 216],
      ...[op.WRITE_LOCAL, 1],
    ],
  });

  vm.run();

  t.deepEqual(vm.stack, [42, 216, 73]);
});

test("The READ_LOCAL 0 instruction aliases the specified local slot to the top of the stack", (t) => {
  const vm = new Vm({
    instructions: [
      ...[op.VALUE, 42],
      ...[op.VALUE, 216],
      ...[op.VALUE, 73],
      ...[op.READ_LOCAL, 0, 1],
    ],
  });

  vm.run();

  t.deepEqual(vm.stack, [42, 216, 73, 216]);
});

test("The PUSH 0 instruction adds a new stack frame with slot 0 at the top of the stack", (t) => {
  const vm = new Vm({
    instructions: [
      ...[op.VALUE, 42],
      ...[op.VALUE, 216],
      ...[op.PUSH, 0],
      ...[op.VALUE, 73],
      ...[op.READ_LOCAL, 0, 0],
    ],
  });

  vm.run();

  t.deepEqual(vm.stack, [42, 216, 73, 216]);
});

test("With a positive argument, PUSH puts slot 0 above the current top of the stack", (t) => {
  const vm = new Vm({
    instructions: [
      ...[op.VALUE, 42],
      ...[op.VALUE, 216],
      ...[op.PUSH, 1],
      ...[op.VALUE, 73],
      ...[op.READ_LOCAL, 0, 0],
    ],
  });

  vm.run();

  t.deepEqual(vm.stack, [42, 216, 73, 73]);
});

test("With a negative argument, PUSH puts slot 0 below the current top of the stack", (t) => {
  const vm = new Vm({
    instructions: [
      ...[op.VALUE, 42],
      ...[op.VALUE, 216],
      ...[op.PUSH, -1],
      ...[op.VALUE, 73],
      ...[op.READ_LOCAL, 0, 0],
    ],
  });

  vm.run();

  t.deepEqual(vm.stack, [42, 216, 73, 42]);
});
