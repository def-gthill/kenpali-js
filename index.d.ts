//#region AST nodes

export interface CheckedNode {
  type: "checked";
  name: NamePatternNode;
  schema: Schema<KpValue>;
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

export type KpArray<T extends KpValue> = T[];

export type KpTuple<T extends KpValue[]> = T;

export class FullStream<T extends KpValue> {
  isEmpty: () => false;
  value: () => T;
  next: () => Stream<T>;
}

export class EmptyStream {
  isEmpty: () => true;
}

export type Stream<T extends KpValue> = FullStream<T> | EmptyStream;

export function stream<T extends KpValue>(
  value: () => T,
  next: () => Stream<T>
): FullStream<T>;

export function emptyStream(): EmptyStream;

export type Sequence<T extends KpValue> =
  | (T extends string ? string : never)
  | KpArray<T>
  | Stream<T>;

export type KpObject<K extends string, V extends KpValue> = Map<K, V>;

export type Callback<
  P extends KpTuple<KpValue[]>,
  N extends KpObject<string, KpValue>,
> = (args: P, namedArgs: N, context: VmContext) => KpValue;

export interface CompiledFunction {
  name: string;
  isPlatform: boolean;
}

export type PlatformFunction = CompiledFunction & { isPlatform: true };

export type NaturalFunction = CompiledFunction & { isPlatform: false };

export type KpFunction = Callback<never, never> | CompiledFunction;

export interface KpError {
  error: string;
  details: KpObject<string, KpValue>;
}

export class KpInstance<T extends KpValue, P extends object> {
  class_: KpClass<T>;
  properties: P;
  constructor(class_: KpClass<T>, properties: P);
}

export class KpProtocol<T extends KpValue> extends KpInstance<
  KpProtocol<T>,
  {
    name: string;
    supers: KpProtocol<KpValue>[];
  }
> {
  constructor(name: string, supers: KpProtocol<KpValue>[]);
}

export class KpClass<T extends KpValue> extends KpInstance<
  KpClass<T>,
  {
    name: T extends KpClass<KpValue> ? "Class" : string;
    protocols: KpProtocol<KpValue>[];
  }
> {
  constructor(name: string, protocols: KpProtocol<KpValue>[]);
}

export type KpValue =
  | null
  | boolean
  | number
  | string
  | KpValue[] // KpArray, inlined to avoid circularity
  | (FullStream<KpValue> | EmptyStream) // Stream, inlined to avoid circularity
  | Map<string, KpValue> // KpObject, inlined to avoid circularity
  | Callback<never, never>
  | CompiledFunction
  | KpError
  | KpInstance<KpValue, object>
  | KpClass<KpValue>
  | KpProtocol<KpValue>;

export const sequenceProtocol: KpProtocol<
  string | KpArray<KpValue> | Stream<KpValue>
>;
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
export const arrayClass: KpClass<KpArray<KpValue>>;
export const streamClass: KpClass<Stream<KpValue>>;
export const objectClass: KpClass<KpObject<string, KpValue>>;
export const functionClass: KpClass<KpFunction>;
export const errorClass: KpClass<KpError>;
export const classClass: KpClass<KpClass<KpValue>>;
export const protocolClass: KpClass<KpProtocol<KpValue>>;

//#endregion

//#region Schemas

export type TypeSchema<T extends KpValue> = KpClass<T> | KpProtocol<T>;

export interface TypeWithWhereSchema<T extends KpValue> {
  type: TypeSchema<T>;
  where: (value: T) => boolean;
}

export interface OneOfSchema<T extends KpValue> {
  oneOf: T[];
}

export interface ArraySchema<T extends KpValue> {
  type: TypeSchema<KpArray<KpValue>>;
  elements: Schema<T>;
  where?: (value: KpArray<T>) => boolean;
}

export interface TupleSchema<T extends KpValue[]> {
  type: TypeSchema<KpArray<KpValue>>;
  shape?: { [K in keyof T]: Schema<T[K]> | OptionalSchema<T[K]> };
  where?: (value: KpTuple<T>) => boolean;
}

export interface ObjectSchema<K extends string, V extends KpValue> {
  type: TypeSchema<KpObject<K, V>>;
  keys?: Schema<K>;
  values?: Schema<V>;
  where?: (value: KpObject<K, V>) => boolean;
}

export interface RecordSchema<K extends string, V extends KpValue> {
  type: TypeSchema<KpObject<K, V>>;
  shape?: Map<K, Schema<V> | OptionalSchema<V>>;
  where?: (value: KpObject<K, V>) => boolean;
}

export interface OptionalSchema<T extends KpValue> {
  optional: Schema<T>;
}

export interface EitherSchema<T extends KpValue> {
  either: Schema<T>[];
}

export type TypeWithConditionsSchema<T extends KpValue> =
  | TypeWithWhereSchema<T>
  | (T extends KpArray<infer E> ? ArraySchema<E> : never)
  | (T extends KpTuple<infer T> ? TupleSchema<T> : never)
  | (T extends KpObject<infer K, infer V>
      ? ObjectSchema<K, V> | RecordSchema<K, V>
      : never);

export type Schema<T extends KpValue> =
  | TypeSchema<T>
  | EitherSchema<T>
  | OneOfSchema<T>
  | TypeWithConditionsSchema<T>;

export function is<T extends KpValue>(
  type: TypeSchema<T>,
  where?: (value: T) => boolean
): Schema<T>;

export function oneOf<T extends KpValue>(value: T[]): OneOfSchema<T>;

export function arrayOf<T extends KpValue>(
  elementSchema: Schema<T>
): ArraySchema<T>;

export function tupleLike<T extends KpValue[]>(shape: {
  [K in keyof T]: Schema<T[K]> | OptionalSchema<T[K]>;
}): TupleSchema<T>;

export function objectOf<K extends string, V extends KpValue>(
  keys: Schema<K>,
  values: Schema<V>
): ObjectSchema<K, V>;

export function recordLike<K extends string, V extends KpValue>(
  shape: Map<K, Schema<V> | OptionalSchema<V>>
): RecordSchema<K, V>;

export function optional<T extends KpValue>(
  schema: Schema<T>
): OptionalSchema<T>;

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
): KpValue;

