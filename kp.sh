this_dir=$(dirname $0)

node --stack-trace-limit=1000 $this_dir/src/kp.js $@
