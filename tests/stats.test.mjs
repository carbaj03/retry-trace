import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function loadStats(db) {
  const source = readFileSync(
    new URL('../lib/experiment.ts', import.meta.url),
    'utf8',
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(
    (name) => {
      if (name === '@/db') return { database: () => db };
      if (name === '@/lib/diagnostics')
        return { observeDatabase: (_step, operation) => operation() };
      return require(name);
    },
    module,
    module.exports,
  );
  return module.exports.stats;
}

test('one read-only snapshot preserves distinct cohorts, workflows and replies', async () => {
  const sqlite = new DatabaseSync(':memory:');
  let calls = 0;
  try {
    sqlite.exec(
      readFileSync(
        new URL('../drizzle/0000_curious_gamma_corps.sql', import.meta.url),
        'utf8',
      ),
    );
    sqlite.exec(`
      INSERT INTO actors VALUES ('owner','operator','owner-directed',1,'2026-09-07'),('outside','unattributed','search',0,'2026-09-07');
      INSERT INTO runs VALUES ('a','owner','operator',429,1,1,'seconds',2,'2026-09-07','2026-09-08'),('b','owner','operator',503,1,1,'seconds',0,'2026-09-07','2026-09-08'),('c','outside','unattributed',429,1,1,'seconds',1,'2026-09-07','2026-09-08');
      INSERT INTO attempts VALUES ('a1','a',1,'2026-09-07',429,'1'),('a2','a',2,'2026-09-07',200,NULL),('c1','c',1,'2026-09-07',200,NULL);
      INSERT INTO events VALUES ('e1','2026-09-07','trace_read','operator','a','none'),('e2','2026-09-07','trace_read','operator','a','none');
      INSERT INTO findings VALUES ('f1','owner','operator',NULL,'title','summary','[]','key1','hash','2026-09-07'),('f2','outside','unattributed','f1','reply','summary','[]','key2','hash','2026-09-07');
    `);
    const stats = loadStats({
      prepare: (sql) => ({ sql }),
      batch: async (statements) => {
        calls++;
        assert.equal(statements.length, 6);
        sqlite.exec('BEGIN');
        const results = statements.map(({ sql }) => {
          assert.match(sql, /^SELECT /);
          return { success: true, results: sqlite.prepare(sql).all() };
        });
        sqlite.exec('COMMIT');
        return results;
      },
    });
    const result = JSON.parse(JSON.stringify(await stats()));
    assert.equal(calls, 1);
    assert.deepEqual(result.workflow_outcomes, [
      {
        cohort: 'operator',
        runs: 2,
        reached_200: 1,
        success_and_trace_read: 1,
      },
      {
        cohort: 'unattributed',
        runs: 1,
        reached_200: 1,
        success_and_trace_read: 0,
      },
    ]);
    assert.deepEqual(result.actors, [
      { cohort: 'operator', count: 1 },
      { cohort: 'unattributed', count: 1 },
    ]);
    assert.deepEqual(result.cohorts, [
      { cohort: 'operator', kind: 'trace_read', count: 2 },
    ]);
    assert.deepEqual(result.repeat_tokens, [{ cohort: 'operator', count: 1 }]);
    assert.deepEqual(result.cross_token_replies, [
      { cohort: 'unattributed', count: 1 },
    ]);
    assert.equal(result.discovery_claims.length, 2);
    assert.equal(result.independent_agents, null);
  } finally {
    sqlite.close();
  }
});

test('failed or incomplete snapshots reject without zero substitution or retries', async () => {
  for (const mode of ['throw', 'incomplete', 'failed']) {
    let calls = 0;
    const stats = loadStats({
      prepare: (sql) => ({ sql }),
      batch: async () => {
        calls++;
        if (mode === 'throw') throw new Error('Database unavailable');
        return Array.from(
          { length: mode === 'incomplete' ? 5 : 6 },
          (_, i) => ({ success: mode !== 'failed' || i !== 2, results: [] }),
        );
      },
    });
    await assert.rejects(stats());
    assert.equal(calls, 1);
  }
});
