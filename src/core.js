export const core = String.raw`
sum = (numbers) => plus(*numbers);
isDivisibleBy = (a, b) => (
    divideWithRemainder(a, b).remainder | equals(0)
);
characters = (string) => (
    1 | to(length(string)) | transform((i) => (string @ i))
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
                    then: () => i | plus(length(delimiter)),
                    else: () => i | increment
                ),
                out: if(delimiterMatched, then: () => [i], else: () => []),
            }
        )
    );
    startIndices = [
        1,
        *delimiterLocations | transform((i) => (i | plus(length(delimiter)))),
    ];
    endIndices = [
        *delimiterLocations | transform(decrement),
        length(string),
    ];
    1 | to(length(startIndices)) | transform(
        (i) => (string | slice(startIndices @ i | to(endIndices @ i)))
    )
);
splitLines = (string) => (string | split("\n"));
joinLines = (strings) => (strings | join(with: "\n"));
butIf = (value, condition, ifTrue) => (
    if(toFunction(condition)(value), then: () => ifTrue(value), else: () => value)
);
isEmpty = (coll) => (length(coll) | equals(0));
dropFirst = (coll, n = 1) => slice(coll, increment(n) | to(length(coll)));
dropLast = (coll, n = 1) => slice(coll, 1 | to(length(coll) | minus(n)));
slice = (coll, indices) => (
    result = indices
        | where((index) => and(index | isAtLeast(1), () => index | isAtMost(length(coll))))
        | transform((index) => (coll @ index));
    result | butIf(isString(coll), () => join(result))
);
to = (start, end, by: = 1) => (
    start | build(
        (i) => {
            while: i | isAtMost(end),
            next: i | plus(by),
            out: [i]
        }
    )
);
toSize = (start, size) => (start | to(start | plus(decrement(size))));
rebuild = (array, f) => (
    1 | build(
        (i) => {
            while: i | isAtMost(length(array)),
            next: increment(i),
            out: f(array @ i)
        }
    )
);
transform = (array, f) => array | rebuild((element) => [f(element)]);
where = (array, condition) => array | rebuild(
    (element) => if(condition(element), then: () => [element], else: () => [])
);
zip = (*arrays) => (
    1 | build(
        (i) => {
            while: arrays | forAll((array) => (i | isAtMost(length(array)))),
            next: increment(i),
            out: [arrays | transform((array) => (array @ i))],
        }
    )
);
count = (array, condition) => (array | where(condition) | length);
forAll = (array, condition) => (array | count((element) => (element | condition | not)) | equals(0));
forSome = (array, condition) => (array | count(condition) | isMoreThan(0));
flatten = (array) => array | rebuild((element) => element);
chunk = (array, size) => (
    starts = 1 | to(length(array), by: size);
    starts | transform((start) => (array | slice(start | toSize(size))))
);
properties = (object) => (
    object | keys | transform((key) => [key, object.<<key>>])
);
merge = (objects) => (
    objects | transform(properties) | flatten | toObject
);
`;
