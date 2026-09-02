import AVFoundation
import CryptoKit
import Foundation

/**
 An **ear-free** test of what the Mandarin voice actually says.

 "Does it pronounce 多音字 correctly?" normally needs a human listening. It does not have to.
 `AVSpeechSynthesizer.writeUtterance(_:toBufferCallback:toMarkerCallback:)` renders an utterance to
 PCM without playing it, and hands back `AVSpeechSynthesisMarker`s — including, on iOS 17+, the
 literal phoneme string for each sound the engine is about to produce.

 That turns two subjective questions into string comparisons:

 1. **Does the engine disambiguate a polyphone from context?** Render 行 inside 银行 and inside
    行走 and compare the phonemes over that character. Same phonemes = it does not.
 2. **Does `AVSpeechSynthesisIPANotationAttribute` change anything for zh-CN?** Render the same
    text with and without the pin and compare both the phonemes and a hash of the audio. Identical
    output = Apple ignored the pin, which is the finding that matters.
 */
final class PhonemeProbe {
  /// Held for the duration of a render: `writeUtterance` is asynchronous and the synthesizer must
  /// outlive the call that started it.
  private var inFlight: [AVSpeechSynthesizer] = []
  private let lock = NSLock()

  /// Renders `text` to PCM without playing it and reports the phonemes plus an audio fingerprint.
  /// - Parameter pins: substring -> IPA. Empty means "render the plain string", which is the
  ///   comparison baseline and also exactly what `expo-speech` is limited to.
  func probe(
    text: String,
    bcp47: String,
    voiceIdentifier: String?,
    pins: [String: String],
    completion: @escaping ([String: Any]) -> Void
  ) {
    let synthesizer = AVSpeechSynthesizer()
    lock.lock()
    inFlight.append(synthesizer)
    lock.unlock()

    let utterance = makeUtterance(text: text, bcp47: bcp47, voiceIdentifier: voiceIdentifier, pins: pins)

    var phonemes: [String] = []
    var markerLines: [String] = []
    var hasher = SHA256()
    var byteCount = 0
    var frameCount = 0
    var sampleRate: Double = 0
    var finished = false

    let finish: (String) -> Void = { how in
      guard !finished else { return }
      finished = true
      let digest = hasher.finalize().map { String(format: "%02x", $0) }.joined()
      completion([
        "text": text,
        "bcp47": bcp47,
        "voice": utterance.voice?.identifier ?? "none",
        "pinned": !pins.isEmpty,
        "pinsApplied": pins.keys.filter { text.contains($0) },
        "phonemes": phonemes,
        "phonemeString": phonemes.joined(separator: " "),
        "markers": markerLines,
        "audioSha256": String(digest.prefix(16)),
        "audioBytes": byteCount,
        "audioFrames": frameCount,
        "sampleRate": sampleRate,
        "end": how
      ])
      self.lock.lock()
      self.inFlight.removeAll { $0 === synthesizer }
      self.lock.unlock()
    }

    // A voice that never renders must not hang the probe.
    DispatchQueue.global().asyncAfter(deadline: .now() + 15) { finish("timeout") }

    let markerCallback: ([AVSpeechSynthesisMarker]) -> Void = { markers in
      for marker in markers {
        let kind: String
        switch marker.mark {
        case .phoneme: kind = "phoneme"
        case .word: kind = "word"
        case .sentence: kind = "sentence"
        case .paragraph: kind = "paragraph"
        case .bookmark: kind = "bookmark"
        @unknown default: kind = "unknown(\(marker.mark.rawValue))"
        }
        if marker.mark == .phoneme, #available(iOS 17.0, *) {
          phonemes.append(marker.phoneme)
        }
        let range = marker.textRange
        let covered = Self.slice(of: text, range: range)
        markerLines.append("\(kind)@\(marker.byteSampleOffset) range=\(range.location)+\(range.length)'\(covered)'")
      }
    }

    let bufferCallback: (AVAudioBuffer) -> Void = { buffer in
      guard let pcm = buffer as? AVAudioPCMBuffer else { return }
      sampleRate = pcm.format.sampleRate
      // A zero-length buffer is how AVSpeechSynthesizer signals the end of the render.
      if pcm.frameLength == 0 {
        finish("done")
        return
      }
      frameCount += Int(pcm.frameLength)
      if let channel = pcm.floatChannelData?[0] {
        let bytes = Int(pcm.frameLength) * MemoryLayout<Float>.size
        byteCount += bytes
        channel.withMemoryRebound(to: UInt8.self, capacity: bytes) { raw in
          hasher.update(data: Data(bytes: raw, count: bytes))
        }
      } else if let channel = pcm.int16ChannelData?[0] {
        let bytes = Int(pcm.frameLength) * MemoryLayout<Int16>.size
        byteCount += bytes
        channel.withMemoryRebound(to: UInt8.self, capacity: bytes) { raw in
          hasher.update(data: Data(bytes: raw, count: bytes))
        }
      }
    }

    if #available(iOS 16.0, *) {
      synthesizer.write(utterance, toBufferCallback: bufferCallback, toMarkerCallback: markerCallback)
    } else {
      synthesizer.write(utterance, toBufferCallback: bufferCallback)
    }
  }

  /// The same utterance construction the app would use, so the probe measures the real thing.
  private func makeUtterance(
    text: String,
    bcp47: String,
    voiceIdentifier: String?,
    pins: [String: String]
  ) -> AVSpeechUtterance {
    let utterance: AVSpeechUtterance
    let applicable = pins.filter { text.contains($0.key) }
    if applicable.isEmpty {
      utterance = AVSpeechUtterance(string: text)
    } else {
      let attributed = NSMutableAttributedString(string: text)
      let ipaKey = NSAttributedString.Key(rawValue: AVSpeechSynthesisIPANotationAttribute)
      for (substring, ipa) in applicable {
        var searchFrom = 0
        while searchFrom < attributed.length {
          let remaining = NSRange(location: searchFrom, length: attributed.length - searchFrom)
          let found = (attributed.string as NSString).range(of: substring, range: remaining)
          if found.location == NSNotFound { break }
          attributed.addAttribute(ipaKey, value: ipa, range: found)
          searchFrom = found.location + max(found.length, 1)
        }
      }
      utterance = AVSpeechUtterance(attributedString: attributed)
    }

    if let voiceIdentifier, let voice = AVSpeechSynthesisVoice(identifier: voiceIdentifier) {
      utterance.voice = voice
    } else {
      utterance.voice = AVSpeechSynthesisVoice(language: bcp47)
    }
    return utterance
  }

  private static func slice(of text: String, range: NSRange) -> String {
    let ns = text as NSString
    guard range.location != NSNotFound,
          range.location >= 0,
          range.location + range.length <= ns.length else { return "" }
    return ns.substring(with: range)
  }
}
