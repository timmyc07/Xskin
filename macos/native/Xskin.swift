import AppKit
import AVKit
import ImageIO
import SwiftUI
import UniformTypeIdentifiers

private enum StudioStyle {
  static let background = Color(red: 0.067, green: 0.075, blue: 0.071)
  static let surface = Color(red: 0.098, green: 0.110, blue: 0.102)
  static let raised = Color(red: 0.125, green: 0.141, blue: 0.125)
  static let text = Color(red: 0.937, green: 0.945, blue: 0.922)
  static let muted = Color(red: 0.631, green: 0.659, blue: 0.631)
  static let accent = Color(red: 0.863, green: 0.929, blue: 0.627)
  static let line = Color.white.opacity(0.09)
}

private struct StudioMedia: Decodable, Equatable {
  let id: String?
  let name: String
  let kind: String
  let path: String
  let bytes: Int64
  let applied: Bool?
}

private struct StudioSnapshot: Decodable {
  let version: String
  let active: StudioMedia?
  let selection: StudioMedia?
  let autostart: Bool
  let autostartLoaded: Bool
  let maskOpacity: Double
  let message: String?
}

private struct CommandError: Decodable { let error: String }

private struct StudioFailure: LocalizedError {
  let message: String
  var errorDescription: String? { message }
}

private enum StudioCommand {
  static func run(_ command: String, arguments: [String] = []) async throws -> StudioSnapshot {
    guard let resources = Bundle.main.resourceURL else {
      throw StudioFailure(message: "無法讀取程式資源，請重新安裝 Xskin。")
    }
    let script = resources.appendingPathComponent("runtime/scripts/studio-command-macos.sh")
    return try await withCheckedThrowingContinuation { continuation in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          let process = Process()
          let output = Pipe()
          process.executableURL = URL(fileURLWithPath: "/bin/bash")
          process.arguments = [script.path, command] + arguments
          process.standardOutput = output
          process.standardError = FileHandle.nullDevice
          try process.run()
          let data = output.fileHandleForReading.readDataToEndOfFile()
          process.waitUntilExit()
          if process.terminationStatus != 0 {
            let failure = try? JSONDecoder().decode(CommandError.self, from: data)
            throw StudioFailure(message: failure?.error ?? "本機背景服務無法完成操作，請重試。")
          }
          guard let result = try? JSONDecoder().decode(StudioSnapshot.self, from: data) else {
            throw StudioFailure(message: "本機背景服務回傳的資料不完整，請重新開啟 Xskin。")
          }
          guard result.maskOpacity.isFinite && (0...1).contains(result.maskOpacity) else {
            throw StudioFailure(message: "本機背景服務回傳的遮罩深度無效，請重新開啟 Xskin。")
          }
          continuation.resume(returning: result)
        } catch {
          continuation.resume(throwing: error)
        }
      }
    }
  }
}

@MainActor
private final class StudioModel: ObservableObject {
  enum Operation {
    case loading, importing, applying, autostart, mask
    var message: String {
      switch self {
      case .loading: return "正在讀取本機背景設定…"
      case .importing: return "正在匯入素材，檔案只會留在這台電腦。"
      case .applying: return "正在套用背景並確認 Codex，請稍候…"
      case .autostart: return "正在更新自動套用設定…"
      case .mask: return "正在更新全版遮罩…"
      }
    }
  }

  @Published var snapshot: StudioSnapshot?
  @Published var operation: Operation? = .loading
  @Published var errorMessage = ""
  @Published var notice = ""
  @Published var previewImage: NSImage?
  @Published var player: AVPlayer?
  @Published var dimensions = CGSize.zero
  @Published var previewReady = false
  @Published var decoding = false
  @Published var maskOpacity = 0.62
  private var previewPath = ""
  private var previewTask: Task<Void, Never>?
  private var playerObservation: NSKeyValueObservation?
  private var loopObserver: NSObjectProtocol?
  private var windowVisible = true
  private var importFailed = false
  private var maskTask: Task<Void, Never>?
  private var editingMask = false
  private var maskEdited = false

