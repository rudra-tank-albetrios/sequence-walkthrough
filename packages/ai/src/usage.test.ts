import { beforeEach, describe, expect, it } from 'vitest';

import { newModel, type ModelEntry } from './models.ts';
import { parseReset, readRateHeaders } from './ratelimit.ts';
import { resetAiStorage } from './testing.ts';
import { formatReset, forgetUsage, loadUsage, recordUsage, standing, usageLevel, usageView } from './usage.ts';

const NOW = new Date(2026, 9, 31, 12, 0, 0).getTime();

const model = (patch: Partial<ModelEntry> = {}): ModelEntry => ({ ...newModel('groq'), key: 'k', ...patch });

beforeEach(resetAiStorage);

describe('reset times', () => {
  it.each([
    ['2m59.56s', NOW + 179_560],
    ['7.66s', NOW + 7660],
    ['1h2m3s', NOW + 3_723_000],
    ['500ms', NOW + 500],
    ['6m0s', NOW + 360_000],
    ['33011.38', NOW + 33_011_380],
    ['60', NOW + 60_000],
    ['1893456000', 1_893_456_000_000],
    ['1893456000000', 1_893_456_000_000],
    ['2030-01-01T00:00:00Z', Date.UTC(2030, 0, 1)],
  ])('reads %s', (value, expected) => {
    expect(parseReset(value, NOW)).toBe(expected);
  });

  it.each(['', 'soon', '-5'])('gives up on %j', (value) => {
    expect(parseReset(value, NOW)).toBeNull();
  });
});

describe('rate-limit headers', () => {
  it('reads Groq names: requests per day and tokens per minute', () => {
    const headers = new Headers({
      'x-ratelimit-limit-requests': '14400',
      'x-ratelimit-remaining-requests': '14370',
      'x-ratelimit-reset-requests': '2m59.56s',
      'x-ratelimit-limit-tokens': '18000',
      'x-ratelimit-remaining-tokens': '17997',
      'x-ratelimit-reset-tokens': '7.66s',
    });
    expect(readRateHeaders(headers, NOW)).toEqual(
      expect.arrayContaining([
        { name: 'requests', unit: 'requests', limit: 14400, remaining: 14370, resetAt: NOW + 179_560 },
        { name: 'tokens', unit: 'tokens', limit: 18000, remaining: 17997, resetAt: NOW + 7660 },
      ]),
    );
  });

  it('reads Cerebras names', () => {
    const headers = new Headers({
      'x-ratelimit-limit-requests-day': '14400',
      'x-ratelimit-remaining-requests-day': '100',
      'x-ratelimit-reset-requests-day': '33011.38',
    });
    expect(readRateHeaders(headers, NOW)).toEqual([
      { name: 'requests per day', unit: 'requests', limit: 14400, remaining: 100, resetAt: NOW + 33_011_380 },
    ]);
  });

  it('reads Mistral names, and works out when a window with no reset header fills up', () => {
    const headers = new Headers({
      'x-ratelimit-limit-tokens-minute': '500000',
      'x-ratelimit-remaining-tokens-minute': '499000',
      'x-ratelimit-tokens-query-cost': '1000',
    });
    expect(readRateHeaders(headers, NOW)).toEqual([
      { name: 'tokens per minute', unit: 'tokens', limit: 500000, remaining: 499000, resetAt: NOW + 60_000 },
    ]);
  });

  it('reads the plain names OpenRouter sends on a limit error', () => {
    const headers = new Headers({
      'X-RateLimit-Limit': '20',
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': '1893456000000',
    });
    expect(readRateHeaders(headers, NOW)).toEqual([
      { name: 'requests', unit: 'requests', limit: 20, remaining: 0, resetAt: 1_893_456_000_000 },
    ]);
  });

  it('finds nothing when the provider exposes nothing, or half a window', () => {
    expect(readRateHeaders(new Headers({ 'content-type': 'application/json' }), NOW)).toEqual([]);
    expect(readRateHeaders(new Headers({ 'x-ratelimit-remaining-requests': '5' }), NOW)).toEqual([]);
    expect(readRateHeaders(new Headers({ 'x-ratelimit-limit-requests': '0', 'x-ratelimit-remaining-requests': '0' }), NOW)).toEqual([]);
  });
});

