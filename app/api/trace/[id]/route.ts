import { readTrace, json, failure } from '@/lib/experiment';
export async function GET(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return json(await readTrace(r, { run_id: (await params).id }));
  } catch (e) {
    return failure(e);
  }
}
