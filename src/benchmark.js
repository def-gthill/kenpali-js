import kpeval from "./kpeval.js";
import kpparse from "./kpparse.js";

const hello = `join("Hello", ", ", "world!")`;
const repeatedReference = `array = 1 | to(100);
plus(length(array), length(array), length(array))
`;
const naiveFib = `
fib = (n) => if(
  n | isAtMost(2),
  then: 1,
  else: plus(fib(n | minus(1)), fib(n | minus(2))),
);
fib(2)
`;

const benchmarks = [
  { name: "Hello", code: hello, times: 200000 },
  { name: "Repeated Reference", code: repeatedReference, times: 400 },
  // This doesn't work yet because function calls force-evaluate their arguments!
  // { name: "Naive Fibonacci", code: naiveFib, times: 1 },
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
