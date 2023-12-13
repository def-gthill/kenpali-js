import kpeval from "./kpeval.js";
import kpparse from "./kpparse.js";

console.log(kpeval(kpparse("[1, 2, *[3, 4, 5]]")));
