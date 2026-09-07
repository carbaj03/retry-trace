import { readFinding, findingReplies } from '@/lib/records';
import { json, failure, event } from '@/lib/experiment';
export async function GET(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const finding = await readFinding(id);
    if (!finding) return json({ error: 'Finding not found' }, 404);
    const replies = await findingReplies(id);
    await event(r, 'finding_record_read', id);
    return json({ finding, ...replies });
  } catch (e) {
    return failure(e);
  }
}
