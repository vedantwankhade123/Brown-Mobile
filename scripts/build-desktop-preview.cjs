const esbuild = require('esbuild');
const fs = require('fs'), path = require('path');
const mobile = path.resolve(__dirname, '..');
const out = path.resolve(mobile, '../src/renderer/phone-preview');
fs.mkdirSync(out, { recursive: true });
esbuild.build({
  entryPoints: [path.join(mobile, 'src/preview/DesktopChatPreview.tsx')], outfile: path.join(out, 'preview.js'), bundle: true, minify: true, platform: 'browser', target: 'chrome120', define: { 'process.env.NODE_ENV': '"production"', __DEV__: 'false' },
  resolveExtensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.js', '.json'],
  alias: { 'react-native': path.join(mobile, 'src/preview/reactNativeWeb.tsx'), 'react-native-svg': require.resolve('react-native-svg/lib/module/ReactNativeSVG.web.js') },
  plugins: [{ name: 'read-only-native-boundaries', setup(build) {
    build.onResolve({ filter: /ButtonSurface$/ }, () => ({ path: 'preview-button-surfaces', namespace: 'preview-buttons' }));
    build.onLoad({ filter: /.*/, namespace: 'preview-buttons' }, () => ({ loader: 'tsx', resolveDir: mobile, contents: 'import React from "react"; import {TouchableOpacity} from "react-native"; export const ButtonSurface=()=>null; export const BrownButton=React.forwardRef(({brownSurface,...props}:any,ref:any)=><TouchableOpacity {...props} ref={ref}/>);' }));
    build.onResolve({ filter: /AvailableChatModels$/ }, () => ({ path: 'model-labels', namespace: 'preview-labels' }));
    build.onLoad({ filter: /.*/, namespace: 'preview-labels' }, () => ({ loader: 'ts', contents: fs.readFileSync(path.join(mobile, 'src/services/modelManager/AvailableChatModels.ts'), 'utf8').split('export async function fetchAvailableChatModels')[0].replace(/^import .*;\r?\n/gm, '') }));
    build.onResolve({ filter: /^(expo-document-picker|expo-file-system|react-native-safe-area-context|expo-linear-gradient)$/ }, args => ({ path: args.path, namespace: 'preview-boundary' }));
    build.onLoad({ filter: /.*/, namespace: 'preview-boundary' }, args => ({ loader: 'js', resolveDir: mobile, contents:
      args.path === 'react-native-safe-area-context' ? 'export const useSafeAreaInsets=()=>({top:0,right:0,bottom:0,left:0});' :
      args.path === 'expo-linear-gradient' ? `import React from 'react';import {View} from 'react-native';export function LinearGradient({colors,style,...props}){return React.createElement(View,{...props,style:[style,{backgroundImage:'linear-gradient(180deg,'+colors.join(',')+')'}]});}` :
      'export const getDocumentAsync=async()=>({canceled:true});export const readAsStringAsync=async()=>"";export const EncodingType={Base64:"base64"};' }));
  } }],
}).then(() => {
  const fontRoot = path.join(mobile, 'node_modules/@expo-google-fonts/outfit');
  const fonts = [[400, '400Regular', 'Outfit_400Regular'], [500, '500Medium', 'Outfit_500Medium'], [600, '600SemiBold', 'Outfit_600SemiBold'], [700, '700Bold', 'Outfit_700Bold']];
  let css = '';
  for (const [weight, directory, name] of fonts) { fs.copyFileSync(path.join(fontRoot, directory, name + '.ttf'), path.join(out, name + '.ttf')); css += `@font-face{font-family:Outfit;font-weight:${weight};src:url(${name}.ttf)}@font-face{font-family:${name};src:url(${name}.ttf)}\n`; }
  fs.copyFileSync(path.join(fontRoot, 'LICENSE_FONT'), path.join(out, 'FONT-LICENSE.txt'));
  const robotoRoot = path.join(mobile, 'node_modules/@fontsource/roboto');
  for (const weight of [400, 500, 600, 700]) {
    const name = `roboto-latin-${weight}-normal.woff2`;
    fs.copyFileSync(path.join(robotoRoot, 'files', name), path.join(out, name));
    css += `@font-face{font-family:Roboto;font-weight:${weight};src:url(${name}) format('woff2')}\n`;
  }
  fs.copyFileSync(path.join(robotoRoot, 'LICENSE'), path.join(out, 'ROBOTO-LICENSE.txt'));
  fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'none'"><style>${css}html,body,#root{height:100%;margin:0;background:#000}#root{display:flex;flex-direction:column}body,button,input,textarea{font-family:Roboto,sans-serif}#preview-chat-scroll{scrollbar-width:thin!important;scrollbar-color:transparent transparent!important}#preview-chat-scroll:hover{scrollbar-color:#68686d transparent!important}#preview-chat-scroll::-webkit-scrollbar{width:4px;background:transparent}#preview-chat-scroll::-webkit-scrollbar-thumb{background:transparent;border-radius:8px}#preview-chat-scroll:hover::-webkit-scrollbar-thumb{background:#68686d}</style></head><body><div id="root"></div><script src="preview.js"></script></body></html>`);
  console.log('Built desktop preview from shared mobile chat components.');
}).catch(error => { console.error(error); process.exitCode = 1; });
