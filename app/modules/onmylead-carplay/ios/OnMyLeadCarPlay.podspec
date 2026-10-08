Pod::Spec.new do |s|
  s.name           = 'OnMyLeadCarPlay'
  s.version        = '1.0.0'
  s.summary        = 'CarPlay screen for OnMyLead Ride Mode'
  s.description    = 'Shows the group status and one-tap ride buttons on CarPlay using Apple templates.'
  s.license        = 'UNLICENSED'
  s.author         = 'RUS Offroad'
  s.homepage       = 'https://onmylead.com'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CarPlay'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
