export const core = `
minus = (a, b) => plus(a, negative(b));
increment = (n) => (n | plus(1));
dividedBy = (a, b) => times(a, oneOver(b));
isDivisibleBy = (a, b) => (
    divideWithRemainder(a, b).remainder | equals(0)
);
butIf = (value, condition, ifTrue) => (
    if(condition(value?), then: ifTrue(value?), else: value)
);
isEmpty = (coll) => (length(coll) | equals(0));
to = (start, end) => (
    start | build(
        (i) => {
            while: i | isLessThan(end),
            next: increment(i),
            out: i
        }
    )
);
forEach = (array, transform) => (
    1 | build(
        (i) => {
            while: i | isLessThan(length(array)),
            next: increment(i),
            out: transform(array @ i ?)
        }
    )
);
`;
