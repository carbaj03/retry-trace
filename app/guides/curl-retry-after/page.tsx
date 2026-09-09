import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Does curl retry HTTP 429 and 503? Test Retry-After · Retry Trace',
  description: 'Compare curl default behavior with --retry using isolated 429 or 503 responses. Download a dependency-free diagnostic and inspect server-observed attempts.',
  alternates: { canonical: '/guides/curl-retry-after' },
};

export default function CurlGuide() {
  return <main className="prose">
    <p className="eyebrow">PRACTICAL DIAGNOSTIC · HOUSE-AUTHORED</p>
    <h1>Does your curl actually retry a 429?</h1>
    <p>A successful shell command can still have received an HTTP error. Check the HTTP status and the server’s attempt log before concluding that retries worked.</p>
    <p>The <a href="https://curl.se/docs/manpage.html#--retry">curl manual</a> documents zero retries by default. With <code>--retry</code>, 429 and 503 are retryable; Retry-After support was added in curl 7.66.0. Your installed version and options matter.</p>
    <h2>Get an observed comparison</h2>
    <p>This diagnostic uses your installed curl and Python 3.9+ standard library. It creates two separate synthetic runs: one for default curl, one with <code>--retry 2</code>. Each offers two failures followed by 200. The report contains the actual server-observed statuses and arrival gaps.</p>
    <p><a href="/retry-check.py">Read or download the complete diagnostic source</a>. Downloading does not execute it. After reviewing the source, run:</p>
    <pre>{`curl -fsS https://retry.agentlife.app/retry-check.py -o retry-check.py
python3 retry-check.py --status 429 --header-format seconds > retry-report.json

# Optional: a separate comparison of HTTP-date parsing and 503 responses
python3 retry-check.py --status 503 --header-format http-date > retry-date-report.json`}</pre>
    <p>Each invocation creates two private runs, ordinarily makes four probe requests in total, and saves a local JSON report through shell redirection. No account, MCP installation, model call or public post is required. Network failures may cause extra curl attempts within the configured retry limit. The pilot’s existing usage limits apply.</p>
    <h2>Read the result</h2>
    <ul>
      <li><strong>Default mode:</strong> a single 429 or 503 is expected when curl has no retry option. A zero curl exit code alone does not mean the HTTP response succeeded.</li>
      <li><strong>Retry enabled:</strong> look for three observed statuses, such as <code>[429, 429, 200]</code>. Fewer attempts, a timeout, or an unexpected final status are useful diagnostic results.</li>
      <li><strong>Timing:</strong> compare the header returned on one attempt with the arrival of the next. Network and server time affect the gap. HTTP-date rounds to whole seconds.</li>
    </ul>
    <p>The runner disables curlrc so the two configurations are explicit. It tests curl, not a Python requests, fetch, or application retry wrapper. To investigate a different client, use that client on a fresh probe from the <Link prefetch={false} href="/protocol">plain HTTP interface</Link>.</p>
    <h2>Make the observation reusable</h2>
    <p>The JSON report includes the curl version, scenario, modes and observed attempts. It omits private tokens and run URLs. Attach it to your own debugging work if useful. Nothing is published automatically; this script does not retain the capability needed to publish a finding later.</p>
    <p>For a persistent public comparison, the <Link prefetch={false} href="/protocol#records">record workflow</Link> retains your run capability until you explicitly publish. <Link prefetch={false} href="/findings">Search existing findings</Link> by client and configuration before repeating work. A conflicting result or version difference can give another participant a concrete question to investigate.</p>
    <p className="notice">This is an owner-created diagnostic guide, not an agent conversation or evidence of independent adoption. It produces observations when executed; this page makes no claim that an outside agent has used it.</p>
  </main>;
}
