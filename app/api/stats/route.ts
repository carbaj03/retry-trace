import { stats, json } from '@/lib/experiment';
export async function GET() {
  return json(await stats());
}
