export const STUDIO_META = "com.xskin/studio";
export const LANGUAGES = ["en", "zh-Hant", "zh-Hans", "ja"];
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const ERROR_KEYS = {
  unsupported_platform: "unsupported", invalid_setup: "setupError", invalid_response: "responseError",
  operation_busy: "busyError", select_media: "chooseAgain", invalid_selection: "chooseAgain",
  missing_selection: "chooseAgain", invalid_local_file: "chooseAgain", source_changed: "chooseAgain",
  resume_unavailable: "connectionNeeded", apply_failed_restored: "changeRestored", mask_failed_restored: "changeRestored",
  apply_failed_unrestored: "restoreFailed", mask_failed_unrestored: "restoreFailed",
};

export function createStudioController(app, render) {
  const view = { state: null, busy: null, error: null, notice: null, retry: null };
  let disposed = false;
  const publish = () => { if (!disposed) render(view); };
  const receive = result => {
    const state = result?._meta?.[STUDIO_META];
    if (state && typeof state.version === "string" && state.platform === "macos" &&
      Number.isFinite(state.maskOpacity) && state.maskOpacity >= 0 && state.maskOpacity <= 1 &&
      LANGUAGES.includes(state.language)) view.state = state;
    if (result?.isError) {
      const code = result._meta?.["com.xskin/error"];
      view.error = Object.hasOwn(ERROR_KEYS, code) ? ERROR_KEYS[code] : "failed";
    }
    publish();
    return Boolean(state && view.state === state);
  };
  const run = async (name, args = {}) => {
    if (disposed || view.busy) return false;
    view.busy = name;
    view.error = view.notice = null;
    publish();
    try {
      const result = await app.callServerTool({ name, arguments: args }, { timeout: 210000 });
      if (disposed) return false;
      if (!receive(result) || result.isError) throw new Error("operation_failed");
      view.retry = null;
      view.notice = view.state.cancelled ? "cancelled" : name === "xskin_choose_media" ? "ready"
        : name === "xskin_apply" ? "applied" : name === "xskin_pause" ? "paused"
        : name === "xskin_resume" ? "resumed" : "";
      return true;
    } catch {
      if (!disposed) {
        view.error ??= "failed";
        view.retry = () => run(name, args);
      }
      return false;
    } finally {
      view.busy = null;
      publish();
    }
  };
  return {
    view, receive, run,
    choose: () => run("xskin_choose_media"),
    refresh: () => run("xskin_status"),
    apply() {
      const id = view.state?.selection?.id;
      return typeof id === "string" && UUID.test(id) ? run("xskin_apply", { selectionId: id }) : Promise.resolve(false);
    },
    mask(percent) {
      if (!Number.isFinite(percent) || percent < 0 || percent > 100) return Promise.resolve(false);
      const opacity = Math.round(percent) / 100;
      return opacity === view.state?.maskOpacity ? Promise.resolve(true) : run("xskin_mask", { opacity });
    },
    language(language) {
      return LANGUAGES.includes(language) ? run("xskin_set_language", { language }) : Promise.resolve(false);
    },
    dispose() { disposed = true; },
  };
}
