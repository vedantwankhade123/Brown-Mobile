const { withAndroidManifest } = require('expo/config-plugins');

// Offline peers have changing numeric LAN/hotspot/USB addresses and no public
// TLS certificate. Android's default release policy otherwise blocks discovery
// and the HTTP carrier for our authenticated AES-GCM companion envelopes.
// Public remote endpoints still require HTTPS/WSS in CompanionTransport.
module.exports = config => withAndroidManifest(config, mod => {
  const application = mod.modResults.manifest.application?.[0];
  if (application) application.$['android:usesCleartextTraffic'] = 'true';
  return mod;
});
