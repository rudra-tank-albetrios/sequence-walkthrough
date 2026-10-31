import { parseFlow } from '@swv/core';
import { describe, expect, it } from 'vitest';

import { DEFAULT_DIAGRAM } from './defaultDiagram.ts';

// The demo flow against the table in plan section 8.12: one example showing every feature.
const { flow } = parseFlow(DEFAULT_DIAGRAM);

describe('the demo flow', () => {
  it('is a clean walkthrough/2 flow, shown when the viewer opens', () => {
    expect(flow.title).toBe('Place an order');
    expect(flow.isSequence).toBe(true);
    expect(flow.spec).toBe('walkthrough/2');
    expect(flow.lint).toEqual([]);
    expect(flow.syntax).toEqual([]);
  });

  it('has every main layer once, with numbered arrows', () => {
    expect(DEFAULT_DIAGRAM).toMatch(/^\s*autonumber$/m);
    const names = flow.participants.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual([
      'Shopper',
      'Pages',
      'Components',
      'Store',
      'API Client',
      'App',
      'Routes',
      'Middleware',
      'Validator',
      'Controller',
      'Service',
      'Repository',
      'Database',
      'Serializer',
      'DTO',
      'Redis',
      'Event Bus',
      'Mail Queue',
      'Mail Worker',
      'Mail',
    ]);
    for (const { alias, name } of flow.participants) {
      const used = flow.steps.some((step) => step.from === alias || step.to === alias);
      expect(used, `${name} is crossed`).toBe(true);
    }
  });

  it('shows what goes and what comes back', () => {
    const request = flow.steps.find((step) => step.http?.path === '/api/orders');
    expect(new Set(request?.payloads.map((p) => p.part))).toEqual(new Set(['headers', 'body']));
    const created = flow.steps.find((step) => step.status?.code === 201);
    expect(created?.payloads.some((p) => p.part === 'body')).toBe(true);
    expect(flow.steps.filter((step) => step.payloads.some((p) => p.part === 'result')).length).toBeGreaterThan(5);
  });

  it('has the success, 401, 409 and 422 replies, each with its message', () => {
    for (const code of [201, 401, 409, 422]) {
      const reply = flow.steps.find((step) => step.status?.code === code);
      expect(reply?.payloads.some((p) => p.part === 'body'), `${code} has a body`).toBe(true);
    }
  });

  it('has the five named chapters', () => {
    expect(flow.sections.map((section) => section.name)).toEqual([
      'Check the request',
      'Reserve stock',
      'Save the order',
      'Reply',
      'Send the email',
    ]);
  });

  it('keeps the background work in its own chapter: event, queue, worker, then the email', () => {
    const chapter = flow.sections.findIndex((section) => section.name === 'Send the email');
    const arrows = flow.steps
      .filter((step) => step.section === chapter)
      .map((step) => `${step.fromName} → ${step.toName}`);
    expect(arrows).toEqual([
      'Event Bus → Mail Queue',
      'Mail Worker → Mail Queue',
      'Mail Queue → Mail Worker',
      'Mail Worker → Mail',
      'Mail → Mail Worker',
    ]);
    // Nothing in the request itself waits for the email: it comes after the reply chapter.
    const lastReply = flow.steps.findLast((step) => step.status?.code === 201);
    expect(lastReply?.section).toBeLessThan(chapter);
  });

  it('names a cron, hook, util and config value as side parts, with their code', () => {
    const kinds = flow.uses.map((use) => use.kind);
    expect(new Set(kinds)).toEqual(new Set(['cron', 'hook', 'util', 'config']));
    for (const use of flow.uses) {
      expect(use.ref, use.name).toMatch(/^src\/.+:\d+$/);
      expect(use.text, use.name).not.toBe('');
      expect(use.steps.length, use.name).toBeGreaterThan(0);
    }
  });

  it('has one threat, clearly labelled as a sample', () => {
    expect(flow.threats).toHaveLength(1);
    expect(flow.threats[0]?.text).toMatch(/^Sample threat for the demo:/);
  });

  it('has a side part on step 1, where the tour shows them', () => {
    expect(flow.steps[0]?.uses.length).toBeGreaterThan(0);
  });
});
