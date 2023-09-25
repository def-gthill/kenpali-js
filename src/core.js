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
isMoreThan = (a, b) => (b | isLessThan(a));
isAtLeast = (a, b) => (b | isAtMost(a));
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
            out: transform(array @ i)
        }
    )
);
where = (array, condition) => (
    0 | build(
        (i) => (
            next = increment(i) | repeat(
                (j) => (
                    {
                        while: and(
                            j | isAtMost(length(array)),
                            not(condition(array @ j)),
                        ),
                        next: increment(j),
                    }
                )
            );
            {
                while: next | isAtMost(length(array)),
                next: next,
                out: array @ next,
            }
        )
    )
);
count = (array, condition) => (array | where(condition) | length);
flatten = (array) => (
    [1, 1] | build(
        (indices) => (
            [i, j] = indices;
            {
                while: i | isAtMost(length(array)),
                next: if(
                    j | isLessThan(length(array @ i)),
                    then: [i, increment(j)],
                    else: [increment(i), 1],
                ),
                out: array @ i @ j,
            }
        )
    )
);
`;