  var media: StudioMedia? { snapshot?.selection ?? snapshot?.active }
  var busy: Bool { operation != nil }
  var hasPendingMask: Bool { maskEdited }
  var canApply: Bool {
    !busy && !importFailed && previewReady && snapshot?.selection?.id != nil
  }
  var statusMessage: String {
    if let operation { return operation.message }
    if !errorMessage.isEmpty { return errorMessage }
    if !notice.isEmpty { return notice }
    if snapshot?.selection != nil { return "素材已就緒，確認預覽後即可套用。" }
    if snapshot?.active?.applied == true { return "目前背景已套用，匯入新素材即可更換。" }
    return "選擇本機素材，預覽後即可套用。"
  }
  var resolution: String {
    dimensions.width > 0 ? "\(Int(dimensions.width)) × \(Int(dimensions.height))" : decoding ? "讀取中…" : "—"
  }
  var mediaLabel: String {
    guard let media else { return "" }
    if media.kind == "image" { return "圖片背景" }
    return dimensions.width >= 3840 && dimensions.height >= 2160 ? "4K · 原始影片" : "MP4 · 原始影片"
  }
  var applyLabel: String {
    if operation == .applying { return "正在套用背景…" }
    if snapshot?.selection != nil { return "套用這個背景" }
    if snapshot?.active?.applied == true && !notice.isEmpty { return "背景已套用" }
    return "匯入素材以套用"
  }

  func refresh() {
    guard snapshot == nil else { return }
    Task { await perform("status", operation: .loading) }
  }

  func chooseFile() {
    guard !busy else { return }
    player?.pause()
    let panel = NSOpenPanel()
    panel.title = "匯入背景素材"
    panel.message = "選擇圖片或 MP4 影片。4K 影片會保留原始畫質與幀率。"
    panel.prompt = "匯入素材"
    panel.allowedContentTypes = ["mp4", "png", "jpg", "jpeg", "webp", "heic", "heif", "tif", "tiff"].compactMap { UTType(filenameExtension: $0) }
    panel.allowsMultipleSelection = false
    panel.canChooseDirectories = false
    panel.canChooseFiles = true
    panel.begin { [weak self] response in
      guard response == .OK, let url = panel.url else { return }
      self?.importFile(url)
    }
  }

  func importFile(_ url: URL) {
    guard !busy else { return }
    guard url.isFileURL else {
      errorMessage = "請匯入這台電腦上的圖片或 MP4 檔案。"
      importFailed = true
      return
    }
    importFailed = true
    player?.pause()
    operation = .importing
    Task { await perform("import", arguments: [url.path], operation: .importing) }
  }

