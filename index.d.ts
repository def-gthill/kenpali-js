export function kpparse(code: string): object;
export function kpeval(expression: object, names?: Map<string, any>): any;
export function toString(value: any): string;
export function kpobject(...entries: [string, any][]): Map<string, any>;
export function callOnValues(
  f: Map<string, any> | function,
  args: any[],
  namedArgs: Map<string, any>
): any;
