import AppKit
import Foundation

private let managedBundleID = "com.xskin.codex-launcher"
private let managedApp = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Applications/Codex (Xskin).app")
private let stateFolder = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/CodexDreamSkinStudio")

private func tileURL(_ tile: [String: Any]) -> URL? {
  guard let data = tile["tile-data"] as? [String: Any], let file = data["file-data"] as? [String: Any],
    let value = file["_CFURLString"] as? String else { return nil }
  return (value.hasPrefix("file:") ? URL(string: value) : URL(fileURLWithPath: value))?.standardizedFileURL
}

private func replacingURL(_ tile: [String: Any], with url: URL) -> [String: Any] {
  var result = tile
  var data = result["tile-data"] as? [String: Any] ?? [:]
  data["file-data"] = ["_CFURLString": url.absoluteString, "_CFURLStringType": 15]
  data["file-label"] = "Codex (Xskin)"
  result["tile-data"] = data
  result["tile-type"] = "file-tile"
  return result
}

private func installEntry(official: URL) throws {
  let manager = FileManager.default
  if manager.fileExists(atPath: managedApp.path) {
    guard Bundle(url: managedApp)?.bundleIdentifier == managedBundleID else { throw CocoaError(.fileWriteFileExists) }
  }
  let temporary = managedApp.deletingLastPathComponent().appendingPathComponent(".xskin-entry-\(UUID().uuidString).app")
  try manager.createDirectory(at: temporary.appendingPathComponent("Contents/MacOS"), withIntermediateDirectories: true)
  defer { try? manager.removeItem(at: temporary) }
  try manager.copyItem(at: URL(fileURLWithPath: CommandLine.arguments[0]).standardizedFileURL, to: temporary.appendingPathComponent("Contents/MacOS/CodexLauncher"))
  var info: [String: Any] = ["CFBundleIdentifier": managedBundleID, "CFBundleName": "Codex (Xskin)", "CFBundleDisplayName": "Codex (Xskin)", "CFBundleExecutable": "CodexLauncher", "CFBundlePackageType": "APPL", "LSUIElement": true, "LSMinimumSystemVersion": "13.0", "XskinCodexBundlePath": official.standardizedFileURL.path]
  if let icon = Bundle(url: official)?.object(forInfoDictionaryKey: "CFBundleIconFile") as? String,
    !icon.contains("/"), !icon.contains("..") {
    let name = icon.hasSuffix(".icns") ? icon : icon + ".icns"
    let resources = temporary.appendingPathComponent("Contents/Resources")
    try manager.createDirectory(at: resources, withIntermediateDirectories: true)
    try manager.copyItem(at: official.appendingPathComponent("Contents/Resources/\(name)"), to: resources.appendingPathComponent(name))
    info["CFBundleIconFile"] = name
  }
  try PropertyListSerialization.data(fromPropertyList: info, format: .xml, options: 0).write(to: temporary.appendingPathComponent("Contents/Info.plist"))
  let sign = Process()
  sign.executableURL = URL(fileURLWithPath: "/usr/bin/codesign")
  sign.arguments = ["--force", "--sign", "-", "--timestamp=none", temporary.path]
  sign.standardOutput = FileHandle.nullDevice
  sign.standardError = FileHandle.nullDevice
  try sign.run(); sign.waitUntilExit()
  guard sign.terminationStatus == 0 else { throw CocoaError(.executableNotLoadable) }
  if manager.fileExists(atPath: managedApp.path) { _ = try manager.replaceItemAt(managedApp, withItemAt: temporary) }
  else { try manager.moveItem(at: temporary, to: managedApp) }
}

private func configureDock(official: URL?, restore: Bool) throws {
  let domain = "com.apple.dock" as CFString
  let key = "persistent-apps" as CFString
  guard var tiles = CFPreferencesCopyAppValue(key, domain) as? [[String: Any]] else { throw CocoaError(.fileReadCorruptFile) }
  let backup = stateFolder.appendingPathComponent("direct-launch-dock.plist")
  var originals: [[String: Any]] = []
  if restore {
    guard FileManager.default.fileExists(atPath: backup.path) else { return }
    guard let saved = try PropertyListSerialization.propertyList(from: Data(contentsOf: backup), format: nil) as? [[String: Any]] else { throw CocoaError(.fileReadCorruptFile) }
    originals = saved
    for record in originals {
      guard let guid = record["GUID"] as? Int,
        let index = tiles.firstIndex(where: { ($0["GUID"] as? Int) == guid && tileURL($0) == managedApp.standardizedFileURL }) else { continue }
      if let original = record["original"] as? [String: Any] { tiles[index] = original }
      else { tiles.remove(at: index) }
    }
  } else {
    guard let official else { throw CocoaError(.fileReadInvalidFileName) }
    if tiles.contains(where: { tileURL($0) == managedApp.standardizedFileURL }) { return }
    for index in tiles.indices where tileURL(tiles[index]) == official.standardizedFileURL {
      let guid = tiles[index]["GUID"] as? Int ?? Int.random(in: 1...Int(Int32.max))
      originals.append(["GUID": guid, "original": tiles[index]])
      tiles[index] = replacingURL(tiles[index], with: managedApp)
      tiles[index]["GUID"] = guid
    }
    if originals.isEmpty {
      let guid = Int.random(in: 1...Int(Int32.max))
      originals.append(["GUID": guid])
      tiles.append(replacingURL(["GUID": guid], with: managedApp))
    }
    try FileManager.default.createDirectory(at: stateFolder, withIntermediateDirectories: true)
    try PropertyListSerialization.data(fromPropertyList: originals, format: .binary, options: 0).write(to: backup, options: .atomic)
    try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: backup.path)
  }
  CFPreferencesSetAppValue(key, tiles as CFArray, domain)
  guard CFPreferencesAppSynchronize(domain) else { throw CocoaError(.fileWriteUnknown) }
  if restore { try FileManager.default.removeItem(at: backup) }
  let restart = Process()
  restart.executableURL = URL(fileURLWithPath: "/usr/bin/killall")
  restart.arguments = ["Dock"]
  restart.standardOutput = FileHandle.nullDevice
  restart.standardError = FileHandle.nullDevice
  try restart.run(); restart.waitUntilExit()
}

