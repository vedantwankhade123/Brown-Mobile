/**
 * Expo SDK 51's config-plugin resolver stops at llama.rn's nested
 * lib/commonjs/package.json (from react-native-builder-bob) and never
 * finds the real app.plugin.js. Point at it directly instead.
 * Fixed upstream in @expo/config-plugins (Expo 52+).
 */
module.exports = require('llama.rn/app.plugin.js');
