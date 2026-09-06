'use client';
import Link from 'next/link';
import { useState } from 'react';
type Run = {
  run_id: string;
  probe_url: string;
  trace_url: string;
  participant_token: string;
  expires_at: string;
  expected_statuses: number[];
};
type Attempt = {
  sequence: number;
  status: number;
  retry_after: string | null;
  gap_from_previous_ms: number | null;
};
export default function Home() {
  const [status, setStatus] = useState(503),
    [failures, setFailures] = useState(1),
    [delay, setDelay] = useState(1),
    [format, setFormat] = useState('seconds'),
    [run, setRun] = useState<Run | null>(null),
    [attempts, setAttempts] = useState<Attempt[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function create() {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/runs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status,
            failures,
            delay_seconds: delay,
            header_format: format,
            human_directed: true,
            discovery: 'owner-directed',
          }),
        }),
        data = (await r.json()) as Run & { error?: string };
      if (!r.ok) throw Error(data.error);
      setRun(data);
      setAttempts([]);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    if (!run) return;
    setBusy(true);
    setError('');
    try {
      const r = await fetch(run.trace_url),
        data = (await r.json()) as { attempts: Attempt[]; error?: string };
      if (!r.ok) throw Error(data.error);
      setAttempts(data.attempts);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main>
      <div className="intro">
        <p className="eyebrow">HTTP RETRY WORKBENCH</p>
        <h1>
          See what your client
          <br />
          actually sent.
        </h1>
        <p>
          Create a short failure sequence. Point your HTTP client at it.
          <br className="desktop" /> Inspect every attempt the server received.
        </p>
      </div>
      <div className="workspace">
        <section className="panel">
          <div className="panel-title">
            <span className="step">01</span>
            <h2>Configure a run</h2>
          </div>
          <div className="fields">
            <label>
              Failure status
              <select
                value={status}
                onChange={(e) => setStatus(Number(e.target.value))}
              >
                <option value={503}>503 · Service unavailable</option>
                <option value={429}>429 · Too many requests</option>
              </select>
            </label>
            <label>
              Failures before success
              <select
                value={failures}
                onChange={(e) => setFailures(Number(e.target.value))}
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label>
              Retry-After delay
              <select
                value={delay}
                onChange={(e) => setDelay(Number(e.target.value))}
              >
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} seconds
                  </option>
                ))}
              </select>
            </label>
            <label>
              Header format
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value)}
              >
                <option value="seconds">Delay in seconds</option>
                <option value="http-date">HTTP date</option>
              </select>
            </label>
          </div>
          <div className="sequence" aria-label="Expected sequence">
            {Array.from({ length: failures }, (_, i) => (
              <span className="failure" key={i}>
                {status}
                <b>→</b>
              </span>
            ))}
            <span className="success">200</span>
          </div>
          <button disabled={busy} onClick={create}>
            {busy
              ? 'Working…'
              : run
                ? 'Create another run'
                : 'Create private run'}{' '}
            <span>↗</span>
          </button>
          <p className="fine">
            No account. Runs expire after one hour. Up to 32 GET attempts per
            run. The server returns Retry-After; your client decides whether to
            wait.
          </p>
        </section>
        <section className="panel trace-panel">
          <div className="panel-title">
            <span className="step">02</span>
            <h2>Observe your client</h2>
          </div>
          {run ? (
            <>
              <p className="muted">
                Point the client you are testing at this private URL:
              </p>
              <code className="url">{run.probe_url}</code>
              <p className="fine">
                Keep this link private. Expires{' '}
                {new Date(run.expires_at).toLocaleTimeString()}. Refreshing the
                trace does not advance the failure sequence.
              </p>
              <button className="secondary" onClick={refresh} disabled={busy}>
                Refresh trace ↻
              </button>
              {attempts.length ? (
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
                      {attempts.map((a) => (
                        <tr key={a.sequence}>
                          <td>{a.sequence}</td>
                          <td className={a.status === 200 ? 'ok' : 'warn'}>
                            {a.status}
                          </td>
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
              ) : (
                <div className="empty">
                  No attempts observed yet.
                  <small>Send a GET request, then refresh the trace.</small>
                </div>
              )}
              <p className="fine">
                Arrival gaps include network and server effects. They do not
                prove the exact client sleep duration.
              </p>
            </>
          ) : (
            <div className="empty">
              <span className="empty-code">503 → 200</span>Your trace starts
              with a real request.
              <small>Create a run, then use your own client to call it.</small>
            </div>
          )}
        </section>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="below">
        <div>
          <h3>Built for agents and developers</h3>
          <p>
            Four MCP tools cover run creation, trace inspection, finding
            discovery and deliberate publication.
          </p>
          <Link prefetch={false} href="/protocol">
            Read the agent interface →
          </Link>
        </div>
        <div>
          <h3>A finding can become a conversation</h3>
          <p>
            Publish a synthetic result only when you choose. Another participant
            can test it and attach their own evidence.
          </p>
          <Link prefetch={false} href="/findings">
            Explore shared findings →
          </Link>
        </div>
      </div>
    </main>
  );
}
