export const core = String.raw`
sum = (numbers) => plus(*toArray(numbers));
absolute = (n) => n | butIf(n | isLessThan(0), () => negative(n));
isDivisibleBy = (a, b) => a | remainderBy(b) | equals(0);
joinLines = (strings) => (strings | join(on: "\n"));
splitLines = (string) => (string | split(on: "\n"));
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
butIf = (value, condition, ifTrue) => (
    if(toFunction(condition)(value), then: () => ifTrue(value), else: () => value)
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
toSize = (start, size) => (start | to(start | plus(size | down)));
repeat = (value) => value | build((x) => x);
last = @ -1;
keepLast = (coll, n) => (
    result = coll | dropFirst(length(coll) | minus(n));
    if(
        result | isString,
        then: () => result,
        else: () => result | toArray,
    )
);
dropLast = (coll, n = 1) => (
    result = coll | keepFirst(length(coll) | minus(n));
    if(
        result | isString,
        then: () => result,
        else: () => result | toArray,
    )
);
count = (sequence, condition) => sequence | where(condition) | toArray | length;
forAll = (sequence, condition) => (
    sequence
    | count((element) => (element | condition | not))
    | equals(0)
);
forSome = (sequence, condition) => (
    sequence
    | count(condition)
    | isMoreThan(0)
);
reverse = (sequence) => (
    array = sequence | toArray;
    array | length | to(1, by: -1)
    | transform((i) => array @ i)
    | toArray
);
isEmpty = (coll) => coll | keepFirst(1) | length | equals(0);
first = @ 1;
slice = (coll, from:, to:) => (
    coll | keepFirst(to) | dropFirst(from | down)
);
thenRepeat = (sequence, values) => [sequence, repeat(values)] | flatten;
sliding = (sequence, size) => (
    sequence
    | running(
        start: [null] | repeat | keepFirst(size) | toArray,
        next: (element, state: [first, *rest]) => [*rest, element]
    )
    | dropFirst(size)
);
chunk = (sequence, size) => (
    sequence
    | zip(1 | to(size) | repeat | flatten)
    | dissect(([element, i]) => i | equals(size))
    | transform(| transform(([element]) => element) | toArray)
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
groupBy = (sequence, by, onGroup: = (x) => x) => (
    sequence
    | transform((element) => [by(element), element])
    | group(onGroup: onGroup)
);
also = (value, f) => (f(value); value);
`;
