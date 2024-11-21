export type KpAstNode = object;

export type KpArray = KpValue[];

export type KpObject = Map<string, KpValue>;

export type SingleParamSpec =
  | string
  | { name: string; type: KpValue }
  | { rest: string | { name: string; type: KpValue } };

export interface ParamSpec {
  params?: SingleParamSpec[];
  namedParams?: SingleParamSpec[];
}

export type Builtin = function & { builtinName: string } & ParamSpec;

export interface Given {
  given: ParamSpec;
  result: any;
  closure: Map<string, any>;
}

export interface KpError {
  error: string;
  details: KpObject;
}

export type KpValue =
  | null
  | boolean
  | number
  | string
  | KpArray
  | KpObject
  | Builtin
  | Given
  | KpError;

export type Schema = KpValue;

export interface CallOptions {
  timeLimitSeconds?: number;
}

export interface EvalOptions extends CallOptions {
  names?: Map<string, KpValue>;
  modules?: Map<string, KpValue>;
  trace?: boolean;
}

export function kpparse(code: string): KpAstNode;
export function kpeval(
  expression: KpAstNode,
  options: EvalOptions = {}
): KpValue;

export function kpobject(...entries: [string, KpValue][]): KpObject;
export function matches(value: KpValue, schema: Schema): boolean;
export function kpcall(
  f: Given,
  args: KpValue[],
  namedArgs: Record<string, KpValue>,
  options: CallOptions = {}
): any;
export function toKpFunction(f: function): Builtin;
export function toString(value: KpValue): string;
