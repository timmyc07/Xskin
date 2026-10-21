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
  let messageCode: String?
}

private struct CommandError: Decodable { let errorCode: String? }

private struct StudioFailure: LocalizedError {
  let key: XskinText
  var errorDescription: String? { XskinLocalization.text(key, language: .english) }
}

private enum StudioCommand {
  static func run(_ command: String, arguments: [String] = []) async throws -> StudioSnapshot {
    guard let resources = Bundle.main.resourceURL else {
      throw StudioFailure(key: .resourcesUnavailable)
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
            throw StudioFailure(key: failure?.errorCode.flatMap(XskinText.init(rawValue:)) ?? .operationFailed)
          }
          guard let result = try? JSONDecoder().decode(StudioSnapshot.self, from: data) else {
            throw StudioFailure(key: .responseInvalid)
          }
          guard result.maskOpacity.isFinite && (0...1).contains(result.maskOpacity) else {
            throw StudioFailure(key: .maskResponseInvalid)
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
    var messageKey: XskinText {
      switch self {
      case .loading: return .operationLoading
      case .importing: return .operationImporting
      case .applying: return .operationApplying
      case .autostart: return .operationAutostart
      case .mask: return .operationMask
      }
    }
  }

  @Published var snapshot: StudioSnapshot?
  @Published var operation: Operation? = .loading
  @Published var error: XskinText?
  @Published var notice: XskinText?
  @Published var language: XskinLanguage {
    didSet { UserDefaults.standard.set(language.rawValue, forKey: "xskin.language") }
  }
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

  init() {
    language = XskinLanguage(rawValue: UserDefaults.standard.string(forKey: "xskin.language") ?? "en") ?? .english
  }

  func text(_ key: XskinText) -> String { XskinLocalization.text(key, language: language) }
  var errorMessage: String { error.map(text) ?? "" }
  func fileSize(_ bytes: Int64) -> String {
    String(format: "%.1f MiB", locale: language.locale, Double(bytes) / (1024 * 1024))
  }

  var media: StudioMedia? { snapshot?.selection ?? snapshot?.active }
  var busy: Bool { operation != nil }
  var hasPendingMask: Bool { maskEdited }
  var canApply: Bool {
    !busy && !importFailed && previewReady && snapshot?.selection?.id != nil
  }
  var statusMessage: String {
    if let operation { return text(operation.messageKey) }
    if !errorMessage.isEmpty { return errorMessage }
    if let notice { return text(notice) }
    if snapshot?.selection != nil { return text(.statusReady) }
    if snapshot?.active?.applied == true { return text(.statusApplied) }
    return text(.statusChoose)
  }
  var resolution: String {
    dimensions.width > 0 ? "\(Int(dimensions.width)) × \(Int(dimensions.height))" : decoding ? text(.reading) : "—"
  }
  var mediaLabel: String {
    guard let media else { return "" }
    if media.kind == "image" { return text(.imageBackground) }
    return text(dimensions.width >= 3840 && dimensions.height >= 2160 ? .original4K : .originalMP4)
  }
  var applyLabel: String {
    if operation == .applying { return text(.applyBusy) }
    if snapshot?.selection != nil { return text(.applyButton) }
    if snapshot?.active?.applied == true && notice != nil { return text(.applySuccess) }
    return text(.applyImport)
  }

  func refresh() {
    guard snapshot == nil else { return }
    Task { await perform("status", operation: .loading) }
  }

  func chooseFile() {
    guard !busy else { return }
    player?.pause()
    let panel = NSOpenPanel()
    panel.title = text(.importBackground)
    panel.message = text(.importPanelHint)
    panel.prompt = text(.importMedia)
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
      error = .localFileRequired
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
      if !busy { error = .dropOneFile }
      return false
    }
    provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) { [weak self] item, error in
      let url = (item as? URL) ?? (item as? Data).flatMap { URL(dataRepresentation: $0, relativeTo: nil) }
      Task { @MainActor in
        guard let self else { return }
        guard error == nil, let url else {
          self.error = .dropUnreadable
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
    error = nil
    notice = nil
    do {
      let result = try await StudioCommand.run(command, arguments: arguments)
      snapshot = result
      if !maskEdited { maskOpacity = result.maskOpacity }
      if command == "import" { importFailed = false }
      notice = result.messageCode.map { XskinText(rawValue: $0) ?? .operationFailed }
      preparePreview()
    } catch {
      self.error = (error as? StudioFailure)?.key ?? .operationFailed
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
          throw StudioFailure(key: .fileUnreadable)
        }
        if media.kind == "image" {
          let decoded = await Task.detached(priority: .userInitiated) { () -> CGImage? in
            guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
            return CGImageSourceCreateImageAtIndex(source, 0, [kCGImageSourceShouldCacheImmediately: true] as CFDictionary)
          }.value
          try Task.checkCancellation()
          guard let decoded else { throw StudioFailure(key: .imageDecode) }
          self?.previewImage = NSImage(cgImage: decoded, size: .zero)
          self?.dimensions = CGSize(width: decoded.width, height: decoded.height)
          self?.previewReady = true
          self?.decoding = false
        } else if media.kind == "video" {
          let asset = AVURLAsset(url: url)
          guard try await asset.load(.isPlayable), let track = try await asset.loadTracks(withMediaType: .video).first else {
            throw StudioFailure(key: .videoUnplayable)
          }
          let (size, transform) = try await track.load(.naturalSize, .preferredTransform)
          try Task.checkCancellation()
          let transformed = size.applying(transform)
          let dimensions = CGSize(width: abs(transformed.width), height: abs(transformed.height))
          guard dimensions.width > 0, dimensions.height > 0 else {
            throw StudioFailure(key: .videoNoFrames)
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
                self.error = .videoDecode
              }
            }
          }
          self?.loopObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak player] _ in
            player?.seek(to: .zero) { finished in if finished { player?.play() } }
          }
        } else {
          throw StudioFailure(key: .mediaUnsupported)
        }
      } catch is CancellationError {
      } catch {
        guard !Task.isCancelled else { return }
        self?.decoding = false
        self?.previewReady = false
        self?.error = (error as? StudioFailure)?.key ?? (media.kind == "video" ? .videoDecode : .imageDecode)
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
    .environment(\.locale, model.language.locale)
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
        SectionHeading(number: "01", title: model.text(.preview))
        Spacer()
        if model.media != nil {
          Text(model.text(model.snapshot?.selection != nil ? .pending : model.snapshot?.active?.applied == true ? .appliedBadge : .savedBadge))
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
            Text(model.text(model.media == nil ? .noMedia : model.decoding ? .preparingPreview : .previewUnavailable))
              .font(.system(size: 12)).foregroundColor(StudioStyle.muted)
            if model.media == nil { Text(model.text(.previewHint))
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
      .accessibilityLabel(model.text(.previewAccessibility))
      if let media = model.media {
        VStack(alignment: .leading, spacing: 17) {
          HStack(spacing: 9) {
            Image(systemName: media.kind == "video" ? "film" : "photo").font(.system(size: 13)).foregroundColor(StudioStyle.muted)
            Text(media.name).font(.system(size: 12, weight: .medium)).lineLimit(1).truncationMode(.middle).help(media.name)
              .accessibilityIdentifier("preview-file-name")
            Spacer(minLength: 0)
            Text(model.text(.localMedia)).font(.system(size: 9)).foregroundColor(StudioStyle.muted)
          }
          HStack(spacing: 12) {
            fact(model.text(.mediaType), model.text(media.kind == "video" ? .mp4Video : .image))
            fact(model.text(.resolution), model.resolution)
            fact(model.text(.fileSize), model.fileSize(media.bytes))
          }
        }
        .padding(16).background(StudioStyle.surface, in: RoundedRectangle(cornerRadius: 12))
        if media.kind == "video" {
          Label(model.text(.videoHint), systemImage: "speaker.slash")
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
          SectionHeading(number: "02", title: model.text(.source))
          Spacer()
          Text(model.text(.mediaFormats)).font(.system(size: 9)).foregroundColor(StudioStyle.muted)
        }
        Button(action: model.chooseFile) {
          VStack(alignment: .leading, spacing: 10) {
            Image(systemName: "photo.badge.plus").font(.system(size: 22, weight: .light)).foregroundColor(StudioStyle.accent)
            VStack(alignment: .leading, spacing: 7) {
              Text(model.text(model.media == nil ? .importBackground : .changeBackground)).font(.system(size: 13, weight: .semibold))
              Text(model.text(.dropHint)).font(.system(size: 10)).foregroundColor(StudioStyle.muted)
            }
            Rectangle().fill(StudioStyle.line).frame(height: 1)
            HStack {
              Text(model.text(.chooseFile)).font(.system(size: 11, weight: .medium))
              Spacer()
              Image(systemName: "arrow.up.right").font(.system(size: 12))
            }.foregroundColor(StudioStyle.accent)
          }
          .frame(maxWidth: .infinity, alignment: .leading).padding(15)
          .background(StudioStyle.surface, in: RoundedRectangle(cornerRadius: 13))
          .overlay(RoundedRectangle(cornerRadius: 13).strokeBorder(StudioStyle.muted.opacity(0.25), style: StrokeStyle(lineWidth: 1, dash: [5, 4])))
        }
        .buttonStyle(.plain).disabled(model.busy).opacity(model.busy ? 0.5 : 1)
        .help(model.text(.chooseFileHelp))
        .accessibilityLabel(model.text(.chooseFile))
        .accessibilityIdentifier("import-background")
        Text(model.text(.fileLimits))
          .font(.system(size: 9)).foregroundColor(StudioStyle.muted).lineSpacing(5)
      }
      VStack(alignment: .leading, spacing: 12) {
        HStack {
          SectionHeading(number: "03", title: model.text(.preferences))
          Spacer(minLength: 4)
          Picker(model.text(.language), selection: $model.language) {
            ForEach(XskinLanguage.allCases) { language in Text(language.name).tag(language) }
          }
          .labelsHidden().pickerStyle(.menu).controlSize(.small).frame(width: 112)
          .accessibilityLabel(model.text(.language))
          .accessibilityIdentifier("interface-language")
          .help(model.text(.language))
        }
        HStack(alignment: .center, spacing: 12) {
          VStack(alignment: .leading, spacing: 7) {
            Text(model.text(.autostartLabel)).font(.system(size: 12, weight: .medium))
            Text(model.text(.autostartHint))
              .font(.system(size: 10)).foregroundColor(StudioStyle.muted).fixedSize(horizontal: false, vertical: true)
          }
          Spacer(minLength: 0)
          Toggle(model.text(.autostartLabel), isOn: Binding(get: { model.snapshot?.autostart ?? false }, set: model.setAutostart))
            .toggleStyle(.switch).tint(StudioStyle.accent).labelsHidden().controlSize(.small).disabled(model.busy)
            .accessibilityLabel(model.text(.autostartLabel))
            .accessibilityIdentifier("autostart-background")
        }
        .padding(12).background(StudioStyle.surface, in: RoundedRectangle(cornerRadius: 12))
        VStack(alignment: .leading, spacing: 8) {
          HStack {
            Text(model.text(.maskDepth)).font(.system(size: 12, weight: .medium))
            Spacer()
            Text("\(Int((model.maskOpacity * 100).rounded()))%")
              .font(.system(size: 11, weight: .medium, design: .monospaced)).foregroundColor(StudioStyle.accent)
              .accessibilityIdentifier("mask-opacity-value")
          }
          Slider(value: Binding(get: { model.maskOpacity }, set: model.setMaskOpacity), in: 0...1, step: 0.01,
            onEditingChanged: model.setMaskEditing)
            .tint(StudioStyle.accent).controlSize(.small).disabled(model.busy)
            .accessibilityLabel(model.text(.maskDepth))
            .accessibilityValue("\(Int((model.maskOpacity * 100).rounded()))%")
            .accessibilityIdentifier("mask-opacity")
          HStack {
            Text(model.text(.light))
            Spacer()
            Text(model.text(.entireWindow))
            Spacer()
            Text(model.text(.dark))
          }.font(.system(size: 9)).foregroundColor(StudioStyle.muted)
        }
        .padding(12).background(StudioStyle.surface, in: RoundedRectangle(cornerRadius: 12))
        HStack(alignment: .top, spacing: 7) {
          Circle().fill(model.snapshot?.active == nil ? StudioStyle.muted : StudioStyle.accent).frame(width: 4, height: 4).padding(.top, 4)
          Text(model.text(.activeBackground)).font(.system(size: 9)).foregroundColor(StudioStyle.muted)
          Text(model.snapshot?.active?.name ?? model.text(.notConfigured)).font(.system(size: 9)).lineLimit(1).truncationMode(.middle)
            .help(model.snapshot?.active?.name ?? model.text(.notConfigured))
        }
        if model.snapshot?.autostart == true && model.snapshot?.autostartLoaded == false {
          Label(model.text(.autostartUnavailable), systemImage: "exclamationmark.circle")
            .font(.system(size: 10)).foregroundColor(.orange)
        }
      }
      HStack(alignment: .top, spacing: 10) {
        Image(systemName: "checkmark.shield").font(.system(size: 15, weight: .light)).padding(.top, 1)
        VStack(alignment: .leading, spacing: 6) {
          Text(model.text(.localProcessing)).font(.system(size: 10, weight: .medium))
          Text(model.text(.privacy)).font(.system(size: 9)).foregroundColor(StudioStyle.muted)
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
            .accessibilityLabel(model.text(.statusPrefix) + model.statusMessage)
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
        Button(model.text(.importMenu), action: model.chooseFile).keyboardShortcut("o", modifiers: .command).disabled(model.busy)
      }
    }
  }
}
