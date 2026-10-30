/** The walkthrough/2 data model. One file so every module and the app see the same shapes. */

export type PayloadPart =
  | 'headers'
  | 'query'
  | 'params'
  | 'cookies'
  | 'body'
  | 'sql'
  | 'event'
  | 'input'
  | 'result'
  /** A `@payload` line without a part (the version 1 form). */
  | '_';

export interface Payload {
  part: PayloadPart;
  text: string;
}

export interface AnnotatedPayload extends Payload {
  line: number;
}

/** `@uses <kind> <name> [path:line] <text>` */
export interface Uses {
  kind: string;
  name: string;
  ref: string;
  text: string;
}

export interface StepUses extends Uses {
  line: number;
}

/** A side part aggregated over the whole flow. */
export interface FlowUses extends Uses {
  steps: number[];
}

export interface FieldNote {
  name: string;
  text: string;
}

export interface SchemaRule {
  field: string;
  text: string;
}

export interface StateText {
  before: string;
  after: string;
}

export type FlagTag = 'async' | 'retry' | 'timeout' | 'idempotent';

/** `@async`, `@retry 3×` and so on: the text, or `true` when the tag has none. */
export type Flags = Partial<Record<FlagTag, string | true>>;

export interface LintEntry {
  line: number;
  msg: string;
  code: string;
  step?: number;
}

/** A line Mermaid 12 refuses. The viewer shows the diagram error; the validator reports these. */
export interface SyntaxIssue {
  line: number;
  code: string;
  msg: string;
}

export interface Term {
  term: string;
  def: string;
  line: number;
}

export interface LayerAnnotation {
  text: string;
  kind: string;
  line: number;
}

/** One arrow line with the step-level annotations that were written above it. */
export interface AnnotatedArrow {
  line: number;
  left: string;
  text: string;
  step: string;
  stepLine: number;
  payloads: AnnotatedPayload[];
  refs: string[];
  uses: StepUses[];
  effects: string[];
  fields: FieldNote[];
  schema: SchemaRule[];
  state: StateText;
  flags: Flags;
  unconfirmed: string[];
  section: string | null;
  sectionLine: number;
  annLines: number[];
}

/** Everything the `%%` annotations say, before Mermaid's view of the arrows is joined in. */
export interface Annotations {
  lines: string[];
  title: string;
  titleLine: number;
  fmTitle: string;
  kwTitle: string;
  spec: string;
  mode: string;
  scope: string;
  trigger: string;
  summary: string[];
  terms: Term[];
  layers: Record<string, LayerAnnotation>;
  sectionSummaries: Record<number, string[]>;
  arrows: AnnotatedArrow[];
  lint: LintEntry[];
  diagramType: string;
  typeLine: number;
  sectionCount: number;
  frontMatterEnd: number;
}

export type ParticipantType = 'participant' | 'actor';

export interface Participant {
  alias: string;
  name: string;
  type: ParticipantType;
}

export type BlockKind =
  | 'loop'
  | 'alt'
  | 'else'
  | 'opt'
  | 'par'
  | 'and'
  | 'critical'
  | 'option'
  | 'break';

/** One enclosing Mermaid block of an arrow, outermost first. `rect` boxes are not recorded. */
export interface Branch {
  id: number;
  kind: BlockKind;
  label: string;
  /** True in the first branch of a block (`alt`, `par`, `critical`), false in `else`, `and`, `option`. */
  first: boolean;
}

export interface SequenceArrow {
  from: string;
  to: string;
  text: string;
  /** Mermaid's LINETYPE number for the arrow style. */
  type: number;
  dotted: boolean;
  branch: Branch[];
  line: number;
}

/** The sequence diagram as Mermaid draws it: participants in order, arrows in order, blocks. */
export interface SequenceInfo {
  type: 'sequence';
  participants: Participant[];
  arrows: SequenceArrow[];
  autonumber: boolean;
  syntax: SyntaxIssue[];
}

export type Zone = 'client' | 'ours' | 'outside' | '';

export interface Layer {
  name: string;
  desc: string;
  kind: string;
  icon: string;
  zone: Zone;
}

export interface Section {
  name: string;
  firstStep: number;
  count: number;
  line: number;
  summary: string;
  hue: number;
  idx: number;
  /** Set on the unnamed "Start" chapter the viewer adds before the first `@section`. */
  implicit?: true;
}

export interface HttpCall {
  method: string;
  path: string;
}

export interface Status {
  code: number;
  reason: string;
}

export type StepKind = 'request' | 'reply' | 'self';

export interface Step {
  idx: number;
  n: number;
  line: number;
  annLines: number[];
  from: string;
  to: string;
  fromName: string;
  toName: string;
  kind: StepKind;
  labelRaw: string;
  label: string[];
  explain: string;
  payloads: Payload[];
  payload: string;
  refs: string[];
  uses: StepUses[];
  effects: string[];
  fields: FieldNote[];
  schema: SchemaRule[];
  state: StateText;
  flags: Flags;
  unconfirmed: string[];
  http: HttpCall | null;
  status: Status | null;
  section: number;
  branch: Branch[];
  /** `from→to|label`, plus `#n` when the same arrow appears more than once. Notes attach to it. */
  key: string;
  replies: number[];
  answers: number;
  isError: boolean;
  inElse: boolean;
}

export interface Effect {
  text: string;
  step: number;
}

export interface DataTouched {
  table: string;
  ops: string[];
  steps: number[];
}

export interface Boundary {
  left: string;
  right: string;
  from: Zone;
  to: Zone;
}

export interface Flow {
  title: string;
  hasTitle: boolean;
  spec: string;
  isSequence: boolean;
  diagramType: string;
  mode: string;
  proposed: boolean;
  scope: string;
  trigger: string;
  summary: string;
  terms: Term[];
  layers: Record<string, Layer>;
  participants: Participant[];
  sections: Section[];
  steps: Step[];
  lint: LintEntry[];
  /** Mermaid drew a different number of arrows than the annotation scan found. */
  mismatch: boolean;
  uses: FlowUses[];
  effects: Effect[];
  data: DataTouched[];
  /** Step indexes of the replies to the main request. */
  endings: number[];
  unconfirmed: number;
  boundaries: Boundary[];
  main: number;
  syntax: SyntaxIssue[];
}
