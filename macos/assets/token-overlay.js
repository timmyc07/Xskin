(function installTokenOverlay() {
  const state = window.__CODEX_DREAM_SKIN_STATE__;
  state?.usageOverlay?.dispose();
  if (state?.surface !== "codex") return false;

  const ID = "codex-dream-skin-usage";
  const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  const threadPattern = new RegExp(`^local:(${UUID})$`, "i");
  const chinese = /^zh\b/i.test(document.documentElement.lang);
  const labels = chinese
    ? { total: "Token", cache: "快取", context: "上下文剩餘", quota: "額度剩餘", plan: "方案", input: "輸入", output: "輸出", stale: "資料暫不可用", cacheNote: "快取包含在輸入內", minute: "分", hour: "時", day: "天",
      hit: "最近快取", hitDescription: "最近一次輸入的快取命中率", write: "寫入", totalWrite: "累計寫入", sampled: "Token 事件更新", retention: "服務端快取保存量與保留期限未提供" }
    : { total: "Tokens", cache: "Cached", context: "Context left", quota: "Quota left", plan: "Plan", input: "Input", output: "Output", stale: "Usage unavailable", cacheNote: "Cached tokens are included in input", minute: "m", hour: "h", day: "d",
      hit: "Recent cache", hitDescription: "Latest input cache hit rate", write: "Written", totalWrite: "Total written", sampled: "Token event updated", retention: "Server cache inventory and retention are not provided" };
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
  let activeUntil = 0;
  let idleTimer = null;
  let staleTimer = null;

  const clearData = () => {
    clearTimeout(idleTimer);
    clearTimeout(staleTimer);
    idleTimer = staleTimer = null;
    snapshot = null;
    lastReceivedAt = null;
    rate = 0;
    activeUntil = 0;
  };
  const paintMotion = () => {
    if (!row) return;
    const spinning = rate > 0 && Date.now() < activeUntil && !document.hidden && !motion.matches;
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
    const parts = [
      `${labels.total} ${compact(snapshot?.totalTokens)}`,
      `${labels.cache} ${compact(snapshot?.cachedInputTokens)}`,
      `${labels.context} ${percent(snapshot?.contextRemainingPercent)}`,
      `${windowLabel(snapshot?.primary)} ${percent(snapshot?.primary?.remainingPercent)}`,
    ];
    if (snapshot?.secondary) parts.push(`${windowLabel(snapshot.secondary)} ${percent(snapshot.secondary.remainingPercent)}`);
    parts.push(`${labels.plan} ${typeof snapshot?.planType === "string" && snapshot.planType ? snapshot.planType : "—"}`);
    const value = parts.join(" · ");
    if (text.textContent !== value) text.textContent = value;
    const title = (snapshot
      ? `${labels.total} ${count(snapshot.totalTokens)} · ${labels.input} ${count(snapshot.inputTokens)} · ${labels.output} ${count(snapshot.outputTokens)} · ${labels.cache} ${count(snapshot.cachedInputTokens)} · ${labels.cacheNote}\n${labels.sampled} ${date(snapshot.sampledAt)}`
      : labels.stale
    ) + `\n${labels.retention}`;
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
    const writeLabel = Number.isFinite(write) && write >= 0 ? `${labels.write} ${compact(write)}`
      : Number.isFinite(totalWrite) && totalWrite >= 0 ? `${labels.totalWrite} ${compact(totalWrite)}` : "";
    const cacheValue = `${labels.hit} ${percent(hit)}${writeLabel ? ` · ${writeLabel}` : ""}`;
    if (cacheText.textContent !== cacheValue) cacheText.textContent = cacheValue;
    const cacheTitle = `${labels.hitDescription} · ${labels.input} ${count(input)} · ${labels.cache} ${count(cached)}\n${labels.write} ${count(write)} · ${labels.totalWrite} ${count(totalWrite)}\n${labels.sampled} ${date(snapshot?.sampledAt)}\n${labels.retention}`;
    if (cacheBar.parentElement.title !== cacheTitle) cacheBar.parentElement.title = cacheTitle;
    if (row.dataset.stale !== String(!snapshot)) row.dataset.stale = String(!snapshot);
    paintMotion();
  };
  const request = () => {
    if (disposed) return { threadId: null, visible: false };
    let changed = false;
    const page = document.querySelector('[data-app-shell-active-page="true"]');
    const home = page?.querySelector('[data-testid="home-icon"], [data-feature="game-source"], [class~="group/home-suggestions"]');
    const selected = document.querySelectorAll('[data-app-action-sidebar-thread-selected="true"][aria-current="page"]');
    const local = selected.length === 1 && selected[0].getAttribute("data-app-action-sidebar-thread-host-id") === "local" &&
      selected[0].getAttribute("data-app-action-sidebar-thread-kind") === "local";
    const current = !home && local
      ? selected[0].getAttribute("data-app-action-sidebar-thread-id")?.match(threadPattern)?.[1]?.toLowerCase() ?? null : null;
    if (current !== threadId) {
      threadId = current;
      clearData();
      changed = true;
    }
    const composer = [...document.querySelectorAll("[data-composer-body]")].find(node =>
      !node.closest('[data-app-shell-active-page="false"]') && node.checkVisibility({ visibilityProperty: true, opacityProperty: true }));
    const anchor = composer?.closest("[data-composer-layout]") ?? composer;
    if (!anchor) {
      row?.remove();
      row = text = cacheBar = cacheFill = cacheText = null;
      return { threadId, visible: false };
    }
    if (!row) {
      changed = true;
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
    if (anchor.nextElementSibling !== row) anchor.insertAdjacentElement("afterend", row);
    if (changed) render();
    else paintMotion();
    return { threadId, visible: !document.hidden, installation: state.installToken };
  };
  const update = next => {
    request();
    if (disposed) return false;
    if (next === null) {
      clearData();
      render();
      return true;
    }
    if (!next || next.threadId !== threadId || !Number.isFinite(next.sampledAt) ||
      next.sampledAt > Date.now() + 5000 || (snapshot && next.sampledAt < snapshot.sampledAt)) return false;
    if (snapshot && next.sampledAt > snapshot.sampledAt && Date.now() - next.sampledAt < 8000 &&
      Number.isFinite(next.totalTokens) && Number.isFinite(snapshot.totalTokens) &&
      next.totalTokens > snapshot.totalTokens) {
      rate = (next.totalTokens - snapshot.totalTokens) / ((next.sampledAt - snapshot.sampledAt) / 1000);
      activeUntil = Date.now() + 8000;
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => { rate = 0; idleTimer = null; paintMotion(); }, 8000);
    } else if (!snapshot || !Number.isFinite(next.totalTokens) || next.totalTokens < snapshot.totalTokens) {
      rate = 0;
      activeUntil = 0;
    }
    snapshot = next;
    lastReceivedAt = Date.now();
    clearTimeout(staleTimer);
    staleTimer = setTimeout(() => { clearData(); render(); }, 15000);
    render();
    return true;
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clearData();
    row?.remove();
    row = text = cacheBar = cacheFill = cacheText = null;
    document.removeEventListener("visibilitychange", request);
    motion.removeEventListener("change", paintMotion);
  };
  state.usageOverlay = {
    request, update, dispose,
    status: () => ({ threadId, mounted: Boolean(row?.isConnected), stale: !snapshot, tokensPerSecond: rate,
      spinning: row?.dataset.spinning === "true", sampledAt: snapshot?.sampledAt ?? null, lastReceivedAt }),
  };
  document.addEventListener("visibilitychange", request);
  motion.addEventListener("change", paintMotion);
  request();
  return true;
})
