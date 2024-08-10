import {
  kpcompile as kpcompileBaseline,
  evalCompiled as kpevalBaseline,
} from "./baseline/kpeval.js";
import kpparseBaseline from "./baseline/kpparse.js";
import { isError } from "./builtins.js";
import { kpcompile, evalCompiled as kpeval } from "./kpeval.js";
import kpparse from "./kpparse.js";
import {
  kpcompile as kpcompilePrevious,
  evalCompiled as kpevalPrevious,
} from "./previous/kpeval.js";
import kpparsePrevious from "./previous/kpparse.js";

const hello = `1 | to(100) | transform((n) => join(["Hello, ", n | toString, "!"]))`;
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
rows | transform((row) => (
  cols | transform((col) => (
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
  { name: "String Splitting", code: stringSplitting, times: 30 },
];

const trace = process.argv.includes("--trace");

function formatTime(time) {
  return time.toFixed(2);
}

function formatBenchmarkTime({ runTime, compileTime }) {
  return `${formatTime(runTime)} (+ ${formatTime(compileTime)})`;
}

function runBenchmark(benchmark, kpparse, kpcompile, kpeval) {
  const json = kpparse(benchmark.code);
  const compileStart = process.hrtime();
  const compiled = kpcompile(json);
  const [compileSeconds, compileNanoseconds] = process.hrtime(compileStart);
  const compileTime = compileSeconds + compileNanoseconds / 1e9;
  // Check for errors
  const result = kpeval(compiled, undefined, trace);
  if (isError(result)) {
    console.log(result);
    return { runTime: 0, compileTime: 0 };
  }
  // Warm up
  for (let i = 0; i < benchmark.times / 10; i++) {
    kpeval(compiled, undefined, trace);
  }
  const start = process.hrtime();
  for (let i = 0; i < benchmark.times; i++) {
    kpeval(compiled, undefined, trace);
  }
  const [seconds, nanoseconds] = process.hrtime(start);
  const time = seconds + nanoseconds / 1e9;
  return { runTime: time, compileTime };
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
        kpcompileBaseline,
        kpevalBaseline
      );
      console.log(`${formatBenchmarkTime(baselineTime)} (baseline)`);
      result["baselineTime"] = baselineTime.runTime;
      const previousTime = runBenchmark(
        benchmark,
        kpparsePrevious,
        kpcompilePrevious,
        kpevalPrevious
      );
      console.log(`${formatBenchmarkTime(previousTime)} (previous)`);
      result["previousTime"] = previousTime.runTime;
    }
    const currentTime = runBenchmark(benchmark, kpparse, kpcompile, kpeval);
    console.log(`${formatBenchmarkTime(currentTime)} (current)`);
    result["currentTime"] = currentTime.runTime;
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
