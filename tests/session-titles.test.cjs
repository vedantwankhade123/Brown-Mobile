const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const store = new Map();
const moduleUnderTest = {exports:{}};
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/services/inference/SessionTitleService.ts'),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
new Function('require','module','exports',source)(name => {
  assert.equal(name,'@react-native-async-storage/async-storage');
  return {getItem:async key=>store.get(key)||null,setItem:async (key,value)=>store.set(key,value)};
},moduleUnderTest,moduleUnderTest.exports);
const {SessionTitleService,parseAiSessionTitle}=moduleUnderTest.exports;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(deferred=false) {
  let session={id:'chat',title:'Write An Emil',messageCount:2,updatedAt:10,lastMessagePreview:'An email'};
  let complete, finish, calls=0, stops=0, captured;
  const repo={getSessionById:async()=>session&&({...session}),getMessagesForSession:async()=>[
    {role:'user',content:'write an emil requesting leave'}, {role:'assistant',content:'Subject: Leave request'},
  ],updateGeneratedTitle:async(_id,expected,title)=>{if(session?.title===expected)session.title=title;}};
  const engine={stopGeneration(){stops++;finish?.();},async generateStream(prompt,history,settings,_token,done){
    calls++;captured={prompt,history,settings};complete=done;
    if(deferred)await new Promise(resolve=>finish=resolve);
    else done('{"title":"Leave Request Email"}');
  }};
  const service=new SessionTitleService(engine,repo);
  return {service,engine,repo,get session(){return session;},get calls(){return calls;},get stops(){return stops;},get captured(){return captured;},delete(){session=null;},finish(){complete('{"title":"Leave Request Email"}');finish();}};
}
(async()=>{
  assert.equal(parseAiSessionTitle('```json\n{"title":"iOS API Integration"}\n```'),'iOS API Integration');
  assert.equal(parseAiSessionTitle('<think>reasoning</think>{"title":"Travel Planning"}'),'Travel Planning');
  for(const raw of ['Do you want an email?', '{"title":"New Chat"}', '{"title":42}', '{"title":"one two three four five six"}', '{bad}'])assert.equal(parseAiSessionTitle(raw),null);
  const a=fixture(); const titled=await a.service.regenerate('chat');
  assert.equal(titled.title,'Leave Request Email'); assert.equal(titled.messageCount,2);assert.equal(titled.updatedAt,10);
  assert(a.captured.prompt.includes('write an emil'));assert(a.captured.prompt.includes('Subject: Leave request'));
  assert.equal(a.captured.settings.maxTokens,64);assert.equal(a.captured.history.length,1);
  console.log('PASS: AI title uses the actual question and answer, preserves names, bounds output, and retains session metadata.');
  const b=fixture(true);const pending=b.service.regenerate('chat');await tick();b.service.cancel();b.finish();
  assert.equal(await pending,null);assert.equal(b.session.title,'Write An Emil');assert.equal(b.stops,1);
  const c=fixture(true);const removed=c.service.regenerate('chat');await tick();c.delete();c.finish();assert.equal(await removed,null);
  const d=fixture(true);const renamed=d.service.regenerate('chat');await tick();d.session.title='My custom title';d.finish();await renamed;assert.equal(d.session.title,'My custom title');
  console.log('PASS: Cancellation, deleted chats, and concurrent manual renames cannot receive stale AI titles.');
  const e=fixture();await e.service.lockManualTitle('chat');
  const restarted=new SessionTitleService(e.engine,e.repo);assert.equal(await restarted.regenerate('chat'),null);assert.equal(e.calls,0);
  console.log('PASS: Manually renamed titles remain locked across service restarts.');
})().catch(error=>{console.error(error);process.exitCode=1;});