@main
@MainActor
private struct DirectLauncher {
  private static func showFailure() {
    NSApplication.shared.setActivationPolicy(.accessory)
    let language = XskinLanguage(rawValue: UserDefaults(suiteName: "com.xskin.studio")?.string(forKey: "xskin.language") ?? "en") ?? .english
    let alert = NSAlert()
    alert.messageText = "Xskin"
    alert.informativeText = XskinLocalization.text(.launchFailed, language: language)
    alert.runModal()
  }

  static func main() {
    do { try run() }
    catch {
      if CommandLine.arguments.count == 1 { showFailure() }
      else { FileHandle.standardError.write(Data("Xskin could not configure direct launch.\n".utf8)) }
      exit(1)
    }
  }

  private static func run() throws {
    let args = Array(CommandLine.arguments.dropFirst())
    if args == ["--self-check"] {
      let original: [String: Any] = ["GUID": 7, "tile-type": "file-tile", "tile-data": ["file-data": ["_CFURLString": "file:///Applications/ChatGPT.app/", "_CFURLStringType": 15], "keep": true]]
      assert(tileURL(original)?.path == "/Applications/ChatGPT.app")
      let changed = replacingURL(original, with: managedApp)
      assert(changed["GUID"] as? Int == 7)
      assert((changed["tile-data"] as? [String: Any])?["keep"] as? Bool == true)
      assert(tileURL(changed) == managedApp.standardizedFileURL)
      print("PASS: direct-launch entry preserves Dock metadata and uses a distinct managed bundle.")
      return
    }
    if args.count == 2, ["--install", "--link-dock"].contains(args[0]) {
      let official = URL(fileURLWithPath: args[1]).standardizedFileURL
      guard Bundle(url: official)?.bundleIdentifier == "com.openai.codex" else { throw CocoaError(.fileReadCorruptFile) }
      if args[0] == "--install" { try installEntry(official: official) }
      else { try configureDock(official: official, restore: false) }
      let data = try JSONSerialization.data(withJSONObject: ["appPath": managedApp.path])
      print(String(decoding: data, as: UTF8.self))
      return
    }
    if args == ["--unlink-dock"] { try configureDock(official: nil, restore: true); return }
    guard args.isEmpty else { throw CocoaError(.validationMissingMandatoryProperty) }
    NSApplication.shared.setActivationPolicy(.accessory)
    guard let targetPath = Bundle.main.object(forInfoDictionaryKey: "XskinCodexBundlePath") as? String, targetPath.hasPrefix("/") else {
      throw CocoaError(.fileReadCorruptFile)
    }
    let target = URL(fileURLWithPath: targetPath).standardizedFileURL
    let runtime = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".codex/codex-dream-skin-studio")
    let script = runtime.appendingPathComponent("scripts/direct-launch-macos.sh")
    guard FileManager.default.isExecutableFile(atPath: script.path) else { throw CocoaError(.executableNotLoadable) }
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/bin/bash")
    process.arguments = [script.path]
    var environment = ProcessInfo.processInfo.environment
    environment["CODEX_APP_BUNDLE"] = target.path
    process.environment = environment
    try FileManager.default.createDirectory(at: stateFolder, withIntermediateDirectories: true)
    let log = stateFolder.appendingPathComponent("direct-launch.log")
    if !FileManager.default.fileExists(atPath: log.path) { FileManager.default.createFile(atPath: log.path, contents: nil, attributes: [.posixPermissions: 0o600]) }
    let output = try FileHandle(forWritingTo: log)
    try output.seekToEnd()
    defer { try? output.close() }
    process.standardOutput = output; process.standardError = output

    try process.run()
    process.waitUntilExit()
    guard process.terminationStatus == 0 else { throw CocoaError(.executableNotLoadable) }
  }
}
