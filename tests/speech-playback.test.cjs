const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup() {
  const sounds = [], deleted = [], synthesized = [];
  let releaseVoice, voice = Promise.resolve('af_heart');
  const mocks = {
    'react-native': {Platform:{OS:'android'}},
    './KokoroTtsService': {getActiveKokoroVoice:() => voice, getKokoroInstallStatus:async () => ({}), isKokoroVoiceInstalled:() => true},
    './KokoroOnnxEngine': {
      isKokoroOnnxRuntimeReady:async () => true,
      streamKokoroOnnx:async function* (text, _voice, _rate, cancelled) {
        for (const part of ['first', 'second', 'third']) {
          if (cancelled()) return;
          synthesized.push(part); yield {uri:text + '-' + part};
        }
      },
    },
    'expo-file-system':{deleteAsync:async uri => deleted.push(uri)},
    'expo-av':{Audio:{setAudioModeAsync:async () => {}, Sound:{createAsync:async ({uri}) => {
      const sound = {uri, played:false, unloaded:false, callback:null,
        setOnPlaybackStatusUpdate(callback) {this.callback=callback;},
        async playAsync() {this.played=true; this.callback?.({isLoaded:true,isPlaying:true});},
        async stopAsync() {this.played=false;}, async unloadAsync() {this.unloaded=true;},
        finish() {this.callback?.({isLoaded:true,isPlaying:false,didJustFinish:true});},
      };
      sounds.push(sound); return {sound};
    }}}},
  };
  const source = ts.transpileModule(fs.readFileSync(require('path').join(__dirname,'../src/services/voice/TextToSpeech.ts'),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const module = {exports:{}};
  new Function('require','module','exports',source)(name => {if(name in mocks)return mocks[name];throw Error(name);},module,module.exports);
  return {service:module.exports.TextToSpeechService, sounds, deleted, synthesized,
    delayVoice() {voice=new Promise(resolve => releaseVoice=resolve);}, releaseVoice() {releaseVoice('af_heart');}};
}
(async () => {
  const a=setup(), statuses=[]; let done=0;
  const speaking=a.service.speak('A reply',()=>done++,status=>statuses.push(status));
  assert.equal(a.service.getStatus(),'loading'); await tick();
  assert.equal(a.sounds.length,1); assert.equal(a.sounds[0].played,true);
  assert.equal(a.service.getStatus(),'speaking');
  assert.deepEqual(a.synthesized,['first','second']);
  for(let i=0;i<3;i++) {a.sounds[i].finish(); await tick();}
  await speaking;
  assert.equal(done,1); assert.equal(a.service.getStatus(),'idle');
  assert(a.sounds.every(sound=>sound.unloaded)); assert.equal(new Set(a.deleted).size,3);
  assert.deepEqual(statuses.slice(0,2),['loading','speaking']);
  console.log('PASS: Loading, early playback, bounded prefetch, completion and audio cleanup.');
  const b=setup(); b.delayVoice(); let cancelledDone=false;
  const cancelled=b.service.speak('Cancelled',()=>cancelledDone=true);
  b.service.stop(); b.releaseVoice(); await cancelled;
  assert.equal(b.sounds.length,0); assert.equal(cancelledDone,false); assert.equal(b.service.getStatus(),'idle');
  console.log('PASS: Stop during voice lookup prevents late playback.');
  const c=setup(); let oldDone=false;
  const old=c.service.speak('Old',()=>oldDone=true); await tick();
  const current=c.service.speak('New'); await tick();
  assert.equal(c.sounds[0].played,false); assert.equal(c.service.getActiveText(),'New');
  await old;
  assert.equal(oldDone,false); assert.equal(c.service.getStatus(),'speaking');
  c.service.stop(); await current;
  assert.equal(c.service.getStatus(),'idle'); assert(c.sounds.every(sound=>sound.unloaded));
  console.log('PASS: Switching messages and cancelling discard stale callbacks and prefetched audio.');
})().catch(error=>{console.error(error);process.exitCode=1;});
