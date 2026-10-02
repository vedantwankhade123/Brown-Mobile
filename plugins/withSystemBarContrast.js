const { withAndroidStyles } = require('expo/config-plugins');

// SDK 51's navigation bar plugin does not expose Android's contrast overlay.
module.exports = (config) => withAndroidStyles(config, (mod) => {
  const theme = mod.modResults.resources.style.find((style) => style.$.name === 'AppTheme');
  if (theme) {
    theme.item = (theme.item || []).filter((item) => item.$.name !== 'android:enforceNavigationBarContrast');
    theme.item.push({ $: { name: 'android:enforceNavigationBarContrast', 'tools:targetApi': '29' }, _: 'false' });
    mod.modResults.resources.$ = { ...mod.modResults.resources.$, 'xmlns:tools': 'http://schemas.android.com/tools' };
  }
  return mod;
});