  func acceptDrop(_ providers: [NSItemProvider]) -> Bool {
    guard !busy, providers.count == 1, let provider = providers.first,
      provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) else {
      if !busy { errorMessage = "請一次拖入一個圖片或 MP4 檔案。" }
      return false
    }
    provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) { [weak self] item, error in
      let url = (item as? URL) ?? (item as? Data).flatMap { URL(dataRepresentation: $0, relativeTo: nil) }
      Task { @MainActor in
        guard let self else { return }
        guard error == nil, let url else {
          self.errorMessage = "無法讀取拖入的檔案，請使用「選擇檔案」。"
          self.importFailed = true
          return
        }
        self.importFile(url)
      }
    }
    return true
  }

  func apply() {
    guard canApply, let id = snapshot?.selection?.id else { return }
    player?.pause()
    operation = .applying
    Task { await perform("apply", arguments: [id], operation: .applying) }
  }

  func setAutostart(_ enabled: Bool) {
    guard !busy else { return }
    operation = .autostart
    Task { await perform("autostart", arguments: [enabled ? "true" : "false"], operation: .autostart) }
  }

  func setMaskOpacity(_ value: Double) {
    guard !busy, snapshot != nil, value.isFinite else { return }
    maskOpacity = (min(1, max(0, value)) * 100).rounded() / 100
    maskEdited = true
    maskTask?.cancel()
    guard !editingMask else { return }
    maskTask = Task { [weak self] in
      do { try await Task.sleep(nanoseconds: 300_000_000) }
      catch { return }
      self?.saveMask()
    }
  }

  func setMaskEditing(_ editing: Bool) {
    editingMask = editing
    maskTask?.cancel()
    if !editing { saveMask() }
  }

  private func saveMask() {
    guard !busy, !editingMask, let savedOpacity = snapshot?.maskOpacity else { return }
    maskTask?.cancel()
    maskTask = nil
    maskEdited = false
    guard abs(maskOpacity - savedOpacity) > 0.0001 else { return }
    let argument = String(format: "%.2f", locale: Locale(identifier: "en_US_POSIX"), maskOpacity)
    operation = .mask
    Task { await perform("mask", arguments: [argument], operation: .mask) }
  }

  private func perform(_ command: String, arguments: [String] = [], operation: Operation) async {
    self.operation = operation
    errorMessage = ""
    notice = ""
    do {
      let result = try await StudioCommand.run(command, arguments: arguments)
      snapshot = result
      if !maskEdited { maskOpacity = result.maskOpacity }
      if command == "import" { importFailed = false }
      notice = result.message ?? ""
      preparePreview()
    } catch {
      errorMessage = error.localizedDescription
      if command == "mask" { maskOpacity = snapshot?.maskOpacity ?? 0.62 }
    }
    self.operation = nil
    if maskEdited && !editingMask { saveMask() }
  }

  func setWindowVisible(_ visible: Bool) {
    guard visible != windowVisible else { return }
    windowVisible = visible
    if visible { preparePreview() }
    else if media?.kind == "video" {
      previewTask?.cancel()
      releasePlayer()
      previewPath = ""
      previewReady = false
      decoding = false
    }
  }

  func close() {
    previewTask?.cancel()
    maskTask?.cancel()
    releasePlayer()
  }

  private func releasePlayer() {
    playerObservation = nil
    if let loopObserver { NotificationCenter.default.removeObserver(loopObserver) }
    loopObserver = nil
    player?.pause()
    player?.replaceCurrentItem(with: nil)
    player = nil
  }

  private func preparePreview() {
    guard let media, media.path != previewPath, windowVisible else { return }
    previewTask?.cancel()
    releasePlayer()
    previewImage = nil
    dimensions = .zero
    previewReady = false
    decoding = true
    previewPath = media.path
    let url = URL(fileURLWithPath: media.path)
    previewTask = Task { [weak self] in
      do {
        guard FileManager.default.isReadableFile(atPath: url.path) else {
          throw StudioFailure(message: "無法讀取這個素材，請重新匯入檔案。")
        }
        if media.kind == "image" {
          let decoded = await Task.detached(priority: .userInitiated) { () -> CGImage? in
            guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
            return CGImageSourceCreateImageAtIndex(source, 0, [kCGImageSourceShouldCacheImmediately: true] as CFDictionary)
          }.value
          try Task.checkCancellation()
          guard let decoded else { throw StudioFailure(message: "無法解碼這張圖片，請選擇其他檔案。") }
          self?.previewImage = NSImage(cgImage: decoded, size: .zero)
          self?.dimensions = CGSize(width: decoded.width, height: decoded.height)
          self?.previewReady = true
          self?.decoding = false
        } else if media.kind == "video" {
          let asset = AVURLAsset(url: url)
          guard try await asset.load(.isPlayable), let track = try await asset.loadTracks(withMediaType: .video).first else {
            throw StudioFailure(message: "這部影片無法播放，請使用可播放的 MP4 檔案。")
          }
          let (size, transform) = try await track.load(.naturalSize, .preferredTransform)
          try Task.checkCancellation()
          let transformed = size.applying(transform)
          let dimensions = CGSize(width: abs(transformed.width), height: abs(transformed.height))
          guard dimensions.width > 0, dimensions.height > 0 else {
            throw StudioFailure(message: "影片缺少有效畫面，請選擇其他 MP4。")
          }
          let item = AVPlayerItem(asset: asset)
          let player = AVPlayer(playerItem: item)
          player.isMuted = true
          player.actionAtItemEnd = .none
          self?.dimensions = dimensions
          self?.player = player
          self?.playerObservation = item.observe(\.status, options: [.initial, .new]) { [weak self] item, _ in
            Task { @MainActor in
              guard let self, self.previewPath == url.path, self.player?.currentItem === item else { return }
              if item.status == .readyToPlay {
                self.previewReady = true
                self.decoding = false
              } else if item.status == .failed {
                self.previewReady = false
                self.decoding = false
                self.errorMessage = "無法解碼這部影片，請選擇其他 MP4 檔案。"
              }
            }
          }
          self?.loopObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak player] _ in
            player?.seek(to: .zero) { finished in if finished { player?.play() } }
          }
        } else {
          throw StudioFailure(message: "不支援這個素材類型，請重新匯入圖片或 MP4。")
        }
      } catch is CancellationError {
      } catch {
        guard !Task.isCancelled else { return }
        self?.decoding = false
        self?.previewReady = false
        self?.errorMessage = error.localizedDescription
      }
    }
  }
}

