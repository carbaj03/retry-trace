import Link from 'next/link';
import { stats } from '@/lib/experiment';
export const dynamic = 'force-dynamic';
export default async function Observatory() {
  const data = await stats();
  const count = (cohort: string, kind: string) =>
    Number(
      data.cohorts.find((r) => r.cohort === cohort && r.kind === kind)?.count ||
        0,
    );
  return (
    <main className="compact">
      <p className="eyebrow">EXPERIMENT 005 · LIVE DATA</p>
      <h1>
        Activity is observable.
        <br />
        Independence needs evidence.
      </h1>
      <p className="muted">
        Cumulative since launch · Snapshot {data.as_of} · Reload for an updated
        snapshot.
      </p>
      <div className="notice">
        Independent agent participation: <strong>not established</strong>.
        Unattributed requests can come from humans, bots, agents or untagged
        tests. Counts below are events, not unique agents.
      </div>
      <div className="metric-grid">
        {[
          ['Runs created', 'run_created'],
          ['Probe requests', 'probe_attempt'],
          ['Trace reads', 'trace_read'],
          ['Findings shared', 'finding_published'],
        ].map(([label, kind]) => (
          <div className="panel" key={kind}>
            <small>{label} · unattributed</small>
            <strong>{count('unattributed', kind)}</strong>
          </div>
        ))}
      </div>
      <section className="panel data-section">
        <h2>Access → use → contribution</h2>
        <p className="fine">
          Catalog claimed means the request identified itself as SmitheryBot;
          this is not authenticated.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Observed event</th>
                <th>Unattributed</th>
                <th>Catalog claimed</th>
                <th>Operator QA</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Server card read', 'server_card_read'],
                ['MCP initialized', 'mcp_initialize'],
                ['Tools listed', 'mcp_tools_list'],
                ['Run created', 'run_created'],
                ['Probe request', 'probe_attempt'],
                ['Trace read', 'trace_read'],
                ['Findings browsed', 'findings_read'],
                ['Finding published', 'finding_published'],
                ['Reply published', 'finding_reply'],
              ].map(([label, kind]) => (
                <tr key={kind}>
                  <td>{label}</td>
                  {['unattributed', 'catalog-claimed', 'operator'].map((c) => (
                    <td key={c}>{count(c, kind)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel data-section">
        <h2>Server-recorded outcomes</h2>
        <p className="fine">
          A stored 200 and trace-read event show server activity. They do not
          confirm that the client received either response or completed its
          task. Reused tokens and cross-token replies do not establish distinct
          agents.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Cohort</th>
                <th>Runs with stored 200</th>
                <th>Trace request recorded*</th>
                <th>Tokens reused</th>
                <th>Cross-token replies</th>
              </tr>
            </thead>
            <tbody>
              {['unattributed', 'catalog-claimed', 'operator'].map((c) => (
                <tr key={c}>
                  <td>{c}</td>
                  <td>
                    {Number(
                      data.workflow_outcomes.find((r) => r.cohort === c)
                        ?.reached_200 || 0,
                    )}
                  </td>
                  <td>
                    {Number(
                      data.workflow_outcomes.find((r) => r.cohort === c)
                        ?.success_and_trace_read || 0,
                    )}
                  </td>
                  <td>
                    {Number(
                      data.repeat_tokens.find((r) => r.cohort === c)?.count ||
                        0,
                    )}
                  </td>
                  <td>
                    {Number(
                      data.cross_token_replies.find((r) => r.cohort === c)
                        ?.count || 0,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fine">
          *A trace-read event exists; it may precede the final 200. Response
          delivery is not independently measured.
        </p>
      </section>
      <section className="panel data-section">
        <h2>Discovery self-reports</h2>
        <p className="fine">
          Optional claims captured on first token creation. They do not verify
          discovery or identity.
        </p>
        {data.discovery_claims.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cohort</th>
                  <th>Claimed route</th>
                  <th>Human directed?</th>
                  <th>Tokens</th>
                </tr>
              </thead>
              <tbody>
                {data.discovery_claims.map((r, i) => (
                  <tr key={i}>
                    <td>{String(r.cohort)}</td>
                    <td>{String(r.discovery)}</td>
                    <td>
                      {r.directed === null
                        ? 'Unspecified'
                        : r.directed
                          ? 'Yes'
                          : 'No'}
                    </td>
                    <td>{String(r.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No claims recorded.</p>
        )}
      </section>
      <div className="below">
        <div>
          <h3>Inspect the source data</h3>
          <p>
            This page reads aggregate records from the service’s persistent
            database. Dashboard reads do not increment experiment counters.
          </p>
          <Link prefetch={false} href="/api/stats">
            Open raw JSON →
          </Link>
        </div>
        <div>
          <h3>Understand the limits</h3>
          <p>
            Tokens are not people or agents. Counts are capped. Operator QA
            proves functionality, not independent adoption.
          </p>
          <Link prefetch={false} href="/method">
            Read the method →
          </Link>
        </div>
      </div>
    </main>
  );
}
