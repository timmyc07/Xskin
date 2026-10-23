import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const failure = code => Object.assign(new Error(`Xskin could not complete the operation (${code}).`), { errorCode: code });
const codes = {
  invalidImage: "invalid_image", imageSizeLimit: "image_size_limit", imageDimensions: "image_dimensions",
  imageConversion: "image_conversion", unsupportedFormat: "unsupported_format", invalidVideo: "invalid_video",
  videoSizeLimit: "video_size_limit", invalidMask: "invalid_mask", selectMedia: "select_media",
  invalidLocalFile: "invalid_local_file", fileAccessDenied: "file_access_denied", sourceChanged: "source_changed",
  applyFailedRestored: "apply_failed_restored", applyFailedUnrestored: "apply_failed_unrestored",
  maskFailedRestored: "mask_failed_restored", maskFailedUnrestored: "mask_failed_unrestored",
  operationBusy: "operation_busy", resumeUnavailable: "resume_unavailable",
  invalidStudio: "invalid_studio", invalidBackground: "invalid_background",
  invalidAutostart: "invalid_autostart", invalidCommand: "invalid_command",
};
const publicId = value => typeof value === "string" && /^[a-f0-9]{32}$/.test(value)
  ? `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}` : null;

export async function createWindowsBackend(runtimeRoot, { execute, options }) {
  const shell = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  options = { ...options, env: { ...options.env, PSModulePath: path.join(path.dirname(shell), "Modules") } };
  const script = path.join(runtimeRoot, "scripts", "xskin-command.ps1");
  const args = file => ["-NoProfile", "-NonInteractive", "-Sta", "-ExecutionPolicy", "Bypass", "-File", file];
  let last;
  let stateRoot;
  const parse = stdout => {
    const line = stdout.split(/\r?\n/).filter(line => line.startsWith("XSKIN_RESULT:")).at(-1);
    let value;
    try { value = JSON.parse(line?.slice("XSKIN_RESULT:".length)); } catch { throw failure("invalid_response"); }
    if (value?.ok !== true) throw failure(codes[value?.errorCode] ?? "operation_failed");
    if (!value.state || typeof value.state !== "object") throw failure("invalid_response");
    if (typeof value.state.stateRoot !== "string" || !path.isAbsolute(value.state.stateRoot) ||
      (stateRoot && value.state.stateRoot !== stateRoot)) throw failure("invalid_setup");
    stateRoot ??= value.state.stateRoot;
    last = value.state;
    return last;
  };
  const invoke = async (action, request = {}, overrides = {}) => {
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "xskin-request-"));
    const requestPath = path.join(temporary, "request.json");
    try {
      await fs.writeFile(requestPath, JSON.stringify(request), { flag: "wx", mode: 0o600 });
      const command = [...args(script), "-Embedded", "-Action", action, "-RequestPath", requestPath];
      if (last?.stateRoot) command.push("-StateRoot", last.stateRoot);
      let result;
      try { result = await execute(shell, command, { ...options, windowsHide: true, ...overrides }); }
      catch (error) { if (typeof error.stdout === "string") return parse(error.stdout); throw failure("operation_failed"); }
      return parse(result.stdout);
    } finally { await fs.rm(temporary, { recursive: true, force: true }); }
  };
  const normalize = raw => {
    const media = (file, bytes, name, extra) => file ? {
      path: file, bytes, name, kind: path.extname(file).toLowerCase() === ".mp4" ? "video" : "image", ...extra,
    } : null;
    return { version: raw.version,
      active: media(raw.activeVideoPath || raw.activeImagePath, raw.activeBytes, raw.activeName, { applied: raw.applied === true }),
      selection: raw.pending ? media(raw.videoPath || raw.imagePath, raw.bytes, raw.name, { id: publicId(raw.selectionId) }) : null,
      maskOpacity: raw.maskOpacity, autostart: raw.autostart, autostartLoaded: raw.autostartLoaded,
      pendingRecovery: raw.pendingRecovery, language: raw.language, needsSetup: raw.needsSetup === true };
  };
  const checked = raw => {
    if (raw.stateRoot !== stateRoot) throw failure("invalid_setup");
    return normalize(raw);
  };
  return {
    get stateRoot() { return stateRoot; },
    status: async () => checked(await invoke("status", {}, { timeout: 15000 })),
    language: async () => last?.language || "en",
    setLanguage: async language => { await invoke("preferences", { language }); },
    pick: async signal => {
      let stdout;
      try {
        ({ stdout } = await execute(shell, args(path.join(runtimeRoot, "scripts", "choose-media.ps1")),
          { ...options, timeout: 0, windowsHide: true, signal }));
      } catch { throw failure("operation_failed"); }
      let selected;
      try { selected = JSON.parse(stdout); } catch { throw failure("invalid_response"); }
      if (typeof selected !== "string") throw failure("invalid_response");
      return selected;
    },
    dispatch: async (name, value) => {
      let action = name;
      let request = {};
      if (name === "import") request = { path: value };
      else if (name === "apply") {
        const current = await invoke("status", {}, { timeout: 15000 });
        if (publicId(current.selectionId) !== value) throw failure("select_media");
        request = { selectionId: current.selectionId, imagePath: current.imagePath, maskOpacity: current.maskOpacity };
      } else if (name === "mask") request = { maskOpacity: Number(value) };
      else if (name === "autostart") request = { enabled: value === "true" };
      else if (name === "status") action = "recover";
      return checked(await invoke(action, request, { timeout: ["apply", "mask"].includes(name) ? 0 : options.timeout }));
    },
  };
}
