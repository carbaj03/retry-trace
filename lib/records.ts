import { z } from 'zod';
import { database } from '@/db';

const ORIGIN = 'https://retry.agentlife.app';
export const findingQuery = z
  .object({
    q: z.string().trim().max(100).optional(),
    status: z.enum(['429', '503']).optional(),
    header_format: z.enum(['seconds', 'http-date']).optional(),
  })
  .strict();
export const findingId = z.object({ finding_id: z.uuid() }).strict();
export const comparisonQuery = z
  .object({ finding_id: z.uuid(), other_id: z.uuid() })
  .strict();
type Evidence = {
  status: 429 | 503;
  failures: number;
  header_format: 'seconds' | 'http-date';
  delay_seconds: number;
  reached_success: boolean;
  attempts: {
    sequence: number;
    received: string;
    status: number;
    retry_after: string | null;
    gap_from_previous_ms: number | null;
  }[];
};
type Row = {
  id: string;
  parent: string | null;
  title: string;
  summary: string;
  evidence: string;
  created: string;
};
export function findingLinks(id: string, cohort: string) {
  return cohort === 'operator'
    ? { url: null, json_url: null, operator_test: true, public: false }
    : {
        url: `${ORIGIN}/findings/${id}`,
        json_url: `${ORIGIN}/api/findings/${id}`,
        operator_test: false,
        public: true,
      };
}
function record(row: Row) {
  const evidence = JSON.parse(row.evidence) as Evidence;
  return {
    ...row,
    evidence,
    ...findingLinks(row.id, 'unattributed'),
    reproduce: {
      status: evidence.status,
      failures: evidence.failures,
      delay_seconds: evidence.delay_seconds,
      header_format: evidence.header_format,
    },
    evidence_scope:
      'Immutable snapshot at publication, retained during this pilot. Server-observed synthetic attempts; no client receipt or policy correctness is established.',
  };
}
export async function searchFindings(input: unknown = {}) {
  const a = findingQuery.parse(input);
  const clauses = ["cohort<>'operator'"];
  const values: (string | number)[] = [];
  if (a.q) {
    clauses.push("instr(lower(title || ' ' || summary),lower(?))>0");
    values.push(a.q);
  }
  if (a.status) {
    clauses.push("json_extract(evidence,'$.status')=?");
    values.push(Number(a.status));
  }
  if (a.header_format) {
    clauses.push("json_extract(evidence,'$.header_format')=?");
    values.push(a.header_format);
  }
  const result = await database()
    .prepare(
      `SELECT id,parent,title,summary,evidence,created FROM findings WHERE ${clauses.join(' AND ')} ORDER BY created DESC,id DESC LIMIT 51`,
    )
    .bind(...values)
    .all<Row>();
  return {
    findings: result.results.slice(0, 50).map(record),
    has_more: result.results.length > 50,
    limit: 50,
    filters: a,
  };
}
export async function readFinding(id: string) {
  findingId.parse({ finding_id: id });
  const row = await database()
    .prepare(
      "SELECT id,parent,title,summary,evidence,created FROM findings WHERE id=? AND cohort<>'operator'",
    )
    .bind(id)
    .first<Row>();
  return row ? record(row) : null;
}
export async function findingReplies(id: string) {
  const result = await database()
    .prepare(
      "SELECT id,parent,title,summary,evidence,created FROM findings WHERE parent=? AND cohort<>'operator' ORDER BY created,id LIMIT 51",
    )
    .bind(id)
    .all<Row>();
  return {
    replies: result.results.slice(0, 50).map(record),
    has_more: result.results.length > 50,
  };
}
export function compareRecords(
  a: NonNullable<Awaited<ReturnType<typeof readFinding>>>,
  b: NonNullable<Awaited<ReturnType<typeof readFinding>>>,
) {
  const fields = [
    'status',
    'failures',
    'delay_seconds',
    'header_format',
  ] as const;
  const differences = fields.filter((k) => a.reproduce[k] !== b.reproduce[k]);
  return {
    same_scenario: differences.length === 0,
    different_settings: differences,
    records: [a, b].map((f) => ({
      finding_id: f.id,
      title: f.title,
      url: f.url,
      scenario: f.reproduce,
      attempt_count: f.evidence.attempts.length,
      stored_statuses: f.evidence.attempts.map((x) => x.status),
      arrival_gaps_ms: f.evidence.attempts.map((x) => x.gap_from_previous_ms),
      stored_http_200: f.evidence.reached_success,
    })),
    interpretation: differences.length
      ? 'Different settings: these records are not a matched reproduction.'
      : 'Settings match. Different clients, networks or server delays can still produce different observations.',
    limitation:
      'No automatic correctness verdict. Neither matching traces nor different tokens prove independent reproduction. Arrival gaps do not measure exact client sleep; stored 200 does not confirm delivery.',
  };
}
export async function compareFindings(input: unknown) {
  const a = comparisonQuery.parse(input);
  const first = await readFinding(a.finding_id);
  const second = await readFinding(a.other_id);
  return first && second ? compareRecords(first, second) : null;
}
