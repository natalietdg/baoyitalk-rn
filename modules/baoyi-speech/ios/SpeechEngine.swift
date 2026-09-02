import AVFoundation
import os

/// Speaks a batch of parts — one language, or all three in sequence.
///
/// This is a port of the SwiftUI app's `Speaker`, and it lives in native code on purpose.
/// The queue is stepped here rather than in JavaScript because every hard bug this class solves
/// is a race inside `AVSpeechSynthesizer` (see `awaitingCancel`). Driving that queue across an
/// async JS bridge would re-open all of them with worse timing.
///
/// Main-queue-only by convention: `onMain` funnels every delegate callback before it reads or
/// writes any member below.
final class SpeechEngine: NSObject {
    /// One thing to say.
    struct Part {
        let text: String
        let bcp47: String
        /// A parent recording to play instead of synthesising. Wins over TTS when present.
        let recordingUri: String?
        /// Counting only: how many objects should be showing while this is said.
        let reveal: Int?
    }

    /// What the engine reports back to JavaScript.
    enum Event {
        case boundary(batchId: String, partIndex: Int, text: String, location: Int, length: Int)
        case partStarted(batchId: String, partIndex: Int, text: String, bcp47: String)
        case reveal(batchId: String, count: Int)
        case finished(batchId: String)
        case stopped(batchId: String)
        case log(String)
    }

    var onEvent: ((Event) -> Void)?

    private let synthesizer = AVSpeechSynthesizer()
    private let logger = Logger(subsystem: "com.natalieleong.BaoYiTalk", category: "tts")

    /// Resolved once — exact voice at the best installed quality, or a same-family fallback.
    private lazy var voices: [String: AVSpeechSynthesisVoice] = resolveVoices()

    /// Mandarin polyphone pins, pushed from JS content so the table stays data, not code.
    /// Keys are substrings, not characters: 着 is zháo in 睡着 but zhe as an aspect particle.
    private var pronunciationPins: [String: String] = [:]

    private var queue: [Part] = []
    private var queueIndex = 0
    private var batchId = ""
    private var rate: Float = 0.35

    /// **Muted means volume 0, not "don't speak".**
    ///
    /// The utterance is still handed to the synthesizer, so the word-boundary highlight, the
    /// counting reveal, a story's auto-advance and an activity's step all keep **real speech
    /// timing**. Skipping the utterance instead would mean either freezing those or faking their
    /// timing — and a muted tap would feel like a broken tap.
    ///
    /// It is also an app-level flag, never an audio-session change: deactivating the session to go
    /// quiet is what left the Swift app silent even after unmuting.
    private var muted = false

    /// Bumped on every new batch and every stop, so a late callback can tell it is stale.
    private var generation = 0

    private var lastUtterance: AVSpeechUtterance?
    private var player: AVAudioPlayer?
    private var playerGeneration = -1

    /// True between asking the synthesizer to stop and its cancel/finish callback landing.
    ///
    /// **This is what kept the story reader going silent on the third page.** `stopSpeaking` is
    /// not synchronous: handing the synthesizer a new utterance while it is still tearing down a
    /// cancelled one gets the new one cancelled too.
    private var awaitingCancel = false
    private var pendingUtterance: AVSpeechUtterance?
    private var currentPartIndex = 0

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    // MARK: audio session

    /// **Ship-blocker if omitted.** The default category obeys the ringer switch, so on a phone
    /// set to silent — which is most phones a parent hands over — a sound-first app is mute and
    /// looks broken. `.playback` ignores the switch; `.spokenAudio` is the narration mode.
    ///
    /// Returns the category actually in force, so a test can prove it rather than assume it.
    func configureAudioSession() -> [String: Any] {
        let session = AVAudioSession.sharedInstance()
        var error: String?
        do {
            try session.setCategory(.playback, mode: .spokenAudio)
            try session.setActive(true)
        } catch let failure {
            error = failure.localizedDescription
            logger.error("Audio session setup failed: \(failure.localizedDescription, privacy: .public)")
        }
        let result: [String: Any] = [
            "category": session.category.rawValue,
            "mode": session.mode.rawValue,
            "playsWhenSilent": session.category == .playback || session.category == .playAndRecord,
            "error": error ?? NSNull()
        ]
        emitLog("Audio session: category=\(session.category.rawValue) mode=\(session.mode.rawValue)")
        return result
    }

