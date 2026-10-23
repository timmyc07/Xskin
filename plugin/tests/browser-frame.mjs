// Only bundled by the own-browser QA harness, never by the shipped app.
const hostOrigin = new URL(location.href).searchParams.get("host");
const element = id => document.getElementById(id);
const rect = node => {
  const { top, right, bottom, left, width, height } = node.getBoundingClientRect();
  return { top, right, bottom, left, width, height };
};
const view = () => {
  const styles = getComputedStyle(document.documentElement);
  const ids = ["choose", "apply", "refresh", "mask", "autostart", "pause", "resume", "retry", "language-en", "language-zh-Hant", "language-zh-Hans", "language-ja"];
  return {
    origin: location.origin, lang: document.documentElement.lang, theme: document.documentElement.dataset.theme,
    width: document.documentElement.clientWidth, height: innerHeight,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    bodyBackground: getComputedStyle(document.body).backgroundColor,
    rootBackground: styles.backgroundColor, canvasSchemes: styles.colorScheme,
    settingsBackground: getComputedStyle(element("settings")).backgroundColor,
    primaryBackground: getComputedStyle(element("apply")).backgroundColor,
    paddingBottom: parseFloat(getComputedStyle(element("studio")).paddingBottom),
    insetBottom: styles.getPropertyValue("--studio-safe-bottom"),
    previewError: !element("preview-error").hidden,
    error: element("error").textContent, errorVisible: !element("error-box").hidden,
    connectionHint: !element("connection-hint").hidden,
    name: element("media-name").textContent,
    busy: element("studio").getAttribute("aria-busy"),
    checkedLanguage: document.querySelector('input[name="language"]:checked')?.value,
    controls: Object.fromEntries(ids.map(id => {
      const node = element(id);
      const box = rect(node);
      return [id, { disabled: node.matches(":disabled"), hidden: node.hidden, checked: node.checked,
        focused: document.activeElement === node, box,
        hit: box.height > 0 && document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) === node }];
    })),
    image: { src: element("image").getAttribute("src"), loaded: element("image").complete && element("image").naturalWidth > 0 },
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
    else if (command === "top") scrollTo(0, 0);
    else if (command !== "inspect") throw new Error("Unknown own-fixture command");
    await new Promise(resolve => requestAnimationFrame(resolve));
    parent.postMessage({ fixture: "xskin-qa", id, result: view() }, hostOrigin);
  } catch (error) {
    parent.postMessage({ fixture: "xskin-qa", id, error: error.message }, hostOrigin);
  }
});
