export type KpAstNode = object;

export type KpArray = KpValue[];

export type Stream = (
  | {
      value: () => KpValue;
      next: () => Stream;
    }
  | {}
) & { isEmpty: () => boolean };

export type Sequence = string | KpArray | Stream;

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

export interface CompiledFunction {
  name: string;
  isBuiltin: boolean;
}

export type Builtin = CompiledFunction & { isBuiltin: true };

export type Given = CompiledFunction & { isBuiltin: false };

export type KpFunction = Callback | CompiledFunction;

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
  | Stream
  | KpObject
  | Callback
  | CompiledFunction
  | KpError;

export type TypeSchema =
  | "null"
  | "boolean"
  | "number"
  | "string"
  | "array"
  | "stream"
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

export type TypeToValue<T extends TypeSchema> = T extends "null"
  ? null
  : T extends "boolean"
    ? boolean
    : T extends "number"
      ? number
      : T extends "string"
        ? string
        : T extends "array"
          ? KpArray
          : T extends "stream"
            ? Stream
            : T extends "object"
              ? KpObject
              : T extends "builtin"
                ? Builtin
                : T extends "given"
                  ? Given
                  : T extends "error"
                    ? KpError
                    : T extends "function"
                      ? KpFunction
                      : T extends "sequence"
                        ? Sequence
                        : KpValue;

export interface TypeWithWhereSchema<T extends TypeSchema = TypeSchema> {
  type: T;
  where: (value: TypeToValue<T>) => boolean;
}

export interface ArrayWithConditionsSchema {
  type: "array";
  shape?: Schema[];
  elements?: Schema;
  where?: (value: KpArray) => boolean;
}

export interface ObjectWithConditionsSchema {
  type: "object";
  shape?: Record<string, Schema>;
  keys?: TypeWithWhereSchema & { type: "string" };
  values?: Schema;
  where?: (value: KpObject) => boolean;
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
  f: KpFunction,
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
export function kpcatch<T>(f: () => T): T | KpError;
export function foldError(
  f: () => KpValue,
  onSuccess: (value: KpValue) => KpValue,
  onFailure: (error: KpError) => KpValue
): KpValue;

export function kpobject(...entries: [string, KpValue][]): KpObject;
export function matches<T extends Schema = Schema>(
  value: KpValue,
  schema: T
): value is TypeToValue<T>;
export function validate(value: KpValue, schema: Schema): void;
export function validateCatching(
  value: KpValue,
  schema: Schema
): KpError | null;
export function validateErrorTo(
  value: KpValue,
  schema: Schema,
  onFailure: (error: KpError) => void
): void;
export function toString(value: KpValue): string;
export function isError(value: unknown): value is KpError;

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
