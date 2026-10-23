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
    primaryBackground: getComputedStyle(element("apply")).backgroundColor,
    paddingBottom: parseFloat(getComputedStyle(element("studio")).paddingBottom),
    reservedBottom: parseFloat(getComputedStyle(document.body).paddingBottom),
    scrollport: { ...bounds, scrollTop: scrollport.scrollTop, maxScroll: scrollport.scrollHeight - scrollport.clientHeight },
    reservedHits,
    insetBottom: styles.getPropertyValue("--studio-safe-bottom"),
    previewError: !element("preview-error").hidden,
    error: element("error").textContent, errorVisible: !element("error-box").hidden,
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
    else if (command !== "inspect") throw new Error("Unknown own-fixture command");
    await new Promise(resolve => requestAnimationFrame(resolve));
    parent.postMessage({ fixture: "xskin-qa", id, result: view() }, hostOrigin);
  } catch (error) {
    parent.postMessage({ fixture: "xskin-qa", id, error: error.message }, hostOrigin);
  }
});
