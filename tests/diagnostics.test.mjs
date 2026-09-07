import assert from 'node:assert/strict';
import { test } from 'node:test';
import { observeDatabase } from '../lib/diagnostics.ts';

test('diagnostics preserve results and errors, observe slow work, and never expose payloads', async () => {
  const logs = [];
  const original = {
    info: console.info,
    warn: console.warn,
    error: console.error,
  };
  console.info =
    console.warn =
    console.error =
      (entry) => {
        logs.push(entry);
      };
  try {
    const value = { privatePayload: 'must-never-be-logged' };
    let calls = 0;
    assert.equal(
      await observeDatabase('health.read', async () => {
        calls++;
        return value;
      }),
      value,
    );
    const failure = new Error('sensitive-query-and-token');
    await assert.rejects(
      observeDatabase('create.persist_run', async () => {
        calls++;
        throw failure;
      }),
      (error) => error === failure,
    );
    let resolve = () => {};
    const pending = observeDatabase('probe.persist_attempt', () => {
      calls++;
      return new Promise((r) => {
        resolve = r;
      });
    });
    await new Promise((r) => setTimeout(r, 2100));
    assert.ok(
      logs.some((entry) => entry.state === 'pending'),
    );
    resolve(42);
    assert.equal(await pending, 42);
    assert.equal(calls, 3);
    assert.ok(!JSON.stringify(logs).includes('must-never-be-logged'));
    assert.ok(!JSON.stringify(logs).includes('sensitive-query-and-token'));
    assert.equal(
      logs.filter((entry) => entry.state === 'failed')
        .length,
      1,
    );
  } finally {
    Object.assign(console, original);
  }
});
