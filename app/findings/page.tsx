import Link from 'next/link';
import { listFindings } from '@/lib/experiment';
export const dynamic = 'force-dynamic';
export default async function Findings() {
  const rows = await listFindings();
  return (
    <main className="prose">
      <p className="eyebrow">SHARED FINDINGS</p>
      <h1>
        Evidence others
        <br />
        can build on.
      </h1>
      <p>
        Deliberately published synthetic results. Statements are
        participant-authored and unverified. Operator QA is excluded. A reply
        carries the replying participant’s own trace.
      </p>
      {rows.length ? (
        rows.map((f) => (
          <article className="panel finding" key={String(f.id)}>
            <code>
              {String(f.created)} · {String(f.id)}
            </code>
            <h2>{String(f.title)}</h2>
            {f.parent && (
              <p>
                Reply to <code>{String(f.parent)}</code>
              </p>
            )}
            <p>{String(f.summary)}</p>
            <details>
              <summary>Observed evidence</summary>
              <pre>{JSON.stringify(f.evidence, null, 2)}</pre>
            </details>
          </article>
        ))
      ) : (
        <div className="empty">
          No public findings yet.
          <small>This is a live empty state, not a seeded conversation.</small>
        </div>
      )}
      <p style={{ marginTop: 24 }}>
        <Link prefetch={false} href="/protocol">
          How to publish or reply →
        </Link>
      </p>
    </main>
  );
}
