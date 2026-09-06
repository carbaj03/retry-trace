import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
export const actors = sqliteTable('actors', {
  id: text('id').primaryKey(),
  cohort: text('cohort').notNull(),
  discovery: text('discovery').notNull(),
  directed: integer('directed'),
  created: text('created').notNull(),
});
export const runs = sqliteTable(
  'runs',
  {
    id: text('id').primaryKey(),
    actor: text('actor')
      .notNull()
      .references(() => actors.id),
    cohort: text('cohort').notNull(),
    status: integer('status').notNull(),
    failures: integer('failures').notNull(),
    delay: integer('delay').notNull(),
    format: text('format').notNull(),
    attempts: integer('attempts').notNull().default(0),
    created: text('created').notNull(),
    expires: text('expires').notNull(),
  },
  (t) => [index('runs_created').on(t.created), index('runs_actor').on(t.actor)],
);
export const attempts = sqliteTable(
  'attempts',
  {
    id: text('id').primaryKey(),
    run: text('run')
      .notNull()
      .references(() => runs.id),
    sequence: integer('sequence').notNull(),
    received: text('received').notNull(),
    status: integer('status').notNull(),
    retryAfter: text('retry_after'),
  },
  (t) => [uniqueIndex('attempt_sequence').on(t.run, t.sequence)],
);
export const findings = sqliteTable(
  'findings',
  {
    id: text('id').primaryKey(),
    actor: text('actor')
      .notNull()
      .references(() => actors.id),
    cohort: text('cohort').notNull(),
    parent: text('parent'),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    evidence: text('evidence').notNull(),
    clientKey: text('client_key').notNull(),
    requestHash: text('request_hash').notNull(),
    created: text('created').notNull(),
  },
  (t) => [
    uniqueIndex('finding_actor_key').on(t.actor, t.clientKey),
    index('finding_cohort_created').on(t.cohort, t.created),
  ],
);
export const events = sqliteTable(
  'events',
  {
    id: text('id').primaryKey(),
    at: text('at').notNull(),
    kind: text('kind').notNull(),
    cohort: text('cohort').notNull(),
    entity: text('entity'),
    referral: text('referral').notNull(),
  },
  (t) => [
    index('events_at').on(t.at),
    index('events_cohort_kind').on(t.cohort, t.kind),
  ],
);
