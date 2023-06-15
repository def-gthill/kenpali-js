import kpeval from "./kpeval.js";
import kpparse from "./kpparse.js";

console.log(kpeval(kpparse("minus(3, 2)")));
// console.log(kpparse("(x, y = 3) => plus(x, y)"));
