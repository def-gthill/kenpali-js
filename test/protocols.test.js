import test from "ava";
import {
  collectionProtocol,
  emptyStream,
  kpeval,
  kpobject,
  kpparse,
  platformClass,
} from "../index.js";

test("If a collection provides an isEmpty method, isEmpty doesn't call toStream", (t) => {
  let isEmptyCalls = 0;
  let toStreamCalls = 0;
  const myCollection = platformClass("MyCollection", {
    protocols: [collectionProtocol],
    constructors: {
      newMyCollection: {
        body: ([], { getMethod }) => ({
          internals: {},
          properties: {
            isEmpty: getMethod("isEmpty"),
            toStream: getMethod("toStream"),
          },
        }),
      },
    },
    methods: {
      isEmpty: {
        body: () => {
          isEmptyCalls++;
          return true;
        },
      },
      toStream: {
        body: () => {
          toStreamCalls++;
          return emptyStream();
        },
      },
    },
  });

  const fooModule = kpobject(
    ...myCollection.map((builtin) =>
      typeof builtin === "function" ? [builtin.functionName, builtin] : builtin
    )
  );

  const code = `foo/newMyCollection() | isEmpty`;
  const result = kpeval(kpparse(code), {
    modules: kpobject(["foo", fooModule]),
  });
  t.is(result, true);
  t.is(isEmptyCalls, 1);
  t.is(toStreamCalls, 0);
});

test("If a collection provides an toArray method, toArray doesn't call toStream", (t) => {
  let toArrayCalls = 0;
  let toStreamCalls = 0;
  const myCollection = platformClass("MyCollection", {
    protocols: [collectionProtocol],
    constructors: {
      newMyCollection: {
        body: ([], { getMethod }) => ({
          internals: {},
          properties: {
            toArray: getMethod("toArray"),
            toStream: getMethod("toStream"),
          },
        }),
      },
    },
    methods: {
      toArray: {
        body: () => {
          toArrayCalls++;
          return [];
        },
      },
      toStream: {
        body: () => {
          toStreamCalls++;
          return emptyStream();
        },
      },
    },
  });

  const fooModule = kpobject(
    ...myCollection.map((builtin) =>
      typeof builtin === "function" ? [builtin.functionName, builtin] : builtin
    )
  );

  const code = `foo/newMyCollection() | toArray`;
  const result = kpeval(kpparse(code), {
    modules: kpobject(["foo", fooModule]),
  });
  t.deepEqual(result, []);
  t.is(toArrayCalls, 1);
  t.is(toStreamCalls, 0);
});
