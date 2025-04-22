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

export type Callback = (
  args: KpArray,
  namedArgs: KpObject,
  context: VmContext
) => KpValue;

export interface Function {
  name: string;
  isBuiltin: boolean;
}

export type Builtin = Function & { isBuiltin: true };

export type Given = Function & { isBuiltin: false };

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
  | Callback
  | Function
  | KpError;

export type TypeSchema =
  | "null"
  | "boolean"
  | "number"
  | "string"
  | "array"
  | "object"
  | "builtin"
  | "given"
  | "error"
  | "function"
  | "sequence";

export interface EitherSchema {
  either: Schema[];
}

export interface OneOfSchema {
  oneOf: KpValue[];
}

export interface TypeWithWhereSchema {
  type: TypeSchema;
  where: (value: KpValue) => boolean;
}

export interface ArrayWithConditionsSchema {
  type: "array";
  shape?: Schema[];
  elements?: Schema;
  where?: (value: KpValue) => boolean;
}

export interface ObjectWithConditionsSchema {
  type: "object";
  shape?: Record<string, Schema>;
  keys?: TypeWithWhereSchema & { type: "string" };
  values?: Schema;
  where?: (value: KpValue) => boolean;
}

export type TypeWithConditionsSchema =
  | TypeWithWhereSchema
  | ArrayWithConditionsSchema
  | ObjectWithConditionsSchema;

export type Schema =
  | TypeSchema
  | EitherSchema
  | OneOfSchema
  | TypeWithConditionsSchema;

export interface KpProgram {
  instructions: any[];
  diagnostics: any[];
}

export interface ParseOptions {
  trace?: boolean;
}

export interface CallOptions {
  timeLimitSeconds?: number;
  debugLog?: (message: string) => void;
}

export interface CompileOptions {
  names?: Map<string, KpValue>;
  modules?: Map<string, KpValue>;
  trace?: boolean;
}

export interface VmOptions extends CallOptions {
  trace?: boolean;
}

export type EvalOptions = CompileOptions & VmOptions;

export function kpparse(code: string, options: ParseOptions = {}): KpAstNode;
export function kpeval(
  expression: KpAstNode,
  options: EvalOptions = {}
): KpValue;
export function kpcompile(
  expression: KpAstNode,
  options: CompileOptions
): KpProgram;
export function kpvm(program: KpProgram, options: VmOptions): KpValue;

export function kpcall(
  f: Given,
  args: KpValue[],
  namedArgs: Record<string, KpValue>,
  options: CallOptions = {}
): any;
export function toKpFunction(
  f: (
    args: KpValue[],
    namedArgs: Record<string, KpValue>,
    kpcallback: Kpcallback
  ) => KpValue
): Callback;
export function kpcatch(f: () => KpValue): KpValue;

export function kpobject(...entries: [string, KpValue][]): KpObject;
export function matches(value: KpValue, schema: Schema): boolean;
export function validate(value: KpValue, schema: Schema): void;
export function toString(value: KpValue): string;

export type Kpcallback = (
  callee: KpValue,
  args: KpArray,
  namedArgs: KpObject
) => KpValue;

export type DebugLog = (message: string) => void;
export type GetMethod = (methodName: string) => Builtin;
export type VmContext = {
  kpcallback: Kpcallback;
  debugLog: DebugLog;
  getMethod: GetMethod;
};

export type BuiltinImpl = (args: KpArray, context: VmContext) => KpValue;
export type MethodImpl = (
  args: [any, ...KpArray],
  context: VmContext
) => KpValue;

export type BuiltinSpec = BuiltinImpl & {
  builtinName: string;
  methods?: MethodSpec[];
};

export type MethodSpec = MethodImpl & {
  methodName: string;
};

export function builtin(
  name: string,
  paramSpec: ParamSpec,
  f: BuiltinImpl,
  methods?: MethodSpec[]
): BuiltinSpec;
export function method(
  name: string,
  paramSpec: ParamSpec,
  f: MethodImpl
): MethodSpec;
export function instance(
  self: any,
  methods: string[],
  getMethod: GetMethod
): KpObject;
