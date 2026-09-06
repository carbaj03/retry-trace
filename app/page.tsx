'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { z } from 'zod';
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
  async function create(input?: {
    status: 503 | 429;
    failures: number;
    delay_seconds: number;
    header_format: 'seconds' | 'http-date';
  }) {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/runs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            input || {
              status,
              failures,
              delay_seconds: delay,
              header_format: format,
            },
          ),
        }),
        data = (await r.json()) as Run & { error?: string };
      if (!r.ok) throw Error(data.error);
      flushSync(() => {
        setRun(data);
        setAttempts([]);
        if (input) {
          setStatus(input.status);
          setFailures(input.failures);
          setDelay(input.delay_seconds);
          setFormat(input.header_format);
        }
      });
      return data;
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
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool(
            tool: {
              name: string;
              description: string;
              inputSchema: object;
              annotations: object;
              execute(input: unknown): Promise<unknown>;
            },
            options: { signal: AbortSignal },
          ): void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context) return;
    const lifecycle = new AbortController();
    const schema = z.object({
      status: z.union([z.literal(503), z.literal(429)]),
      failures: z.number().int().min(1).max(4),
      delay_seconds: z.number().int().min(0).max(5),
      header_format: z.enum(['seconds', 'http-date']),
      participant_token: z.string().regex(/^[a-f0-9]{64}$/).optional().describe('Reuse an existing participant capability, preserving its activity cohort.'),
    });
    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: 'create_private_retry_run',
            description:
              'Create a synthetic HTTP retry run and display its private probe URL in this workbench. Your client must call that URL to advance the sequence. This creates stored state but does not publish a finding. No sensitive data is required.',
            inputSchema: z.toJSONSchema(schema),
            annotations: { readOnlyHint: false, untrustedContentHint: false },
            async execute(input) {
              const a = schema.parse(input);
              const r = await fetch('/api/runs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(a),
              });
              const data = (await r.json()) as Run & { error?: string };
              if (!r.ok) throw Error(data.error);
              flushSync(() => {
                setRun(data);
                setAttempts([]);
                setStatus(a.status);
                setFailures(a.failures);
                setDelay(a.delay_seconds);
                setFormat(a.header_format);
              });
              return {
                run_id: data.run_id,
                probe_url: data.probe_url,
                trace_url: data.trace_url,
                expires_at: data.expires_at,
                expected_statuses: data.expected_statuses,
              };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() =>
        setError(
          'Browser tool registration is unavailable. The form and remote MCP API remain available.',
        ),
      );
    } catch {
      console.warn(
        'Browser tool registration is unavailable; form and remote MCP API remain available.',
      );
    }
    return () => lifecycle.abort();
  }, []);
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
          <button disabled={busy} onClick={() => create()}>
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
