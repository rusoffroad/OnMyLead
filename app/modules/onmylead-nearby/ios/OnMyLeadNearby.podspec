Pod::Spec.new do |s|
  s.name           = 'OnMyLeadNearby'
  s.version        = '1.0.0'
  s.summary        = 'Bluetooth Sharing for OnMyLead'
  s.description    = 'Passes encrypted ride packets between nearby OnMyLead phones over Bluetooth Low Energy when there is no service.'
  s.license        = 'UNLICENSED'
  s.author         = 'RUS Offroad'
  s.homepage       = 'https://onmylead.com'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CoreBluetooth'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
