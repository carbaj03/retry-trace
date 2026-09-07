type DatabaseStep =
  | 'stats.snapshot'
  | 'health.read'
  | 'create.actor_lookup'
  | 'create.persist_run'
  | 'probe.run_lookup'
  | 'probe.persist_attempt'
  | 'trace.run_lookup'
  | 'trace.attempts'
  | 'event.persist';

// Never include SQL, bound values, request URLs, credentials or error messages.
// Observation does not time out, retry, cancel or change the database operation.
export async function observeDatabase<T>(
  step: DatabaseStep,
  operation: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  console.info({ event: 'database_step', step, state: 'started' });
  const timer = setTimeout(() => {
    console.warn({
      event: 'database_step',
      step,
      state: 'pending',
      elapsed_ms: Date.now() - started,
    });
  }, 2000);
  try {
    const result = await operation();
    console.info({
      event: 'database_step',
      step,
      state: 'completed',
      elapsed_ms: Date.now() - started,
    });
    return result;
  } catch (error) {
    console.error({
      event: 'database_step',
      step,
      state: 'failed',
      elapsed_ms: Date.now() - started,
    });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
