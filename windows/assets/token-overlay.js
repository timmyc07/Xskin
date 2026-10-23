(function installTokenOverlay() {
  const state = window.__CODEX_DREAM_SKIN_STATE__;
  state?.usageOverlay?.dispose();
  if (state?.surface !== "codex") return false;

  const ID = "codex-dream-skin-usage";
  let installation = window.crypto.randomUUID();
  const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  const conversationPattern = new RegExp(`^${UUID}$`, "i");
  const chinese = /^zh\b/i.test(document.documentElement.lang);
  const labels = chinese
    ? { total: "Token", cache: "快取", context: "上下文剩餘", quota: "額度剩餘", plan: "方案", input: "輸入", output: "輸出", stale: "資料暫不可用", cacheNote: "快取包含在輸入內", minute: "分", hour: "時", day: "天",
      hit: "最近快取", hitDescription: "最近一次輸入的快取命中率", write: "快取寫入", totalWrite: "累計快取寫入", sampled: "Token 事件更新", retention: "服務端快取保存量與保留期限未提供",
      notProvided: "未提供", unconfirmed: "未確認", planNote: "方案採用此對話最近一次回報，可能不是即時帳戶狀態", writeNote: "快取寫入是來源回報的 token 數，並非檔案或磁碟寫入量", zeroWrite: "來源值為 0；該欄位可能使用來源預設值，實際快取寫入量未確認",
      waiting: "等待本機用量記錄", running: "任務執行中", disconnected: "用量連線暫時中斷，正在重新連接" }
    : { total: "Tokens", cache: "Cached", context: "Context left", quota: "Quota left", plan: "Plan", input: "Input", output: "Output", stale: "Usage unavailable", cacheNote: "Cached tokens are included in input", minute: "m", hour: "h", day: "d",
      hit: "Recent cache", hitDescription: "Latest input cache hit rate", write: "Cache written", totalWrite: "Total cache written", sampled: "Token event updated", retention: "Server cache inventory and retention are not provided",
      notProvided: "not provided", unconfirmed: "unconfirmed", planNote: "Plan is the latest report in this conversation, not necessarily the current account state", writeNote: "Cache writes are source-reported token counts, not file or disk writes", zeroWrite: "Source value is 0; that field may use a source default, so its actual cache writes are unconfirmed",
      waiting: "Waiting for local usage records", running: "Task running", disconnected: "Usage connection interrupted; reconnecting" };
  const numbers = new Intl.NumberFormat(chinese ? "zh-TW" : "en", { maximumFractionDigits: 0 });
  const compactNumbers = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
  const dates = new Intl.DateTimeFormat(chinese ? "zh-TW" : "en", { dateStyle: "short", timeStyle: "short" });
  const count = value => Number.isFinite(value) && value >= 0 ? numbers.format(value) : "—";
  const compact = value => Number.isFinite(value) && value >= 10000 ? compactNumbers.format(value) : count(value);
  const percent = value => Number.isFinite(value) && value >= 0 && value <= 100 ? `${Math.round(value * 10) / 10}%` : "—";
  const date = value => Number.isFinite(value) && value >= 0 && value <= 8.64e15 ? dates.format(value) : "—";
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let row = null;
  let text = null;
  let cacheBar = null;
  let cacheFill = null;
  let cacheText = null;
  let threadId;
  let snapshot = null;
  let lastReceivedAt = null;
  let disposed = false;
  let rate = 0;
  let staleTimer = null;
  let disconnected = false;
  let clockOffset = Date.now() - performance.now();

  const clearData = () => {
    clearTimeout(staleTimer);
    staleTimer = null;
    snapshot = null;
    lastReceivedAt = null;
    rate = 0;
    disconnected = false;
  };
  const receiveHeartbeat = () => {
    disconnected = false;
    lastReceivedAt = Date.now();
    clearTimeout(staleTimer);
    staleTimer = setTimeout(() => { clearData(); disconnected = true; render(); }, 15000);
  };
  const paintMotion = () => {
    if (!row) return;
    const spinning = snapshot?.running === true && !document.hidden && !motion.matches;
    if (row.dataset.spinning !== String(spinning)) row.dataset.spinning = String(spinning);
    const period = `${Math.max(0.16, 2 / Math.sqrt(1 + rate / 20)).toFixed(3)}s`;
    if (row.style.getPropertyValue("--dream-skin-fan-period") !== period) row.style.setProperty("--dream-skin-fan-period", period);
  };
  const windowLabel = quota => {
    const minutes = quota?.windowMinutes;
    if (!Number.isFinite(minutes) || minutes <= 0) return labels.quota;
    const duration = minutes % 1440 === 0 ? `${minutes / 1440}${labels.day}`
      : minutes % 60 === 0 ? `${minutes / 60}${labels.hour}` : `${minutes}${labels.minute}`;
    return `${duration} ${labels.quota}`;
  };
  const render = () => {
    if (!row) return;
    const available = [snapshot?.totalTokens, snapshot?.cachedInputTokens].some(value => Number.isFinite(value) && value >= 0) ||
      [snapshot?.contextRemainingPercent, snapshot?.primary?.remainingPercent, snapshot?.secondary?.remainingPercent]
        .some(value => Number.isFinite(value) && value >= 0 && value <= 100) ||
      (typeof snapshot?.planType === "string" && snapshot.planType.length > 0);
    const parts = [
      `${labels.total} ${compact(snapshot?.totalTokens)}`,
      `${labels.cache} ${compact(snapshot?.cachedInputTokens)}`,
      `${labels.context} ${percent(snapshot?.contextRemainingPercent)}`,
      `${windowLabel(snapshot?.primary)} ${percent(snapshot?.primary?.remainingPercent)}`,
    ];
    if (snapshot?.secondary) parts.push(`${windowLabel(snapshot.secondary)} ${percent(snapshot.secondary.remainingPercent)}`);
    parts.push(`${labels.plan} ${typeof snapshot?.planType === "string" && snapshot.planType ? snapshot.planType : labels.notProvided}`);
    const value = available ? parts.join(" · ") : disconnected ? labels.disconnected
      : `${snapshot?.running ? `${labels.running} · ` : ""}${labels.waiting}`;
    if (text.textContent !== value) text.textContent = value;
    const sampledAt = Number.isFinite(snapshot?.totalTokens) ? snapshot.sampledAt : null;
    const title = (available
      ? `${labels.total} ${count(snapshot.totalTokens)} · ${labels.input} ${count(snapshot.inputTokens)} · ${labels.output} ${count(snapshot.outputTokens)} · ${labels.cache} ${count(snapshot.cachedInputTokens)} · ${labels.cacheNote}\n${labels.sampled} ${date(sampledAt)}`
      : value
    ) + `\n${labels.planNote}\n${labels.retention}`;
    if (row.title !== title) row.title = title;
    const input = snapshot?.lastInputTokens;
    const cached = snapshot?.lastCachedInputTokens;
    const hit = Number.isFinite(input) && input > 0 && Number.isFinite(cached) && cached >= 0 && cached <= input
      ? cached / input * 100 : null;
    if (cacheBar.dataset.available !== String(hit !== null)) cacheBar.dataset.available = String(hit !== null);
    const hitText = hit === null ? labels.stale : percent(hit);
    if (cacheBar.getAttribute("aria-valuetext") !== hitText) cacheBar.setAttribute("aria-valuetext", hitText);
    const hitNow = hit === null ? null : String(Math.round(hit * 10) / 10);
    if (cacheBar.getAttribute("aria-valuenow") !== hitNow) {
      if (hitNow === null) cacheBar.removeAttribute("aria-valuenow");
      else cacheBar.setAttribute("aria-valuenow", hitNow);
    }
    const scale = `scaleX(${hit === null ? 0 : hit / 100})`;
    if (cacheFill.style.getPropertyValue("transform") !== scale) cacheFill.style.setProperty("transform", scale);
    const write = snapshot?.lastCacheWriteInputTokens;
    const totalWrite = snapshot?.cacheWriteInputTokens;
    const writeLabel = Number.isFinite(write) && write > 0 ? `${labels.write} ${compact(write)}`
      : Number.isFinite(totalWrite) && totalWrite > 0 ? `${labels.totalWrite} ${compact(totalWrite)}`
      : write === 0 || totalWrite === 0 ? `${labels.write} ${labels.unconfirmed}` : "";
    const cacheValue = `${labels.hit} ${percent(hit)}${writeLabel ? ` · ${writeLabel}` : ""}`;
    if (cacheText.textContent !== cacheValue) cacheText.textContent = cacheValue;
    const cacheTitle = `${labels.hitDescription} · ${labels.input} ${count(input)} · ${labels.cache} ${count(cached)}\n${labels.write} ${count(write)} · ${labels.totalWrite} ${count(totalWrite)}\n${labels.writeNote}${write === 0 || totalWrite === 0 ? `\n${labels.zeroWrite}` : ""}\n${labels.sampled} ${date(sampledAt)}\n${labels.retention}`;
    if (cacheBar.parentElement.title !== cacheTitle) cacheBar.parentElement.title = cacheTitle;
    cacheBar.parentElement.style.setProperty("display", available ? "" : "none");
    row.dataset.usageState = available ? "ready" : disconnected ? "reconnecting" : "waiting";
    if (row.dataset.stale !== String(!snapshot)) row.dataset.stale = String(!snapshot);
    paintMotion();
  };
  const fiberRoot = fiber => {
    for (let depth = 0; fiber && depth < 512; depth++, fiber = fiber.return) {
      if (!fiber.return) return fiber.tag === 3 ? fiber : null;
    }
    return null;
  };
  const conversationIdentity = node => {
    // shortcut: host identity uses renderer metadata; recheck after Codex changes its composer owner props.
    const key = Object.keys(node).find(name => name.startsWith("__reactFiber$"));
    let fiber = node[key];
    const root = fiberRoot(fiber);
    const current = root?.stateNode?.current;
    if (!current) return null;
    if (root !== current) fiber = fiber?.alternate;
    if (fiberRoot(fiber) !== current) return null;
    let conversationId = null;
    for (let depth = 0; fiber && depth < 100; depth++, fiber = fiber.return) {
      const props = fiber.memoizedProps;
      if (typeof props?.conversationId === "string") {
        if (!conversationPattern.test(props.conversationId)) return null;
        const id = props.conversationId.toLowerCase();
        conversationId ??= id;
        if (Object.hasOwn(props, "hostId")) return props.hostId === "local" && id === conversationId ? id : null;
      }
    }
    return null;
  };
  const request = () => {
    if (disposed) return { threadId: null, visible: false };
    let changed = false;
    const composers = [...document.querySelectorAll("[data-composer-body]")].filter(node =>
      !node.closest('[data-app-shell-active-page="false"]') && node.checkVisibility({ visibilityProperty: true, opacityProperty: true }));
    const composer = composers.length === 1 ? composers[0] : null;
    const current = composer ? conversationIdentity(composer) : null;
    if (current !== threadId) {
      threadId = current;
      clearData();
      changed = true;
    }
    // Keep the added height within the composer's layout container.
    const anchor = composer;
    if (!anchor || !threadId) {
      row?.remove();
      row = text = cacheBar = cacheFill = cacheText = null;
      clearData();
      return { threadId, visible: false, installation };
    }
    if (!row) {
      changed = true;
      installation = window.crypto.randomUUID();
      row = document.createElement("div");
      row.id = ID;
      row.className = "dream-skin-usage";
      const fan = document.createElement("span");
      fan.className = "dream-skin-usage-fan";
      fan.setAttribute("aria-hidden", "true");
      fan.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 10c-7-7-4-10 0-9 4 1 5 5 1 9Zm2 2c7-7 10-4 9 0-1 4-5 5-9 1Zm-2 2c7 7 4 10 0 9-4-1-5-5-1-9Zm-2-2C3 19 0 16 1 12s5-5 9-1Z"/><circle cx="12" cy="12" r="2"/></svg>';
      text = document.createElement("span");
      text.className = "dream-skin-usage-totals";
      const cache = document.createElement("span");
      cache.className = "dream-skin-usage-cache";
      cacheBar = document.createElement("span");
      cacheBar.className = "dream-skin-usage-cache-bar";
      cacheBar.setAttribute("role", "progressbar");
      cacheBar.setAttribute("aria-label", labels.hitDescription);
      cacheBar.setAttribute("aria-valuemin", "0");
      cacheBar.setAttribute("aria-valuemax", "100");
      cacheFill = document.createElement("span");
      cacheBar.append(cacheFill);
      cacheText = document.createElement("span");
      cache.append(cacheBar, cacheText);
      row.append(fan, text, cache);
    }
    if (anchor.previousElementSibling !== row) anchor.insertAdjacentElement("beforebegin", row);
    if (changed) render();
    else paintMotion();
    return { threadId, visible: !document.hidden, installation };
  };
  const update = next => {
    request();
    if (disposed || !row) return false;
    const elapsed = performance.now();
    clockOffset = Math.max(clockOffset, Date.now() - elapsed);
    if (next === null) {
      clearData();
      receiveHeartbeat();
      render();
      return true;
    }
    if (!next || next.threadId !== threadId || !Number.isFinite(next.sampledAt) ||
      next.sampledAt > clockOffset + elapsed + 5000 ||
      (Number.isFinite(snapshot?.totalTokens) && next.sampledAt < snapshot.sampledAt)) return false;
    if (snapshot?.running && next.running && next.sampledAt > snapshot.sampledAt &&
      Number.isFinite(next.totalTokens) && Number.isFinite(snapshot.totalTokens) &&
      next.totalTokens > snapshot.totalTokens) {
      rate = (next.totalTokens - snapshot.totalTokens) / ((next.sampledAt - snapshot.sampledAt) / 1000);
    } else if (!next.running || !snapshot?.running || !Number.isFinite(next.totalTokens) || next.totalTokens < snapshot.totalTokens) {
      rate = 0;
    }
    snapshot = next;
    receiveHeartbeat();
    render();
    return true;
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clearData();
    row?.remove();
    row = text = cacheBar = cacheFill = cacheText = null;
    document.removeEventListener("visibilitychange", visibilityChange);
    motion.removeEventListener("change", paintMotion);
  };
  state.usageOverlay = {
    request, update, dispose,
    status: () => ({ threadId, mounted: Boolean(row?.isConnected), stale: !snapshot, tokensPerSecond: rate,
      availability: row?.dataset.usageState ?? "hidden",
      spinning: row?.dataset.spinning === "true", sampledAt: snapshot?.sampledAt ?? null, lastReceivedAt }),
  };
  // Hidden pages unsubscribe; returning waits for a real host heartbeat.
  const visibilityChange = () => {
    if (document.hidden) { clearData(); render(); }
    request();
  };
  document.addEventListener("visibilitychange", visibilityChange);
  motion.addEventListener("change", paintMotion);
  request();
  return true;
})
