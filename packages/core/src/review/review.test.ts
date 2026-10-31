import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseFlow } from '../parse.ts';
import { REVIEW_RULES, reviewFlow } from './index.ts';
import type { FlowReview } from './types.ts';

const LAYERS = `
    actor U as Shopper
    participant API as API Client
    participant RT as Routes
    participant MW as Auth Middleware
    participant VAL as Validator
    participant CTL as Controller
    participant SVC as Service
    participant REPO as Repository
    participant DB as Database
    participant SER as Serializer
    participant PAY as Payment Provider`;

const KINDS = `
    %% @layer U kind=person The shopper.
    %% @layer API kind=client Sends the request.
    %% @layer RT kind=router Matches the path.
    %% @layer MW kind=middleware Checks the session.
    %% @layer VAL kind=validator Checks the body.
    %% @layer CTL kind=controller Picks the status.
    %% @layer SVC kind=service Holds the rules.
    %% @layer REPO kind=repository Reads and writes.
    %% @layer DB kind=db Stores rows.
    %% @layer SER kind=serializer Shapes the reply.
    %% @layer PAY kind=external Takes the money.`;

/** A flow with every layer in order, and nothing wrong with it. */
const CLEAN = `sequenceDiagram
    %% @title Pay an invoice${KINDS}${LAYERS}
    %% @step The shopper presses Pay.
    %% @ref src/pages/pay.ts:1
    U->>API: Press Pay
    %% @step The client posts the invoice id with the session header.
    %% @payload.headers Authorization: Bearer abc
    %% @payload.body { "invoiceId": "i_1" }
    %% @ref src/api/client.ts:1
    API->>RT: POST /api/payments
    %% @step The route runs its middleware.
    %% @ref src/routes/payments.ts:1
    RT->>MW: requireUser
    %% @step The session is valid, so the body is checked.
    %% @ref src/middleware/auth.ts:1
    MW->>VAL: next()
    %% @step The body is valid, so the controller runs.
    %% @ref src/validators/pay.ts:1
    VAL->>CTL: pay(ctx)
    %% @step The controller asks the service to pay.
    %% @ref src/controllers/pay.ts:1
    CTL->>SVC: pay(user, dto)
    %% @step The service charges the card, with one retry.
    %% @retry once on a network error
    %% @ref src/services/pay.ts:1
    SVC->>PAY: charge(i_1)
    %% @step The provider answers.
    %% @ref src/services/pay.ts:2
    PAY-->>SVC: charged
    %% @step The repository saves the payment and the invoice in one transaction.
    %% @ref src/services/pay.ts:3
    SVC->>REPO: save(payment, invoice)
    %% @step Both rows are written together.
    %% @payload.sql INSERT INTO payments (id) VALUES ('p_1')
    %% @ref src/repositories/pay.ts:1
    REPO->>DB: transaction: insert payment, update invoice
    %% @step The saved rows come back.
    %% @ref src/repositories/pay.ts:2
    DB-->>REPO: rows
    %% @step The repository returns the payment.
    %% @ref src/repositories/pay.ts:3
    REPO-->>SVC: payment
    %% @step The service returns it.
    %% @ref src/services/pay.ts:4
    SVC-->>CTL: payment
    %% @step The controller asks for the public shape.
    %% @ref src/controllers/pay.ts:2
    CTL->>SER: serializePayment(payment)
    %% @step The public shape comes back.
    %% @ref src/serializers/pay.ts:1
    SER-->>CTL: public payment
    %% @step The shopper's client gets the answer.
    %% @payload.body { "id": "p_1", "status": "paid" }
    %% @ref src/controllers/pay.ts:3
    RT-->>API: 201 Created
    %% @step The shopper sees it.
    %% @ref src/pages/pay.ts:2
    API-->>U: Paid`;

const review = (code: string, flowsReviewed = 1): FlowReview =>
  reviewFlow(parseFlow(code).flow, flowsReviewed);

/** The clean flow with one line changed, so a problem is the only difference. */
function cleanWith(from: string, to: string): string {
  expect(CLEAN).toContain(from);
  return CLEAN.replace(from, to);
}

