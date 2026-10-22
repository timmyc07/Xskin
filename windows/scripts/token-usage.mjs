import fs from "node:fs/promises";
import { watch } from "node:fs";
import os from "node:os";
import path from "node:path";

const THREAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SESSION_FILE = /^rollout-.*-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i;
const MAX_READ_BYTES = 1024 * 1024;
const DISCOVERY_DELAY_MS = 5000;
const count = value => Number.isSafeInteger(value) && value >= 0;
const percent = value => Math.max(0, Math.min(100, value));
const snapshot = (threadId, record, now) => record?.usage || Number.isFinite(record?.activityAt) ? {
  threadId, ...record.usage,
  primary: record.primary?.resetsAt * 1000 > now ? record.primary : null,
  secondary: record.secondary?.resetsAt * 1000 > now ? record.secondary : null,
  planType: record.planType, sampledAt: record.sampledAt ?? record.activityAt, running: record.running,
} : null;

function limitWindow(value) {
  if (!value || typeof value.used_percent !== "number" || !Number.isFinite(value.used_percent) ||
    !count(value.window_minutes) || !count(value.resets_at)) return null;
  return {
    remainingPercent: percent(100 - value.used_percent),
    windowMinutes: value.window_minutes,
    resetsAt: value.resets_at,
  };
}

function readEvent(line, record, now) {
  if (!/"(?:token_count|task_started|task_complete|turn_aborted)"/.test(line)) return;
  let event;
  try { event = JSON.parse(line); } catch { return; }
  if (event.type !== "event_msg") return;
  if (["task_started", "task_complete", "turn_aborted"].includes(event.payload?.type)) {
    record.running = event.payload.type === "task_started";
    const timestamp = Date.parse(event.timestamp);
    record.activityAt = Number.isFinite(timestamp) ? timestamp : now;
    return;
  }
  if (event.payload?.type !== "token_count") return;
  const { info, rate_limits: limits } = event.payload;
  const totals = info?.total_token_usage;
  if (totals && [totals.total_tokens, totals.input_tokens, totals.cached_input_tokens,
    totals.output_tokens].every(count) && totals.cached_input_tokens <= totals.input_tokens) {
    const context = info.last_token_usage?.total_tokens;
    const window = info.model_context_window;
    record.usage = {
      totalTokens: totals.total_tokens,
      inputTokens: totals.input_tokens,
      cachedInputTokens: totals.cached_input_tokens,
      outputTokens: totals.output_tokens,
      cacheWriteInputTokens: count(totals.cache_write_input_tokens) && totals.cache_write_input_tokens <= totals.input_tokens
        ? totals.cache_write_input_tokens : null,
      lastInputTokens: count(info.last_token_usage?.input_tokens) ? info.last_token_usage.input_tokens : null,
      lastCachedInputTokens: count(info.last_token_usage?.input_tokens) && count(info.last_token_usage?.cached_input_tokens) &&
        info.last_token_usage.cached_input_tokens <= info.last_token_usage.input_tokens ? info.last_token_usage.cached_input_tokens : null,
      lastCacheWriteInputTokens: count(info.last_token_usage?.input_tokens) && count(info.last_token_usage?.cache_write_input_tokens) &&
        info.last_token_usage.cache_write_input_tokens <= info.last_token_usage.input_tokens ? info.last_token_usage.cache_write_input_tokens : null,
      contextRemainingPercent: count(context) && count(window) && window > 0
        ? percent(100 - context / window * 100) : null,
    };
    const timestamp = Date.parse(event.timestamp);
    record.sampledAt = Number.isFinite(timestamp) ? timestamp : now;
  }
  if (limits && typeof limits === "object" && !Array.isArray(limits)) {
    record.primary = limitWindow(limits.primary);
    record.secondary = limitWindow(limits.secondary);
    record.planType = typeof limits.plan_type === "string" && /^[a-z][a-z0-9_-]{0,39}$/i.test(limits.plan_type)
      ? limits.plan_type : null;
  }
}

