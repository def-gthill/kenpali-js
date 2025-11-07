import {
  arrayOf,
  booleanClass,
  display,
  functionClass,
  kpcall,
  kpcatch,
  kpeval,
  kpparse,
  matches,
  numberClass,
  satisfying,
  toKpFunction,
  tupleLike,
} from "../index.js";

const numRows = 30;
const numCols = 30;

const rowNumberSchema = satisfying(numberClass, (n) => n >= 1 && n <= numRows);
const colNumberSchema = satisfying(numberClass, (n) => n >= 1 && n <= numCols);
const liveCellsSchema = arrayOf(tupleLike([rowNumberSchema, colNumberSchema]));

export const defaultSetupCode = `glider = (centre) => (
  [[1, 1], [1, 0], [1, -1], [0, 1], [-1, 0]]
  | transform(
    (cell) => [
      cell @ 1 | add(centre @ 1),
      cell @ 2 | add(centre @ 2),
    ]
  )
);
[glider([5, 5]), glider([5, 10])] | flatten | toArray
`;

export const defaultRulesCode = `(isLive) => (
  currentCellIsLive = isLive([0, 0]);
  neighbors = [
    [-1, -1], [-1, 0], [-1, 1], [0, -1],
    [0, 1], [1, -1], [1, 0], [1, 1],
  ];
  numLiveNeighbors = neighbors | count(isLive);
  if(
    currentCellIsLive,
    then: () => or(
      numLiveNeighbors | eq(2),
      () => numLiveNeighbors | equals(3),
    ),
    else: () => numLiveNeighbors | eq(3),
  )
)
`;

function newGameBoard(liveCells) {
  if (!matches(liveCells, liveCellsSchema)) {
    return `Live cells must be an array of [rowNumber, columnNumber] pairs between [1, 1] and [${numRows}, ${numCols}]. Received: ${display(
      liveCells
    )}`;
  }
  const newBoard = Array.from({ length: numRows }, () =>
    Array.from({ length: numCols }, () => false)
  );
  for (const cell of liveCells) {
    const [rowNum, colNum] = cell;
    newBoard[rowNum - 1][colNum - 1] = true;
  }
  return newBoard;
}

export function updateGameBoard(oldBoard, rules) {
  const newBoard = JSON.parse(JSON.stringify(oldBoard)); // Create a copy of the board

  for (let i = 0; i < numRows; i++) {
    for (let j = 0; j < numCols; j++) {
      const isLive = function ([rowNum, colNum]) {
        const neighborRow = (i + rowNum + numRows) % numRows;
        const neighborCol = (j + colNum + numCols) % numCols;

        return (
          neighborRow >= 0 &&
          neighborRow < numRows &&
          neighborCol >= 0 &&
          neighborCol < numCols &&
          oldBoard[neighborRow][neighborCol]
        );
      };

      const result = rules(isLive);
      if (result.status === "error") {
        return display(result.error);
      }
      const newState = result.value;
      if (!matches(newState, booleanClass)) {
        return `Rules must return a boolean, received: ${display(newState)}`;
      }

      newBoard[i][j] = newState;
    }
  }

  return newBoard;
}

function runSetup() {
  const code = defaultSetupCode;
  const result = kpcatch(() => kpeval(kpparse(code), { timeLimitSeconds: 1 }));
  if (result.status === "error") {
    return display(result.error);
  }
  const liveCells = result.value;
  return newGameBoard(liveCells);
}

function setUpRules() {
  const code = defaultRulesCode;
  const result = kpcatch(() => kpeval(kpparse(code), { timeLimitSeconds: 1 }));
  if (result.status === "error") {
    return display(result.error);
  }
  const rulesKpFunction = result.value;
  if (!matches(rulesKpFunction, functionClass)) {
    return `Not a function: ${display(rulesKpFunction)}`;
  } else {
    return (isLive) =>
      kpcall(
        rulesKpFunction,
        [toKpFunction(([coordinate]) => isLive(coordinate))],
        {}
      );
  }
}

function run() {
  const initialBoard = runSetup();
  if (typeof initialBoard === "string") {
    console.log(initialBoard);
    return;
  }
  const rules = setUpRules();
  if (typeof rules === "string") {
    console.log(rules);
  }
  try {
    const start = Date.now();
    const newBoard = updateGameBoard(initialBoard, rules);
    const elapsedTime = (Date.now() - start) / 1000;
    console.log(`Updated board in ${elapsedTime} seconds`);
    console.log(newBoard.length);
  } catch (e) {
    console.log(e);
  }
}

run();
