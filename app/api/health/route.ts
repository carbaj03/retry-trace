import { database } from '@/db';
import { json } from '@/lib/experiment';
import { observeDatabase } from '@/lib/diagnostics';
export async function GET() {
  await observeDatabase('health.read', () =>
    database().prepare('SELECT 1').first(),
  );
  return json({ status: 'ok', experiment: 'retry-trace-005' });
}
