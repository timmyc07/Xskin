import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { TokenUsageReader } from "../scripts/token-usage.mjs";

const build = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../build");
await fs.mkdir(build, { recursive: true });
const root = await fs.mkdtemp(path.join(build, "xskin-token-usage-"));
const threadId = "01a162d1-0000-7000-8000-000000000001";
const otherId = "01a162d1-0000-7000-8000-000000000002";
const directory = path.join(root, "sessions", "2026", "10", "22");
const filename = path.join(directory, `rollout-2026-10-22T16-53-58-${threadId}.jsonl`);
let now = Date.parse("2026-10-22T08:55:00Z");
const reader = new TokenUsageReader({ codexHome: root, now: () => now });
const usage = (total = 1200, changes = {}) => JSON.stringify({
  timestamp: "2026-10-22T08:55:00Z",
  type: "event_msg",
  payload: {
    type: "token_count",
    info: {
      total_token_usage: { input_tokens: total - 200, cached_input_tokens: 800, output_tokens: 200, total_tokens: total },
      last_token_usage: { total_tokens: 250 },
      model_context_window: 1000,
    },
    rate_limits: {
      plan_type: "prolite",
      primary: { used_percent: 61, window_minutes: 10080, resets_at: 1793084543 },
      secondary: { used_percent: 12.5, window_minutes: 300, resets_at: 1792660000 },
    },
    ...changes,
  },
});
const until = async predicate => {
  const deadline = Date.now() + 1500;
  while (!predicate() && Date.now() < deadline) await delay(5);
  assert.ok(predicate(), "File notifications must publish without waiting for a heartbeat");
};

