export function kpparse(code: string): object;
export function kpeval(expression: object, names?: Map<string, any>): any;
export function toString(value: any): string;
export function kpobject(...entries: [string, any][]): Map<string, any>;
export function toJsFunction(f: Map<string, any>): function;
export function toKpFunction(f: function): function;
