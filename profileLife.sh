node --prof test/life.js --current $*
profiler_output=$(ls -t isolate-*-v8.log | head -n 1)
node --prof-process $profiler_output > profileLife.txt
rm $profiler_output
