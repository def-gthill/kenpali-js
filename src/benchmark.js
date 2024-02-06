import kpevalBaseline from "./baseline/kpeval.js";
import kpparseBaseline from "./baseline/kpparse.js";
import kpeval from "./kpeval.js";
import kpparse from "./kpparse.js";
import kpevalPrevious from "./previous/kpeval.js";
import kpparsePrevious from "./previous/kpparse.js";

const hello = `join(["Hello", ", ", "world!"])`;
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
  { name: "Hello", code: hello, times: 300000 },
  { name: "Repeated Reference", code: repeatedReference, times: 500 },
  {
    name: "Repeated Reference in Given",
    code: repeatedGiven,
    times: 500,
  },
  {
    name: "Prime Pairs",
    code: primePairs,
    times: 200,
  },
  { name: "Naive Fibonacci", code: naiveFib, times: 30 },
  { name: "String Splitting", code: stringSplitting, times: 20 },
];

const trace = process.argv.includes("--trace");

function formatTime(time) {
  return time.toFixed(2);
}

function runBenchmark(benchmark, kpparse, kpeval) {
  const json = kpparse(benchmark.code);
  // Warm up
  for (let i = 0; i < benchmark.times / 10; i++) {
    kpeval(json, undefined, trace);
  }
  const start = process.hrtime();
  for (let i = 0; i < benchmark.times; i++) {
    kpeval(json, undefined, trace);
  }
  const [seconds, nanoseconds] = process.hrtime(start);
  const time = seconds + nanoseconds / 1e9;
  return time;
}

const namesOfBenchmarksToRun = process.argv.slice(2);

const results = [];

for (const benchmark of benchmarks) {
  if (
    namesOfBenchmarksToRun.length === 0 ||
    namesOfBenchmarksToRun.includes(benchmark.name)
  ) {
    console.log(benchmark.name);
    const baselineTime = runBenchmark(
      benchmark,
      kpparseBaseline,
      kpevalBaseline
    );
    console.log(`${formatTime(baselineTime)} (baseline)`);
    const previousTime = runBenchmark(
      benchmark,
      kpparsePrevious,
      kpevalPrevious
    );
    console.log(`${formatTime(previousTime)} (previous)`);
    const currentTime = runBenchmark(benchmark, kpparse, kpeval);
    console.log(`${formatTime(currentTime)} (current)`);
    results.push({
      name: benchmark.name,
      baselineTime,
      previousTime,
      currentTime,
    });
  }
}

function total(runType) {
  return results.map((result) => result[runType]).reduce((a, b) => a + b);
}

function percentChange(newTime, oldTime) {
  const change = Math.round(((newTime - oldTime) / newTime) * 100);
  if (change === 0) {
    return "\x1b[2m0%\x1b[0m";
  } else if (change < 0) {
    return `\x1b[32m${change}%\x1b[0m`;
  } else if (change > 0) {
    return `\x1b[31m+${change}%\x1b[0m`;
  }
}

const baselineTotal = total("baselineTime");
console.log(`Baseline total: ${formatTime(baselineTotal)}`);
const previousTotal = total("previousTime");
console.log(`Previous total: ${formatTime(previousTotal)}`);
const currentTotal = total("currentTime");
console.log(`Current total: ${formatTime(currentTotal)}`);
console.log(
  `(${percentChange(
    currentTotal,
    previousTotal
  )} from previous, ${percentChange(
    currentTotal,
    baselineTotal
  )} from baseline)`
);
