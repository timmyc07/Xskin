// Only bundled by the own-browser QA harness, never by the shipped app.
const hostOrigin = new URL(location.href).searchParams.get("host");
const element = id => document.getElementById(id);
const rect = node => {
  const { top, right, bottom, left, width, height } = node.getBoundingClientRect();
  return { top, right, bottom, left, width, height };
};
const view = () => {
  const styles = getComputedStyle(document.documentElement);
  const ids = ["choose", "apply", "refresh", "mask", "autostart", "pause", "resume", "recover", "retry", "language"];
  const scrollport = element("studio");
  const bounds = rect(scrollport);
  const overflowNodes = new Set(document.querySelectorAll("#studio, #settings, .actions, .media-info, .preference-row, .error, button, select"));
  const internalOverflows = [...overflowNodes].filter(node => node.clientWidth > 0 && node.scrollWidth - node.clientWidth > 1)
    .map(node => ({ node: node.id || node.className || node.tagName, client: node.clientWidth, scroll: node.scrollWidth }));
  const textOverflows = [];
  for (const card of document.querySelectorAll(".setting-row, .preference-row, .actions, .media-info, .error")) {
    const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const text = walker.currentNode;
      if (!text.textContent.trim() || text.parentElement.closest("select")) continue;
      const owner = text.parentElement.closest("button") || card;
      const box = rect(owner);
      if (!box.width || !box.height) continue;
      const range = document.createRange();
      range.selectNodeContents(text);
      for (const line of range.getClientRects()) if (line.left < box.left - 1 || line.right > box.right + 1 || line.top < box.top - 1 || line.bottom > box.bottom + 1)
        textOverflows.push({ node: owner.id || owner.className, text: text.textContent.trim().slice(0, 40), box, line: { left: line.left, right: line.right, top: line.top, bottom: line.bottom } });
    }
  }
  const stage = rect(element("preview-stage"));
  const previewMedia = element("image").hidden ? element("video") : element("image");
  const heading = rect(element("settings-heading"));
  const reservedHits = [];
  for (let y = bounds.bottom + 2; y < innerHeight; y += 16) for (const x of [bounds.left + 8, (bounds.left + bounds.right) / 2, bounds.right - 8]) {
    const hit = document.elementFromPoint(x, y);
    if (hit && scrollport.contains(hit)) reservedHits.push(hit.id || hit.tagName);
  }
  return {
    origin: location.origin, lang: document.documentElement.lang, theme: document.documentElement.dataset.theme,
    width: document.documentElement.clientWidth, height: innerHeight,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    bodyBackground: getComputedStyle(document.body).backgroundColor,
    rootBackground: styles.backgroundColor, canvasSchemes: styles.colorScheme,
    settingsBackground: getComputedStyle(element("settings")).backgroundColor,
    languageScheme: getComputedStyle(element("language")).colorScheme,
    languageOptionBackground: getComputedStyle(element("language").options[0]).backgroundColor,
    languageRow: { label: rect(document.querySelector('label[for="language"]')), control: rect(element("language")) },
    primaryBackground: getComputedStyle(element("apply")).backgroundColor,
    paddingBottom: parseFloat(getComputedStyle(element("studio")).paddingBottom),
    reservedBottom: parseFloat(getComputedStyle(document.body).paddingBottom),
    scrollport: { ...bounds, scrollTop: scrollport.scrollTop, maxScroll: scrollport.scrollHeight - scrollport.clientHeight },
    reservedHits,
    internalOverflows, textOverflows,
    previewGeometry: { stage, section: rect(document.querySelector(".preview-section")), media: rect(previewMedia) },
    settingsHeading: { bounds: heading, fieldset: rect(element("settings")), labelledBy: element("settings").getAttribute("aria-labelledby") },
    insetBottom: styles.getPropertyValue("--studio-safe-bottom"),
    previewError: !element("preview-error").hidden,
    error: element("error").textContent, errorVisible: !element("error-box").hidden,
    errorLocation: { withinPreview: document.querySelector(".preview-section").contains(element("error-box")),
      bounds: rect(element("error-box")), actions: rect(document.querySelector(".actions")) },
    connectionHint: !element("connection-hint").hidden,
    name: element("media-name").textContent,
    busy: element("studio").getAttribute("aria-busy"),
    checkedLanguage: element("language").value,
    controls: Object.fromEntries(ids.map(id => {
      const node = element(id);
      const box = rect(node);
      return [id, { disabled: node.matches(":disabled"), hidden: node.hidden, checked: node.checked,
        focused: document.activeElement === node, box,
        hit: box.height > 0 && document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) === node }];
    })),
    image: { src: element("image").getAttribute("src"), loaded: element("image").complete && element("image").naturalWidth > 0 },
    background: { visible: !element("studio-background").hidden, imageLoaded: element("background-image").complete && element("background-image").naturalWidth > 0,
      src: element("background-image").getAttribute("src"), bounds: rect(element("studio-background")) },
    video: { src: element("video").getAttribute("src"), ready: element("video").readyState,
      width: element("video").videoWidth, paused: element("video").paused, autoplay: element("video").autoplay },
  };
};
window.addEventListener("message", async event => {
  if (event.source !== parent || event.origin !== hostOrigin || event.data?.fixture !== "xskin-qa") return;
  const { id, command, args = {} } = event.data;
  try {
    const node = args.id ? element(args.id) : null;
    if (command === "focus") node.focus();
    else if (command === "click") node.click();
    else if (command === "input" || command === "change") {
      node.value = args.value;
      node.dispatchEvent(new Event(command, { bubbles: true }));
    } else if (command === "scroll") node.scrollIntoView({ block: "end" });
    else if (command === "fraction") element("studio").scrollTop = (element("studio").scrollHeight - element("studio").clientHeight) * args.fraction;
    else if (command === "top") element("studio").scrollTop = 0;
    else if (command === "fontScale") {
      for (const [key, size] of Object.entries({ "--font-text-sm-size": 14, "--font-text-xs-size": 13, "--font-heading-md-size": 24, "--font-heading-xs-size": 15 })) {
        if (args.scale === 1) document.documentElement.style.removeProperty(key);
        else document.documentElement.style.setProperty(key, `${size * args.scale}px`);
      }
    }
    else if (command !== "inspect") throw new Error("Unknown own-fixture command");
    await new Promise(resolve => requestAnimationFrame(resolve));
    parent.postMessage({ fixture: "xskin-qa", id, result: view() }, hostOrigin);
  } catch (error) {
    parent.postMessage({ fixture: "xskin-qa", id, error: error.message }, hostOrigin);
  }
});
