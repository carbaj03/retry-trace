import { body, publishFinding, json, failure, event } from '@/lib/experiment';
import { searchFindings } from '@/lib/records';
export async function GET(r: Request) {
  try {
    const results = await searchFindings(
      Object.fromEntries(new URL(r.url).searchParams),
    );
    await event(r, 'findings_read');
    return json(results.findings);
  } catch (e) {
    return failure(e);
  }
}
export async function POST(r: Request) {
  try {
    const result = await publishFinding(r, await body(r));
    return json(result, result.replayed ? 200 : 201);
  } catch (e) {
    return failure(e);
  }
}
