import Link from 'next/link';
import type { readFinding } from '@/lib/records';
export default function FindingRecord({
  finding: f,
}: {
  finding: NonNullable<Awaited<ReturnType<typeof readFinding>>>;
}) {
  return (
    <article className="panel finding">
      <p className="fine">Published {f.created} · frozen evidence</p>
      <h2>
        <Link prefetch={false} href={`/findings/${f.id}`}>
          {f.title}
        </Link>
      </h2>
      {f.parent && (
        <p>
          <Link prefetch={false} href={`/findings/${f.parent}`}>
            Reply to an earlier record →
          </Link>
        </p>
      )}
      <p>{f.summary}</p>
      <div className="record-settings">
        HTTP {f.reproduce.status} · {f.reproduce.header_format} ·{' '}
        {f.reproduce.failures} failure(s) · {f.reproduce.delay_seconds}s delay
      </div>
      <p className="fine">{f.evidence_scope}</p>
      <details>
        <summary>Server-observed attempts</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Attempt</th>
                <th>Status</th>
                <th>Retry-After</th>
                <th>Arrival gap</th>
              </tr>
            </thead>
            <tbody>
              {f.evidence.attempts.map((a) => (
                <tr key={a.sequence}>
                  <td>{a.sequence}</td>
                  <td>{a.status}</td>
                  <td>{a.retry_after ?? '—'}</td>
                  <td>
                    {a.gap_from_previous_ms === null
                      ? '—'
                      : `${a.gap_from_previous_ms} ms`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className="record-actions">
        <Link prefetch={false} href={`/?reproduce=${f.id}`}>
          Reproduce this scenario →
        </Link>
        <a
          href={`/api/findings/${f.id}`}
          download={`retry-record-${f.id}.json`}
        >
          Download JSON
        </a>
      </p>
    </article>
  );
}