const small = (...lines: string[]): string =>
  ['sequenceDiagram', '%% @title Small', ...lines].join('\n');

const rulesFound = (result: FlowReview): string[] => [
  ...new Set(result.findings.map((f) => f.rule)),
];

describe('a clean flow', () => {
  it('gets 100, no findings and no threats', () => {
    const result = review(CLEAN);
    expect(result.findings).toEqual([]);
    expect(result.score).toBe(100);
    expect(result.threats).toEqual([]);
    expect(result.rules.every((rule) => rule.status !== 'found')).toBe(true);
  });

  it('is rated the same every time', () => {
    expect(review(CLEAN, 3)).toEqual(review(CLEAN, 3));
  });

  it('does not call a login flow a leak: a password in the request, a token in the reply', () => {
    const result = review(
      small(
        'participant B as Browser',
        'participant API as Auth Service',
        '%% @layer B kind=client The page.',
        '%% @layer API kind=service The backend.',
        '%% @payload.body { "email": "ada@example.com", "password": "correct horse" }',
        'B->>API: POST /login',
        '%% @payload.body { "accessToken": "abc", "refreshToken": "def" }',
        'API-->>B: 200 OK',
      ),
    );
    expect(rulesFound(result)).not.toContain('secret-exposed');
  });

  it('does not read "logs the user in" as a log', () => {
    const result = review(
      small(
        'participant A as App',
        'participant B as Backend',
        '%% @effect Logs the user in with the session token',
        'A->>B: Open the session',
      ),
    );
    expect(rulesFound(result)).not.toContain('secret-exposed');
  });
});

