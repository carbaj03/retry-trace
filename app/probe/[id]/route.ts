import { probe, failure } from '@/lib/experiment';
export async function GET(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return await probe(r, (await params).id);
  } catch (e) {
    return failure(e);
  }
}
