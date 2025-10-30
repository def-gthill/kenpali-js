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

/**
 * Creates a non-empty `Stream`.
 *
 * Streams should generally be created using a function that captures the current
 * internal state, and is called recursively from inside the `next` function. For example,
 * the following imitates the core `to` function:
 *
 * ```javascript
 * function to(start, end) {
 *   return stream({
 *     value: () => start,
 *     next: () => start < end ? to(start + 1, end) : emptyStream(),
 *   });
 * }
 * ```
 *
 * @param definition - The definition of the stream, an object with the following properties:
 * - `value` - A function that returns the first value of the stream.
 * - `next` - A function that returns a stream that generates the rest of the elements.
 * @returns A non-empty `Stream`.
 */
export function stream<T extends KpValue>(definition: {
  value: () => T;
  next: () => Stream<T>;
}): FullStream<T>;

/**
 * Creates an empty `Stream`.
 *
 * This function can be used on its own to create an empty stream, but it's
 * also the normal way to signal that a non-empty stream has run out of elements.
 *
 * @returns An empty `Stream`.
 */
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

export interface EnumSchema<T extends KpValue> {
  form: "enum";
  values: T[];
}

export interface UnionSchema<T extends KpValue> {
  form: "union";
  options: Schema<T>[];
}

export interface ConditionSchema<T extends KpValue> {
  form: "condition";
  schema: Schema<T>;
  condition: (value: T) => boolean;
}

export interface ArraySchema<T extends KpValue> {
  form: "array";
  elements: Schema<T>;
}

export interface TupleSchema<T extends KpValue[]> {
  form: "tuple";
  shape: { [K in keyof T]: Schema<T[K]> | OptionalSchema<T[K]> };
}

export interface ObjectSchema<K extends string, V extends KpValue> {
  form: "object";
  keys?: Schema<K>;
  values: Schema<V>;
}

export interface RecordSchema<K extends string, V extends KpValue> {
  form: "record";
  shape?: Map<K, Schema<V> | OptionalSchema<V>>;
}

export interface OptionalSchema<T extends KpValue> {
  form: "optional";
  schema: Schema<T>;
}

export type Schema<T extends KpValue> =
  | TypeSchema<T>
  | EnumSchema<T>
  | UnionSchema<T>
  | ConditionSchema<T>
  | (T extends KpArray<infer E> ? ArraySchema<E> : never)
  | (T extends KpTuple<infer T> ? TupleSchema<T> : never)
  | (T extends KpObject<infer K, infer V>
      ? ObjectSchema<K, V> | RecordSchema<K, V>
      : never);

/**
 * Creates a schema that checks whether the value is one of the specified values.
 *
 * This is used to simulate enum types; for example, a parameter representing a
 * traffic light's colour could be given the schema `oneOfValues(["red", "green", "yellow"])`.
 *
 * For more general union types, use `either`.
 *
 * @param values - The values to check against.
 * @returns The enum schema.
 */
export function oneOfValues<T extends KpValue>(values: T[]): EnumSchema<T>;

/**
 * Creates a schema that checks whether the value matches any of the specified schemas.
 *
 * @param schemas - The schemas to check against.
 * @returns The union schema.
 */
export function either<T extends KpValue>(
  ...schemas: Schema<T>[]
): UnionSchema<T>;

/**
 * Creates a schema that adds an arbitrary condition to an existing schema.
 *
 * @param schema - The schema to add the condition to.
 * @param condition - A predicate that the value must satisfy.
 * @returns The condition schema.
 */
export function satisfying<T extends KpValue>(
  schema: Schema<T>,
  condition: (value: T) => boolean
): ConditionSchema<T>;

/**
 * Creates a schema that checks for arrays with a uniform element type.
 *
 * To specify a different schema for each element, use `tupleLike`.
 *
 * @param elements - The schema that all elements must match.
 * @returns The array schema.
 */
export function arrayOf<T extends KpValue>(elements: Schema<T>): ArraySchema<T>;

/**
 * Creates a schema that checks for arrays with a specific schema for each element.
 *
 * @param shape - The array of schemas that the corresponding element must match.
 * @returns The tuple schema.
 */
export function tupleLike<T extends KpValue[]>(shape: {
  [K in keyof T]: Schema<T[K]> | OptionalSchema<T[K]>;
}): TupleSchema<T>;

/**
 * Creates a schema that checks for objects with a uniform key and value type.
 *
 * To specify a different schema for each property, use `recordLike`.
 *
 * @param keys - The schema that the keys must match.
 * @param values - The schema that the values must match.
 * @returns The object schema.
 */
export function objectOf<K extends string, V extends KpValue>(
  keys: Schema<K>,
  values: Schema<V>
): ObjectSchema<K, V>;

/**
 * Creates a schema that checks for objects with a specific schema for each property.
 *
 * @param shape - The map of schemas that the corresponding property must match.
 * @returns The record schema.
 */
