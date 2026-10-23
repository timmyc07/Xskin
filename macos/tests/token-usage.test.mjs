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
const lifecycle = type => JSON.stringify({ timestamp: "2026-10-22T08:55:00Z", type: "event_msg", payload: { type } });
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
    planType: "prolite", sampledAt: now, running: false,
  });
  assert.deepEqual(await reader.read(threadId), first, "Unchanged snapshots must not add tokens or resample time.");

  await fs.appendFile(filename, `${lifecycle("task_started")}\n`);
  const running = await reader.read(threadId);
  assert.equal(running.running, true, "A task starts before its next token event");
  assert.equal(running.sampledAt, first.sampledAt, "Lifecycle notifications do not invent token samples");
  await fs.appendFile(filename, `${lifecycle("task_complete")}\n`);
  assert.equal((await reader.read(threadId)).running, false);
  await fs.appendFile(filename, `${lifecycle("task_started")}\n${lifecycle("turn_aborted")}\n`);
  assert.equal((await reader.read(threadId)).running, false, "An interrupted task stops immediately");

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

  const newThreadId = "01a162d1-2222-7222-8222-222222222222";
  const newFilename = path.join(directory, `rollout-new-${newThreadId}.jsonl`);
  const discovered = [];
  const newTask = reader.watch(newThreadId, value => discovered.push(value));
  try {
    await newTask.refresh(true);
    assert.equal(discovered.at(-1), null);
    const createdAt = performance.now();
    await fs.writeFile(newFilename, `${lifecycle("task_started")}\n`);
    await until(() => discovered.at(-1)?.running === true);
    assert.ok(performance.now() - createdAt < 500, "New tasks must not wait for the five-second discovery heartbeat");
    assert.equal(discovered.at(-1).totalTokens, undefined, "Task activity can arrive before the first usage event");
    await fs.appendFile(newFilename, `${usage(2800)}\n`);
    await until(() => discovered.at(-1)?.totalTokens === 2800);
    assert.equal(discovered.at(-1).running, true);
    await fs.appendFile(newFilename, `${lifecycle("task_complete")}\n`);
    await until(() => discovered.at(-1)?.running === false);
  } finally { newTask.close(); }

  const racingId = "01a162d1-3333-7333-8333-333333333333";
  class RacingDiscoveryReader extends TokenUsageReader {
    async findSession(id) {
      const found = await super.findSession(id);
      if (!this.created) {
        this.created = true;
        await fs.writeFile(path.join(directory, `rollout-racing-${id}.jsonl`), `${usage(2900)}\n`);
      }
      return found;
    }
  }
  const racingReader = new RacingDiscoveryReader({ codexHome: root, now: () => now });
  let racingSnapshot;
  const racing = racingReader.watch(racingId, value => { racingSnapshot = value; });
  try {
    await racing.refresh(true);
    assert.equal(racingSnapshot?.totalTokens, 2900, "A session created between discovery and watch attachment is read immediately");
  } finally { racing.close(); }

  const historyId = "01a162d1-4444-7444-8444-444444444444";
  const historyFile = path.join(directory, `rollout-history-${historyId}.jsonl`);
  const toolOutput = `${JSON.stringify({ type: "response_item", payload: { type: "function_call_output",
    output: "x".repeat(2 * 1024 * 1024) } })}\n`;
  const historyReader = new TokenUsageReader({ codexHome: root, now: () => now });
  const originalOpen = fs.open;
  let maximumRead = 0;
  let readBytes = 0;
  fs.open = async (...arguments_) => {
    const handle = await originalOpen(...arguments_);
    const read = handle.read.bind(handle);
    handle.read = (buffer, offset, length, position) => {
      maximumRead = Math.max(maximumRead, length);
      readBytes += length;
      return read(buffer, offset, length, position);
    };
    return handle;
  };
  try {
    await fs.writeFile(historyFile, `${usage(3050)}\n${toolOutput}${lifecycle("task_started")}\n`);
    const reopeningReader = new TokenUsageReader({ codexHome: root, now: () => now });
    const beforeUsageTail = await reopeningReader.read(historyId);
    assert.equal(beforeUsageTail?.totalTokens, 3050,
      "Reopening a long task recovers usage before the 1 MiB tool-output tail without waiting for another token event");
    assert.equal(beforeUsageTail.running, true, "Older usage must not overwrite the current lifecycle");
    const recoveredBytes = readBytes;
    assert.deepEqual(await reopeningReader.read(historyId), beforeUsageTail);
    assert.equal(readBytes, recoveredBytes, "A recovered idle session does not rescan history at each heartbeat");
    await fs.appendFile(historyFile, `${usage(3075)}\n${toolOutput}${lifecycle("task_complete")}\n`);
    const afterLongAppend = await reopeningReader.read(historyId);
    assert.equal(afterLongAppend.totalTokens, 3075, "Large appends recover newer usage even when it precedes the tail");
    assert.equal(afterLongAppend.running, false);
    await fs.appendFile(historyFile, `${usage(3075, { info: null, rate_limits: {
      plan_type: "pro", primary: null, secondary: null,
    } })}\n${toolOutput}${lifecycle("task_started")}\n`);
    const afterLimitAppend = await reopeningReader.read(historyId);
    assert.equal(afterLimitAppend.totalTokens, 3075, "A rate-only append retains known totals");
    assert.equal(afterLimitAppend.planType, "pro");
    assert.equal(afterLimitAppend.primary, null, "An explicit newer quota clear is not replaced by older limits");
    assert.equal(afterLimitAppend.running, true);
    const nonEvent = `${JSON.stringify({ type: "response_item", payload: { type: "task_complete" } })}\n`;
    await fs.writeFile(historyFile, `${lifecycle("task_started")}\n${toolOutput}${nonEvent}${usage(3100)}\n`);
    const activeHistory = await historyReader.read(historyId);
    assert.equal(activeHistory.running, true, "A task start beyond the initial 1 MiB usage tail is recovered");
    assert.equal(activeHistory.totalTokens, 3100, "Backward activity discovery preserves the latest usage totals");
    const afterBootstrap = readBytes;
    assert.deepEqual(await historyReader.read(historyId), activeHistory);
    assert.equal(readBytes, afterBootstrap, "An unchanged session does not repeat backward discovery");
    await fs.appendFile(historyFile, `${lifecycle("task_complete")}\n${toolOutput}${usage(3200)}\n`);
    assert.equal((await historyReader.read(historyId)).running, false, "The newest completed marker wins across skipped output chunks");
    await fs.appendFile(historyFile, `${lifecycle("task_started")}\n${toolOutput}${lifecycle("turn_aborted")}\n${toolOutput}${usage(3300)}\n`);
    const aborted = await historyReader.read(historyId);
    assert.equal(aborted.running, false, "Backward discovery stops at an abort before reaching an earlier start");
    assert.equal(aborted.totalTokens, 3300);
    assert.ok(maximumRead <= 1024 * 1024, "Lifecycle recovery never increases the per-read memory bound");
    const beforeIncrement = readBytes;
    await fs.appendFile(historyFile, `${lifecycle("task_started")}\n`);
    assert.equal((await historyReader.read(historyId)).running, true);
    assert.ok(readBytes - beforeIncrement < 1024, "Normal incremental updates do not scan history");
    const boundaryStart = `${lifecycle("task_started")}\n`;
    const boundaryUsage = `${usage(3400)}\n`;
    const boundaryOutput = "x".repeat(1024 * 1024 - Math.floor(boundaryStart.length / 2) - boundaryUsage.length - 1);
    await fs.writeFile(historyFile, `${boundaryStart}${boundaryOutput}\n${boundaryUsage}`);
    assert.equal((await historyReader.read(historyId)).running, true, "A lifecycle line split between reverse-read chunks is reconstructed");

    const partialStart = `${lifecycle("task_started")}\n`;
    const split = Math.floor(partialStart.length / 2);
    await fs.writeFile(historyFile, `${usage(3500)}\n${partialStart.slice(0, split)}`);
    assert.equal((await historyReader.read(historyId)).running, false);
    await fs.appendFile(historyFile, `${partialStart.slice(split)}${toolOutput}${usage(3600)}\n`);
    assert.equal((await historyReader.read(historyId)).running, true, "Skipped-region recovery includes a lifecycle line partially read before the append");

    await fs.writeFile(historyFile, `${toolOutput.repeat(3)}${usage(3700)}\n`);
    const markerlessReader = new TokenUsageReader({ codexHome: root, now: () => now });
    assert.equal((await markerlessReader.read(historyId)).running, false, "Markerless historical sessions remain idle");
    for (const total of [3800, 3900]) {
      const appended = `${toolOutput}${usage(total)}\n`;
      const beforeAppend = readBytes;
      await fs.appendFile(historyFile, appended);
      const markerless = await markerlessReader.read(historyId);
      assert.equal(markerless.running, false);
      assert.equal(markerless.totalTokens, total);
      assert.ok(readBytes - beforeAppend <= Buffer.byteLength(appended) + 1024 * 1024,
        "Large appends to markerless sessions read only new bytes plus the usage-tail overlap");
    }
    const shortOutput = JSON.stringify({type:'response_item',payload:{type:'function_call_output',output:'x'.repeat(80)}}) + '\n';
    const denseHistory = `${usage(4000)}\n${lifecycle("task_started")}\n${shortOutput.repeat(20000)}`;
    await fs.writeFile(historyFile, denseHistory);
    const denseReader = new TokenUsageReader({codexHome:root,now:() => now});
    const beforeDense = readBytes;
    const dense = await denseReader.read(historyId);
    assert.equal(dense.totalTokens, 4000);
    assert.equal(dense.running, true);
    console.log(`Dense history: ${Buffer.byteLength(denseHistory)} bytes, ${readBytes - beforeDense} bytes read.`);
    assert.ok(readBytes - beforeDense <= Buffer.byteLength(denseHistory) + 1024,
      "Reverse recovery must not reread the parsed 1 MiB tail; only its first partial line may overlap.");
  } finally { fs.open = originalOpen; }

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
