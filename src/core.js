export const core = String.raw`
sum = (numbers) => plus(*toArray(numbers));
isDivisibleBy = (a, b) => (
    divideWithRemainder(a, b) @ remainder: | equals(0)
);
absolute = (n) => n | butIf(n | isLessThan(0), () => negative(n));
splitLines = (string) => (string | split(on: "\n"));
joinLines = (strings) => (strings | join(on: "\n"));
butIf = (value, condition, ifTrue) => (
    if(toFunction(condition)(value), then: () => ifTrue(value), else: () => value)
);
isBetween = (n, lower, upper) => (
    n | isAtLeast(lower) | and(() => n | isAtMost(upper))
);
least = (sequence) => (
    sequence
    | running(
        start: null,
        next: (element, state: leastSoFar) => if(
            leastSoFar | isNull | or(
                () => element | isLessThan(leastSoFar)
            ),
            then: () => element,
            else: () => leastSoFar,
        )
    )
    | last
);
most = (sequence) => (
    sequence
    | running(
        start: null,
        next: (element, state: mostSoFar) => if(
            mostSoFar | isNull | or(
                () => element | isMoreThan(mostSoFar)
            ),
            then: () => element,
            else: () => mostSoFar,
        )
    )
    | last
);
isEmpty = (coll) => (length(coll) | equals(0));
last = @ -1;
keepLast = (coll, n) => coll | slice(length(coll) | minus(n) | increment | to(length(coll)));
dropLast = (coll, n = 1) => coll | slice(1 | to(length(coll) | minus(n)));
slice = (coll, indices) => (
    result = indices
    | where(| isBetween(1, coll | length))
    | transform((index) => coll @ index)
    | toArray;
    result | butIf(isString(coll), () => join(result))
);
to = (start, end, by: = 1) => (
    isNoFurtherThan = if(
        by | isMoreThan(0),
        then: () => isAtMost,
        else: () => isAtLeast,
    );
    start
    | build(| plus(by))
    | while(| isNoFurtherThan(end))
);
toSize = (start, size) => (start | to(start | plus(decrement(size))));
repeat = (values) => (
    values | build((x) => x) | flatten
);
transpose = (sequences, fillWith: = null) => (
    arrays = sequences | transform(| toArray) | toArray;
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
        | toArray
    ))
    | toArray
);
count = (sequence, condition) => (sequence | where(condition) | toArray | length);
forAll = (array, condition) => (array | count((element) => (element | condition | not)) | equals(0));
forSome = (array, condition) => (array | count(condition) | isMoreThan(0));
sliding = (sequence, size) => (
    sequence
    | running(
        start: [null] | repeat | keepFirst(size) | toArray,
        next: (element, state: [first, *rest]) => [*rest, element]
    )
    | dropFirst(size)
);
chunk = (sequence, size) => (
    array = sequence | toArray;
    starts = 1 | to(length(array), by: size);
    starts | transform((start) => (array | slice(start | toSize(size))))
);
reverse = (array) => (
    array | length | to(1, by: -1)
    | transform((i) => array @ i)
    | toArray
);
properties = (object) => (
    object | keys | transform((key) => [key, object @ key]) | toArray
);
merge = (objects) => (
    objects | transform(properties) | flatten | toObject
);
group = (pairs, onGroup: = (x) => x) => (
    result = mutableMap();
    pairs
    | forEach(([key, value]) => (
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
    | toArray
);
groupBy = (array, by, onGroup: = (x) => x) => (
    array
    | transform((element) => [by(element), element])
    | group(onGroup: onGroup)
);
also = (value, f) => (f(value); value);
`;
