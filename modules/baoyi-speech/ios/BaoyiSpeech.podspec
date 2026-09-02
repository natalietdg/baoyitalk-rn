Pod::Spec.new do |s|
  s.name           = 'BaoyiSpeech'
  s.version        = '1.0.0'
  s.summary        = 'Trilingual speech engine for BaoYiTalk'
  s.description    = 'AVSpeechSynthesizer wrapper with quality-tier voice picking, IPA pins and word-boundary events.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
