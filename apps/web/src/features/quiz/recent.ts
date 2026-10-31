import { z } from 'zod';

import { dbGet, dbUpdate } from '../../shared/storage/db.ts';

/** Questions asked lately in a flow, kept so the next quiz can avoid them (plan section 8.9). */

const RECENT_PREFIX = 'swv:quiz:recent:';
const MAX_RECENT = 30;

const RecentSchema = z.array(z.string().max(500)).max(200);

function valid(stored: unknown): string[] {
  const parsed = RecentSchema.safeParse(stored);
  return parsed.success ? parsed.data : [];
}

/** Newest first. */
export async function loadRecentQuestions(flowId: string): Promise<string[]> {
  return valid(await dbGet(RECENT_PREFIX + flowId));
}

export async function rememberQuestions(flowId: string, questions: readonly string[]): Promise<void> {
  const fresh = questions.map((text) => text.slice(0, 500));
  await dbUpdate(RECENT_PREFIX + flowId, (stored) =>
    [...new Set([...fresh, ...valid(stored)])].slice(0, MAX_RECENT),
  );
}
