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
least = (array) => (
    [1, null] | repeat(
        next: ([i, leastSoFar]) => [
            i | increment,
            if(
                leastSoFar | isNull | or(
                    () => array @ i | isLessThan(leastSoFar)
                ),
                then: () => array @ i,
                else: () => leastSoFar,
            )
        ],
        continueIf: ([i, leastSoFar]) => i | isAtMost(array | length),
    ) @ 2
);
most = (array) => (
    [1, null] | repeat(
        next: ([i, mostSoFar]) => [
            i | increment,
            if(
                mostSoFar | isNull | or(
                    () => array @ i | isMoreThan(mostSoFar)
                ),
                then: () => array @ i,
                else: () => mostSoFar,
            )
        ],
        continueIf: ([i, mostSoFar]) => i | isAtMost(array | length),
    ) @ 2
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
    isNoFurtherThan = if(
        by | isMoreThan(0),
        then: () => isAtMost,
        else: () => isAtLeast,
    );
    start | build(
        while: (i) => i | isNoFurtherThan(end),
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
zip = (*arrays, fillWith: = null) => arrays | transpose(fillWith:);
transpose = (arrays, fillWith: = null) => (
    numElements = if(
        fillWith | isNull,
        then: () => arrays | transform(| length) | least,
        else: () => arrays | transform(| length) | most,
    );
    1 | to(numElements) | transform((elementNumber) => (
        1 | to(arrays | length) | transform((arrayNumber) => (
            arrays @ arrayNumber | at(
                elementNumber,
                default: () => fillWith(arrayNumber:, elementNumber:),
            )
        ))
    ))
);
count = (array, condition) => (array | where(condition) | length);
forAll = (array, condition) => (array | count((element) => (element | condition | not)) | equals(0));
forSome = (array, condition) => (array | count(condition) | isMoreThan(0));
flatten = (array) => array | rebuild((element) => element);
chunk = (array, size) => (
    starts = 1 | to(length(array), by: size);
    starts | transform((start) => (array | slice(start | toSize(size))))
);
reverse = (array) => (
    array | length | to(1, by: -1) | transform((i) => array @ i)
);
properties = (object) => (
    object | keys | transform((key) => [key, object @ key])
);
merge = (objects) => (
    objects | transform(properties) | flatten | toObject
);
group = (pairs, onGroup: = (x) => x) => (
    result = mutableMap();
    pairs
    | transform(([key, value]) => (
        if(
            result @ has:(key),
            then: () => result @ at:(key) @ append:(value),
            else: () => result @ set:(key, mutableArray([value])),
        )
    ));
    result @ entries:()
    | transform(([key, value]) => (
        [key, value @ elements:() | onGroup]
    ))
);
groupBy = (array, by, onGroup: = (x) => x) => (
    array
    | transform((element) => [by(element), element])
    | group(onGroup: onGroup)
);
also = (value, f) => (f(value); value);
`;
