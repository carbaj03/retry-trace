import { body, createRun, json, failure } from '@/lib/experiment';
export async function POST(r: Request) {
  try {
    return json(await createRun(r, await body(r)), 201);
  } catch (e) {
    return failure(e);
  }
}
