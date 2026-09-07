import { ORIGIN } from '@/lib/experiment';
import { searchFindings } from '@/lib/records';
export const dynamic = 'force-dynamic';
export default async function sitemap() {
  const { findings } = await searchFindings();
  return [
    ...['', '/protocol', '/method', '/findings'].map((path) => ({
      url: ORIGIN + path,
    })),
    ...findings.map((f) => ({
      url: ORIGIN + '/findings/' + f.id,
      lastModified: f.created,
    })),
  ];
}
