Pod::Spec.new do |s|
  s.name           = 'BrownRecorder'
  s.version        = '1.0.0'
  s.summary        = '16 kHz mono PCM WAV recorder for Whisper STT'
  s.description    = 'AVAudioRecorder-based linear PCM capture for Brown mobile voice input.'
  s.author         = ''
  s.homepage       = 'https://usebrown.online'
  s.platforms      = { :ios => '13.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.requires_arc   = true
  s.swift_version  = '5.1'
  s.preserve_paths = 'Present'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_COMPILATION_MODE' => 'wholemodule' }
  s.user_target_xcconfig = { 'OTHER_LDFLAGS' => '-ObjC -all_load' }

  s.source_files   = "**/*.swift"
  s.dependency 'ExpoModulesCore'
end
