import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  readFinding,
  findingReplies,
  compareRecords,
  findingId,
} from '@/lib/records';
import FindingRecord from '@/components/finding-record';
export const dynamic = 'force-dynamic';
export default async function RecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ compare?: string }>;
}) {
  const { id } = await params;
  if (!findingId.safeParse({ finding_id: id }).success) notFound();
  const f = await readFinding(id);
  if (!f) notFound();
  const { replies, has_more } = await findingReplies(id);
  const { compare } = await searchParams;
  let comparison: ReturnType<typeof compareRecords> | null = null,
    error = '';
  if (compare) {
    if (!findingId.safeParse({ finding_id: compare }).success)
      error = 'Enter a valid finding ID.';
    else {
      const other = await readFinding(compare);
      if (other) comparison = compareRecords(f, other);
      else error = 'The other public record was not found.';
    }
  }
  return (
    <main className="prose record-page">
      <Link prefetch={false} href="/findings">
        ← All records
      </Link>
      <FindingRecord finding={f} />
      <section>
        <h2>Compare another record</h2>
        <p>
          Compare settings and observations before deciding whether the results
          support the same conclusion.
        </p>
        <form method="get" className="record-search">
          <label>
            Other finding ID
            <input
              name="compare"
              required
              defaultValue={compare || ''}
              placeholder="UUID from another record"
            />
          </label>
          <button type="submit">Compare evidence</button>
        </form>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {comparison && (
          <>
            <p className="notice">{comparison.interpretation}</p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Observation</th>
                    {comparison.records.map((v, i) => (
                      <th key={i}>{v.title}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Attempt count</td>
                    {comparison.records.map((v, i) => (
                      <td key={i}>{v.attempt_count}</td>
                    ))}
                  </tr>
                  <tr>
                    <td>Stored statuses</td>
                    {comparison.records.map((v, i) => (
                      <td key={i}>{v.stored_statuses.join(' → ')}</td>
                    ))}
                  </tr>
                  <tr>
                    <td>Arrival gaps (ms)</td>
                    {comparison.records.map((v, i) => (
                      <td key={i}>
                        {v.arrival_gaps_ms.map((x) => x ?? '—').join(', ')}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <p>{comparison.limitation}</p>
          </>
        )}
      </section>
      <h2>Reproduce and reply</h2>
      <p>
        Create your own private run with these settings. Use your actual client,
        then publish its observed evidence with this record’s ID as{' '}
        <code>parent_id</code>. Include the client version and relevant public
        configuration in your summary. A mismatch is useful evidence too.
      </p>
      <pre>{JSON.stringify(f.reproduce, null, 2)}</pre>
      <p>
        Parent finding: <code>{f.id}</code>
      </p>
      <Link prefetch={false} href={`/?reproduce=${f.id}`}>
        Load settings in the workbench →
      </Link>
      <h2>
        Replies · {replies.length}
        {has_more ? '+' : ''}
      </h2>
      {replies.length ? (
        replies.map((x) => <FindingRecord finding={x} key={x.id} />)
      ) : (
        <p>
          No public replies yet. This record is already usable as a reference.
        </p>
      )}
      {has_more && <p>Only the first 50 direct replies are shown.</p>}
    </main>
  );
}
