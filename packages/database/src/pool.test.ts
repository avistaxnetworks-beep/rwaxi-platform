import { test } from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import { POOL_DEFAULTS, poolUrl, retryTransient, transaction, transientKind } from "./pool";

const err = (code: string, message = "") => Object.assign(new Error(message || code), { code });

test("poolUrl adds the pool defaults and keeps whatever the URL already sets", () => {
  const url = new URL(
    poolUrl("postgresql://app:s%40cret@ep-x-pooler.neon.tech/db?sslmode=require&pool_timeout=40")!,
  );
  assert.equal(url.searchParams.get("pool_timeout"), "40");
  assert.equal(
    url.searchParams.get("max_idle_connection_lifetime"),
    POOL_DEFAULTS.max_idle_connection_lifetime,
  );
  assert.equal(url.searchParams.get("sslmode"), "require");
  assert.equal(url.password, "s%40cret");
  assert.equal(poolUrl(undefined), undefined);
  assert.equal(poolUrl("not a url"), "not a url");
});

test("transientKind tells a query that never left from a dropped connection", () => {
  assert.equal(transientKind(err("P2024")), "not-sent");
  assert.equal(transientKind(err("P1001")), "not-sent");
  assert.equal(
    transientKind(err("P2028", "Transaction API error: Unable to start a transaction in the given time.")),
    "not-sent",
  );
  assert.equal(transientKind(err("P1017")), "dropped");
  assert.equal(
    transientKind(new Error("Error in PostgreSQL connection: Error { kind: Io, cause: ConnectionReset }")),
    "dropped",
  );
  assert.equal(transientKind(err("P2002")), null);
  assert.equal(transientKind(err("P2028", "Transaction already closed")), null);
  assert.equal(transientKind(undefined), null);
});

async function attempts(failure: Error, repeatable: boolean): Promise<number> {
  let calls = 0;
  await retryTransient(
    async () => {
      calls++;
      if (calls === 1) throw failure;
      return "ok";
    },
    { repeatable, backoffMs: 1 },
  ).catch(() => undefined);
  return calls;
}

test("retryTransient repeats reads after any transient failure, writes only if they never left", async () => {
  assert.equal(await attempts(err("P2024"), false), 2); // write that never reached the database
  assert.equal(await attempts(err("P1017"), true), 2); // read after a dropped connection
  assert.equal(await attempts(err("P1017"), false), 1); // write after a dropped connection: maybe applied
  assert.equal(await attempts(err("P2002"), true), 1); // not a connection failure
});

test("retryTransient gives up after its attempts and rethrows the last error", async () => {
  let calls = 0;
  await assert.rejects(
    retryTransient(
      async () => {
        calls++;
        throw err("P2024");
      },
      { attempts: 3, backoffMs: 1 },
    ),
    { code: "P2024" },
  );
  assert.equal(calls, 3);
});

/** A client whose $transaction fails `before` times before running the callback, then fails `inside` times inside it. */
function fakeClient(before: number, inside: number) {
  const calls = { starts: 0, runs: 0 };
  const client = {
    async $transaction(fn: (tx: unknown) => Promise<unknown>) {
      calls.starts++;
      if (calls.starts <= before) throw err("P2028", "Unable to start a transaction in the given time.");
      calls.runs++;
      if (calls.runs <= inside) {
        await fn({});
        throw err("P1017"); // connection lost after the writes: they may have committed
      }
      return fn({});
    },
  } as unknown as PrismaClient;
  return { client, calls };
}

test("transaction retries only a transaction that never started", async () => {
  const late = fakeClient(1, 0);
  assert.equal(await transaction(late.client, async () => "done"), "done");
  assert.deepEqual(late.calls, { starts: 2, runs: 1 });

  const dropped = fakeClient(0, 1);
  await assert.rejects(
    transaction(dropped.client, async () => "done"),
    { code: "P1017" },
  );
  assert.deepEqual(dropped.calls, { starts: 1, runs: 1 });
});
