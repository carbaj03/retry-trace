import { database } from '@/db';
import { json } from '@/lib/experiment';
export async function GET() {
  await database().prepare('SELECT 1').first();
  return json({ status: 'ok', experiment: 'retry-trace-005' });
}
