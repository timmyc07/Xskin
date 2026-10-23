import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createMediaPreview } from "./media-preview.mjs";

const run = promisify(execFile);
const languages = new Set(["en", "zh-Hant", "zh-Hans", "ja"]);
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const failure = (errorCode = "operation_failed") => Object.assign(new Error(`Xskin could not complete the operation (${errorCode}).`), { errorCode });
const chooser = `try
  set chosen to choose file with prompt "Choose an Xskin background" of type {"public.image", "public.mpeg-4"}
  return POSIX path of chosen
on error number -128
  return ""
end try`;

export async function createStudio(runtimeRoot, { home = process.env.HOME || os.homedir(), execute = run, platform = process.platform } = {}) {
  if (platform !== "darwin") throw failure("unsupported_platform");
  runtimeRoot = path.resolve(runtimeRoot);
  const version = (await fs.readFile(path.join(runtimeRoot, "VERSION"), "utf8")).trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw failure("invalid_setup");
  const stateRoot = path.join(home, "Library/Application Support/CodexDreamSkinStudio");
  const backend = path.join(home, ".codex/codex-dream-skin-studio/scripts/background-studio.mjs");
  const wrapper = path.join(runtimeRoot, "scripts/studio-command-macos.sh");
  const preview = await createMediaPreview({ stateRoot });
  const options = { env: { ...process.env, HOME: home }, timeout: 200000, maxBuffer: 1024 * 1024 };
  let closed = false;
  let busy = false;
  let pickerController = null;
  let pickerDone = null;

  const command = async (file, args, overrides = {}) => {
    if (closed) throw failure("closed");
    try { return await execute(file, args, { ...options, ...overrides }); }
    catch (error) {
      let code;
      try { code = JSON.parse(error.stdout).errorCode; } catch {}
      throw failure(typeof code === "string" && /^[a-z_]{1,50}$/.test(code) ? code : "operation_failed");
    }
  };
  const language = async () => {
    try {
      const { stdout } = await command("/usr/bin/defaults", ["read", "com.xskin.studio", "xskin.language"], { timeout: 5000 });
      const value = stdout.trim();
      return languages.has(value) ? value : "en";
    } catch { return "en"; }
  };
  const sanitized = async raw => {
    if (!raw || typeof raw !== "object" || !/^\d+\.\d+\.\d+$/.test(raw.version) ||
      !Number.isFinite(raw.maskOpacity) || raw.maskOpacity < 0 || raw.maskOpacity > 1 ||
      typeof raw.autostart !== "boolean" || typeof raw.autostartLoaded !== "boolean") throw failure("invalid_response");
    const urls = await preview.update(raw);
    const media = (value, slot) => {
      if (value == null) return null;
      if (typeof value.name !== "string" || value.name.length > 240 || /[\p{Cc}\u2028\u2029]/u.test(value.name) ||
        !["image", "video"].includes(value.kind) || !Number.isSafeInteger(value.bytes) || value.bytes < 1 ||
        (slot === "selection" && !uuid.test(value.id ?? ""))) throw failure("invalid_response");
      return { ...(slot === "selection" ? { id: value.id } : { applied: value.applied === true }),
        name: value.name, kind: value.kind, bytes: value.bytes, previewUrl: urls[slot] };
    };
    return { version: raw.version, platform: "macos", active: media(raw.active, "active"), selection: media(raw.selection, "selection"),
      maskOpacity: raw.maskOpacity, autostart: raw.autostart, autostartLoaded: raw.autostartLoaded,
      pendingRecovery: raw.pendingRecovery === true, language: await language(), needsSetup: false };
  };
  const parse = async result => {
    let raw;
    try { raw = JSON.parse(result.stdout); } catch { throw failure("invalid_response"); }
    return sanitized(raw);
  };
  const status = async () => {
    if (closed) throw failure("closed");
    try {
      const [script, config] = await Promise.all([fs.lstat(backend), fs.lstat(path.join(stateRoot, "theme/theme.json"))]);
      if (!script.isFile() || !config.isFile()) throw failure("invalid_setup");
    } catch (error) {
      if (error.code !== "ENOENT") throw failure("invalid_setup");
      await preview.update({});
      return { version, platform: "macos", active: null, selection: null, maskOpacity: 0.62,
        autostart: false, autostartLoaded: false, pendingRecovery: false, language: await language(), needsSetup: true };
    }
    return parse(await command(process.execPath, [backend, "status"], { timeout: 15000 }));
  };
  const mutate = async operation => {
    if (closed) throw failure("closed");
    if (busy) throw failure("operation_busy");
    busy = true;
    try { return await operation(); }
    finally { busy = false; }
  };
  const dispatch = async (name, value) => parse(await command("/bin/bash", [wrapper, "--embedded", name, ...(value === undefined ? [] : [value])]));

  return {
    previewOrigin: preview.origin,
    status,
    choose: signal => mutate(async () => {
      if (signal?.aborted) throw failure("cancelled");
      const controller = new AbortController();
      const abort = () => controller.abort();
      pickerController = controller;
      signal?.addEventListener("abort", abort, { once: true });
      let stdout;
      try {
        pickerDone = command("/usr/bin/osascript", ["-e", chooser], { timeout: 0, signal: controller.signal });
        ({ stdout } = await pickerDone);
      } catch (error) {
        if (controller.signal.aborted) throw failure("cancelled");
        throw error;
      } finally {
        signal?.removeEventListener("abort", abort);
        pickerController = null;
        pickerDone = null;
      }
      const chosen = stdout.endsWith("\n") ? stdout.slice(0, -1) : stdout;
      if (!chosen) return { ...await status(), cancelled: true };
      if (!path.isAbsolute(chosen) || /[\p{Cc}\u2028\u2029]/u.test(chosen)) throw failure("invalid_local_file");
      return dispatch("import", chosen);
    }),
    apply: id => mutate(async () => {
      if (typeof id !== "string" || !uuid.test(id)) throw failure("select_media");
      return dispatch("apply", id);
    }),
    mask: opacity => mutate(async () => {
      if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1 || Math.abs(opacity * 100 - Math.round(opacity * 100)) > 1e-9) throw failure("invalid_mask");
      return dispatch("mask", opacity.toFixed(2));
    }),
    autostart: enabled => mutate(async () => {
      if (typeof enabled !== "boolean") throw failure("invalid_autostart");
      return dispatch("autostart", String(enabled));
    }),
    pause: () => mutate(() => dispatch("pause")),
    resume: () => mutate(async () => {
      if ((await status()).needsSetup) throw failure("resume_unavailable");
      return dispatch("resume");
    }),
    setLanguage: value => mutate(async () => {
      if (!languages.has(value)) throw failure("invalid_language");
      await command("/usr/bin/defaults", ["write", "com.xskin.studio", "xskin.language", "-string", value], { timeout: 5000 });
      return status();
    }),
    async close() {
      if (closed) return;
      closed = true;
      pickerController?.abort();
      await Promise.all([preview.close(), pickerDone?.catch(() => {})]);
    },
  };
}