private struct NativeVideoPreview: NSViewRepresentable {
  let player: AVPlayer
  func makeNSView(context: Context) -> AVPlayerView {
    let view = AVPlayerView()
    view.controlsStyle = .floating
    view.videoGravity = .resizeAspect
    view.showsSharingServiceButton = false
    view.allowsPictureInPicturePlayback = false
    view.player = player
    return view
  }
  func updateNSView(_ view: AVPlayerView, context: Context) { view.player = player }
  static func dismantleNSView(_ view: AVPlayerView, coordinator: ()) { view.player = nil }
}

private struct SectionHeading: View {
  let number: String
  let title: String
  var body: some View {
    HStack(spacing: 8) {
      Text(number).font(.system(size: 10, weight: .medium, design: .monospaced)).foregroundColor(StudioStyle.muted)
      Text(title).font(.system(size: 13, weight: .semibold)).foregroundColor(StudioStyle.text)
    }
  }
}

private struct StudioView: View {
  @ObservedObject var model: StudioModel
  @State private var dropTargeted = false

  var body: some View {
    VStack(spacing: 0) {
      GeometryReader { geometry in
        ScrollView {
          HStack(alignment: .top, spacing: 28) {
            previewColumn(stageHeight: max(240, geometry.size.height - 230)).frame(maxWidth: .infinity)
            inspector.frame(width: 258)
          }
          .padding(28)
        }
      }
      footer
    }
    .frame(minWidth: 760, minHeight: 580)
    .background(StudioStyle.background)
    .foregroundColor(StudioStyle.text)
    .preferredColorScheme(.dark)
    .background(WindowObserver(model: model))
    .onAppear { model.refresh() }
    .onDrop(of: [UTType.fileURL], isTargeted: $dropTargeted) { model.acceptDrop($0) }
    .overlay {
      if dropTargeted && !model.busy {
        RoundedRectangle(cornerRadius: 14).strokeBorder(StudioStyle.accent, lineWidth: 3).padding(6).allowsHitTesting(false)
      }
    }
  }

