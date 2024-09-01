export function assertExpansionIs(t, actual, expected) {
  t.assert("expansion" in actual, `${actual} isn't an expansion`);
  t.deepEqual(actual.expansion.result, expected.expansion.result);
  t.deepEqual(
    actual.expansion.steps.sort(byFind),
    expected.expansion.steps.sort(byFind)
  );
}

export function assertDecompositionIs(t, actual, expected) {
  t.deepEqual(actual.result, expected.result);
  t.deepEqual(actual.steps.sort(byFind), expected.steps.sort(byFind));
}

function byFind(a, b) {
  if (a.find < b.find) {
    return -1;
  } else if (a.find > b.find) {
    return 1;
  } else {
    return 0;
  }
}
