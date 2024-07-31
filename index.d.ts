export function kpeval(expression: object, names?: Map<string, any>): any;
export function kpobject(...entries: [string, any][]): Map<string, any>;
export function kpparse(code: string): object;
export function matches(value: any, schema: any): boolean;
export function toJsFunction(f: Map<string, any>): function;
export function toKpFunction(f: function): function;
export function toString(value: any): string;