    // MARK: voices

    /// Every installed voice, with its **real** quality tier.
    ///
    /// Both published RN TTS libraries collapse `.premium` into "default" — they only test for
    /// `.enhanced` — which makes a premium voice look like the tinny compact one. Reporting the
    /// three tiers honestly is half the reason this module exists.
    func listVoices() -> [[String: Any]] {
        AVSpeechSynthesisVoice.speechVoices().map { voice in
            [
                "identifier": voice.identifier,
                "name": voice.name,
                "language": voice.language,
                "quality": qualityName(voice.quality),
                "qualityRank": voice.quality.rawValue
            ]
        }
    }

    /// Exact language at the best installed quality, else any voice in the same language family.
    ///
    /// `AVSpeechSynthesisVoice(language:)` returns the *default* voice, which is the compact tier.
    /// A parent who downloaded an enhanced or premium voice should actually hear it, so the list
    /// is searched and sorted by quality instead.
    private func resolveVoices() -> [String: AVSpeechSynthesisVoice] {
        let installed = AVSpeechSynthesisVoice.speechVoices()
        var resolved: [String: AVSpeechSynthesisVoice] = [:]

        for code in ["en-US", "ms-MY", "zh-CN"] {
            if let exact = installed.filter({ $0.language == code })
                .max(by: { $0.quality.rawValue < $1.quality.rawValue }) {
                resolved[code] = exact
                emitLog("voice \(code) -> \(exact.identifier) quality=\(qualityName(exact.quality))")
                continue
            }
            let prefix = String(code.prefix(2))
            if let family = installed.filter({ $0.language.hasPrefix(prefix) })
                .max(by: { $0.quality.rawValue < $1.quality.rawValue }) {
                resolved[code] = family
                emitLog("voice \(code) MISSING -> family fallback \(family.language) (\(family.identifier)) quality=\(qualityName(family.quality))")
            } else {
                emitLog("voice \(code) MISSING -> no voice at all, system default will be used")
            }
        }
        return resolved
    }

    /// What the app resolved for each language it speaks — the evidence the settings screen and
    /// the audio spike both read.
    func resolvedVoices() -> [[String: Any]] {
        ["en-US", "ms-MY", "zh-CN"].map { code in
            guard let voice = voices[code] else {
                return ["requested": code, "resolved": NSNull(), "quality": NSNull(), "isFallback": true]
            }
            return [
                "requested": code,
                "resolved": voice.identifier,
                "name": voice.name,
                "language": voice.language,
                "quality": qualityName(voice.quality),
                "isFallback": voice.language != code
            ]
        }
    }

    private func qualityName(_ quality: AVSpeechSynthesisVoiceQuality) -> String {
        switch quality {
        case .premium:  return "premium"
        case .enhanced: return "enhanced"
        case .default:  return "compact"
        @unknown default: return "unknown"
        }
    }

    // MARK: pronunciation

    func setPronunciationPins(_ pins: [String: String]) {
        pronunciationPins = pins
        emitLog("pronunciation pins loaded: \(pins.count)")
    }

    /// Applies `AVSpeechSynthesisIPANotationAttribute` to every pinned substring.
    ///
    /// Mandarin polyphones are where a zh-CN voice most visibly fails, and TTS is the default
    /// experience rather than a fallback, so each trap is named explicitly.
    ///
    /// **Honest limit:** Apple does not document IPA coverage for zh-CN. The pin is applied and
    /// logged; whether the voice honours it has to be confirmed by a human listening.
    private func utterance(for text: String, bcp47: String) -> AVSpeechUtterance {
        guard bcp47.hasPrefix("zh") else { return AVSpeechUtterance(string: text) }
        let applicable = pronunciationPins.filter { text.contains($0.key) }
        guard !applicable.isEmpty else { return AVSpeechUtterance(string: text) }

        let attributed = NSMutableAttributedString(string: text)
        let ipaKey = NSAttributedString.Key(rawValue: AVSpeechSynthesisIPANotationAttribute)
        for (substring, ipa) in applicable {
            var searchFrom = 0
            while searchFrom < attributed.length {
                let remaining = NSRange(location: searchFrom, length: attributed.length - searchFrom)
                let found = (attributed.string as NSString).range(of: substring, range: remaining)
                guard found.location != NSNotFound else { break }
                attributed.addAttribute(ipaKey, value: ipa, range: found)
                searchFrom = found.location + found.length
            }
            emitLog("IPA pin applied \(substring) -> \(ipa) in \"\(text)\"")
        }
        return AVSpeechUtterance(attributedString: attributed)
    }