describe('usage bar colours', () => {
  it.each([
    [0, 'green'],
    [59.9, 'green'],
    [60, 'amber'],
    [85, 'amber'],
    [85.1, 'red'],
    [100, 'red'],
    [null, 'none'],
  ])('at %s%% used is %s', (percent, level) => {
    expect(usageLevel(percent)).toBe(level);
  });
});

describe('usage bar readings', () => {
  it('labels provider data as Exact and shows percentage and remaining amount as text', () => {
    const entry = model();
    recordUsage(
      entry.id,
      { windows: [{ name: 'requests per day', unit: 'requests', limit: 14400, remaining: 1720, resetAt: NOW + 3_600_000 }] },
      NOW,
    );
    const view = usageView(entry, loadUsage()[entry.id], NOW);
    expect(view).toMatchObject({ source: 'exact', label: 'Exact', level: 'red' });
    expect(view.text).toBe('88% used, 1,720 of 14,400 requests left');
    expect(view.detail).toContain('Limit 14,400 requests per day.');
    expect(view.detail).toContain(`Resets at ${formatReset(NOW + 3_600_000, NOW)}.`);
  });

  it('shows the limit closest to running out and lists every limit on hover', () => {
    const entry = model();
    recordUsage(
      entry.id,
      {
        windows: [
          { name: 'requests', unit: 'requests', limit: 100, remaining: 90, resetAt: NOW + 1000 },
          { name: 'tokens', unit: 'tokens', limit: 1000, remaining: 300, resetAt: NOW + 2000 },
        ],
      },
      NOW,
    );
    const view = usageView(entry, loadUsage()[entry.id], NOW);
    expect(view.text).toBe('70% used, 300 of 1,000 tokens left');
    expect(view.level).toBe('amber');
    expect(view.resetAt).toBe(NOW + 2000);
    expect(view.detail).toContain('Limit 100 requests.');
    expect(view.detail).toContain('Limit 1,000 tokens.');
  });

  it('counts a window as full again once its reset has passed', () => {
    const entry = model();
    recordUsage(
      entry.id,
      { windows: [{ name: 'tokens per minute', unit: 'tokens', limit: 1000, remaining: 0, resetAt: NOW + 60_000 }] },
      NOW,
    );
    const record = loadUsage()[entry.id];
    expect(usageView(entry, record, NOW).percentUsed).toBe(100);
    expect(usageView(entry, record, NOW + 60_001).percentUsed).toBe(0);
  });

  it('labels a browser count against typed-in limits as Estimated', () => {
    const entry = model({ limits: { requestsPerDay: 10, tokensPerDay: 1000 } });
    recordUsage(entry.id, { tokens: 300 }, NOW);
    recordUsage(entry.id, { tokens: 400 }, NOW);
    const view = usageView(entry, loadUsage()[entry.id], NOW);
    expect(view).toMatchObject({ source: 'estimated', label: 'Estimated, this browser only', level: 'amber' });
    expect(view.text).toBe('70% used, 300 of 1,000 tokens left');
    expect(view.detail).toContain('Limit 10 requests per day.');
  });

  it('prefers provider data over typed-in limits', () => {
    const entry = model({ limits: { requestsPerDay: 10, tokensPerDay: null } });
    recordUsage(entry.id, { windows: [{ name: 'requests', unit: 'requests', limit: 100, remaining: 99, resetAt: null }] }, NOW);
    expect(usageView(entry, loadUsage()[entry.id], NOW).source).toBe('exact');
  });

  it('labels no data and no limit as Count only, with the requests made today', () => {
    const entry = model();
    expect(usageView(entry, undefined, NOW)).toMatchObject({
      source: 'count',
      label: 'Count only',
      percentUsed: null,
      level: 'none',
      text: '0 requests today',
    });
    recordUsage(entry.id, {}, NOW);
    expect(usageView(entry, loadUsage()[entry.id], NOW).text).toBe('1 request today');
    recordUsage(entry.id, {}, NOW);
    expect(usageView(entry, loadUsage()[entry.id], NOW).text).toBe('2 requests today');
  });

  it('starts the counts again on a new day', () => {
    const entry = model({ limits: { requestsPerDay: 10, tokensPerDay: null } });
    recordUsage(entry.id, {}, NOW);
    const tomorrow = NOW + 86_400_000;
    expect(usageView(entry, loadUsage()[entry.id], tomorrow).percentUsed).toBe(0);
    recordUsage(entry.id, {}, tomorrow);
    expect(usageView(entry, loadUsage()[entry.id], tomorrow).requestsToday).toBe(1);
  });

  it('stops trusting a reading with no reset time after a day', () => {
    const entry = model();
    recordUsage(entry.id, { windows: [{ name: 'requests', unit: 'requests', limit: 100, remaining: 1, resetAt: null }] }, NOW);
    expect(usageView(entry, loadUsage()[entry.id], NOW).source).toBe('exact');
    expect(usageView(entry, loadUsage()[entry.id], NOW + 86_400_000).source).toBe('count');
  });

  it('survives malformed stored data', () => {
    localStorage.setItem('swv:ai:usage', JSON.stringify({ a: 'nonsense', b: { requests: 'x', windows: [{}] } }));
    expect(loadUsage().a).toMatchObject({ requests: 0, windows: [] });
    expect(loadUsage().b).toMatchObject({ requests: 0, windows: [] });
    localStorage.setItem('swv:ai:usage', 'not json');
    expect(loadUsage()).toEqual({});
  });

  it('forgets a deleted model', () => {
    const entry = model();
    recordUsage(entry.id, {}, NOW);
    forgetUsage(entry.id);
    expect(loadUsage()[entry.id]).toBeUndefined();
  });
});

