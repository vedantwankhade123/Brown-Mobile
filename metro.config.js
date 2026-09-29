// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Ignore gradle build output. Metro's file watcher otherwise crawls
// android/app/build, which churns (kotlin snapshot dirs) during release
// builds and crashes the watcher / poisons the resolution cache on Windows.
const buildDirBlockList = new RegExp(
  `${escapeRegExp(__dirname)}[/\\\\]android[/\\\\].*[/\\\\]build[/\\\\].*`
);
config.resolver.blockList = buildDirBlockList;

module.exports = config;

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
