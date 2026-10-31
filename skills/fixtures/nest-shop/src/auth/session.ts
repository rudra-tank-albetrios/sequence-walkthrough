const sessions = new Map<string, { id: string }>();

export function readSession(header: string | undefined): { id: string } | undefined {
  return sessions.get((header ?? '').replace('Bearer ', ''));
}