async function readEarlierActivity(handle, end, minimum, completeFirstLine, record, now) {
  let pending = Buffer.alloc(0);
  let discard = true;
  const accept = bytes => {
    if (bytes.length > MAX_READ_BYTES) return false;
    const line = bytes.toString("utf8");
    if (!/"type"\s*:\s*"(?:task_started|task_complete|turn_aborted)"/.test(line)) return false;
    const activity = { activityAt: null };
    readEvent(line, activity, now);
    if (activity.activityAt === null) return false;
    record.running = activity.running;
    record.activityAt = activity.activityAt;
    return true;
  };
  while (end > minimum) {
    const start = Math.max(minimum, end - MAX_READ_BYTES);
    const bytes = Buffer.alloc(end - start);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, start);
    if (!bytesRead) return;
    const data = Buffer.concat([bytes.subarray(0, bytesRead), pending]);
    let lineEnd = data.length;
    for (let newline = data.lastIndexOf(10); newline !== -1;
      newline = lineEnd > 0 ? data.lastIndexOf(10, lineEnd - 1) : -1) {
      if (!discard && accept(data.subarray(newline + 1, lineEnd))) return;
      discard = false;
      lineEnd = newline;
    }
    if (start === minimum && completeFirstLine && !discard && accept(data.subarray(0, lineEnd))) return;
    discard ||= lineEnd > MAX_READ_BYTES;
    pending = discard ? Buffer.alloc(0) : Buffer.from(data.subarray(0, lineEnd));
    end = start;
  }
}

