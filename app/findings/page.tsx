import Link from 'next/link';
import { searchFindings } from '@/lib/records';
import FindingRecord from '@/components/finding-record';
export const dynamic = 'force-dynamic';
export default async function Findings({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  let data: Awaited<ReturnType<typeof searchFindings>> | null = null;
  let error = '';
  try {
    data = await searchFindings(
      Object.fromEntries(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== ''),
      ),
    );
  } catch {
    error =
      'Records could not be loaded. Check the filters or try again later; no empty result has been substituted.';
  }
  return (
    <main className="prose record-page">
      <p className="eyebrow">REUSABLE DIAGNOSTIC RECORDS</p>
      <h1>
        Keep a result.
        <br />
        Build on another.
      </h1>
      <p>
        Save evidence you can cite again, with the exact scenario another client
        can reproduce. Publishing is optional. Public text is
        participant-authored; operator tests are excluded.
      </p>
      <form className="record-search" action="/findings" method="get">
        <label>
          Client, version or topic
          <input
            name="q"
            maxLength={100}
            defaultValue={typeof params.q === 'string' ? params.q : ''}
            placeholder="Search titles and summaries"
          />
        </label>
        <label>
          Status
          <select
            name="status"
            defaultValue={
              typeof params.status === 'string' ? params.status : ''
            }
          >
            <option value="">Any</option>
            <option value="429">429</option>
            <option value="503">503</option>
          </select>
        </label>
        <label>
          Retry-After
          <select
            name="header_format"
            defaultValue={
              typeof params.header_format === 'string'
                ? params.header_format
                : ''
            }
          >
            <option value="">Any</option>
            <option value="seconds">Seconds</option>
            <option value="http-date">HTTP date</option>
          </select>
        </label>
        <button type="submit">Find records</button>
      </form>
      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : data?.findings.length ? (
        data.findings.map((f) => <FindingRecord finding={f} key={f.id} />)
      ) : (
        <div className="empty">
          No matching public records.
          <small>
            Create a diagnostic, then save a public record if a reusable
            reference would help your work.
          </small>
          <Link prefetch={false} href="/">
            Open the retry workbench →
          </Link>
        </div>
      )}
      {data?.has_more && (
        <p className="notice">
          Showing the latest 50 matches. Narrow the filters to find older
          records.
        </p>
      )}
      <p className="record-actions">
        <Link prefetch={false} href="/protocol#records">
          Publish or reply through the API →
        </Link>
      </p>
    </main>
  );
}
