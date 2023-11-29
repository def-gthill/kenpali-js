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
const stringSplitting = String.raw`
parseCsv = (text) => (
  text | splitLines | forEach(
    (line) => (line | split(","))
  )
);
parseCsv("one, two, three\nuno, dos, tres\neins, zwei, drei")
`;

const benchmarks = [
  // The "times" is set so each test takes about a second on my MacBook Pro.
  // As performance improves, these numbers should keep getting bigger!
  { name: "Hello", code: hello, times: 1500000 },
  { name: "Repeated Reference", code: repeatedReference, times: 1000 },
  {
    name: "Repeated Reference in Given",
    code: repeatedGiven,
    times: 1000,
  },
  {
    name: "Prime Pairs",
    code: primePairs,
    times: 300,
  },
  { name: "Naive Fibonacci", code: naiveFib, times: 50 },
  { name: "String Splitting", code: stringSplitting, times: 100 },
];

const trace = process.argv.includes("--trace");

function runBenchmark(benchmark) {
  const json = kpparse(benchmark.code);
  const start = process.hrtime();
  for (let i = 0; i < benchmark.times; i++) {
    kpeval(json, undefined, trace);
  }
  const [seconds, nanoseconds] = process.hrtime(start);
  const time = (seconds + nanoseconds / 1e9).toFixed(2);
  console.log(benchmark.name);
  console.log(`${time}`);
}

const namesOfBenchmarksToRun = process.argv.slice(2);

for (const benchmark of benchmarks) {
  if (
    namesOfBenchmarksToRun.length === 0 ||
    namesOfBenchmarksToRun.includes(benchmark.name)
  ) {
    runBenchmark(benchmark);
  }
}
