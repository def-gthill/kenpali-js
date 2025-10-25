//#region AST nodes

export interface CheckedNode {
  type: "checked";
  name: NamePatternNode;
  schema: Schema;
}

export interface OptionalNode {
  type: "optional";
  name: NamePatternNode;
  defaultValue: ExpressionNode;
}

export interface RestNode {
  type: "rest";
  name: NamePatternNode;
}

export type ArrayPatternElement = OptionalNode | RestNode | NamePatternNode;

export interface ArrayPatternNode {
  type: "arrayPattern";
  names: ArrayPatternElement[];
}

export type ObjectPatternEntry =
  | RestNode
  | [ExpressionNode, OptionalNode | NamePatternNode];

export interface ObjectPatternNode {
  type: "objectPattern";
  entries: ObjectPatternEntry[];
}

export type NamePatternNode =
  | string
  | CheckedNode
  | ArrayPatternNode
  | ObjectPatternNode;

export interface SpreadNode {
  type: "spread";
  value: ExpressionNode;
}

export interface LiteralNode {
  type: "literal";
  value: KpValue;
}

export type ArrayElement = SpreadNode | ExpressionNode;

export interface ArrayNode {
  type: "array";
  elements: ArrayElement[];
}

export type ObjectEntry = SpreadNode | [ExpressionNode, ExpressionNode];

export interface ObjectNode {
  type: "object";
  entries: ObjectEntry[];
}

export interface NameNode {
  type: "name";
  name: string;
  from?: string;
}

export interface BlockNode {
  type: "block";
  defs: [null | NamePatternNode, ExpressionNode][];
  result: ExpressionNode;
}

export interface FunctionNode {
  type: "function";
  posParams?: ArrayPatternElement[];
  namedParams?: ObjectPatternEntry[];
  body: ExpressionNode;
}

export interface CallNode {
  type: "call";
  callee: ExpressionNode;
  posArgs?: ArrayElement[];
  namedArgs?: ObjectEntry[];
}

export interface IndexNode {
  type: "index";
  collection: ExpressionNode;
  index: ExpressionNode;
}

export interface CatchNode {
  type: "catch";
  expression: ExpressionNode;
}

export type ExpressionNode =
  | LiteralNode
  | ArrayNode
  | ObjectNode
  | NameNode
  | BlockNode
  | FunctionNode
  | CallNode
  | IndexNode
  | CatchNode;

//#endregion

//#region Kenpali values

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

export type Callback<P extends KpArray, N extends KpObject> = (
  args: P,
  namedArgs: N,
  context: VmContext
) => KpValue;

export interface CompiledFunction {
  name: string;
  isPlatform: boolean;
}

export type PlatformFunction = CompiledFunction & { isPlatform: true };

export type NaturalFunction = CompiledFunction & { isPlatform: false };

export type KpFunction = Callback<never, never> | CompiledFunction;

export interface KpError {
  error: string;
  details: KpObject;
}

export class KpInstance<T extends KpValue, P extends object> {
  class_: KpClass<T>;
  properties: P;
  constructor(class_: KpClass<T>, properties: P);
}

export class KpProtocol<out T extends KpValue> extends KpInstance<
  KpProtocol<T>,
  {
    name: string;
    protocols: KpProtocol<KpValue>[];
  }
> {
  // Ensures that KpProtocol and KpClass are not assignable to each other,
  // despite having the same shape.
  private _jsclass: "protocol";
  constructor(name: string, protocols: KpProtocol<KpValue>[]);
}

export class KpClass<out T extends KpValue> extends KpInstance<
  KpClass<T>,
  {
    name: string;
    protocols: KpProtocol<KpValue>[];
  }
> {
  // Ensures that KpProtocol and KpClass are not assignable to each other,
  // despite having the same shape.
  private _jsclass: "class";
  constructor(name: string, protocols: KpProtocol<KpValue>[]);
}

export type KpValue =
  | null
  | boolean
  | number
  | string
  | KpArray
  | Stream
  | KpObject
  | Callback<never, never>
  | CompiledFunction
  | KpError
  | KpInstance<KpValue, object>
  | KpClass<KpValue>
  | KpProtocol<KpValue>;

export const sequenceProtocol: KpProtocol<string | KpArray | Stream>;
export const typeProtocol: KpProtocol<KpClass<KpValue> | KpProtocol<KpValue>>;
export const instanceProtocol: KpProtocol<KpInstance<KpValue, object>>;
export const displayProtocol: KpProtocol<
  KpInstance<KpValue, { display: () => string }>
>;
export const anyProtocol: KpProtocol<KpValue>;

export const nullClass: KpClass<null>;
export const booleanClass: KpClass<boolean>;
export const numberClass: KpClass<number>;
export const stringClass: KpClass<string>;
export const arrayClass: KpClass<KpArray>;
export const objectClass: KpClass<KpObject>;
export const functionClass: KpClass<KpFunction>;
export const classClass: KpClass<KpClass<KpValue>>;
export const protocolClass: KpClass<KpProtocol<KpValue>>;

