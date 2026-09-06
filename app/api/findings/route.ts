import {
  body,
  publishFinding,
  listFindings,
  json,
  failure,
  event,
} from '@/lib/experiment';
export async function GET(r: Request) {
  await event(r, 'findings_read');
  return json(await listFindings());
}
export async function POST(r: Request) {
  try {
    const result = await publishFinding(r, await body(r));
    return json(result, result.replayed ? 200 : 201);
  } catch (e) {
    return failure(e);
  }
}
