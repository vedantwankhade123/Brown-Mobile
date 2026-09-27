import AVFoundation
import ExpoModulesCore

/**
 * 16 kHz mono 16-bit PCM WAV capture for Whisper STT.
 */
public class BrownRecorderModule: Module {
  private var recorder: AVAudioRecorder?
  private var fileUrl: URL?

  public func definition() -> ModuleDefinition {
    Name("BrownRecorder")

    Function("start") {
      return self.startCapture()
    }

    Function("stop") {
      return self.stopAndSave()
    }

    Function("isRecording") {
      return self.recorder?.isRecording ?? false
    }
  }

  private func startCapture() -> Bool {
    if recorder?.isRecording == true { return true }
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(.playAndRecord, mode: .measurement, options: [.defaultToSpeaker])
      try session.setActive(true)
    } catch {
      return false
    }
    let url = URL(fileURLWithPath: NSTemporaryDirectory())
      .appendingPathComponent("brown-stt-\(Int(Date().timeIntervalSince1970 * 1000)).wav")
    let settings: [String: Any] = [
      AVFormatIDKey: kAudioFormatLinearPCM,
      AVSampleRateKey: 16000.0,
      AVNumberOfChannelsKey: 1,
      AVLinearPCMBitDepthKey: 16,
      AVLinearPCMIsFloatKey: false,
      AVLinearPCMIsBigEndianKey: false,
      AVLinearPCMIsNonInterleaved: false,
      AVEncoderAudioQualityKey: AVAudioQuality.max.rawValue
    ]
    do {
      let rec = try AVAudioRecorder(url: url, settings: settings)
      guard rec.record() else { return false }
      recorder = rec
      fileUrl = url
      return true
    } catch {
      return false
    }
  }

  private func stopAndSave() -> String? {
    guard let rec = recorder else { return nil }
    rec.stop()
    recorder = nil
    try? AVAudioSession.sharedInstance().setCategory(.playback)
    return fileUrl?.absoluteString
  }
}
