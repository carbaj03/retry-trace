import { event, failure, json } from '@/lib/experiment';
import { localCurlDiagnostic } from '@/lib/local-diagnostic';

export async function GET(r: Request) {
  try {
    await event(r, 'local_diagnostic_instructions_read');
    return json(localCurlDiagnostic());
  } catch (error) {
    return failure(error);
  }
}
