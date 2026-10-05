const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
function load(file, mocks) {
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, file), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
  const module = {exports:{}};
  new Function('require','module','exports',source)((name) => {
    if (name in mocks) return mocks[name];
    throw new Error('Unexpected dependency: '+name);
  }, module, module.exports);
  return module.exports;
}
const stream = load('../src/services/inference/StreamText.ts', {});
let resolveReply;
let captured;
const engineModule = load('../src/services/inference/LlamaEngine.ts', {
  'react-native': {Platform:{OS:'android'}},
  './StreamText': stream,
  './GeminiClient': {streamGeminiReply: async options => { captured=options; return new Promise(resolve => resolveReply=resolve); }},
  './CloudProviders': {},
  '../modelManager/Downloader': {}, '../sync/DesktopSync': {}, '../storage/StoragePaths': {},
});
(async () => {
  const engine = engineModule.LlamaEngine.getInstance();
  await engine.loadModel({id:'gemini-test', provider:'gemini',apiModel:'test'});
  let output=''; let completed=false;
  const pending=engine.generateStream('hi',[],{systemPrompt:'Be concise'},piece=>output+=piece,()=>completed=true);
  assert.strictEqual(captured.systemPrompt,'Be concise');
  engine.stopGeneration();
  assert(captured.signal.aborted);
  captured.onToken('late text'); resolveReply('late final'); await pending;
  assert.strictEqual(output,''); assert.strictEqual(completed,false);
  console.log('PASS: Stop aborts cloud requests and ignores late tokens and completion.');
  // Inject the native boundary, then test exactly the callback shape the installed llama.rn uses.
  engine.activeModel={id:'device-test',provider:'device'};
  engine.useNativeEngine=true; engine.contextTokens=2048;
  engine.llamaContext={completion:async (options,callback)=>{
    for(const content of ['One','One answer','One answer.']) callback({content,token:'ignored'});
    return {content:'One answer.',tokens_predicted:3};
  }};
  output=''; let final='';
  await engine.generateStream('hi',[{role:'user',content:'hi'}],{systemPrompt:'Be concise'},piece=>output+=piece,text=>final=text);
  assert.strictEqual(output,'One answer.'); assert.strictEqual(final,output);
  console.log('PASS: Native cumulative snapshots stream and complete without duplication.');
  const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useMemo:fn=>fn(),useState:()=>[null,()=>{}]};
  const rn={View:'View',Text:'Text',TouchableOpacity:'Button',ScrollView:'Scroll',StyleSheet:{create:x=>x},Linking:{}};
  const visuals=load('../src/components/AnswerVisual.tsx', {'react':React,'react-native':rn,'react-native-svg':{},'../theme/colors':{colors:{}}});
  const {MarkdownRenderer}=load('../src/components/MarkdownRenderer.tsx', {'react':React,'react-native':rn,'../theme/colors':{colors:{}},'../theme/typography':{typography:{fontFamily:{mono:'mono'}}},'./Icons':{},'./AnswerVisual':visuals});
  assert.strictEqual(visuals.parseMobileChart('{"type":"bar","labels":["A"],"values":[-2]}').values[0],-2);
  for(const value of ['{"type":"bar","labels":[],"values":[1]}','{"type":"pie","labels":["A"],"values":[-1]}','{"type":"line","labels":["A"],"values":[null]}']) assert.throws(()=>visuals.parseMobileChart(value));
  const pendingVisual=MarkdownRenderer({content:'```chart\n{"type":"bar"'});
  assert(JSON.stringify(pendingVisual).includes('"pending":true'));
  assert(!JSON.stringify(pendingVisual).includes('{\\"type\\":\\"bar\\"'));
  const tree=MarkdownRenderer({content:'# Heading\n\n**bold** and `inline`\n\n3. third\n4) fourth\n\n- first\n- second\n\n| Name | Value |\n| --- | --- |\n| A | B |\n\n```js\nconst x = 1;\n```'});
  const leaves=[]; const types=[];
  function visit(node){if(typeof node==='string'){leaves.push(node);return;} if(Array.isArray(node)){node.forEach(visit);return;} if(node){types.push(node.type);visit(node.children);}}
  visit(tree);
  for(const value of ['Heading','bold','inline','3.','4.','first','second','Name','Value','A','B','const x = 1;']) assert(leaves.includes(value),value);
  assert(types.includes('Scroll'));
  console.log('PASS: Markdown headings, emphasis, code, numbered lists, bullets, and tables render.');
  let clipboardText = '';
  const clipboard = load('../src/utils/clipboard.ts', {
    'react-native': {Platform:{OS:'android'}},
    'expo-modules-core': {requireNativeModule: name => {
      assert.strictEqual(name, 'ExpoClipboard');
      return {setStringAsync: async value => {clipboardText = value; return true;}};
    }},
  });
  assert.strictEqual(await clipboard.copyTextToClipboard('A reply\nwith formatting'), true);
  assert.strictEqual(clipboardText, 'A reply\nwith formatting');
  const unavailableClipboard = load('../src/utils/clipboard.ts', {
    'react-native': {Platform:{OS:'android'}},
    'expo-modules-core': {requireNativeModule: () => {throw new Error('Unavailable');}},
  });
  assert.strictEqual(await unavailableClipboard.copyTextToClipboard('hello'), false);
  console.log('PASS: Android clipboard writes exact text and reports unavailable modules as failures.');

  const desktopSkills = load('../src/services/inference/DesktopAnswerSkills.ts', {});
  assert.strictEqual(desktopSkills.DESKTOP_ANSWER_SKILLS.length,11);
  const {buildAssistantInstructions} = load('../src/services/inference/ChatCapabilities.ts', {'./DesktopAnswerSkills':desktopSkills});
  assert(buildAssistantInstructions('Compare prices in a table').includes('separator row'));
  assert(buildAssistantInstructions('Write Python code').includes('working example'));
  assert(!buildAssistantInstructions('What is my test code? Reply only the code.').includes('working example'));
  assert(buildAssistantInstructions('Write code for sorting numbers').includes('working example'));
  assert(buildAssistantInstructions('Write a long story').includes('invent characters'));
  assert(!buildAssistantInstructions('Write a long story').includes('source if it is missing'));
  assert(buildAssistantInstructions('Summarize this article').includes('preserve supplied facts'));
  assert(!buildAssistantInstructions('hello').includes('separator row'));
  assert(buildAssistantInstructions('hello', ['I prefer concise replies']).includes('I prefer concise replies'));
  assert(buildAssistantInstructions('hello', Array.from({length:20}, (_,i) => `${i} ${'x'.repeat(390)}`)).length < 2200);
  console.log('PASS: Task guidance is relevant and saved preference injection is bounded.');
  const store = new Map();
  const storage = {getItem:async key => store.get(key) || null, setItem:async (key,value) => store.set(key,value), removeItem:async key => store.delete(key)};
  const {AssistantMemory} = load('../src/services/storage/AssistantMemory.ts', {'@react-native-async-storage/async-storage': storage});
  assert.strictEqual(await AssistantMemory.directive('I enjoy hiking'), null);
  assert.strictEqual((await AssistantMemory.list()).length, 0);
  await AssistantMemory.directive('Remember that I prefer brief answers');
  await AssistantMemory.directive('Remember that I prefer brief answers');
  assert.deepStrictEqual(await AssistantMemory.preferences(), ['I prefer brief answers']);
  const {AssistantMemory: restarted} = load('../src/services/storage/AssistantMemory.ts', {'@react-native-async-storage/async-storage': storage});
  assert.deepStrictEqual(await restarted.preferences(), ['I prefer brief answers']);
  await restarted.setEnabled(false); assert.deepStrictEqual(await restarted.preferences(), []);
  assert.strictEqual((await restarted.list()).length, 1);
  assert((await restarted.directive('Remember that I prefer French')).includes('off'));
  await restarted.setEnabled(true);
  await restarted.directive('Forget that I prefer brief answers'); assert.deepStrictEqual(await restarted.list(), []);
  await restarted.directive('Remember that I prefer French'); await restarted.directive('Clear all saved memories');
  assert.deepStrictEqual(await restarted.list(), []);
  for(let i=0;i<20;i++) await restarted.directive(`Remember that preference ${i}`);
  assert((await restarted.directive('Remember that extra preference')).includes('full'));
  assert.strictEqual((await restarted.list()).length,20);
  await restarted.clear();
  await restarted.directive('Remember that I prefer brief replies');
  await restarted.edit('I prefer brief replies', 'I prefer detailed replies');
  assert.deepStrictEqual(await restarted.list(), ['I prefer detailed replies']);
  await assert.rejects(() => restarted.edit('I prefer detailed replies', ''), /1–400/);
  await restarted.directive('Remember that I prefer English');
  await assert.rejects(() => restarted.edit('I prefer detailed replies', 'I prefer English'), /already saved/);
  await restarted.forget('I prefer detailed replies');
  assert.deepStrictEqual(await restarted.list(), ['I prefer English']);
  await restarted.clear();
  console.log('PASS: Explicit memory persists, deduplicates, disables without deletion, and forgets.');
  const longHistory = [{role:'user',content:'Project codename is Indigo, deadline Friday.'}, {role:'assistant',content:'Noted.'}];
  for(let i=0;i<16;i++) longHistory.push({role:i%2?'assistant':'user',content:`Turn ${i}. ${'filler '.repeat(70)}`});
  longHistory.push({role:'user',content:'What is the Indigo project deadline?'});
  const bounded = engineModule.buildChatMessages(longHistory, 'Be concise', 1100);
  assert.strictEqual(bounded[0].role, 'system');
  assert(bounded[0].content.includes('deadline Friday'));
  assert.strictEqual(bounded[1].role,'user');
  assert.strictEqual(bounded[bounded.length-1].content, 'What is the Indigo project deadline?');
  assert(bounded.reduce((sum,m)=>sum+m.content.length,0) < 3300);
  let formatCalls=0;
  const tokenContext = {getFormattedChat:async messages=>{formatCalls++; return {prompt: messages.map(m=>m.content).join(' ')};},tokenize:async text=>({tokens:Array(Math.ceil(text.length/2)).fill(1)})};
  const fitted = await engineModule.fitNativeContext(tokenContext,bounded,500);
  assert(fitted[0].content.startsWith('Be concise'));
  assert.strictEqual(fitted[fitted.length-1].content, bounded[bounded.length-1].content);
  assert((await tokenContext.tokenize((await tokenContext.getFormattedChat(fitted)).prompt)).tokens.length <=500);
  assert(formatCalls>1);
  const priorPlan = [{role:'user',content:'Make a deployment plan.'},{role:'assistant',content:'Deployment plan: stage Aster first, then verify.'},...longHistory.slice(2,-1),{role:'user',content:'Continue your earlier Aster deployment plan.'}];
  assert(engineModule.buildChatMessages(priorPlan, 'Be concise', 1100)[0].content.includes('stage Aster first'));
  console.log('PASS: Older relevant context survives trimming and real-token fitting reserves output space.');
  const markdown = load('../src/components/MarkdownRenderer.tsx', {'react':React,'react-native':rn,'../theme/colors':{colors:{}},'../theme/typography':{typography:{fontFamily:{mono:'mono'}}},'./Icons':{},'./AnswerVisual':visuals});
  assert.deepStrictEqual(markdown.splitTableRow('| A \\| B | `x|y` | C |'), ['A | B', '`x|y`', 'C']);
  const fencedTable = '```markdown\n| Name | Value |\n| --- | --- |\n| A | B |\n```';
  assert(!markdown.unwrapFencedTables(fencedTable).includes('```'));
  assert(markdown.unwrapFencedTables('```js\nconst x = 1 | 2;\n```').includes('```js'));
  const tableTree = markdown.MarkdownRenderer({content:'| Short | Longer name |\n| --- | --- |\n| A very long value with details | x |\n| B | y |'});
  const widths=[];
  function collect(node){if(Array.isArray(node)){node.forEach(collect);return;} if(!node || typeof node!=='object')return; const style=node.props?.style; if(Array.isArray(style)){const sizing=style.find(v=>v && typeof v.width==='number');if(sizing)widths.push(sizing.width);}collect(node.children);}
  collect(tableTree);
  assert.strictEqual(widths.length,6); assert.strictEqual(widths[0],widths[2]); assert.strictEqual(widths[2],widths[4]); assert.strictEqual(widths[1],widths[3]);
  console.log('PASS: Tables preserve escaped/code pipes, unwrap table fences, and align column widths.');

  let finishFormat; let nativeStarted=false;
  engine.activeModel={id:'native-test',provider:'device'}; engine.useNativeEngine=true;
  engine.llamaContext={getFormattedChat:async()=>new Promise(resolve=>finishFormat=resolve),tokenize:async()=>({tokens:[1]}),completion:async()=>{nativeStarted=true;return {content:'unexpected'};}};
  const preparing = engine.generateStream('hi',[{role:'user',content:'hi'}],{systemPrompt:'Be concise'},()=>{},()=>{});
  assert(finishFormat); engine.stopGeneration(); finishFormat({prompt:'hi'}); await preparing;
  assert.strictEqual(nativeStarted,false);
  console.log('PASS: Stop during native context preparation cannot start a late generation.');

  const lifecycle = load('../src/services/storage/AccountLifecycle.ts', {});
  const databaseModule = load('../src/services/storage/Database.ts', {'react-native': {Platform:{OS:'web'}}, './AccountLifecycle': lifecycle});
  await databaseModule.AppDatabase.getInstance().init();
  const repositoryModule = load('../src/services/storage/ChatRepository.ts', {'./Database': databaseModule});
  const backupModule = load('../src/services/storage/BackupService.ts', {'./ChatRepository': repositoryModule, './AssistantMemory': {AssistantMemory}});
  const fixture = {app:'Brown',schemaVersion:1,sessions:[{id:'backup-qa',title:'Restored chat',modelId:'test',createdAt:1,updatedAt:2}],messages:[{id:'backup-msg',sessionId:'backup-qa',role:'user',content:'Restore fixture',timestamp:2}],assistantMemory:{enabled:true,preferences:['Prefer concise replies']}};
  const validated = backupModule.validateBackup(JSON.stringify(fixture));
  assert.strictEqual(validated.sessions[0].messages[0].content,'Restore fixture');
  await AssistantMemory.clear(); await AssistantMemory.setEnabled(false);
  assert.deepStrictEqual(await backupModule.restoreBackup(validated),{sessions:1,messages:1,preferences:1});
  assert.deepStrictEqual(await backupModule.restoreBackup(validated),{sessions:0,messages:0,preferences:0});
  assert.strictEqual(await AssistantMemory.enabled(),false);
  assert.throws(()=>backupModule.validateBackup('{broken'));
  assert.throws(()=>backupModule.validateBackup(JSON.stringify({...fixture,schemaVersion:999})));
  assert.throws(()=>backupModule.validateBackup(JSON.stringify({...fixture,messages:[{...fixture.messages[0],sessionId:'missing'}]})));
  assert.throws(()=>backupModule.validateBackup(JSON.stringify({...fixture,messages:[{...fixture.messages[0],role:'invalid'}]})));
  assert.throws(()=>backupModule.validateBackup('x'.repeat(backupModule.MAX_BACKUP_BYTES+1)));
  await AssistantMemory.clear(); await AssistantMemory.merge(Array.from({length:20},(_,i)=>'Preference '+i));
  const fresh = backupModule.validateBackup(JSON.stringify({...fixture,sessions:[{...fixture.sessions[0],id:'must-not-import'}],messages:[{...fixture.messages[0],id:'new-msg',sessionId:'must-not-import'}]}));
  await assert.rejects(()=>backupModule.restoreBackup(fresh),/limit/);
  assert.strictEqual(await new repositoryModule.ChatRepository().getSessionById('must-not-import'),null);
  await AssistantMemory.clear();
  console.log('PASS: Backup roundtrip deduplicates, preserves memory toggle, and rejects malformed/oversized files before mutation.');
})().catch(error=>{console.error(error);process.exitCode=1;});