describe('standing', () => {
  const withWindow = (remaining: number, resetAt: number | null = NOW + 1000) => {
    const entry = model();
    recordUsage(entry.id, { windows: [{ name: 'requests', unit: 'requests', limit: 100, remaining, resetAt }] }, NOW);
    return standing(entry, loadUsage()[entry.id], 5, NOW);
  };

  it('is ok above the switch level, low at it and below it, and out at zero', () => {
    expect(withWindow(6).state).toBe('ok');
    expect(withWindow(5).state).toBe('low');
    expect(withWindow(1).state).toBe('low');
    expect(withWindow(0)).toEqual({ state: 'out', resetAt: NOW + 1000 });
  });

  it('honours an edited switch level', () => {
    const entry = model();
    recordUsage(entry.id, { windows: [{ name: 'requests', unit: 'requests', limit: 100, remaining: 20, resetAt: null }] }, NOW);
    const record = loadUsage()[entry.id];
    expect(standing(entry, record, 5, NOW).state).toBe('ok');
    expect(standing(entry, record, 20, NOW).state).toBe('low');
  });

  it('is out after a limit error, until the time it was told', () => {
    const entry = model();
    recordUsage(entry.id, { limited: { until: NOW + 5000 } }, NOW);
    const record = loadUsage()[entry.id];
    expect(standing(entry, record, 5, NOW)).toEqual({ state: 'out', resetAt: NOW + 5000 });
    expect(standing(entry, record, 5, NOW + 5001).state).toBe('ok');
  });

  it('waits a minute after a limit error that gave no time', () => {
    const entry = model();
    recordUsage(entry.id, { limited: { until: null } }, NOW);
    const record = loadUsage()[entry.id];
    expect(standing(entry, record, 5, NOW + 59_000).state).toBe('out');
    expect(standing(entry, record, 5, NOW + 60_001).state).toBe('ok');
  });

  it('never blocks a model that only has a count', () => {
    const entry = model();
    recordUsage(entry.id, {}, NOW);
    expect(standing(entry, loadUsage()[entry.id], 5, NOW).state).toBe('ok');
  });
});
