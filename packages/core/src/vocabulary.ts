import type { BlockKind, PayloadPart, ThreatLevel, Zone } from './types.ts';

export const DEFAULT_TITLE = 'Sequence diagram';

/**
 * A lookup table for words read from a diagram. It has no prototype, so `constructor` or
 * `__proto__` in the code is an unknown word, never a member of Object.
 */
export const wordTable = <T>(entries: Record<string, T>): Record<string, T> =>
  Object.assign(Object.create(null) as Record<string, T>, entries);

export const FLOW_TAGS = ['spec', 'title', 'mode', 'scope', 'trigger', 'term', 'layer'] as const;
export const STEP_TAGS = [
  'step',
  'payload',
  'ref',
  'uses',
  'effect',
  'field',
  'schema',
  'state',
  'async',
  'retry',
  'timeout',
  'idempotent',
  'unconfirmed',
  'threat',
] as const;
export const KNOWN_TAGS: readonly string[] = [...FLOW_TAGS, 'section', 'summary', ...STEP_TAGS];

export const PAYLOAD_PARTS: readonly PayloadPart[] = [
  'headers',
  'query',
  'params',
  'cookies',
  'body',
  'sql',
  'event',
  'input',
  'result',
];

export const PART_LABEL: Record<PayloadPart, string> = {
  headers: 'Headers',
  query: 'Query',
  params: 'Path params',
  cookies: 'Cookies',
  body: 'Body',
  sql: 'SQL',
  event: 'Event',
  input: 'Input',
  result: 'Result',
  _: 'Payload',
};

/** Layer kinds with their icon. The order is the default order of a backend's layers. */
export const LAYER_KINDS: Record<string, string> = wordTable({
  person: '👤',
  client: '🖥',
  edge: '🛡',
  app: '🚪',
  router: '🧭',
  middleware: '⚙',
  validator: '✅',
  controller: '🎛',
  serializer: '📦',
  dto: '📄',
  service: '🧩',
  repository: '📚',
  db: '🗄',
  cache: '⚡',
  eventbus: '📣',
  queue: '📨',
  worker: '🛠',
  cron: '⏰',
  external: '🌐',
});

export function layerZone(kind: string): Zone {
  if (!(kind in LAYER_KINDS)) return '';
  if (kind === 'person' || kind === 'client') return 'client';
  return kind === 'external' ? 'outside' : 'ours';
}

export const USES_KINDS: readonly string[] = [
  'hook',
  'cron',
  'listener',
  'job',
  'worker',
  'util',
  'config',
  'env',
  'cache',
  'flag',
  'migration',
  'test',
  'lib',
];

export const FLAG_TAGS = ['async', 'retry', 'timeout', 'idempotent'] as const;

/** The levels a `@threat` line can name, most serious first. */
export const THREAT_LEVELS: readonly ThreatLevel[] = ['high', 'medium', 'low'];

/** A `@threat` line is one short sentence; longer text gets a lint warning. */
export const THREAT_MAX_CHARS = 160;

/** Pastel hues, one per chapter, reused in order when a flow has more chapters than hues. */
export const CHAPTER_HUES: readonly number[] = [210, 150, 30, 280, 0, 180, 60, 330];

export const HTTP_RE = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/\S*|https?:\/\/\S+)/;
export const STATUS_RE = /^([1-5]\d\d)\b\s*(.*)$/;

/** General meaning of common status codes, shown next to the project's own message. */
export const STATUS_TEXT: Record<number, string> = {
  200: 'OK: the request worked and the answer is in the body.',
  201: 'Created: a new record exists now; the body or Location header says where.',
  202: 'Accepted: the work was queued and will finish later.',
  204: 'No Content: it worked and there is nothing to send back.',
  301: 'Moved Permanently: use the new address from now on.',
  302: 'Found: go to the address in the Location header, just this once.',
  304: 'Not Modified: the cached copy is still good.',
  400: 'Bad Request: the request itself is malformed.',
  401: 'Unauthorized: no valid identity was presented; sign in or refresh the token.',
  403: 'Forbidden: the identity is known but may not do this.',
  404: 'Not Found: nothing lives at this address or id.',
  405: 'Method Not Allowed: the path exists but not with this method.',
  408: 'Request Timeout: the server gave up waiting for the request.',
  409: 'Conflict: the request clashes with the current state, such as a duplicate or a version mismatch.',
  410: 'Gone: it existed once and was removed on purpose.',
  412: 'Precondition Failed: an If-Match or similar condition did not hold.',
  413: 'Payload Too Large: the body is over the limit.',
  415: 'Unsupported Media Type: the Content-Type is not accepted.',
  422: 'Unprocessable Entity: the request is well formed but a value fails validation.',
  423: 'Locked: the resource is locked by someone else.',
  425: 'Too Early: the server will not risk a replay yet.',
  429: 'Too Many Requests: rate limit hit; wait for Retry-After.',
  500: 'Internal Server Error: an unexpected failure on our side.',
  502: 'Bad Gateway: an upstream service answered badly.',
  503: 'Service Unavailable: overloaded or down for maintenance.',
  504: 'Gateway Timeout: an upstream service did not answer in time.',
};

export const STOPWORDS: ReadonlySet<string> = new Set(
  'the and with for from that this then than are was were has have had not but you your our its into onto out over under via per any all can will may each also just only more most such what when where which while who why how yes use uses used get got set put new old one two too off own same other again key'.split(
    ' ',
  ),
);

/** Mermaid keywords that start a statement which is not an arrow. */
export const SEQ_KEYWORD =
  /^(participant|actor|note|loop|alt|else|opt|par_over|par|and|critical|option|break|rect|end|activate|deactivate|autonumber|box|create|destroy|title|acctitle|accdescr|links?|properties|details|sequencediagram)\b/i;

/** Words Mermaid will not accept as a participant alias. */
export const RESERVED_ALIASES: ReadonlySet<string> = new Set([
  'end',
  'loop',
  'alt',
  'else',
  'opt',
  'par',
  'and',
  'critical',
  'option',
  'break',
  'rect',
  'box',
  'participant',
  'actor',
  'note',
  'activate',
  'deactivate',
  'autonumber',
  'create',
  'destroy',
  'title',
  'links',
  'link',
  'properties',
  'details',
]);

/** Mermaid's LINETYPE numbers for the arrow styles the viewer reads. */
export const LINETYPE = {
  SOLID: 0,
  DOTTED: 1,
  SOLID_CROSS: 3,
  DOTTED_CROSS: 4,
  SOLID_OPEN: 5,
  DOTTED_OPEN: 6,
  SOLID_POINT: 24,
  DOTTED_POINT: 25,
  BIDIRECTIONAL_SOLID: 33,
  BIDIRECTIONAL_DOTTED: 34,
} as const;

/** Block keywords and the kind Mermaid records for them. `par_over` draws as `par`. */
export const BLOCK_START: Record<string, BlockKind> = wordTable({
  loop: 'loop',
  alt: 'alt',
  opt: 'opt',
  par: 'par',
  par_over: 'par',
  critical: 'critical',
  break: 'break',
});

/** Keywords that start the next branch of an open block, and which block they belong to. */
export const BLOCK_MID: Record<string, { kind: BlockKind; opens: BlockKind }> = wordTable({
  else: { kind: 'else', opens: 'alt' },
  and: { kind: 'and', opens: 'par' },
  option: { kind: 'option', opens: 'critical' },
});
