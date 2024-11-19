import kpevalBaseline from "./baseline/kpeval.js";
import kpparseBaseline from "./baseline/kpparse.js";
import kpcompile from "./kpcompile.js";
import kpparse from "./kpparse.js";
import kpvm from "./kpvm.js";
import kpevalPrevious from "./previous/kpeval.js";
import kpparsePrevious from "./previous/kpparse.js";

const hello = `1 | to(100)
  | transform((n) => join(["Hello, ", n | toString, "!"]))
  | joinLines`;
const primePairs = `primesUpTo = (max) => (
  {numbers: 2 | to(max), index: 1} | repeat(
    while: (state) => state.index | isAtMost(length(state.numbers)),
    next: (state) => (
      {numbers:, index:} = state;
      {
        numbers: numbers | where(
          (n) => or(
            n | equals(numbers @ index),
            () => not(n | isDivisibleBy(numbers @ index))
          )
        ),
        index: increment(index),
      }
    )
  ) @ "numbers"
);
rows = primesUpTo(10);
cols = primesUpTo(10);
rows | transform((row) => (
  cols | transform((col) => (
    [row, col]
  ))
)) | flatten
`;
const naiveFib = `
fib = (n) => if(
  n | isAtMost(2),
  then: () => 1,
  else: () => plus(fib(n | minus(1)), fib(n | minus(2))),
);
fib(14)
`;
const stringSplitting = String.raw`
parseCsv = (text) => (
  text | splitLines | transform(
    (line) => (line | split(","))
  )
);
parseCsv("one, two, three\nuno, dos, tres\neins, zwei, drei")
`;

const benchmarks = [
  // The "times" is set so each test takes about a second on my MacBook Pro.
  // As performance improves, these numbers should keep getting bigger!
  { name: "Hello", code: hello, times: 300 },
  {
    name: "Prime Pairs",
    code: primePairs,
    times: 300,
  },
  { name: "Naive Fibonacci", code: naiveFib, times: 70 },
  { name: "String Splitting", code: stringSplitting, times: 20 },
];

function formatTime(time) {
  return time.toFixed(2);
}

function runBenchmark(benchmark, kpparse, kpcompile, kpvm) {
  const json = kpparse(benchmark.code);
  const program = kpcompile(json);
  // Warm up
  for (let i = 0; i < benchmark.times / 10; i++) {
    kpvm(program);
  }
  const start = process.hrtime();
  for (let i = 0; i < benchmark.times; i++) {
    kpvm(program);
  }
  const [seconds, nanoseconds] = process.hrtime(start);
  const time = seconds + nanoseconds / 1e9;
  return time;
}

const namesOfBenchmarksToRun = process.argv
  .slice(2)
  .filter((arg) => !arg.startsWith("--"));
const currentOnly = process.argv.includes("--current");

const results = [];

for (const benchmark of benchmarks) {
  if (
    namesOfBenchmarksToRun.length === 0 ||
    namesOfBenchmarksToRun.includes(benchmark.name)
  ) {
    const result = { name: benchmark.name };
    console.log(benchmark.name);
    if (!currentOnly) {
      const baselineTime = runBenchmark(
        benchmark,
        kpparseBaseline,
        (x) => x,
        kpevalBaseline
      );
      console.log(`${formatTime(baselineTime)} (baseline)`);
      result["baselineTime"] = baselineTime;
      const previousTime = runBenchmark(
        benchmark,
        kpparsePrevious,
        (x) => x,
        kpevalPrevious
      );
      console.log(`${formatTime(previousTime)} (previous)`);
      result["previousTime"] = previousTime;
    }
    const currentTime = runBenchmark(benchmark, kpparse, kpcompile, kpvm);
    console.log(`${formatTime(currentTime)} (current)`);
    result["currentTime"] = currentTime;
    results.push(result);
  }
}

function total(runType) {
  return results.map((result) => result[runType]).reduce((a, b) => a + b);
}

function percentChange(newTime, oldTime) {
  const change = Math.round(((newTime - oldTime) / oldTime) * 100);
  if (change === 0) {
    return "\x1b[2m0%\x1b[0m";
  } else if (change < 0) {
    return `\x1b[32m${change}%\x1b[0m`;
  } else if (change > 0) {
    return `\x1b[31m+${change}%\x1b[0m`;
  }
}

let baselineTotal;
let previousTotal;
if (!currentOnly) {
  baselineTotal = total("baselineTime");
  console.log(`Baseline total: ${formatTime(baselineTotal)}`);
  previousTotal = total("previousTime");
  console.log(`Previous total: ${formatTime(previousTotal)}`);
}
const currentTotal = total("currentTime");
console.log(`Current total: ${formatTime(currentTotal)}`);
if (!currentOnly) {
  console.log(
    `(${percentChange(
      currentTotal,
      previousTotal
    )} from previous, ${percentChange(
      currentTotal,
      baselineTotal
    )} from baseline)`
  );
}
