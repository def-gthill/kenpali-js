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
    delimiterLocations = 1 | build(
        (i) => (
            delimiterMatched = (
                string
                | slice(i | toSize(length(delimiter)))
                | equals(delimiter)
            );
            {
                while: i | isAtMost(length(string)),
                next: if(
                    delimiterMatched,
                    then: i | plus(length(delimiter)),
                    else: i | increment
                ),
                out: i,
                where: delimiterMatched,
            }
        )
    );
    startIndices = [
        1,
        *delimiterLocations | forEach((i) => (i | plus(length(delimiter)))),
    ];
    endIndices = [
        *delimiterLocations | forEach(decrement),
        length(string),
    ];
    1 | to(length(startIndices)) | forEach(
        (i) => (string | slice(startIndices @ i | to(endIndices @ i)))
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
    if(toFunction(condition)(value), then: toFunction(ifTrue)(value), else: value)
);
isEmpty = (coll) => (length(coll) | equals(0));
dropFirst = (coll, n = 1) => slice(coll, increment(n) | to(length(coll)));
dropLast = (coll, n = 1) => slice(coll, 1 | to(length(coll) | minus(n)));
slice = (coll, indices) => (
    result = indices
        | where((index) => and(index | isAtLeast(1), index | isAtMost(length(coll))))
        | forEach((index) => (coll @ index));
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
    1 | build(
        (i) => {
            while: i | isAtMost(length(array)),
            next: increment(i),
            out: array @ i,
            where: condition(array @ i),
        }
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
properties = (object) => (
    object | keys | forEach((key) => [key, object.<<key>>])
);
merge = (objects) => (
    objects | forEach(properties) | flatten | toObject
);
`;