    // MARK: speaking

    /// Changing it stops the line in flight: muting must go quiet now, and unmuting must not
    /// suddenly blurt out the tail of a phrase nobody heard the start of.
    func setMuted(_ value: Bool) {
        guard value != muted else { return }
        muted = value
        emitLog("mute \(value ? "on" : "off")")
        stop()
    }

    func speak(batchId: String, parts: [Part], rate: Float) {
        emitLog("speak [\(batchId)] \(parts.count) part(s)")
        stop(notify: false)
        guard !parts.isEmpty else {
            onEvent?(.finished(batchId: batchId))
            return
        }
        generation += 1
        self.batchId = batchId
        self.rate = rate
        queue = parts
        queueIndex = 0
        playNext()
    }

    /// Silences everything and forgets any pending completion, so cancelling never auto-advances
    /// a story a child just closed.
    func stop(notify: Bool = true) {
        let cancelled = batchId
        let hadWork = !queue.isEmpty || synthesizer.isSpeaking || player != nil
        generation += 1
        queue = []
        queueIndex = 0
        lastUtterance = nil
        pendingUtterance = nil
        player?.stop()
        player = nil
        // Only ask for a stop if there is something to stop — an unnecessary stop makes the next
        // utterance wait on a cancel callback that never comes.
        if synthesizer.isSpeaking || synthesizer.isPaused {
            awaitingCancel = true
            synthesizer.stopSpeaking(at: .immediate)
        }
        if notify && hadWork && !cancelled.isEmpty {
            onEvent?(.stopped(batchId: cancelled))
        }
    }

    var isSpeaking: Bool { synthesizer.isSpeaking || player != nil }

    private func playNext() {
        guard queueIndex < queue.count else {
            let finishedBatch = batchId
            let firedAt = generation
            queue = []
            // **Handed to the next main-queue turn, never called inline.** This completion turns a
            // story page, which stops and restarts this same synthesizer — doing that inside its
            // own `didFinish` is what wedged narration after a page or two.
            DispatchQueue.main.async { [weak self] in
                guard let self, self.generation == firedAt else { return }
                self.emitLog("batch finished [\(finishedBatch)]")
                self.onEvent?(.finished(batchId: finishedBatch))
            }
            return
        }
        let part = queue[queueIndex]
        currentPartIndex = queueIndex
        queueIndex += 1
        if let reveal = part.reveal {
            onEvent?(.reveal(batchId: batchId, count: reveal))
        }

        // **Playback priority: the parent's own voice, then the system voice.** There is no third
        // tier — a stranger's studio recording would be worse than TTS.
        if let uri = part.recordingUri, let url = fileURL(from: uri) {
            play(url, part: part)
        } else {
            synthesize(part)
        }
    }

    private func fileURL(from uri: String) -> URL? {
        let url = uri.hasPrefix("file://") ? URL(string: uri) : URL(fileURLWithPath: uri)
        guard let url, FileManager.default.fileExists(atPath: url.path) else { return nil }
        return url
    }

    private func play(_ url: URL, part: Part) {
        do {
            let player = try AVAudioPlayer(contentsOf: url)
            player.delegate = self
            player.volume = muted ? 0 : 1   // see `muted`: silent, but still real timing
            self.player = player
            playerGeneration = generation
            emitLog("speaking [\(batchId)] \"\(part.text)\" as \(part.bcp47) via parent recording")
            onEvent?(.partStarted(batchId: batchId, partIndex: currentPartIndex, text: part.text, bcp47: part.bcp47))
            player.play()
        } catch {
            // A corrupt or deleted file must not silence the app — fall through to the voice.
            emitLog("parent recording unplayable (\(url.lastPathComponent)) — using TTS")
            synthesize(part)
        }
    }

