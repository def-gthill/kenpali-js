import {
  kpcall,
  kpcatch,
  kpeval,
  kpparse,
  matches,
  toKpFunction,
  toString,
} from "../index.js";

const numRows = 30;
const numCols = 30;

const rowNumberSchema = {
  type: "number",
  where: (n) => n >= 1 && n <= numRows,
};
const colNumberSchema = {
  type: "number",
  where: (n) => n >= 1 && n <= numCols,
};
const liveCellsSchema = {
  type: "array",
  elements: { type: "array", shape: [rowNumberSchema, colNumberSchema] },
};

export const defaultSetupCode = `glider = (centre) => (
  [[1, 1], [1, 0], [1, -1], [0, 1], [-1, 0]]
  | transform(
    (cell) => [
      cell @ 1 | plus(centre @ 1),
      cell @ 2 | plus(centre @ 2),
    ]
  )
);
[glider([5, 5]), glider([5, 10])] | flatten
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
      numLiveNeighbors | equals(2),
      () => numLiveNeighbors | equals(3),
    ),
    else: () => numLiveNeighbors | equals(3),
  )
)
`;

function newGameBoard(liveCells) {
  if (!matches(liveCells, liveCellsSchema)) {
    return `Live cells must be an array of [rowNumber, columnNumber] pairs between [1, 1] and [${numRows}, ${numCols}]. Received: ${toString(
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

      const newState = rules(isLive);
      if (matches(newState, "error")) {
        return toString(newState);
      }
      if (!matches(newState, "boolean")) {
        return `Rules must return a boolean, received: ${toString(newState)}`;
      }

      newBoard[i][j] = rules(isLive);
    }
  }

  return newBoard;
}

function runSetup() {
  const code = defaultSetupCode;
  const liveCells = kpcatch(() =>
    kpeval(kpparse(code), { timeLimitSeconds: 1 })
  );
  if (matches(liveCells, "error")) {
    return toString(liveCells);
  }
  return newGameBoard(liveCells);
}

function setUpRules() {
  const code = defaultRulesCode;
  const rulesKpFunction = kpcatch(() =>
    kpeval(kpparse(code), { timeLimitSeconds: 1 })
  );
  if (matches(rulesKpFunction, "error")) {
    return toString(rulesKpFunction);
  } else if (!matches(rulesKpFunction, "function")) {
    return `Not a function: ${toString(rulesKpFunction)}`;
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
