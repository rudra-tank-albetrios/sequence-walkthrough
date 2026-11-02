import { parseFlow } from '@swv/core';
import { beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_DIAGRAM } from '../lib/defaultDiagram.ts';
import { FLOWS_KEY, forgetFlow, keptFlows, otherFlows, rememberFlow } from './flowHistory.ts';
import { Store } from './store.ts';

const code = (title: string, label = 'GET /things') =>
  `sequenceDiagram\n  %% @title ${title}\n  %% @step The call\n  A->>B: ${label}\n  %% @step The reply\n  B-->>A: 200 OK`;

const keep = (text: string) => {
  rememberFlow(parseFlow(text).flow, text);
};
const titles = () => keptFlows().map((flow) => flow.title);

beforeEach(() => {
  Store.del(FLOWS_KEY);
});

describe('the kept flows', () => {
  it('keeps your flows newest first, and never the demo', () => {
    keep(DEFAULT_DIAGRAM);
    expect(titles()).toEqual([]);
    keep(code('Orders', 'GET /orders'));
    keep(code('Refunds', 'GET /refunds'));
    expect(titles()).toEqual(['Refunds', 'Orders']);
  });

  it('holds a flow only once: a new version replaces the old one', () => {
    keep(code('Orders', 'GET /orders'));
    keep(code('Refunds', 'GET /refunds'));
    keep(code('Orders', 'GET /orders/new'));
    expect(titles()).toEqual(['Orders', 'Refunds']);
    expect(keptFlows()[0]?.code).toContain('/orders/new');
  });

  it('holds the same steps only once, under whatever name they came last', () => {
    keep(code('Orders', 'GET /orders'));
    keep(code('Orders again', 'GET /orders'));
    expect(titles()).toEqual(['Orders again']);
  });

  it('never offers the flow on screen, under any name or version', () => {
    keep(code('Orders', 'GET /orders'));
    keep(code('Refunds', 'GET /refunds'));
    const refunds = (text: string) => otherFlows(parseFlow(text).flow).map((flow) => flow.title);
    expect(refunds(code('Orders', 'GET /orders/changed'))).toEqual(['Refunds']);
    expect(refunds(code('Renamed', 'GET /orders'))).toEqual(['Refunds']);
  });

  it('forgets one when asked, and caps how many it holds', () => {
    for (let i = 0; i < 12; i++) keep(code(`Flow ${String(i)}`, `GET /flow/${String(i)}`));
    expect(keptFlows()).toHaveLength(8);
    expect(titles()[0]).toBe('Flow 11');
    forgetFlow('t:Flow 11');
    expect(titles()[0]).toBe('Flow 10');
  });

  it('leaves out what is not a flow entry, because storage can hold anything', () => {
    Store.set(FLOWS_KEY, [{ id: 'x' }, 'text', null]);
    expect(keptFlows()).toEqual([]);
    Store.set(FLOWS_KEY, 'not a list');
    expect(keptFlows()).toEqual([]);
  });
});
