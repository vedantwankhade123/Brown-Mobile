const { withAndroidStyles } = require('expo/config-plugins');

// SDK 51's navigation bar plugin does not expose Android's contrast overlay.
module.exports = (config) => withAndroidStyles(config, (mod) => {
  const theme = mod.modResults.resources.style.find((style) => style.$.name === 'AppTheme');
  if (theme) {
    theme.item = (theme.item || []).filter((item) => item.$.name !== 'android:enforceNavigationBarContrast');
    theme.item.push({ $: { name: 'android:enforceNavigationBarContrast', 'tools:targetApi': '29' }, _: 'false' });
    mod.modResults.resources.$ = { ...mod.modResults.resources.$, 'xmlns:tools': 'http://schemas.android.com/tools' };
  }
  // Expo owns the single branded launch view. Android 12's automatic app-icon
  // splash must not play another logo before that view appears.
  const splash = mod.modResults.resources.style.find((style) => style.$.name === 'Theme.App.SplashScreen');
  if (splash) {
    const names = ['android:windowBackground', 'android:windowSplashScreenAnimatedIcon', 'android:windowSplashScreenBackground'];
    splash.item = (splash.item || []).filter(item => !names.includes(item.$.name));
    splash.item.push(
      { $: { name: names[0] }, _: '@color/splashscreen_background' },
      { $: { name: names[1], 'tools:targetApi': '31' }, _: '@android:color/transparent' },
      { $: { name: names[2], 'tools:targetApi': '31' }, _: '@color/splashscreen_background' }
    );
    mod.modResults.resources.$ = { ...mod.modResults.resources.$, 'xmlns:tools': 'http://schemas.android.com/tools' };
  }
  return mod;
});