export class TokenUsageReader {
  constructor({ codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), now = Date.now } = {}) {
    this.sessionsRoot = path.resolve(codexHome, "sessions");
    this.now = now;
    this.index = new Map();
    this.misses = new Map();
    this.records = new Map();
    this.reads = new Map();
    this.indexed = false;
  }

  async indexDirectory(directory, recursive = false) {
    let entries;
    try { entries = await fs.readdir(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory() && recursive && /^\d{2,4}$/.test(entry.name)) {
        await this.indexDirectory(filename, true);
      } else if (entry.isFile()) {
        const match = entry.name.match(SESSION_FILE);
        if (match) this.index.set(match[1].toLowerCase(), filename);
      }
    }
  }

  async findSession(threadId) {
    if (this.index.has(threadId)) return this.index.get(threadId);
    if ((this.misses.get(threadId) ?? 0) > this.now()) return null;
    const dates = new Set();
    const createdAt = threadId[14] === "7" ? Number.parseInt(threadId.replaceAll("-", "").slice(0, 12), 16) : this.now();
    for (const timestamp of [createdAt, this.now()]) {
      for (const offset of [-86400000, 0, 86400000]) {
        dates.add(new Date(timestamp + offset).toISOString().slice(0, 10).replaceAll("-", path.sep));
      }
    }
    for (const date of dates) {
      await this.indexDirectory(path.join(this.sessionsRoot, date));
      if (this.index.has(threadId)) return this.index.get(threadId);
    }
    if (!this.indexed) {
      this.indexed = true;
      await this.indexDirectory(this.sessionsRoot, true);
      if (this.index.has(threadId)) return this.index.get(threadId);
    }
    this.misses.set(threadId, this.now() + DISCOVERY_DELAY_MS);
    while (this.misses.size > 32) this.misses.delete(this.misses.keys().next().value);
    return null;
  }

  async read(threadId) {
    if (typeof threadId !== "string" || !THREAD_ID.test(threadId)) return null;
    threadId = threadId.toLowerCase();
    const pending = (this.reads.get(threadId) ?? Promise.resolve()).then(() => this.readSession(threadId));
    this.reads.set(threadId, pending);
    try { return await pending; }
    finally { if (this.reads.get(threadId) === pending) this.reads.delete(threadId); }
  }

  watch(threadId, onSnapshot) {
    let closed = false;
    let watcher = null;
    let watchedPath = null;
    let timer = null;
    let running = null;
    let queued = false;
    let heartbeat = false;
    let previous;
    const schedule = () => {
      if (closed || timer) return;
      timer = setTimeout(() => {
        timer = null;
        refresh().catch(() => {});
      }, 20);
    };
    const refresh = (force = false) => {
      if (closed) return Promise.resolve();
      queued = true;
      heartbeat ||= force;
      if (running) return running;
      running = (async () => {
        while (queued && !closed) {
          queued = false;
          const forceSend = heartbeat;
          heartbeat = false;
          const filename = typeof threadId === "string" && THREAD_ID.test(threadId)
            ? await this.findSession(threadId.toLowerCase()) : null;
          if (closed) break;
          const target = filename ?? this.sessionsRoot;
          if (typeof threadId === "string" && THREAD_ID.test(threadId) && (!watcher || watchedPath !== target)) {
            watcher?.close();
            watchedPath = target;
            try {
              // Discover the exact new file, then watch its directory so replacement keeps the subscription.
              const activeWatcher = watch(filename ? path.dirname(filename) : target, { recursive: !filename }, (_event, changed) => {
                const name = changed ? path.basename(String(changed)) : null;
                if (!name || (filename ? name === path.basename(filename) : name.match(SESSION_FILE)?.[1]?.toLowerCase() === threadId.toLowerCase())) {
                  this.misses.delete(threadId.toLowerCase());
                  schedule();
                }
              });
              watcher = activeWatcher;
              if (!filename) this.misses.delete(threadId.toLowerCase());
              activeWatcher.on("error", () => {
                activeWatcher.close();
                if (watcher === activeWatcher) { watcher = null; schedule(); }
              });
            } catch { watcher = null; }
          }
          const next = await this.read(threadId);
          if (closed) break;
          const serialized = JSON.stringify(next);
          if (forceSend || serialized !== previous) {
            previous = serialized;
            await onSnapshot(next);
          }
        }
      })().finally(() => { running = null; });
      return running;
    };
    return {
      refresh,
      close() {
        closed = true;
        clearTimeout(timer);
        watcher?.close();
        watcher = null;
      },
    };
  }

  async readSession(threadId) {
    const filename = await this.findSession(threadId);
    if (!filename) return null;
    let handle;
    try {
      const metadata = await fs.lstat(filename);
      if (!metadata.isFile()) return null;
      let record = this.records.get(threadId);
      const unchanged = `${metadata.dev}:${metadata.ino}:${metadata.birthtimeMs}` === record?.identity &&
        metadata.size === record.offset && metadata.mtimeMs === record.mtimeMs && metadata.ctimeMs === record.ctimeMs;
      if (unchanged) return snapshot(threadId, record, this.now());
      const actualPath = await fs.realpath(filename);
      const actualRoot = await fs.realpath(this.sessionsRoot);
      const relative = path.relative(actualRoot, actualPath);
      if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
      handle = await fs.open(filename, "r");
      const stat = await handle.stat();
      const identity = `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
      if (!record || record.identity !== identity || stat.size < record.offset ||
        (stat.size === record.offset && (stat.mtimeMs !== record.mtimeMs || stat.ctimeMs !== record.ctimeMs))) {
        record = { identity, offset: 0, pending: Buffer.alloc(0), skipFirst: false, usage: null,
          primary: null, secondary: null, planType: null, sampledAt: null, running: false, activityAt: null };
        this.records.set(threadId, record);
        while (this.records.size > 16) this.records.delete(this.records.keys().next().value);
      }
      if (stat.size > record.offset) {
        let recoveryStart = null;
        const completeFirstLine = !record.skipFirst;
        const previousActivityAt = record.activityAt;
        if (stat.size - record.offset > MAX_READ_BYTES) {
          // shortcut: attach reads the last 1 MiB; wait for a new event if no usage fits in that tail.
          recoveryStart = record.offset - record.pending.length;
          record.offset = stat.size - MAX_READ_BYTES;
          record.pending = Buffer.alloc(0);
          record.skipFirst = true;
        }
        const bytes = Buffer.alloc(stat.size - record.offset);
        const { bytesRead } = await handle.read(bytes, 0, bytes.length, record.offset);
        record.offset += bytesRead;
        const data = Buffer.concat([record.pending, bytes.subarray(0, bytesRead)]);
        let start = 0;
        for (let end = data.indexOf(10); end !== -1; end = data.indexOf(10, start)) {
          if (record.skipFirst) record.skipFirst = false;
          else if (end - start <= MAX_READ_BYTES) readEvent(data.subarray(start, end).toString("utf8"), record, this.now());
          start = end + 1;
        }
        record.pending = Buffer.from(data.subarray(start));
        if (record.pending.length > MAX_READ_BYTES) {
          record.pending = Buffer.alloc(0);
          record.skipFirst = true;
        }
        // Recover skipped lifecycle events without revisiting previously parsed history.
        if (recoveryStart !== null && record.activityAt === previousActivityAt) {
          await readEarlierActivity(handle, stat.size, recoveryStart, completeFirstLine, record, this.now());
        }
      }
      record.mtimeMs = stat.mtimeMs;
      record.ctimeMs = stat.ctimeMs;
      return snapshot(threadId, record, this.now());
    } catch {
      this.records.delete(threadId);
      this.index.delete(threadId);
      return null;
    } finally {
      await handle?.close().catch(() => {});
    }
  }
}
