import kpeval from "./kpeval.js";
import kpparse from "./kpparse.js";

const hello = `join("Hello", ", ", "world!")`;
const repeatedReference = `array = 1 | to(100);
plus(length(array), length(array), length(array))
`;
const repeatedGiven = `array = 1 | to(100);
myLength = (a) => length(a);
plus(myLength(array), myLength(array), myLength(array))
`;
const primePairs = `primesUpTo = (max) => (
  [2 | to(max), 1] | repeat((args) => (
    [numbers, i] = args;
    next = numbers
      | where((n) => or(
         n | equals(numbers @ i),
         not(n | isDivisibleBy(numbers @ i))
      ));
    {
      while: not(next | equals(numbers)),
      next: [next, increment(i)],
    }
  )) @ 1
);
rows = primesUpTo(10);
cols = primesUpTo(10);
rows | forEach((row) => (
  cols | forEach((col) => (
    [row, col]
  ))
)) | flatten
`;
const naiveFib = `
fib = (n) => if(
  n | isAtMost(2),
  then: 1,
  else: plus(fib(n | minus(1)), fib(n | minus(2))),
);
fib(15)
`;

const benchmarks = [
  // The "times" is set so each test takes about a second on my MacBook Pro.
  // As performance improves, these numbers should keep getting bigger!
  { name: "Hello", code: hello, times: 1000000 },
  { name: "Repeated Reference", code: repeatedReference, times: 1000 },
  {
    name: "Repeated Reference in Given",
    code: repeatedGiven,
    times: 1000,
  },
  {
    name: "Prime Pairs",
    code: primePairs,
    times: 25,
  },
  // This doesn't work yet because function calls force-evaluate their arguments!
  { name: "Naive Fibonacci", code: naiveFib, times: 10 },
];

function runBenchmark(benchmark) {
  const json = kpparse(benchmark.code);
  const start = process.hrtime();
  for (let i = 0; i < benchmark.times; i++) {
    kpeval(json);
  }
  const [seconds, nanoseconds] = process.hrtime(start);
  const time = (seconds + nanoseconds / 1e9).toFixed(2);
  console.log(benchmark.name);
  console.log(`${time}`);
}

for (const benchmark of benchmarks) {
  runBenchmark(benchmark);
}

// const json = kpparse(`join("Hello", ", ", "world!")`);
// const start = process.hrtime();
// for (let i = 0; i < 100000; i++) {
//   kpeval(json);
// }
// const [seconds, nanoseconds] = process.hrtime(start);
// const time = (seconds + nanoseconds / 1e9).toFixed(2);
// console.log(`${time}`);