  private func previewColumn(stageHeight: CGFloat) -> some View {
    VStack(alignment: .leading, spacing: 15) {
      HStack {
        SectionHeading(number: "01", title: "畫面預覽")
        Spacer()
        if model.media != nil {
          Text(model.snapshot?.selection != nil ? "待套用" : model.snapshot?.active?.applied == true ? "已套用" : "已儲存")
            .font(.system(size: 10, weight: .medium))
            .foregroundColor(model.snapshot?.selection != nil ? StudioStyle.accent : StudioStyle.muted)
            .padding(.horizontal, 9).padding(.vertical, 4)
            .background(Capsule().fill(StudioStyle.raised))
        }
      }
      ZStack {
        Color.black.opacity(0.45)
        if let image = model.previewImage {
          Image(nsImage: image).resizable().interpolation(.high).scaledToFit()
        } else if let player = model.player {
          NativeVideoPreview(player: player)
        } else {
          VStack(spacing: 14) {
            Image(systemName: model.media == nil ? "photo.on.rectangle.angled" : "exclamationmark.triangle")
              .font(.system(size: 37, weight: .ultraLight)).foregroundColor(StudioStyle.muted.opacity(0.65))
            Text(model.media == nil ? "尚未選擇素材" : model.decoding ? "正在準備預覽…" : "目前無法顯示預覽")
              .font(.system(size: 12)).foregroundColor(StudioStyle.muted)
            if model.media == nil { Text("匯入圖片或影片，即可在這裡預覽。")
              .font(.system(size: 10)).foregroundColor(StudioStyle.muted.opacity(0.7)) }
          }
        }
        if model.previewImage != nil || model.player != nil {
          Color.black.opacity(model.maskOpacity).allowsHitTesting(false).accessibilityHidden(true)
        }
        if model.decoding { ProgressView().controlSize(.small).padding(12).background(StudioStyle.background.opacity(0.8), in: Capsule()) }
      }
      .frame(height: stageHeight)
      .clipShape(RoundedRectangle(cornerRadius: 14))
      .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(StudioStyle.line))
      .overlay(alignment: .topTrailing) {
        if model.previewReady {
          Text(model.mediaLabel).font(.system(size: 9, weight: .medium))
            .padding(.horizontal, 9).padding(.vertical, 6)
            .background(Color.black.opacity(0.7), in: Capsule()).padding(12).allowsHitTesting(false)
        }
      }
      .accessibilityLabel("背景素材預覽")
      if let media = model.media {
        VStack(alignment: .leading, spacing: 17) {
          HStack(spacing: 9) {
            Image(systemName: media.kind == "video" ? "film" : "photo").font(.system(size: 13)).foregroundColor(StudioStyle.muted)
            Text(media.name).font(.system(size: 12, weight: .medium)).lineLimit(1).truncationMode(.middle).help(media.name)
              .accessibilityIdentifier("preview-file-name")
            Spacer(minLength: 0)
            Text("本機素材").font(.system(size: 9)).foregroundColor(StudioStyle.muted)
          }
          HStack(spacing: 12) {
            fact("素材類型", media.kind == "video" ? "MP4 影片" : "圖片")
            fact("解析度", model.resolution)
            fact("檔案大小", ByteCountFormatter.string(fromByteCount: media.bytes, countStyle: .file))
          }
        }
        .padding(16).background(StudioStyle.surface, in: RoundedRectangle(cornerRadius: 12))
        if media.kind == "video" {
          Label("預覽預設暫停。套用後靜音循環，保留原始畫質與幀率。", systemImage: "speaker.slash")
            .font(.system(size: 10)).foregroundColor(StudioStyle.muted).fixedSize(horizontal: false, vertical: true)
        }
      }
    }
  }

  private func fact(_ label: String, _ value: String) -> some View {
    VStack(alignment: .leading, spacing: 7) {
      Text(label).font(.system(size: 9)).foregroundColor(StudioStyle.muted)
      Text(value).font(.system(size: 11, weight: .medium, design: .monospaced)).lineLimit(1).minimumScaleFactor(0.8)
    }.frame(maxWidth: .infinity, alignment: .leading)
  }

  private var inspector: some View {
    VStack(alignment: .leading, spacing: 18) {
      VStack(alignment: .leading, spacing: 12) {
        HStack {
          SectionHeading(number: "02", title: "素材來源")
          Spacer()
          Text("圖片 / 影片").font(.system(size: 9)).foregroundColor(StudioStyle.muted)
        }
        Button(action: model.chooseFile) {
          VStack(alignment: .leading, spacing: 10) {
            Image(systemName: "photo.badge.plus").font(.system(size: 22, weight: .light)).foregroundColor(StudioStyle.accent)
            VStack(alignment: .leading, spacing: 7) {
              Text(model.media == nil ? "匯入背景素材" : "更換背景素材").font(.system(size: 13, weight: .semibold))
              Text("拖入圖片或 MP4，也可點此選擇").font(.system(size: 10)).foregroundColor(StudioStyle.muted)
            }
            Rectangle().fill(StudioStyle.line).frame(height: 1)
            HStack {
              Text("選擇檔案").font(.system(size: 11, weight: .medium))
              Spacer()
              Image(systemName: "arrow.up.right").font(.system(size: 12))
            }.foregroundColor(StudioStyle.accent)
          }
          .frame(maxWidth: .infinity, alignment: .leading).padding(15)
          .background(StudioStyle.surface, in: RoundedRectangle(cornerRadius: 13))
          .overlay(RoundedRectangle(cornerRadius: 13).strokeBorder(StudioStyle.muted.opacity(0.25), style: StrokeStyle(lineWidth: 1, dash: [5, 4])))
        }
        .buttonStyle(.plain).disabled(model.busy).opacity(model.busy ? 0.5 : 1)
        .help("開啟本機檔案選擇視窗")
        .accessibilityLabel("選擇檔案")
        .accessibilityIdentifier("import-background")
        Text("常見圖片格式與 MP4\n圖片 ≤ 50 MiB · 影片 ≤ 256 MiB")
          .font(.system(size: 9)).foregroundColor(StudioStyle.muted).lineSpacing(5)
      }
      VStack(alignment: .leading, spacing: 12) {
        SectionHeading(number: "03", title: "使用偏好")
        HStack(alignment: .center, spacing: 12) {
          VStack(alignment: .leading, spacing: 7) {
            Text("啟動時自動套用").font(.system(size: 12, weight: .medium))
            Text("下次開啟 Codex，繼續使用目前背景。")
              .font(.system(size: 10)).foregroundColor(StudioStyle.muted).fixedSize(horizontal: false, vertical: true)
          }
          Spacer(minLength: 0)
          Toggle("啟動時自動套用", isOn: Binding(get: { model.snapshot?.autostart ?? false }, set: model.setAutostart))
            .toggleStyle(.switch).tint(StudioStyle.accent).labelsHidden().controlSize(.small).disabled(model.busy)
            .accessibilityLabel("啟動時自動套用")
            .accessibilityIdentifier("autostart-background")
        }
        .padding(12).background(StudioStyle.surface, in: RoundedRectangle(cornerRadius: 12))
        VStack(alignment: .leading, spacing: 8) {
          HStack {
            Text("遮罩深度").font(.system(size: 12, weight: .medium))
            Spacer()
            Text("\(Int((model.maskOpacity * 100).rounded()))%")
              .font(.system(size: 11, weight: .medium, design: .monospaced)).foregroundColor(StudioStyle.accent)
              .accessibilityIdentifier("mask-opacity-value")
          }
          Slider(value: Binding(get: { model.maskOpacity }, set: model.setMaskOpacity), in: 0...1, step: 0.01,
            onEditingChanged: model.setMaskEditing)
            .tint(StudioStyle.accent).controlSize(.small).disabled(model.busy)
            .accessibilityLabel("遮罩深度")
            .accessibilityValue("\(Int((model.maskOpacity * 100).rounded()))%")
            .accessibilityIdentifier("mask-opacity")
          HStack {
            Text("明")
            Spacer()
            Text("全版一起調整")
            Spacer()
            Text("暗")
          }.font(.system(size: 9)).foregroundColor(StudioStyle.muted)
        }
        .padding(12).background(StudioStyle.surface, in: RoundedRectangle(cornerRadius: 12))
        HStack(alignment: .top, spacing: 7) {
          Circle().fill(model.snapshot?.active == nil ? StudioStyle.muted : StudioStyle.accent).frame(width: 4, height: 4).padding(.top, 4)
          Text("正在使用").font(.system(size: 9)).foregroundColor(StudioStyle.muted)
          Text(model.snapshot?.active?.name ?? "尚未設定").font(.system(size: 9)).lineLimit(1).truncationMode(.middle)
            .help(model.snapshot?.active?.name ?? "尚未設定")
        }
        if model.snapshot?.autostart == true && model.snapshot?.autostartLoaded == false {
          Label("自動套用服務尚未就緒", systemImage: "exclamationmark.circle")
            .font(.system(size: 10)).foregroundColor(.orange)
        }
      }
      HStack(alignment: .top, spacing: 10) {
        Image(systemName: "checkmark.shield").font(.system(size: 15, weight: .light)).padding(.top, 1)
        VStack(alignment: .leading, spacing: 6) {
          Text("只在這台電腦處理").font(.system(size: 10, weight: .medium))
          Text("你的檔案，不會上傳雲端。").font(.system(size: 9)).foregroundColor(StudioStyle.muted)
        }
      }.foregroundColor(StudioStyle.muted)
    }
  }

  private var footer: some View {
    VStack(spacing: 0) {
      Rectangle().fill(StudioStyle.line).frame(height: 1)
      HStack(spacing: 26) {
        HStack(alignment: .center, spacing: 10) {
          if model.busy { ProgressView().controlSize(.small).frame(width: 14) }
          else { Circle().fill(model.errorMessage.isEmpty ? StudioStyle.accent : Color.orange).frame(width: 5, height: 5) }
          Text(model.statusMessage).font(.system(size: 11)).lineLimit(3)
            .foregroundColor(model.errorMessage.isEmpty ? StudioStyle.muted : Color.orange)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityLabel("操作狀態：\(model.statusMessage)")
            .accessibilityIdentifier("operation-status")
        }
        Button(action: model.apply) {
          HStack(spacing: 20) {
            Text(model.applyLabel).font(.system(size: 12, weight: .semibold))
            Spacer(minLength: 0)
            Image(systemName: "arrow.right").font(.system(size: 13, weight: .medium))
          }.frame(width: 193).padding(.horizontal, 18).frame(height: 42)
        }
        .buttonStyle(.plain)
        .foregroundColor(model.canApply ? StudioStyle.background : StudioStyle.muted)
        .background(model.canApply ? StudioStyle.accent : StudioStyle.raised, in: RoundedRectangle(cornerRadius: 10))
        .disabled(!model.canApply)
        .keyboardShortcut(.return, modifiers: [])
        .accessibilityLabel(model.applyLabel)
        .accessibilityIdentifier("apply-background")
      }.padding(.horizontal, 28).padding(.vertical, 12)
    }.background(StudioStyle.background)
  }
}