try {
  await fs.mkdir(directory, { recursive: true });
  assert.equal(await reader.read("../../auth.json"), null);
  assert.equal(await reader.read(null), null);
  await fs.writeFile(filename, `${JSON.stringify({ type: "session_meta", payload: { id: otherId } })}\n${usage()}\n`);
  await fs.writeFile(path.join(directory, `rollout-newer-${otherId}.jsonl`), `${usage(9900)}\n`);
  const first = await reader.read(threadId.toUpperCase());
  assert.deepEqual(first, {
    threadId, totalTokens: 1200, inputTokens: 1000, cachedInputTokens: 800, outputTokens: 200,
    contextRemainingPercent: 75,
    cacheWriteInputTokens: null, lastInputTokens: null, lastCachedInputTokens: null, lastCacheWriteInputTokens: null,
    primary: { remainingPercent: 39, windowMinutes: 10080, resetsAt: 1793084543 },
    secondary: { remainingPercent: 87.5, windowMinutes: 300, resetsAt: 1792660000 },
    planType: "prolite", sampledAt: now,
  });
  assert.deepEqual(await reader.read(threadId), first, "Unchanged snapshots must not add tokens or resample time.");

  const next = usage(1400);
  await fs.appendFile(filename, next.slice(0, next.length - 10));
  assert.deepEqual(await reader.read(threadId), first, "Partial JSONL lines must wait for their newline.");
  await fs.appendFile(filename, `${next.slice(-10)}\n${usage(1400)}\n`);
  assert.equal((await reader.read(threadId)).totalTokens, 1400, "Repeated cumulative totals must never be summed.");

  await fs.appendFile(filename, `${usage(1400, { info: null, rate_limits: {
    plan_type: "pro", primary: { used_percent: 120, window_minutes: 300, resets_at: 1792660000 }, secondary: null,
  } })}\n`);
  const refreshed = await reader.read(threadId);
  assert.equal(refreshed.totalTokens, 1400);
  assert.equal(refreshed.primary.remainingPercent, 0);
  assert.equal(refreshed.planType, "pro");
  assert.equal(refreshed.secondary, null);

  await fs.appendFile(filename, '{broken JSON}\n' + usage(1400, { info: {
    total_token_usage: { total_tokens: 1, input_tokens: 1, cached_input_tokens: 8, output_tokens: 0 },
  }, rate_limits: null }) + "\n");
  assert.deepEqual(await reader.read(threadId), refreshed, "Malformed records must not replace valid totals.");

  await fs.writeFile(filename, `${usage(1600)}\n`);
  assert.equal((await reader.read(threadId)).totalTokens, 1600, "Truncation resets the incremental offset.");
  await fs.rename(filename, `${filename}.old`);
  await fs.writeFile(filename, `${usage(1800)}\n`);
  assert.equal((await reader.read(threadId)).totalTokens, 1800, "Replacement resets file identity.");
  await fs.unlink(filename);
  assert.equal(await reader.read(threadId), null, "Deleted sessions must not leak stale usage.");
  await fs.writeFile(filename, `${"x".repeat(2 * 1024 * 1024)}\n${usage(2000)}\n`);
  assert.equal((await reader.read(threadId)).totalTokens, 2000, "Initial reads only need a bounded tail.");

  const missingId = "01a162d1-1111-7111-8111-111111111111";
  assert.equal(await reader.read(missingId), null);
  await fs.writeFile(path.join(directory, `rollout-new-${missingId}.jsonl`), `${usage()}\n`);
  now += 5001;
  assert.equal((await reader.read(missingId)).totalTokens, 1200, "A new file appears after the discovery cooldown.");

  const olderId = "11111111-2222-4333-8444-555555555555";
  const olderDirectory = path.join(root, "sessions", "2025", "01", "03");
  await fs.mkdir(olderDirectory, { recursive: true });
  await fs.writeFile(path.join(olderDirectory, `rollout-old-${olderId}.jsonl`), `${usage()}\n`);
  const olderReader = new TokenUsageReader({ codexHome: root, now: () => now });
  assert.equal((await olderReader.read(olderId)).totalTokens, 1200, "A one-time directory index also finds older IDs.");

  const numeric = usage(1200, { info: {
    total_token_usage: { total_tokens: 1200, input_tokens: 1000, cached_input_tokens: 0, output_tokens: 200 },
    last_token_usage: { total_tokens: 2000 }, model_context_window: 1000,
  }, rate_limits: { plan_type: "<script>", primary: { used_percent: "61", window_minutes: 300, resets_at: 1 } } });
  await fs.appendFile(filename, `${numeric}\n`);
  const validated = await reader.read(threadId);
  assert.equal(validated.contextRemainingPercent, 0);
  assert.equal(validated.cachedInputTokens, 0);
  assert.equal(validated.primary, null);
  assert.equal(validated.planType, null);
  assert.equal(Object.hasOwn(validated, "payload"), false);
  await fs.appendFile(filename, `${usage(1200, { info: {
    total_token_usage: { total_tokens: 1200, input_tokens: 1000, cached_input_tokens: 800, cache_write_input_tokens: 100, output_tokens: 200 },
    last_token_usage: { total_tokens: 250, input_tokens: 200, cached_input_tokens: 120, cache_write_input_tokens: 60 },
    model_context_window: 1000,
  } })}\n`);
  const writes = await reader.read(threadId);
  assert.equal(writes.cacheWriteInputTokens, 100);
  assert.equal(writes.lastInputTokens, 200);
  assert.equal(writes.lastCachedInputTokens, 120);
  assert.equal(writes.lastCacheWriteInputTokens, 60);
  now += 10 * 86400000;
  const expired = await reader.read(threadId);
  assert.equal(expired.primary, null, "Unchanged files must not keep quota percentages after their reset.");
  assert.equal(expired.secondary, null);
  assert.equal(expired.planType, "prolite");

  const notifications = [];
  const watched = reader.watch(threadId, value => notifications.push(value));
  try {
    await watched.refresh(true);
    const initialCount = notifications.length;
    await fs.writeFile(path.join(directory, "unrelated.jsonl"), `${usage(9999)}\n`);
    await delay(60);
    assert.equal(notifications.length, initialCount, "Only the exact thread file may notify");
    const appendedAt = performance.now();
    await fs.appendFile(filename, `${usage(2200)}\n`);
    await until(() => notifications.at(-1)?.totalTokens === 2200);
    const deliveryMs = performance.now() - appendedAt;
    assert.ok(deliveryMs < 500, "Append delivery must stay in milliseconds, not the old 2.4-second poll");
    console.log(`PASS: exact-thread append delivered in ${deliveryMs.toFixed(1)} ms.`);
    const afterAppend = notifications.length;
    await fs.appendFile(filename, '{"type":"event_msg","payload":{"type":"other"}}\n');
    await delay(60);
    assert.equal(notifications.length, afterAppend, "Non-usage streaming events must not push identical snapshots");
    await fs.unlink(filename);
    await until(() => notifications.at(-1) === null);
    await fs.writeFile(filename, `${usage(2400)}\n`);
    await until(() => notifications.at(-1)?.totalTokens === 2400);
    watched.close();
    const afterClose = notifications.length;
    await fs.appendFile(filename, `${usage(2600)}\n`);
    await delay(80);
    assert.equal(notifications.length, afterClose, "Closing a subscription cancels further pushes");
  } finally { watched.close(); }

  class SerialReader extends TokenUsageReader {
    activeReads = 0;
    maxReads = 0;
    async readSession(id) {
      this.activeReads += 1;
      this.maxReads = Math.max(this.maxReads, this.activeReads);
      try { await delay(5); return await super.readSession(id); }
      finally { this.activeReads -= 1; }
    }
  }
  const serial = new SerialReader({ codexHome: root, now: () => now });
  const parallel = await Promise.all(Array.from({ length: 6 }, () => serial.read(threadId)));
  assert.equal(serial.maxReads, 1, "Multiple renderer subscriptions must never parse one file concurrently");
  assert.ok(parallel.every(value => value.totalTokens === 2600));

  console.log("PASS: Token overlay reads bounded, incremental usage for the exact local thread.");
} finally {
  assert.ok(!path.relative(build, root).startsWith("..") && !path.isAbsolute(path.relative(build, root)));
  await fs.rm(root, { recursive: true, force: true });
}
