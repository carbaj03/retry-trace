import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(
    readFileSync(
      new URL('../drizzle/0000_curious_gamma_corps.sql', import.meta.url),
      'utf8',
    ),
  );
  const db = {
    prepare(sql) {
      const statement = {
        sql,
        args: [],
        bind(...args) {
          return { ...this, args };
        },
        async first() {
          return sqlite.prepare(sql).get(...this.args) || null;
        },
        async all() {
          return {
            success: true,
            results: sqlite.prepare(sql).all(...this.args),
          };
        },
        async run() {
          sqlite.prepare(sql).run(...this.args);
          return { success: true };
        },
      };
      return statement;
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.all());
        sqlite.exec('COMMIT');
        return results;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  };
  const cache = {};
  function load(name) {
    if (cache[name]) return cache[name];
    const source = readFileSync(
      new URL(`../lib/${name}.ts`, import.meta.url),
      'utf8',
    );
    const code = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    }).outputText;
    const mod = { exports: {} };
    new Function('require', 'module', 'exports', code)(
      (n) =>
        n === '@/db'
          ? { database: () => db, operatorToken: () => 'local-operator' }
          : n === '@/lib/diagnostics'
            ? { observeDatabase: (_s, f) => f() }
            : n.startsWith('@/lib/')
              ? load(n.slice(6))
              : require(n),
      mod,
      mod.exports,
    );
    return (cache[name] = mod.exports);
  }
  return { sqlite, ...load('experiment'), records: load('records') };
}
const request = (operator = false) =>
  new Request('https://retry-trace.carbaj0.chatgpt.site/api/runs', {
    headers: operator ? { 'x-retry-trace-operator': 'local-operator' } : {},
  });
async function runWithAttempt(f, operator = false, input = {}) {
  const r = request(operator),
    run = await f.createRun(r, { ...input });
  await f.probe(r, run.run_id);
  return run;
}
function publication(run, extra = {}) {
  return {
    participant_token: run.participant_token,
    run_id: run.run_id,
    public: true,
    title: 'curl 8.7.1 retry observation',
    summary: 'Synthetic run with a documented public client configuration.',
    idempotency_key: crypto.randomUUID(),
    ...extra,
  };
}

test('record is a frozen public reference after expiry; idempotent receipts preserve URLs and omit capabilities', async () => {
  const f = fixture();
  try {
    const run = await runWithAttempt(f),
      input = publication(run),
      saved = await f.publishFinding(request(), input);
    assert(saved.url.endsWith(`/findings/${saved.finding_id}`));
    await f.probe(request(), run.run_id);
    f.sqlite
      .prepare('UPDATE runs SET expires=? WHERE id=?')
      .run('2000-01-01', run.run_id);
    const replay = await f.publishFinding(request(), input);
    assert.equal(replay.url, saved.url);
    assert.equal(replay.json_url, saved.json_url);
    const record = await f.records.readFinding(saved.finding_id);
    assert.equal(record.evidence.attempts.length, 1);
    assert.equal(record.evidence.reached_success, false);
    assert.deepEqual(record.reproduce, {
      status: 503,
      failures: 1,
      delay_seconds: 1,
      header_format: 'seconds',
    });
    const serialized = JSON.stringify(record);
    assert(!serialized.includes(run.run_id));
    assert(!serialized.includes(run.participant_token));
    assert(!serialized.includes('client_key'));
    assert(!serialized.includes('request_hash'));
    await assert.rejects(
      f.publishFinding(request(), {
        ...input,
        summary: input.summary + ' Different.',
      }),
      (e) => e.status === 409,
    );
  } finally {
    f.sqlite.close();
  }
});

test('search filters all records before limiting; operator records remain unavailable by ID and in comparisons', async () => {
  const f = fixture();
  try {
    const a = await runWithAttempt(f, false, {
      status: 429,
      header_format: 'http-date',
    });
    const saved = await f.publishFinding(request(), publication(a));
    const op = await runWithAttempt(f, true);
    const hidden = await f.publishFinding(request(true), publication(op));
    assert.equal(hidden.url, null);
    assert.equal(await f.records.readFinding(hidden.finding_id), null);
    assert.equal(
      await f.records.compareFindings({
        finding_id: saved.finding_id,
        other_id: hidden.finding_id,
      }),
      null,
    );
    assert.equal(
      (
        await f.records.searchFindings({
          q: 'CURL 8.7',
          status: '429',
          header_format: 'http-date',
        })
      ).findings.length,
      1,
    );
    assert.equal(
      (await f.records.searchFindings({ status: '503' })).findings.length,
      0,
    );
    assert.equal(
      (await f.records.searchFindings({ q: "' OR 1=1 --" })).findings.length,
      0,
    );
    await assert.rejects(f.records.searchFindings({ status: '500' }));
    await assert.rejects(f.records.searchFindings({ unknown: 'value' }));
    const source = f.sqlite
      .prepare('SELECT * FROM findings WHERE id=?')
      .get(saved.finding_id);
    for (let i = 0; i < 52; i++)
      f.sqlite
        .prepare('INSERT INTO findings VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(
          crypto.randomUUID(),
          source.actor,
          source.cohort,
          null,
          'Other title',
          'Other summary',
          source.evidence,
          crypto.randomUUID(),
          'hash',
          '2099-01-01',
        );
    assert.equal((await f.records.searchFindings()).findings.length, 50);
    assert.equal((await f.records.searchFindings()).has_more, true);
    assert.equal(
      (await f.records.searchFindings({ q: 'curl' })).findings[0].id,
      saved.finding_id,
    );
  } finally {
    f.sqlite.close();
  }
});

test('reply requires own evidence and consent; comparison flags different scenarios without a correctness verdict', async () => {
  const f = fixture();
  try {
    const a = await runWithAttempt(f),
      b = await runWithAttempt(f, false, { status: 429 });
    const saved = await f.publishFinding(request(), publication(a));
    await assert.rejects(
      f.publishFinding(
        request(),
        publication(a, { participant_token: b.participant_token }),
      ),
      (e) => e.status === 403,
    );
    await assert.rejects(
      f.publishFinding(request(), publication(b, { public: false })),
    );
    const empty = await f.createRun(request(), {});
    await assert.rejects(
      f.publishFinding(request(), publication(empty)),
      /no observed attempts/,
    );
    const reply = await f.publishFinding(
      request(),
      publication(b, { parent_id: saved.finding_id }),
    );
    const replies = await f.records.findingReplies(saved.finding_id);
    assert.equal(replies.replies[0].id, reply.finding_id);
    const compared = await f.records.compareFindings({
      finding_id: saved.finding_id,
      other_id: reply.finding_id,
    });
    assert.equal(compared.same_scenario, false);
    assert.deepEqual(compared.different_settings, ['status']);
    assert.match(compared.limitation, /No automatic correctness verdict/);
    assert.equal(
      (
        await f.records.compareFindings({
          finding_id: saved.finding_id,
          other_id: saved.finding_id,
        })
      ).same_scenario,
      true,
    );
    const stats = await f.stats();
    assert.deepEqual(
      { ...stats.contribution_outcomes[0] },
      {
        cohort: 'unattributed',
        roots: 1,
        replies: 1,
        publishing_tokens: 2,
        roots_with_peer_reply: 1,
      },
    );
    assert.equal(stats.independent_participation, null);
  } finally {
    f.sqlite.close();
  }
});
