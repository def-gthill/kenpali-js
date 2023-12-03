export const core = String.raw`
minus = (a, b) => plus(a, negative(b));
increment = (n) => (n | plus(1));
decrement = (n) => (n | minus(1));
dividedBy = (a, b) => times(a, oneOver(b));
isDivisibleBy = (a, b) => (
    divideWithRemainder(a, b).remainder | equals(0)
);
characters = (string) => (
    1 | to(length(string)) | forEach((i) => (string @ i))
);
split = (string, delimiter) => (
    0 | build(
        (i) => (
            word = increment(i) | build(
                (j) => (
                    {
                        while: and(
                            j | isAtMost(length(string)),
                            not(
                                string
                                | slice(j | toSize(length(delimiter)))
                                | equals(delimiter)
                            ),
                        ),
                        next: increment(j),
                        out: string @ j,
                    }
                )
            ) | join;
            next = i | plus(length(word), length(delimiter));
            {
                while: i | isAtMost(length(string)),
                next: next,
                out: word,
            }
        )
    )
);
splitLines = (string) => (string | split("\n"));
joinLines = (strings) => (strings | join(with: "\n"));
trim = (string) => (
    firstIndex = 1 | repeat(
        (i) => {
            while: and(
                i | isAtMost(length(string)),
                string @ i | equals(" "),
            ),
            next: increment(i),
        }
    );
    lastIndex = length(string) | repeat(
        (i) => {
            while: and(
                i | isAtLeast(1),
                string @ i | equals(" "),
            ),
            next: decrement(i),
        }
    );
    string | slice(firstIndex | to(lastIndex))
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
dropFirst = (coll, n = 1) => slice(coll, increment(n) | to(length(coll)));
dropLast = (coll, n = 1) => slice(coll, 1 | to(length(coll) | minus(n)));
slice = (coll, indices) => (
    result = indices | forEach((index) => (coll @ index));
    result | butIf(isString(coll), join(result))
);
to = (start, end) => (
    start | build(
        (i) => {
            while: i | isAtMost(end),
            next: increment(i),
            out: i
        }
    )
);
toSize = (start, size) => (start | to(start | plus(decrement(size))));
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