//#endregion

//#region Schemas

export type TypeSchema =
  | "null"
  | "boolean"
  | "number"
  | "string"
  | "array"
  | "stream"
  | "object"
  | "function"
  | "error"
  | "sequence";

export interface EitherSchema {
  either: Schema[];
}

export interface OneOfSchema {
  oneOf: KpValue[];
}

export type TypeToValue<T extends Schema> = T extends "null"
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
              : T extends "function"
                ? KpFunction
                : T extends "error"
                  ? KpError
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

//#endregion

//#region Exported functions

export interface KpProgram {
  instructions: any[];
  diagnostics: any[];
}

export type KpModule = Map<string, KpValue | FunctionSpec<{}>>;

export interface ParseOptions {
  trace?: boolean;
}

export interface CallOptions {
  timeLimitSeconds?: number;
  debugLog?: (message: string) => void;
}

export interface CompileOptions {
  names?: Map<string, KpValue>;
  modules?: Map<string, KpModule>;
  trace?: boolean;
}

export interface VmOptions extends CallOptions {
  trace?: boolean;
}

export type EvalOptions = CompileOptions & VmOptions;

export function kpparse(code: string, options?: ParseOptions): ExpressionNode;
export function kpeval(
  expression: ExpressionNode,
  options?: EvalOptions
): KpValue;
export function kpcompile(
  expression: ExpressionNode,
  options?: CompileOptions
): KpProgram;
export function kpvm(program: KpProgram, options: VmOptions): KpValue;

export function kpcall(
  f: KpFunction,
  args: KpValue[],
  namedArgs: Record<string, KpValue>,
  options?: CallOptions
): any;
export function toKpFunction(
  f: (
    args: KpValue[],
    namedArgs: Record<string, KpValue>,
    kpcallback: KpCallback
  ) => KpValue
): Callback<KpArray, KpObject>;
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
export function isError(value: KpValue): value is KpError;

export type KpCallback = (
  callee: KpValue,
  args: KpArray,
  namedArgs: KpObject
) => KpValue;

export type DebugLog = (message: string) => void;
export type GetMethod = (methodName: string) => PlatformFunction;
export type VmContext = {
  kpcallback: KpCallback;
  debugLog: DebugLog;
  getMethod: GetMethod;
};

export interface ParamTypes {
  pos?: KpValue[];
  posRest?: KpValue;
  named?: [string, KpValue][];
  namedRest?: KpValue;
}

type Defined<T> = Exclude<T, undefined>;

type NamedParamTypesFrom<T extends [string, KpValue][]> = {
  [K in keyof T]: T[K][1];
};

export type FunctionImpl<P extends ParamTypes> = (
  args: [
    ...("pos" extends keyof P ? Defined<P["pos"]> : []),
    ...("posRest" extends keyof P ? [Defined<P["posRest"]>] : []),
    ...("named" extends keyof P
      ? NamedParamTypesFrom<Defined<P["named"]>>
      : []),
    ...("namedRest" extends keyof P ? [Defined<P["namedRest"]>] : []),
  ],
  context: VmContext
) => KpValue;

export type FunctionSpec<P extends ParamTypes> = FunctionImpl<P> & {
  functionName: string;
};

export type SingleParamSpec<
  T extends KpValue,
  N extends string = string,
> = KpValue extends T
  ? N | { name: N; type: KpClass<T> | KpProtocol<T> }
  : { name: N; type: KpClass<T> | KpProtocol<T> };

export type RestParamSpec<T extends KpValue> = { rest: SingleParamSpec<T> };

type PosParamSpecsFrom<T extends KpValue[]> = {
  [K in keyof T]: SingleParamSpec<T[K]>;
};

type NamedParamSpecsFrom<T extends [string, KpValue][]> = {
  [K in keyof T]: SingleParamSpec<T[K][1], T[K][0]>;
};

export interface ParamSpec<P extends ParamTypes> {
  params?: [
    ...("pos" extends keyof P ? PosParamSpecsFrom<Defined<P["pos"]>> : []),
    // ...MaybeSingle<P["posRest"], RestParamSpec<Defined<P["posRest"]>>>,
    ...("posRest" extends keyof P
      ? [RestParamSpec<Defined<P["posRest"]>>]
      : []),
    // P["posRest"],
  ];
  namedParams?: [
    ...("named" extends keyof P
      ? NamedParamSpecsFrom<Defined<P["named"]>>
      : []),
    ...("namedRest" extends keyof P
      ? [RestParamSpec<Defined<P["namedRest"]>>]
      : []),
  ];
}

export function platformFunction<P extends ParamTypes>(
  name: string,
  paramSpec: ParamSpec<P>,
  f: FunctionImpl<P>
): FunctionSpec<P>;

//#endregion
