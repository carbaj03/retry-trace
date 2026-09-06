import { serverCard } from '@/lib/mcp';
import { event, json } from '@/lib/experiment';
export async function GET(
  r: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  if (path.join('/') !== '.well-known/mcp/server-card.json')
    return json({ error: 'Not found' }, 404);
  await event(r, 'server_card_read');
  return json(serverCard());
}
