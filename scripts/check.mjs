import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
const base = process.argv[2] || 'http://localhost:3001',
  op = readFileSync('.env', 'utf8').match(/^OPERATOR_TOKEN=(.+)$/m)?.[1];
assert(op, 'Operator token required');
const headers = {
  'Content-Type': 'application/json',
  'x-retry-trace-operator': op,
};
const checks = [];
const record = (name, details = {}) => {
  checks.push({ name, status: 'passed', ...details });
  console.log('PASS', name);
};
async function req(
  path,
  data,
  expected = data !== undefined && path === '/api/runs' ? 201 : 200,
) {
  const r = await fetch(new URL(path, base), {
    method: data === undefined ? 'GET' : 'POST',
    headers,
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const value = await r.json();
  assert.equal(
    r.status,
    expected,
    JSON.stringify({ error: value.error, path }),
  );
  return value;
}
const client = new Client({
  name: 'retry-trace-operator-qa',
  version: '1.0.0',
});
await client.connect(
  new StreamableHTTPClientTransport(new URL('/api/mcp', base), {
    requestInit: { headers },
  }),
);
const listing = await client.listTools();
assert.equal(listing.tools.length, 6);
record('Official MCP client initializes and lists six tools');
async function tool(name, args = {}) {
  const r = await client.callTool({ name, arguments: args });
  assert(!r.isError, JSON.stringify(r));
  return JSON.parse(r.content[0].text);
}
const a = await tool('create_retry_run', {
  status: 503,
  failures: 1,
  delay_seconds: 1,
  discovery: 'owner-directed',
  human_directed: true,
});
await req(new URL(a.probe_url).pathname, undefined, 503);
await new Promise((resolve) => setTimeout(resolve, 1050));
await req(new URL(a.probe_url).pathname);
const t = await tool('read_retry_trace', { run_id: a.run_id });
assert.deepEqual(
  t.attempts.map((v) => v.status),
  [503, 200],
);
assert.equal(t.attempts[0].retry_after, '1');
assert(t.attempts[1].gap_from_previous_ms >= 1000);
record('503 Retry-After seconds → 200, server trace observed', {
  attempts: t.attempts.length,
  gap_ms: t.attempts[1].gap_from_previous_ms,
});
const b = await req('/api/runs', {
  status: 429,
  failures: 2,
  delay_seconds: 2,
  header_format: 'http-date',
});
const b1 = await fetch(b.probe_url, { headers });
assert.equal(b1.status, 429);
assert(Number.isFinite(Date.parse(b1.headers.get('retry-after'))));
await b1.text();
await req(new URL(b.probe_url).pathname, undefined, 429);
await req(new URL(b.probe_url).pathname);
const tb = await req('/api/trace/' + b.run_id);
assert.deepEqual(
  tb.attempts.map((v) => v.status),
  [429, 429, 200],
);
assert.equal((await req('/api/trace/' + a.run_id)).attempts.length, 2);
record('HTTP-date format and isolated sequences');
const c = await req('/api/runs', {
  status: 503,
  failures: 4,
  delay_seconds: 0,
});
const concurrent = await Promise.all(
  Array.from({ length: 36 }, () =>
    fetch(c.probe_url, { headers }).then(async (r) => ({
      status: r.status,
      data: await r.json(),
    })),
  ),
);
const allowed = concurrent.filter((v) => v.status !== 410);
assert.equal(allowed.length, 32);
assert.equal(new Set(allowed.map((v) => v.data.attempt)).size, 32);
assert.equal(allowed.filter((v) => v.status === 503).length, 4);
assert.equal((await req('/api/trace/' + c.run_id)).attempts.length, 32);
record('36 simultaneous requests: 32 unique attempts, four limit rejections');
const share = {
  participant_token: a.participant_token,
  run_id: a.run_id,
  public: true,
  title: 'Operator QA: retry recovered',
  summary:
    'A synthetic operator test observed 503 followed by 200. This is not independent participation.',
  idempotency_key: crypto.randomUUID(),
};
await req(
  '/api/findings',
  { ...share, participant_token: b.participant_token },
  403,
);
await req('/api/findings', { ...share, public: false }, 400);
record('Run ownership and explicit publication consent enforced');
const pub = await tool('publish_retry_finding', share);
assert.equal(pub.operator_test, true);
const replay = await req('/api/findings', share);
assert.equal(pub.finding_id, replay.finding_id);
await req(
  '/api/findings',
  { ...share, summary: share.summary + ' Changed.' },
  409,
);
record('Idempotent publish replay and content-conflict rejection');
const reply = await tool('publish_retry_finding', {
  ...share,
  participant_token: b.participant_token,
  run_id: b.run_id,
  parent_id: pub.finding_id,
  idempotency_key: crypto.randomUUID(),
  title: 'Operator QA: independent test token reply',
});
assert(reply.finding_id);
const feed = await tool('list_retry_findings');
assert(
  !feed.findings.some((v) => [pub.finding_id, reply.finding_id].includes(v.id)),
);
record(
  'Second capability can reply; operator findings excluded from public feed',
);
const stats = await req('/api/stats');
assert(
  stats.cohorts.some(
    (v) => v.cohort === 'operator' && v.kind === 'run_created',
  ),
);
assert.equal(stats.independent_agents, null);
record('Operator cohort recorded; independent agent count remains unknown');
const large = await fetch(new URL('/api/runs', base), {
  method: 'POST',
  headers,
  body: JSON.stringify({ payload: 'x'.repeat(17000) }),
});
assert.equal(large.status, 413);
await large.text();
record('Oversize payload rejected');
await client.close();
const report = {
  at: new Date().toISOString(),
  base,
  cohort: 'operator',
  checks,
  counts: stats,
};
if (process.argv[3])
  writeFileSync(process.argv[3], JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ passed: checks.length, cohort: 'operator' }));
