node --prof src/benchmark.js $*
profiler_output=$(ls -t isolate-*-v8.log | head -n 1)
node --prof-process $profiler_output > profile.txt
rm $profiler_output