    private func synthesize(_ part: Part) {
        let utterance = self.utterance(for: part.text, bcp47: part.bcp47)
        utterance.voice = voices[part.bcp47] ?? AVSpeechSynthesisVoice(language: part.bcp47)
        utterance.rate = rate
        utterance.volume = muted ? 0 : 1   // see `muted`: silent, but still real timing
        utterance.postUtteranceDelay = 0.25

        guard !awaitingCancel else {
            pendingUtterance = utterance
            emitLog("park [\(batchId)] \"\(part.text)\" until the cancelled utterance reports back")
            scheduleParkedUtteranceWatchdog()
            return
        }
        start(utterance, part: part)
    }

    private func start(_ utterance: AVSpeechUtterance, part: Part?) {
        let voiceLabel = utterance.voice?.identifier ?? "system-default"
        emitLog("speaking [\(batchId)] \"\(utterance.speechString)\" as \(utterance.voice?.language ?? "system") via \(voiceLabel) rate=\(utterance.rate)")
        lastUtterance = utterance
        if let part {
            onEvent?(.partStarted(batchId: batchId, partIndex: currentPartIndex, text: part.text, bcp47: part.bcp47))
        }
        synthesizer.speak(utterance)
    }

    private func startPendingIfAny() -> Bool {
        guard let pending = pendingUtterance else { return false }
        pendingUtterance = nil
        emitLog("release [\(batchId)] \"\(pending.speechString)\"")
        let parked: Part? = queue.indices.contains(queueIndex - 1) ? queue[queueIndex - 1] : nil
        start(pending, part: parked)
        return true
    }

    /// Releases a parked utterance even when no cancel callback ever arrives.
    ///
    /// Routine, not an error path: a stop issued while the engine is draining a *finished*
    /// utterance has nothing to cancel, so `didCancel` never comes. 120ms is longer than a real
    /// cancel callback and short enough that the gap is inaudible.
    private func scheduleParkedUtteranceWatchdog() {
        let parkedAt = generation
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) { [weak self] in
            guard let self, self.generation == parkedAt, self.pendingUtterance != nil else { return }
            self.emitLog("release (watchdog) — no cancel callback due")
            self.awaitingCancel = false
            _ = self.startPendingIfAny()
        }
    }

    private func emitLog(_ message: String) {
        logger.info("\(message, privacy: .public)")
        onEvent?(.log(message))
    }

    private func onMain(_ work: @escaping () -> Void) {
        if Thread.isMainThread { work() } else { DispatchQueue.main.async { work() } }
    }
}

extension SpeechEngine: AVAudioPlayerDelegate {
    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        onMain {
            guard self.playerGeneration == self.generation else { return }   // stale, child moved on
            self.player = nil
            self.playNext()
        }
    }

    func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        onMain {
            guard self.playerGeneration == self.generation else { return }
            self.player = nil
            self.playNext()   // one bad file must not end the batch
        }
    }
}

extension SpeechEngine: AVSpeechSynthesizerDelegate {
    /// The literacy touch: the word being said lights up as it is said.
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer,
                           willSpeakRangeOfSpeechString characterRange: NSRange,
                           utterance: AVSpeechUtterance) {
        let spoken = utterance.speechString
        onMain {
            self.onEvent?(.boundary(batchId: self.batchId,
                                    partIndex: self.currentPartIndex,
                                    text: spoken,
                                    location: characterRange.location,
                                    length: characterRange.length))
        }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        onMain {
            self.awaitingCancel = false
            // A stop landed on top of a natural finish — the parked utterance is what to play now.
            if self.startPendingIfAny() { return }
            guard utterance === self.lastUtterance else { return }
            self.lastUtterance = nil
            self.playNext()
        }
    }

    /// **Must clear the cancelling state and release any parked utterance.**
    ///
    /// `lastUtterance` is only cleared if this is the utterance it points at: a cancel callback can
    /// arrive *after* the 120ms watchdog already started the next line — the watchdog wins that
    /// race by design — and clearing unconditionally wiped the pointer to the line that had just
    /// started, so in ×3 the second and third languages went missing.
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        onMain {
            self.awaitingCancel = false
            if utterance === self.lastUtterance { self.lastUtterance = nil }
            _ = self.startPendingIfAny()
        }
    }
}
