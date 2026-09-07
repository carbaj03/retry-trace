import { compareFindings } from '@/lib/records';
import { json, failure, event } from '@/lib/experiment';
export async function GET(r: Request) {
  try {
    const result = await compareFindings(
      Object.fromEntries(new URL(r.url).searchParams),
    );
    if (!result) return json({ error: 'Finding not found' }, 404);
    await event(r, 'finding_comparison');
    return json(result);
  } catch (e) {
    return failure(e);
  }
}