export function toKpFunction<
  P extends KpTuple<KpValue[]>,
  K extends string,
  V extends KpValue,
>(
  f: (args: P, namedArgs: KpObject<K, V>, kpcallback: KpCallback) => KpValue
): Callback<KpTuple<P>, KpObject<K, V>>;

export function kpcatch<T>(f: () => T): T | KpError;

export function foldError(
  f: () => KpValue,
  onSuccess: (value: KpValue) => KpValue,
  onFailure: (error: KpError) => KpValue
): KpValue;

export function kpobject<K extends string, V extends KpValue>(
  ...entries: [NoInfer<K>, NoInfer<V>][]
): KpObject<K, V>;

export function matches<T extends KpValue>(
  value: KpValue,
  schema: Schema<T>
): value is T;

export function validate(value: KpValue, schema: Schema<KpValue>): void;

export function validateCatching(
  value: KpValue,
  schema: Schema<KpValue>
): KpError | null;

export function validateErrorTo(
  value: KpValue,
  schema: Schema<KpValue>,
  onFailure: (error: KpError) => void
): void;

export function display(value: KpValue): string;

export function isError(value: KpValue): value is KpError;

export type KpCallback = (
  callee: KpValue,
  args: KpArray<KpValue>,
  namedArgs: KpObject<string, KpValue>
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
    ...("posRest" extends keyof P ? [Defined<P["posRest"]>[]] : []),
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
  ? N | { name: N; type: Schema<T> }
  : { name: N; type: Schema<T> };

export type RestParamSpec<T extends KpValue> = { rest: SingleParamSpec<T> };

type PosParamSpecsFrom<T extends KpValue[]> = {
  [K in keyof T]: SingleParamSpec<T[K]>;
};

type PosRestParamSpecFrom<T extends KpValue> = RestParamSpec<KpArray<T>>;

type NamedParamSpecsFrom<T extends [string, KpValue][]> = {
  [K in keyof T]: SingleParamSpec<T[K][1], T[K][0]>;
};

type NamedRestParamSpecFrom<T extends KpValue> = RestParamSpec<
  KpObject<string, T>
>;

export interface ParamSpec<P extends ParamTypes> {
  params?: [
    ...("pos" extends keyof P ? PosParamSpecsFrom<Defined<P["pos"]>> : []),
    ...("posRest" extends keyof P
      ? [PosRestParamSpecFrom<Defined<P["posRest"]>>]
      : []),
  ];
  namedParams?: [
    ...("named" extends keyof P
      ? NamedParamSpecsFrom<Defined<P["named"]>>
      : []),
    ...("namedRest" extends keyof P
      ? [NamedRestParamSpecFrom<Defined<P["namedRest"]>>]
      : []),
  ];
}

export function platformFunction<P extends ParamTypes>(
  name: string,
  paramSpec: ParamSpec<P>,
  f: FunctionImpl<P>
): FunctionSpec<P>;

//#endregion
