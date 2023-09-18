export const core = `
minus = (a, b) => plus(a, negative(b));
increment = (n) => (n | plus(1));
dividedBy = (a, b) => times(a, oneOver(b));
isDivisibleBy = (a, b) => (
    divideWithRemainder(a, b).remainder | equals(0)
);
isAtMost = (a, b) => or(
    a | isLessThan(b),
    a | equals(b),
);
butIf = (value, condition, ifTrue) => (
    if(condition(value?), then: ifTrue(value?), else: value)
);
isEmpty = (coll) => (length(coll) | equals(0));
to = (start, end) => (
    start | build(
        (i) => {
            while: i | isAtMost(end),
            next: increment(i),
            out: i
        }
    )
);
forEach = (array, transform) => (
    1 | build(
        (i) => {
            while: i | isAtMost(length(array)),
            next: increment(i),
            out: transform(array @ i ?)
        }
    )
);
flatten = (array) => (
    [1, 1] | build(
        (i) => {
            while: i @ 1 | isAtMost(length(array)),
            next: if(
                i @ 2 | isLessThan(length(array @ (i @ 1))),
                then: [i @ 1, increment(i @ 2)],
                else: [increment(i @ 1), 1],
            ),
            out: array @ (i @ 1) @ (i @ 2),
        }
    )
);
`;
