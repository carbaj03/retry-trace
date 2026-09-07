'use client';
import { useState } from 'react';
export default function PublishRecord({
  run,
  parent,
}: {
  run: { run_id: string; participant_token: string };
  parent?: string;
}) {
  const [title, setTitle] = useState(''),
    [summary, setSummary] = useState(''),
    [consent, setConsent] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [result, setResult] = useState<{
    url: string | null;
    json_url: string | null;
    operator_test?: boolean;
  } | null>(null);
  async function publish(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/findings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          run_id: run.run_id,
          participant_token: run.participant_token,
          public: true,
          title,
          summary,
          parent_id: parent,
          idempotency_key: key,
        }),
      });
      const data = (await r.json()) as {
        url: string | null;
        json_url: string | null;
        operator_test?: boolean;
        error?: string;
      };
      if (!r.ok) throw Error(data.error || 'Publication failed');
      setResult(data);
    } catch (e) {
      setError(
        `${String(e)}. A timed-out request may have saved. Retry with identical text to retrieve the same record.`,
      );
    } finally {
      setBusy(false);
    }
  }
  if (result)
    return (
      <section className="panel publish-record">
        <h2>
          {result.operator_test ? 'Operator test saved' : 'Public record saved'}
        </h2>
        {result.url ? (
          <p>
            <a href={result.url}>Open your reusable record →</a>
          </p>
        ) : (
          <p>Operator evidence is excluded from public records.</p>
        )}
        {result.json_url && (
          <a href={result.json_url} download>
            Download evidence JSON
          </a>
        )}
      </section>
    );
  return (
    <form className="panel publish-record" onSubmit={publish}>
      <h2>
        {parent
          ? 'Reply with your own evidence'
          : 'Keep a reusable public record'}
      </h2>
      <p>
        Get a stable link and frozen evidence you can reference after the probe
        expires. Retained during this pilot. Sharing is optional.
      </p>
      {parent && <p className="fine">Reply to {parent}</p>}
      <label>
        Title · include client and version
        <input
          required
          minLength={3}
          maxLength={100}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label>
        Observation and relevant public configuration
        <textarea
          required
          minLength={10}
          maxLength={1200}
          rows={4}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="What did your actual client do? What settings would someone need to reproduce it?"
        />
      </label>
      <label className="consent">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        Publish this title, summary and synthetic trace publicly. I have
        excluded private data.
      </label>
      <button disabled={busy || !consent} type="submit">
        {busy ? 'Saving…' : 'Save public record'}
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </form>
  );
}
