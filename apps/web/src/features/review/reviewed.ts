import { Store } from '../../shared/storage/store.ts';

const REVIEWED_KEY = 'swv:review:flows';
const KEEP = 200;

/**
 * Remembers that this flow was reviewed in this browser and returns how many flows have been.
 * Confidence rises with this number. Only the flow ids are kept, the newest 200.
 */
export function rememberReviewed(flowId: string): number {
  const stored = Store.get<unknown>(REVIEWED_KEY, []);
  const seen = Array.isArray(stored) ? stored.filter((id) => typeof id === 'string') : [];
  const flows = [...new Set([...seen, flowId])].slice(-KEEP);
  Store.set(REVIEWED_KEY, flows);
  return flows.length;
}