describe('known problems are found', () => {
  const cases: [string, string, number[]][] = [
    [
      'layers-direct-database',
      cleanWith('RT->>MW: requireUser', 'RT->>DB: SELECT * FROM users'),
      [3],
    ],
    [
      'layers-direct-database',
      cleanWith('CTL->>SVC: pay(user, dto)', 'CTL->>DB: update invoices'),
      [6],
    ],
    ['layers-skipped', cleanWith('CTL->>SVC: pay(user, dto)', 'CTL->>REPO: save(payment)'), [6]],
    ['layers-skipped', cleanWith('REPO->>DB: transaction', 'SVC->>DB: transaction'), [10]],
    [
      'layers-wrong-work',
      cleanWith('CTL->>SER: serializePayment', 'SER->>DB: serializePayment'),
      [14],
    ],
    ['layers-wrong-work', cleanWith('REPO-->>SVC: payment', 'REPO-->>SVC: 404 Not Found'), [12]],
    [
      'layers-wrong-work',
      cleanWith('%% @ref src/routes/payments.ts:1', '%% @payload.sql SELECT * FROM users'),
      [3],
    ],
    [
      'validation-missing',
      small(
        'participant A as Browser',
        'participant B as Backend',
        '%% @layer A kind=client The page.',
        '%% @layer B kind=service The backend.',
        '%% @payload.body { "name": "x" }',
        'A->>B: POST /api/login',
        'B-->>A: 200 OK',
      ),
      [1],
    ],
    [
      'access-missing',
      small(
        'participant A as Browser',
        'participant B as Backend',
        '%% @layer A kind=client The page.',
        '%% @layer B kind=service The backend.',
        '%% @schema name non-empty',
        'A->>B: DELETE /api/orders/1',
        'B-->>A: 204 No Content',
      ),
      [1],
    ],
    [
      'access-missing',
      small(
        'participant A as Browser',
        'participant B as Backend',
        '%% @layer A kind=client The page.',
        '%% @layer B kind=service The backend.',
        'A->>B: GET /api/admin/users',
        'B-->>A: 200 OK',
      ),
      [1],
    ],
    ['reply-missing', cleanWith('RT-->>API: 201 Created', 'RT->>API: 201 Created'), [2]],
    ['reply-missing', cleanWith('PAY-->>SVC: charged', 'SVC->>SVC: note the charge'), [7]],
    ['reply-missing', cleanWith('DB-->>REPO: rows', 'REPO->>DB: find rows'), [11]],
    ['error-no-status', cleanWith('RT-->>API: 201 Created', 'RT-->>API: Payment failed'), [16]],
    [
      'reply-skips-serializer',
      cleanWith('CTL->>SER: serializePayment(payment)', 'CTL->>CTL: copy(payment)').replace(
        'SER-->>CTL: public payment',
        'CTL->>CTL: pick the fields',
      ),
      [16],
    ],
    [
      'outside-no-failure',
      cleanWith('%% @retry once on a network error', '%% @effect The card is charged').replace(
        'charges the card, with one retry.',
        'charges the card.',
      ),
      [7],
    ],
    [
      'half-saved',
      cleanWith(
        'REPO->>DB: transaction: insert payment, update invoice',
        `REPO->>DB: insert payment
    REPO->>DB: update invoice`,
      ).replace('in one transaction', 'one after the other'),
      [10, 11],
    ],
    [
      'secret-exposed',
      cleanWith('API->>RT: POST /api/payments', 'API->>RT: GET /pay?token=abc'),
      [2],
    ],
    [
      'secret-exposed',
      cleanWith('API->>RT: POST /api/payments', 'API->>RT: POST /pay?api_key=abc'),
      [2],
    ],
    [
      'secret-exposed',
      cleanWith('%% @ref src/routes/payments.ts:1', '%% @effect Logs the password to the console'),
      [3],
    ],
    [
      'secret-exposed',
      cleanWith('{ "id": "p_1", "status": "paid" }', '{ "id": "u_1", "passwordHash": "x" }'),
      [16],
    ],
  ];

  it.each(cases)('%s (%#)', (rule, code, steps) => {
    const result = review(code);
    const found = result.findings.filter((finding) => finding.rule === rule);
    expect(found.length, JSON.stringify(result.findings)).toBeGreaterThan(0);
    expect(found.flatMap((finding) => finding.steps.map((i) => i + 1))).toEqual(steps);
    expect(result.score).toBeLessThan(100);
    expect(result.rules.find((item) => item.id === rule)?.status).toBe('found');
  });

  it('has a known-problem sample for every rule', () => {
    expect(new Set(cases.map(([rule]) => rule))).toEqual(new Set(REVIEW_RULES.map((r) => r.id)));
  });

  it('finds a token in a queue and a real-looking credential', () => {
    const queued = review(
      small(
        'participant S as Service',
        'participant Q as Mail Queue',
        '%% @layer S kind=service Works.',
        '%% @layer Q kind=queue Waits.',
        '%% @payload.event { "resetToken": "abc" }',
        'S->>Q: enqueue(job)',
      ),
    );
    expect(queued.findings[0]?.rule).toBe('secret-exposed');

    // Built at run time, so the secret scanner has nothing to find in this file.
    const fake = ['sk', 'live', 'x'.repeat(24)].join('_');
    const leaked = review(
      small('A->>B: GET /things', 'B-->>A: 200 OK').replace('200 OK', `200 ${fake}`),
    );
    expect(leaked.findings.map((finding) => finding.rule)).toContain('secret-exposed');
  });
});

describe('the rating', () => {
  it('takes off 20 for a high finding, 10 for a medium and 5 for a low', () => {
    expect(
      review(cleanWith('RT->>MW: requireUser', 'RT->>DB: SELECT * FROM users')).score,
    ).toBeLessThanOrEqual(80);
    expect(review(cleanWith('CTL->>SVC: pay(user, dto)', 'CTL->>REPO: save(payment)')).score).toBe(
      90,
    );
    expect(review(cleanWith('REPO-->>SVC: payment', 'REPO-->>SVC: 404 Not Found')).score).toBe(95);
  });

  it('counts a problem repeated on many steps at most twice, and never goes below 0', () => {
    const repeated = Array.from({ length: 6 }, () => 'CTL->>REPO: save(payment)').join('\n    ');
    expect(review(cleanWith('CTL->>SVC: pay(user, dto)', repeated)).score).toBe(80);

    const parts = ['participant B as Browser', 'participant D as Database'];
    const awful = Array.from({ length: 4 }, (_, i) => [
      `B->>D: GET /admin/${i}?password=x`,
      `D-->>B: Failed with an error ${i}`,
    ]).flat();
    expect(review(small(...parts, ...awful)).score).toBeGreaterThanOrEqual(0);
  });

  it('cannot be changed by @threat lines: they are shown beside it', () => {
    const withThreat = cleanWith(
      '%% @ref src/routes/payments.ts:1',
      '%% @threat high The route accepts any origin',
    );
    const result = review(withThreat);
    expect(result.threats).toEqual([
      { level: 'high', text: 'The route accepts any origin', step: 2 },
    ]);
    expect(result.score).toBe(100);
  });

  it('skips every rule on a diagram that is not a sequence diagram', () => {
    const result = review('flowchart TD\n  A --> B');
    expect(result.findings).toEqual([]);
    expect(result.rules.every((rule) => rule.status === 'skipped')).toBe(true);
  });

  it('reads layer kinds from participant names when no @layer names them', () => {
    const result = review(
      small(
        'participant C as OrdersController',
        'participant D as Postgres',
        'C->>D: SELECT * FROM orders',
        'D-->>C: rows',
      ),
    );
    expect(rulesFound(result)).toEqual(['layers-direct-database']);
  });
});

