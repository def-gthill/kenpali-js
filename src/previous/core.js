export const core = String.raw`
sum = (numbers) => plus(*numbers);
isDivisibleBy = (a, b) => (
    divideWithRemainder(a, b) @ remainder: | equals(0)
);
absolute = (n) => n | butIf(n | isLessThan(0), () => negative(n));
characters = (string) => (
    1 | to(length(string)) | transform((i) => (string @ i))
);
splitLines = (string) => (string | split(on: "\n"));
joinLines = (strings) => (strings | join(on: "\n"));
butIf = (value, condition, ifTrue) => (
    if(toFunction(condition)(value), then: () => ifTrue(value), else: () => value)
);
isBetween = (n, lower, upper) => (
    n | isAtLeast(lower) | and(() => n | isAtMost(upper))
);
isEmpty = (coll) => (length(coll) | equals(0));
dropFirst = (coll, n = 1) => slice(coll, increment(n) | to(length(coll)));
dropLast = (coll, n = 1) => slice(coll, 1 | to(length(coll) | minus(n)));
slice = (coll, indices) => (
    result = indices
        | where((index) => index | isBetween(1, coll | length))
        | transform((index) => (coll @ index));
    result | butIf(isString(coll), () => join(result))
);
to = (start, end, by: = 1) => (
    start | build(
        while: (i) => i | isAtMost(end),
        next: (i) => i | plus(by),
    )
);
toSize = (start, size) => (start | to(start | plus(decrement(size))));
rebuild = (array, f) => (
    1 | build(
        while: (i) => i | isAtMost(length(array)),
        next: increment,
        out: (i) => f(array @ i),
    )
);
transform = (array, f) => array | rebuild((element) => [f(element)]);
where = (array, condition) => array | rebuild(
    (element) => if(condition(element), then: () => [element], else: () => [])
);
zip = (*arrays) => (
    1 | build(
        while: (i) => arrays | forAll((array) => (i | isAtMost(length(array)))),
        next: increment,
        out: (i) => [arrays | transform((array) => (array @ i))]
    )
);
unzip = (array) => (
    1 | to(array @ 1 | length) | transform(
        (i) => array | transform((entry) => entry @ i)
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
    object | keys | transform((key) => [key, object @ key])
);
merge = (objects) => (
    objects | transform(properties) | flatten | toObject
);
`;
