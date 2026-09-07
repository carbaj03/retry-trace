import { z } from 'zod';
import { database, operatorToken } from '@/db';
import { observeDatabase } from '@/lib/diagnostics';
export const ORIGIN = 'https://retry-trace.carbaj0.chatgpt.site';
const token = z.string().regex(/^[a-f0-9]{64}$/);
export const createSchema = z.object({
  status: z.union([z.literal(429), z.literal(503)]).default(503),
  failures: z.number().int().min(1).max(4).default(1),
  delay_seconds: z.number().int().min(0).max(5).default(1),
  header_format: z.enum(['seconds', 'http-date']).default('seconds'),
  participant_token: token.optional(),
  discovery: z
    .enum([
      'unspecified',
      'search',
      'catalog',
      'link',
      'owner-directed',
      'other',
    ])
    .default('unspecified'),
  human_directed: z.boolean().optional(),
});
export const traceSchema = z.object({ run_id: z.uuid() });
export const publishSchema = z.object({
  participant_token: token,
  run_id: z.uuid(),
  public: z.literal(true),
  title: z.string().trim().min(3).max(100),
  summary: z.string().trim().min(10).max(1200),
  parent_id: z.uuid().optional(),
  idempotency_key: z.string().regex(/^[a-zA-Z0-9_-]{8,80}$/),
});
type Run = {
  id: string;
  actor: string;
  cohort: string;
  status: number;
  failures: number;
  delay: number;
  format: string;
  attempts: number;
  created: string;
  expires: string;
};
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function cohort(r: Request) {
  const op = operatorToken();
  return op && r.headers.get('x-retry-trace-operator') === op
    ? 'operator'
    : /SmitheryBot/i.test(r.headers.get('user-agent') || '')
      ? 'catalog-claimed'
      : 'unattributed';
}
function referral(r: Request) {
  try {
    const u = new URL(r.headers.get('referer') || '');
    return u.host === new URL(r.url).host
      ? 'internal'
      : u.hostname === 'smithery.ai'
        ? 'catalog-claimed'
        : /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com)$/.test(u.hostname)
          ? 'search-claimed'
          : 'external';
  } catch {
    return 'none';
  }
}
export async function event(
  r: Request,
  kind: string,
  entity: string | null = null,
  group = cohort(r),
) {
  const at = new Date().toISOString();
  await observeDatabase('event.persist', () =>
    database()
      .prepare(
        'INSERT INTO events(id,at,kind,cohort,entity,referral) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM events WHERE at>=?)<20000',
      )
      .bind(
        crypto.randomUUID(),
        at,
        kind,
        group,
        entity,
        referral(r),
        at.slice(0, 10),
      )
      .run(),
  );
}
async function hash(s: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)),
    ),
  ]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
}
export async function createRun(r: Request, input: unknown) {
  const a = createSchema.parse(input),
    participant =
      a.participant_token ||
      [...crypto.getRandomValues(new Uint8Array(32))]
        .map((v) => v.toString(16).padStart(2, '0'))
        .join(''),
    actor = await hash(participant),
    db = database(),
    now = new Date().toISOString();
  let owner = await observeDatabase('create.actor_lookup', () =>
    db
      .prepare('SELECT id,cohort FROM actors WHERE id=?')
      .bind(actor)
      .first<{ id: string; cohort: string }>(),
  );
  if (a.participant_token && !owner)
    throw new AppError('Unknown participant token', 401);
  const group = owner?.cohort || cohort(r);
  if (!owner) {
    await db
      .prepare(
        'INSERT INTO actors(id,cohort,discovery,directed,created) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM actors WHERE created>=?)<1000',
      )
      .bind(
        actor,
        group,
        a.discovery,
        a.human_directed === undefined ? null : Number(a.human_directed),
        now,
        now.slice(0, 10),
      )
      .run();
    owner = await db
      .prepare('SELECT id,cohort FROM actors WHERE id=?')
      .bind(actor)
      .first();
    if (!owner) throw new AppError('Daily capacity reached', 429);
  }
  const id = crypto.randomUUID(),
    expires = new Date(Date.now() + 3600000).toISOString();
  const saved = await observeDatabase('create.persist_run', () =>
    db
      .prepare(
        'INSERT INTO runs(id,actor,cohort,status,failures,delay,format,attempts,created,expires) SELECT ?,?,?,?,?,?,?,0,?,? WHERE (SELECT COUNT(*) FROM runs WHERE created>=?)<1000 AND (SELECT COUNT(*) FROM runs WHERE actor=? AND expires>?)<20 RETURNING id',
      )
      .bind(
        id,
        actor,
        group,
        a.status,
        a.failures,
        a.delay_seconds,
        a.header_format,
        now,
        expires,
        now.slice(0, 10),
        actor,
        now,
      )
      .first(),
  );
  if (!saved)
    throw new AppError(
      'Run capacity reached: 20 active runs per participant; 1000 new runs per day',
      429,
    );
  await event(r, 'run_created', id, group);
  return {
    run_id: id,
    participant_token: participant,
    probe_url: `${new URL(r.url).origin}/probe/${id}`,
    trace_url: `${new URL(r.url).origin}/api/trace/${id}`,
    expires_at: expires,
    expected_statuses: [...Array(a.failures).fill(a.status), 200],
    retry_after_format: a.header_format,
    delay_seconds: a.delay_seconds,
    note: 'Send your own GET client to probe_url. Requests advance the sequence; the server never sleeps. Keep run URL and participant token private. Only synthetic status/timing records are retained.',
  };
}
export async function probe(r: Request, id: string) {
  if (!z.uuid().safeParse(id).success) throw new AppError('Unknown run', 404);
  const now = new Date().toISOString(),
    db = database(),
    run = await observeDatabase('probe.run_lookup', () =>
      db.prepare('SELECT * FROM runs WHERE id=?').bind(id).first<Run>(),
    );
  if (!run) throw new AppError('Unknown run', 404);
  if (run.expires <= now) throw new AppError('Run expired', 410);
  const header =
    run.format === 'seconds'
      ? String(run.delay)
      : new Date(
          Math.floor(Date.parse(now) / 1000) * 1000 + run.delay * 1000,
        ).toUTCString();
  const results = await observeDatabase('probe.persist_attempt', () =>
    db.batch([
      db
        .prepare(
          'UPDATE runs SET attempts=attempts+1 WHERE id=? AND expires>? AND attempts<32 RETURNING attempts',
        )
        .bind(id, now),
      db
        .prepare(
          'INSERT INTO attempts(id,run,sequence,received,status,retry_after) SELECT ?,id,attempts,?,CASE WHEN attempts<=failures THEN status ELSE 200 END,CASE WHEN attempts<=failures THEN ? ELSE NULL END FROM runs WHERE id=? AND expires>? AND attempts<=32 AND NOT EXISTS(SELECT 1 FROM attempts WHERE run=? AND sequence=runs.attempts) RETURNING sequence,status,retry_after',
        )
        .bind(crypto.randomUUID(), now, header, id, now, id),
    ]),
  );
  const row = results[1].results[0] as
    | { sequence: number; status: number; retry_after: string | null }
    | undefined;
  if (!results[0].results.length || !row)
    throw new AppError('Run attempt limit reached', 410);
  await event(r, 'probe_attempt', id, run.cohort);
  return new Response(
    JSON.stringify({
      synthetic: true,
      attempt: row.sequence,
      status: row.status,
      server_received_at: now,
    }),
    {
      status: row.status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Retry-After',
        ...(row.retry_after === null ? {} : { 'Retry-After': row.retry_after }),
      },
    },
  );
}
export async function readTrace(r: Request, input: unknown) {
  const a = traceSchema.parse(input),
    db = database(),
    run = await observeDatabase('trace.run_lookup', () =>
      db.prepare('SELECT * FROM runs WHERE id=?').bind(a.run_id).first<Run>(),
    );
  if (!run) throw new AppError('Unknown run', 404);
  const list = (
    await observeDatabase('trace.attempts', () =>
      db
        .prepare(
          'SELECT sequence,received,status,retry_after FROM attempts WHERE run=? ORDER BY sequence',
        )
        .bind(run.id)
        .all<{
          sequence: number;
          received: string;
          status: number;
          retry_after: string | null;
        }>(),
    )
  ).results;
  await event(r, 'trace_read', run.id, run.cohort);
  return {
    run_id: run.id,
    created_at: run.created,
    expires_at: run.expires,
    status: run.status,
    failures: run.failures,
    header_format: run.format,
    delay_seconds: run.delay,
    attempts: list.map((v, i) => ({
      ...v,
      gap_from_previous_ms: i
        ? Date.parse(v.received) - Date.parse(list[i - 1].received)
        : null,
    })),
    reached_success: list.some((v) => v.status === 200),
    limitations: [
      'Arrival gaps include network and server effects; they do not prove exact client sleep duration.',
      'Concurrent requests may arrive out of sequence.',
      'A successful final status alone does not establish a correct retry policy.',
      'Run URLs are private capability links. No request bodies, arbitrary URLs, IP addresses or authorization headers are stored.',
    ],
  };
}
export async function publishFinding(r: Request, input: unknown) {
  const a = publishSchema.parse(input),
    actor = await hash(a.participant_token),
    db = database(),
    requestHash = await hash(
      JSON.stringify({
        run: a.run_id,
        title: a.title,
        summary: a.summary,
        parent: a.parent_id || null,
      }),
    );
  const run = await db
    .prepare('SELECT * FROM runs WHERE id=? AND actor=?')
    .bind(a.run_id, actor)
    .first<Run>();
  if (!run) throw new AppError('Run does not belong to this participant', 403);
  const existing = await db
    .prepare(
      'SELECT id,request_hash FROM findings WHERE actor=? AND client_key=?',
    )
    .bind(actor, a.idempotency_key)
    .first<{ id: string; request_hash: string }>();
  if (existing) {
    if (existing.request_hash !== requestHash)
      throw new AppError('Idempotency key content conflict', 409);
    return { finding_id: existing.id, replayed: true };
  }
  if (a.parent_id) {
    const parent = await db
      .prepare('SELECT id,cohort FROM findings WHERE id=?')
      .bind(a.parent_id)
      .first<{ id: string; cohort: string }>();
    if (!parent || parent.cohort !== run.cohort)
      throw new AppError('Parent finding not available in this cohort', 404);
  }
  const trace = await readTrace(r, { run_id: a.run_id });
  if (!trace.attempts.length)
    throw new AppError('Run has no observed attempts');
  const evidence = {
      status: trace.status,
      failures: trace.failures,
      header_format: trace.header_format,
      delay_seconds: trace.delay_seconds,
      reached_success: trace.reached_success,
      attempts: trace.attempts,
    },
    id = crypto.randomUUID(),
    now = new Date().toISOString();
  const stored = await db
    .prepare(
      'INSERT INTO findings(id,actor,cohort,parent,title,summary,evidence,client_key,request_hash,created) SELECT ?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM findings WHERE created>=?)<100 ON CONFLICT(actor,client_key) DO NOTHING RETURNING id',
    )
    .bind(
      id,
      actor,
      run.cohort,
      a.parent_id || null,
      a.title,
      a.summary,
      JSON.stringify(evidence),
      a.idempotency_key,
      requestHash,
      now,
      now.slice(0, 10),
    )
    .first<{ id: string }>();
  if (!stored) {
    const won = await db
      .prepare(
        'SELECT id,request_hash FROM findings WHERE actor=? AND client_key=?',
      )
      .bind(actor, a.idempotency_key)
      .first<{ id: string; request_hash: string }>();
    if (won && won.request_hash === requestHash)
      return { finding_id: won.id, replayed: true };
    throw new AppError('Publication capacity or idempotency conflict', 409);
  }
  await event(
    r,
    a.parent_id ? 'finding_reply' : 'finding_published',
    id,
    run.cohort,
  );
  return {
    finding_id: id,
    public: run.cohort !== 'operator',
    operator_test: run.cohort === 'operator',
    url: `${new URL(r.url).origin}/findings`,
    note: 'Participant-authored statement, unverified intent. The attached evidence is a server-observed synthetic trace.',
  };
}
export async function listFindings() {
  return (
    await database()
      .prepare(
        "SELECT id,parent,title,summary,evidence,created FROM findings WHERE cohort<>'operator' ORDER BY created DESC,id DESC LIMIT 50",
      )
      .all<{
        id: string;
        parent: string | null;
        title: string;
        summary: string;
        evidence: string;
        created: string;
      }>()
  ).results.map((v) => ({ ...v, evidence: JSON.parse(String(v.evidence)) }));
}
export async function stats() {
  const db = database();
  const asOf = new Date().toISOString();
  const snapshots = await observeDatabase('stats.snapshot', () =>
    db.batch<Record<string, unknown>>([
      db.prepare(
        'SELECT cohort,kind,COUNT(*) count FROM events GROUP BY cohort,kind',
      ),
      db.prepare('SELECT cohort,COUNT(*) count FROM actors GROUP BY cohort'),
      db.prepare(
        'SELECT cohort,discovery,directed,COUNT(*) count FROM actors GROUP BY cohort,discovery,directed',
      ),
      db.prepare(
        `SELECT cohort,COUNT(*) runs,SUM(EXISTS(SELECT 1 FROM attempts a WHERE a.run=r.id AND a.status=200)) reached_200,SUM(EXISTS(SELECT 1 FROM attempts a WHERE a.run=r.id AND a.status=200) AND EXISTS(SELECT 1 FROM events e WHERE e.entity=r.id AND e.kind='trace_read')) success_and_trace_read FROM runs r GROUP BY cohort`,
      ),
      db.prepare(
        'SELECT cohort,COUNT(*) count FROM (SELECT actor,cohort FROM runs GROUP BY actor,cohort HAVING COUNT(*)>1) GROUP BY cohort',
      ),
      db.prepare(
        'SELECT f.cohort,COUNT(*) count FROM findings f JOIN findings p ON f.parent=p.id WHERE f.actor<>p.actor GROUP BY f.cohort',
      ),
    ]),
  );
  if (snapshots.length !== 6 || snapshots.some((result) => !result.success)) {
    throw new Error('Statistics snapshot unavailable');
  }
  return {
    as_of: asOf,
    experiment: 'retry-trace-005',
    cohorts: snapshots[0].results,
    actors: snapshots[1].results,
    discovery_claims: snapshots[2].results,
    workflow_outcomes: snapshots[3].results,
    repeat_tokens: snapshots[4].results,
    cross_token_replies: snapshots[5].results,
    independent_agents: null,
    independent_participation: null,
    limitations: [
      'Capability IDs are not unique agents or independent operators.',
      'reached_200 and success_and_trace_read are server-recorded evidence, not confirmed delivery or client task completion. A trace-read event may precede the final 200.',
      'Discovery and direction fields are optional self-reports.',
      'Catalog scans are inferred from a claimed user-agent, not authenticated.',
      'Authenticated operator checks are excluded from unattributed counts. Untagged operator activity can remain unattributed.',
      'Event logging is capped at 20000 per UTC day. Counts are not exposed-population counts.',
    ],
  };
}
export async function body(r: Request) {
  if (Number(r.headers.get('content-length') || 0) > 16384)
    throw new AppError('Request too large', 413);
  const reader = r.body?.getReader();
  let n = 0,
    s = '';
  const decoder = new TextDecoder();
  if (reader)
    while (true) {
      const v = await reader.read();
      if (v.done) break;
      n += v.value.length;
      if (n > 16384) {
        await reader.cancel();
        throw new AppError('Request too large', 413);
      }
      s += decoder.decode(v.value, { stream: true });
    }
  return JSON.parse(s + decoder.decode());
}
export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
export function failure(e: unknown) {
  return json(
    {
      error:
        e instanceof z.ZodError
          ? 'Invalid input'
          : e instanceof AppError
            ? e.message
            : e instanceof SyntaxError
              ? 'Invalid JSON'
              : 'Request failed',
    },
    e instanceof AppError
      ? e.status
      : e instanceof z.ZodError || e instanceof SyntaxError
        ? 400
        : 500,
  );
}
