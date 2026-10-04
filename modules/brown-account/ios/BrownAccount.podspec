Pod::Spec.new do |s|
  s.name = 'BrownAccount'
  s.version = '1.0.0'
  s.summary = 'Local account storage reset for Brown Mobile'
  s.description = 'Purges app-owned local data after background writers are stopped.'
  s.author = 'Brown'
  s.homepage = 'https://usebrown.online'
  s.platforms = { :ios => '13.4' }
  s.source = { git: '' }
  s.static_framework = true
  s.swift_version = '5.1'
  s.source_files = '**/*.swift'
  s.dependency 'ExpoModulesCore'
end