private struct WindowObserver: NSViewRepresentable {
  let model: StudioModel
  func makeCoordinator() -> Coordinator { Coordinator(model: model) }
  func makeNSView(context: Context) -> WindowCaptureView {
    let view = WindowCaptureView()
    view.onWindow = { [weak coordinator = context.coordinator] window in coordinator?.attach(window) }
    return view
  }
  func updateNSView(_ nsView: WindowCaptureView, context: Context) {}

  final class WindowCaptureView: NSView {
    var onWindow: ((NSWindow) -> Void)?
    override func viewDidMoveToWindow() {
      super.viewDidMoveToWindow()
      if let window { onWindow?(window) }
    }
  }

  @MainActor final class Coordinator: NSObject, NSWindowDelegate {
    let model: StudioModel
    weak var window: NSWindow?
    var observers: [NSObjectProtocol] = []
    init(model: StudioModel) { self.model = model }
    func attach(_ window: NSWindow) {
      guard self.window !== window else { return }
      self.window = window
      window.delegate = self
      window.title = "Xskin"
      window.titleVisibility = .visible
      window.backgroundColor = NSColor(StudioStyle.background)
      window.minSize = NSSize(width: 760, height: 580)
      for name in [NSApplication.didHideNotification, NSApplication.didUnhideNotification] {
        observers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
          Task { @MainActor in self?.updateVisibility() }
        })
      }
    }
    private func updateVisibility() {
      model.setWindowVisible(window?.occlusionState.contains(.visible) == true && !NSApp.isHidden)
    }
    func windowDidChangeOcclusionState(_ notification: Notification) { updateVisibility() }
    func windowDidMiniaturize(_ notification: Notification) { model.setWindowVisible(false) }
    func windowDidDeminiaturize(_ notification: Notification) { updateVisibility() }
    func windowShouldClose(_ sender: NSWindow) -> Bool {
      guard !model.busy && !model.hasPendingMask else {
        NSSound.beep()
        return false
      }
      model.close()
      return true
    }
    deinit { for observer in observers { NotificationCenter.default.removeObserver(observer) } }
  }
}

@MainActor
private final class StudioAppDelegate: NSObject, NSApplicationDelegate {
  weak var model: StudioModel?
  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.setActivationPolicy(.regular)
    NSApp.activate(ignoringOtherApps: true)
  }
  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
  func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
    guard model?.busy != true && model?.hasPendingMask != true else {
      NSSound.beep()
      return .terminateCancel
    }
    model?.close()
    return .terminateNow
  }
}

@main
private struct XskinApp: App {
  @NSApplicationDelegateAdaptor(StudioAppDelegate.self) private var delegate
  @StateObject private var model = StudioModel()
  var body: some Scene {
    Window("Xskin", id: "xskin") {
      StudioView(model: model).onAppear { delegate.model = model }
    }
    .windowStyle(.titleBar)
    .windowResizability(.contentMinSize)
    .defaultSize(width: 1080, height: 680)
    .commands {
      CommandGroup(replacing: .newItem) {
        Button("匯入背景素材…", action: model.chooseFile).keyboardShortcut("o", modifiers: .command).disabled(model.busy)
      }
    }
  }
}
