Pod::Spec.new do |s|
  s.name           = 'RafiqMotion'
  s.version        = '1.0.0'
  s.summary        = 'Timestamped gravity, gyroscope and magnetometer samples for the Qibla engine'
  s.description    = 'Streams CoreMotion device-motion samples (gravity, bias-removed rotation rate, calibrated magnetic field) in batches.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CoreMotion'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
