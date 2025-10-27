import kpcompileBaseline from "../src/baseline/kpcompile.js";
import kpparseBaseline from "../src/baseline/kpparse.js";
import kpvmBaseline from "../src/baseline/kpvm.js";
import kpcompile from "../src/kpcompile.js";
import kpparse from "../src/kpparse.js";
import kpvm from "../src/kpvm.js";
import kpcompilePrevious from "../src/previous/kpcompile.js";
import kpparsePrevious from "../src/previous/kpparse.js";
import kpvmPrevious from "../src/previous/kpvm.js";

const hello = `1 | to(100)
  | transform((n) => join(["Hello, ", n | display, "!"]))
  | joinLines`;
const primePairs = `primesUpTo = (max) => (
  {numbers: 2 | to(max), index: 1}
  | build(
    ({index:, numbers:}) => {
      numbers: numbers | where(
        (n) => n | equals(numbers @ index) | or(
          $ n | isDivisibleBy(numbers @ index) | not
        )
      ),
      index: index | up,
    }
  )
  | while(({index:, numbers:}) => index | isAtMost(numbers | length))
  | last
  |.numbers
);
rows = primesUpTo(10);
cols = primesUpTo(10);
rows | transform((row) => (
  cols | transform((col) => (
    [row, col]
  ))
))
| flatten
| toArray
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
    (line) => (line | split(on: ","))
  )
  | toArray
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

const warmUpSeconds = 0.1;
const testSeconds = 1;

class Timer {
  constructor() {
    this.start = process.hrtime();
  }

  time() {
    const [seconds, nanoseconds] = process.hrtime(this.start);
    const time = seconds + nanoseconds / 1e9;
    return time;
  }
}

function runBenchmark(benchmark, kpparse, kpcompile, kpvm) {
  const json = kpparse(benchmark.code);
  const program = kpcompile(json);
  // Warm up
  const warmUpTimer = new Timer();
  while (warmUpTimer.time() < warmUpSeconds) {
    kpvm(program);
  }
  const timer = new Timer();
  let runCount = 0;
  while (timer.time() < testSeconds) {
    kpvm(program);
    runCount += 1;
  }
  return runCount;
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
      const baselineCount = runBenchmark(
        benchmark,
        kpparseBaseline,
        kpcompileBaseline,
        kpvmBaseline
      );
      console.log(`${baselineCount} (baseline)`);
      result.baselineCount = baselineCount;
      const previousCount = runBenchmark(
        benchmark,
        kpparsePrevious,
        kpcompilePrevious,
        kpvmPrevious
      );
      console.log(`${previousCount} (previous)`);
      result.previousCount = previousCount;
    }
    const currentCount = runBenchmark(benchmark, kpparse, kpcompile, kpvm);
    console.log(`${currentCount} (current)`);
    result.currentCount = currentCount;
    results.push(result);
  }
}

function average(array) {
  return array.reduce((a, b) => a + b) / array.length;
}

function averageRatio(oldRunType, newRunType) {
  return average(
    results.map((result) => result[newRunType] / result[oldRunType])
  );
}

function averagePercentChange(oldRunType, newRunType) {
  return (averageRatio(oldRunType, newRunType) - 1) * 100;
}

function percentChangeForDisplay(oldRunType, newRunType) {
  const change = Math.round(averagePercentChange(oldRunType, newRunType));
  if (change === 0) {
    return "\x1b[2m0%\x1b[0m";
  } else if (change > 0) {
    return `\x1b[32m+${change}%\x1b[0m`;
  } else if (change < 0) {
    return `\x1b[31m${change}%\x1b[0m`;
  }
}

if (!currentOnly) {
  console.log("Average Change");
  console.log(
    `From baseline: ${percentChangeForDisplay("baselineCount", "currentCount")}`
  );
  console.log(
    `From previous: ${percentChangeForDisplay("previousCount", "currentCount")}`
  );
}