describe('confidence', () => {
  const stripRefs = (code: string) => code.replace(/^\s*%% @ref .*$/gm, '');

  it('is medium on one fully linked flow and rises with more flows reviewed', () => {
    expect(review(CLEAN, 1).confidence.level).toBe('medium');
    expect(review(CLEAN, 2).confidence.level).toBe('high');
    expect(review(CLEAN, 5).confidence.level).toBe('high');
  });

  it('is low when no step links to code, however many flows were reviewed', () => {
    const result = review(stripRefs(CLEAN), 9);
    expect(result.confidence.level).toBe('low');
    expect(result.confidence.reasons.map((r) => r.text).join(' ')).toContain(
      'No step links to code',
    );
  });

  it('is low on a proposed design', () => {
    const result = review(CLEAN.replace('%% @title', '%% @mode proposed\n    %% @title'), 9);
    expect(result.confidence.level).toBe('low');
    expect(result.confidence.reasons[0]?.text).toContain('proposed design');
  });

  it('falls with unconfirmed details', () => {
    const unsure = cleanWith(
      '%% @ref src/routes/payments.ts:1',
      '%% @unconfirmed The retry count\n    %% @ref src/routes/payments.ts:1',
    );
    expect(review(unsure, 2).confidence.level).toBe('medium');
    const many = CLEAN.replaceAll('%% @ref', '%% @unconfirmed The detail\n    %% @ref');
    expect(review(many, 2).confidence.level).toBe('medium');
    expect(review(many, 1).confidence.level).toBe('low');
  });

  it('rises with the share of steps linked to code', () => {
    let seen = 0;
    const some = CLEAN.replace(/^\s*%% @ref .*$/gm, (line) => (++seen % 2 === 0 ? '' : line));
    const up = review(some, 1).confidence.reasons.find((r) => r.text.includes('link to code'));
    expect(up?.effect).toBe('up');
    expect(review(some, 1).confidence.level).toBe('medium');
    const few = CLEAN.replace(/^\s*%% @ref .*$/gm, (line) => (++seen % 7 === 0 ? line : ''));
    expect(review(few, 1).confidence.level).toBe('low');
  });

  it('says when few layers have a known kind', () => {
    const result = review(small('participant A as Alpha', 'participant B as Beta', 'A->>B: hi'));
    expect(result.confidence.reasons.map((r) => r.text)).toContain(
      'Only 0 of 2 layers have a known kind.',
    );
  });
});

describe('the demo flow', () => {
  const code = readFileSync(
    resolve(import.meta.dirname, '../../../../examples/demo-store/flows/place-order.mmd'),
    'utf8',
  );

  it('gets an honest result: reads clean on secrets and links to its code', () => {
    const result = review(code);
    expect(rulesFound(result)).not.toContain('secret-exposed');
    expect(rulesFound(result)).not.toContain('validation-missing');
    expect(rulesFound(result)).not.toContain('access-missing');
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.confidence.level).toBe('medium');
    expect(result.confidence.reasons[0]?.effect).toBe('up');
  });
});
