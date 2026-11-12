Pod::Spec.new do |s|
  s.name           = 'OnMyLeadCarPlay'
  s.version        = '1.0.0'
  s.summary        = 'CarPlay screen for OnMyLead Ride Mode'
  s.description    = 'Shows the group status, one-tap ride buttons and (with the CarPlay Navigation entitlement) the map on CarPlay.'
  s.license        = 'UNLICENSED'
  s.author         = 'RUS Offroad'
  s.homepage       = 'https://onmylead.com'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CarPlay', 'MapKit'

  # The car map (CarMapScreen.swift, CarPlay Navigation entitlement) is compiled only when
  # plugins/with-carplay.js switched it on: it leaves ios/.oml-carplay-maps behind (or
  # ONMYLEAD_CARPLAY_MAPS=1 is set for pod install). It draws with the same Mapbox SDK as the
  # phone's maps; the version comes from @rnmapbox/maps, which already depends on it.
  car_map = ENV['ONMYLEAD_CARPLAY_MAPS'] == '1' ||
    (File.exist?(File.join(Pod::Config.instance.installation_root.to_s, '.oml-carplay-maps')) rescue false)
  s.dependency 'MapboxMaps' if car_map

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
    'SWIFT_ACTIVE_COMPILATION_CONDITIONS' => car_map ? '$(inherited) OML_CARPLAY_MAPS' : '$(inherited)'
  }
end
