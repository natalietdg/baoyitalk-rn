import ExpoModulesCore

/// JS surface for `SpeechEngine`. Deliberately thin: everything that can race lives in the engine.
///
/// This module exists because no published RN TTS library exposes three things the product needs —
/// the real voice quality tier, IPA pronunciation pins, and a word-boundary stream tied to a batch.
public class BaoyiSpeechModule: Module {
    private let engine = SpeechEngine()
    private let phonemeProbe = PhonemeProbe()

    public func definition() -> ModuleDefinition {
        Name("BaoyiSpeech")

        Events("onBoundary", "onPartStarted", "onReveal", "onBatchFinished", "onBatchStopped", "onEngineLog")

        OnCreate {
            self.engine.onEvent = { [weak self] event in
                guard let self else { return }
                switch event {
                case let .boundary(batchId, partIndex, text, location, length):
                    self.sendEvent("onBoundary", [
                        "batchId": batchId, "partIndex": partIndex,
                        "text": text, "location": location, "length": length
                    ])
                case let .partStarted(batchId, partIndex, text, bcp47):
                    self.sendEvent("onPartStarted", [
                        "batchId": batchId, "partIndex": partIndex, "text": text, "bcp47": bcp47
                    ])
                case let .reveal(batchId, count):
                    self.sendEvent("onReveal", ["batchId": batchId, "count": count])
                case let .finished(batchId):
                    self.sendEvent("onBatchFinished", ["batchId": batchId])
                case let .stopped(batchId):
                    self.sendEvent("onBatchStopped", ["batchId": batchId])
                case let .log(message):
                    self.sendEvent("onEngineLog", ["message": message])
                }
            }
        }

        /// Forces playback to ignore the ringer switch. Returns the category actually in force.
        AsyncFunction("configureAudioSession") { () -> [String: Any] in
            self.engine.configureAudioSession()
        }.runOnQueue(.main)

        AsyncFunction("listVoices") { () -> [[String: Any]] in
            self.engine.listVoices()
        }

        AsyncFunction("resolvedVoices") { () -> [[String: Any]] in
            self.engine.resolvedVoices()
        }

        AsyncFunction("setPronunciationPins") { (pins: [String: String]) in
            self.engine.setPronunciationPins(pins)
        }

        /// Renders without playing and reports the phonemes the engine chose, so "is the Mandarin
        /// right?" can be answered by comparing strings instead of by listening.
        AsyncFunction("phonemeProbe") { (text: String, bcp47: String, voiceIdentifier: String?, pins: [String: String], promise: Promise) in
            self.phonemeProbe.probe(text: text, bcp47: bcp47, voiceIdentifier: voiceIdentifier, pins: pins) { result in
                promise.resolve(result)
            }
        }

        AsyncFunction("speak") { (batchId: String, parts: [SpeechPartRecord], rate: Double) in
            self.engine.speak(
                batchId: batchId,
                parts: parts.map {
                    SpeechEngine.Part(text: $0.text, bcp47: $0.bcp47,
                                      recordingUri: $0.recordingUri, reveal: $0.reveal)
                },
                rate: Float(rate)
            )
        }.runOnQueue(.main)

        AsyncFunction("setMuted") { (muted: Bool) in
            self.engine.setMuted(muted)
        }.runOnQueue(.main)

        AsyncFunction("stop") {
            self.engine.stop()
        }.runOnQueue(.main)

        AsyncFunction("isSpeaking") { () -> Bool in
            self.engine.isSpeaking
        }.runOnQueue(.main)
    }
}

struct SpeechPartRecord: Record {
    @Field var text: String = ""
    @Field var bcp47: String = "en-US"
    /// A parent recording that replaces synthesis for this part.
    @Field var recordingUri: String?
    /// Counting only: how many objects are showing while this part is spoken.
    @Field var reveal: Int?
}
