import test from "ava";
import * as op from "../src/instructions.js";
import kperror, { kpcatch } from "../src/kperror.js";
import { Vm } from "../src/kpvm.js";
import { assertIsError } from "./assertIsError.js";

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

// POP through INDEX

test("The THROW instruction throws the value on the top of the stack", (t) => {
  const vm = new Vm({
    instructions: [
      ...[op.VALUE, kperror("bad")],
      ...[op.THROW],
      ...[op.VALUE, 42],
    ],
  });

  const error = kpcatch(() => vm.run());
  assertIsError(t, error, "bad", {});
  t.deepEqual(vm.stack, []);
});

test("The CATCH instruction causes the next error to jump to the specified offset", (t) => {
  const vm = new Vm({
    instructions: [
      ...[op.CATCH, 5],
      ...[op.VALUE, kperror("bad")],
      ...[op.THROW],
      ...[op.VALUE, 42],
      ...[op.VALUE, 73],
    ],
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
      ...[op.VALUE, kperror("bad")],
      ...[op.THROW],
      ...[op.VALUE, 42],
      ...[op.VALUE, 73],
    ],
  });

  const error = kpcatch(() => vm.run());
  assertIsError(t, error, "bad", {});
  t.deepEqual(vm.stack, []);
});
