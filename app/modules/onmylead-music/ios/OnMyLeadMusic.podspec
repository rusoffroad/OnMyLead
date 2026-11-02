Pod::Spec.new do |s|
  s.name           = 'OnMyLeadMusic'
  s.version        = '1.0.0'
  s.summary        = 'Music Controls for OnMyLead'
  s.description    = 'Play, pause, skip and volume for the music playing on the phone, without leaving OnMyLead.'
  s.license        = 'UNLICENSED'
  s.author         = 'RUS Offroad'
  s.homepage       = 'https://onmylead.com'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'MediaPlayer', 'AVFoundation'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
