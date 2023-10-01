import kpeval from "./kpeval.js";
import kpparse from "./kpparse.js";

console.log(kpeval(kpparse("'((x) => plus(x, 3))'")));
// console.log(kpparse("(x, y = 3) => plus(x, y)"));