export function recordLike<K extends string, V extends KpValue>(
  shape: Map<K, Schema<V> | OptionalSchema<V>>
): RecordSchema<K, V>;

/**
 * Creates a schema that marks an array element or object property as optional.
 *
 * @param schema - The schema that the value must match if present.
 * @returns The optional schema.
 */
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

/**
 * Parses a Kenpali Code expression into a Kenpali JSON AST.
 * @param code - The Kenpali Code expression to parse.
 * @param options - The options for the parsing:
 * - `trace` - Whether to print diagnostic messages to the console.
 * @returns The Kenpali JSON AST.
 */
export function kpparse(code: string, options?: ParseOptions): ExpressionNode;

/**
 * Evaluates a Kenpali JSON expression. See https://www.kenpali.org/docs/json/
 * for the details of the JSON format.
 * @param expression - The expression to evaluate.
 * @param options - The options for the evaluation:
 * - `names` - Additional names to make available to the expression, as if they were
 *   in the core library.
 * - `modules` - Additional modules to make available to the expression via the
 *   `<module>/<name>` syntax. The values in a module can be defined using the
 *   `platformFunction` and `platformClass` functions, or they can be ordinary
 *   Kenpali values.
 * - `trace` - Whether to print diagnostic messages to the console.
 * - `timeLimitSeconds` - The maximum time in seconds the evaluation is allowed to take.
 * - `debugLog` - A function to call when a Kenpali program calls the `debug` function.
 * @returns The result of the evaluation.
 */
export function kpeval(
  expression: ExpressionNode,
  options?: EvalOptions
): KpValue;

/**
 * Compiles a Kenpali JSON expression into a bytecode program.
 * @param expression - The Kenpali JSON expression to compile.
 * @param options - The options for the compilation:
 * - `names` - Additional names to make available to the expression, as if they were
 *   in the core library.
 * - `modules` - Additional modules to make available to the expression via the
 *   `<module>/<name>` syntax. The values in a module can be defined using the
 *   `platformFunction` and `platformClass` functions, or they can be ordinary
 *   Kenpali values.
 * - `trace` - Whether to print diagnostic messages to the console.
 * @returns The compiled bytecode program.
 */
export function kpcompile(
  expression: ExpressionNode,
  options?: CompileOptions
): KpProgram;

/**
 * Executes a Kenpali bytecode program.
 * @param program - The Kenpali bytecode program to execute.
 * @param options - The options for the execution:
 * - `trace` - Whether to print diagnostic messages to the console.
 * - `timeLimitSeconds` - The maximum time in seconds the execution is allowed to take.
 * - `debugLog` - A function to call when a Kenpali program calls the `debug` function.
 * @returns The result of the execution.
 */
export function kpvm(program: KpProgram, options: VmOptions): KpValue;

/**
 * Calls a Kenpali function.
 *
 * This spins up a new Kenpali VM to execute the bytecode program referenced
 * by the function.
 *
 * @param f - The Kenpali function to call.
 * @param args - The positional arguments to pass to the function.
 * @param namedArgs - The named arguments to pass to the function.
 * @param options - The options for the call:
 * - `timeLimitSeconds` - The maximum time in seconds the execution is allowed to take.
 * - `debugLog` - A function to call when a Kenpali program calls the `debug` function.
 * @returns The result of the call.
 */
export function kpcall(
  f: KpFunction,
  args: KpValue[],
  namedArgs: Record<string, KpValue>,
  options?: CallOptions
): KpValue;

export type KpCallback = (
  callee: KpValue,
  args: KpArray<KpValue>,
  namedArgs: Record<string, KpValue>
) => KpValue;

/**
 * Wraps a JavaScript function to make it callable from Kenpali.
 *
 * When called from Kenpali, `f` will be passed three arguments:
 * - `args` - An array of the positional arguments passed to the function.
 * - `namedArgs` - A JavaScript object of the named arguments passed to the function.
 * - `kpcallback` - A function to use when making calls to Kenpali functions.
 *
 * The `kpcallback` function is used in the same way as `kpcall`, but it uses the
 * existing Kenpali VM to execute the function instead of spinning up a new one.
 * Its main use is for calling functions passed as arguments, but some functions
 * in the JavaScript API, such as `display`, also accept a `kpcallback` parameter
 * to ensure that they run in the existing VM.
 *
 * @param f - The JavaScript function to wrap.
 * @returns The wrapped function.
 */
export function toKpFunction<
  P extends KpTuple<KpValue[]>,
  K extends string,
  V extends KpValue,
>(
  f: (args: P, namedArgs: Record<K, V>, kpcallback: KpCallback) => KpValue
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

export type VmCallback = (
  callee: KpValue,
  args: KpArray<KpValue>,
  namedArgs: KpObject<string, KpValue>
) => KpValue;

export type DebugLog = (message: string) => void;
export type GetMethod = (methodName: string) => PlatformFunction;
export type VmContext = {
  kpcallback: VmCallback;
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
