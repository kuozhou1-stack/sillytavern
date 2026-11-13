const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {test}=require('node:test'),assert=require('node:assert/strict');
const file=path.join(__dirname,'双API流程.spec.cjs'),h=new Module(file,module);h.filename=file;h.paths=Module._nodeModulePaths(__dirname);
const req=h.require.bind(h);h.require=name=>name==='node:test'?{test(){}}:req(name);
h._compile(fs.readFileSync(file,'utf8').split('const novelGoodReply =')[0]+'\nmodule.exports={environment,seed,block,endpoint,Schema,copy,deferred,structuredFixtureReply};',file);
const {environment,seed,block,endpoint,Schema,copy,deferred,structuredFixtureReply}=h.exports;
const {SettingsSchema,createSettingsController,atmosphereBrowserKey}=require('../运行/settings.ts');
const {atmospherePrompt,atmosphereRule}=require('../运行/atmosphere.ts');
const {createRuntime}=require('../运行/host.ts');
const mood='  魔法与科技融入日常。\r\n人物主动交流，城市修复持续变化。  ';
const api=(mode,preset,name)=>({mode,sendPreset:preset,...(mode==='extra'?endpoint(name):{})});
async function fixture(run,{mode='extra',preset=false,atmosphere=mood,initial=seed(),informationAuto=true}={}){
 initial.奇遇系统._启用=true;
 const e=environment(initial,{atmosphere,characterAuto:false,informationAuto,variable:api(mode,preset,'variable'),phone:api(mode,preset,'phone'),information:{...api(mode,preset,'information'),reuseVariable:false}});
 e.requests=[];
 const invoke=async(method,config)=>{
  const stage=({information:'knowledge',variables:'worker'})[e.runtime.view.phase]??e.runtime.view.phase;assert(stage);
  const native=method==='generate'?[{role:'system',content:'NATIVE_PRESET'},{role:'system',content:'NATIVE_WORLD_BEFORE'},{role:'system',content:'NATIVE_CHARACTER'},{role:'system',content:'NATIVE_WORLD_AFTER'},{role:'assistant',content:'NATIVE_HISTORY'}]:[];
  const messages=[...native,...(['story','worker'].includes(stage)?e.atmosphereEntries.filter(entry=>entry.enabled).map(({position,content})=>({role:position.role,content})):[]),...[...(config.ordered_prompts??[]),...(config.overrides?.chat_history?.prompts??[])].filter(p=>p&&typeof p==='object').map(({role,content})=>({role,content})),{role:'user',content:config.user_input??''},...(config.injects??[]).map(({role,content})=>({role,content})),...(method==='generate'?[{role:'system',content:'NATIVE_PRESET_TAIL'}]:[])];
  const nativeMessages=copy(messages);const data={messages,custom_prompt_post_processing:'strict'};await e.listeners.get('completion_settings')?.(data);
  const final={...config,finalMessages:copy(messages)};
  e.requests.push({nativeMessages,stage,method,config:copy(config),messages:copy(messages),postProcessing:data.custom_prompt_post_processing});
  if(stage==='knowledge')return JSON.stringify({地点:[],组织:[]});
  if(stage==='novel')return JSON.stringify({商品:[{名称:'合成修复手记',价格:2,类别:'资料',描述:'记录街区修复过程',稀有:false}]});
  return structuredFixtureReply(config,await (stage==='story'?e.story(final):e.update(final)));
 };
 global.generate=config=>invoke('generate',config);global.generateRaw=config=>invoke('generateRaw',config);
 await e.runtime.start();try{await run(e);}finally{await e.runtime.dispose();}
}

test('氛围原样保留换行和空白；纯空白不贡献提示词，不进入MVU存档',()=>{
 assert.equal(SettingsSchema.parse({}).atmosphere,'');assert.equal(SettingsSchema.parse({atmosphere:mood}).atmosphere,mood);
 for(const x of ['', ' \r\n\t'])assert.equal(atmospherePrompt(x),null);
 assert(atmospherePrompt(mood).content.includes('\n'+mood+'\n'));assert.equal(atmospherePrompt(mood).role,'system');
 assert(!Object.hasOwn(seed(),'atmosphere'));assert(!Object.hasOwn(seed().世界,'atmosphere'));
 assert.notEqual(atmosphereBrowserKey('甲'),atmosphereBrowserKey('乙'));assert(atmosphereBrowserKey('甲').startsWith('valoran-v1:'));
});
test('氛围独立服务器与浏览器保存、冷读、空值清除，不触动API或变量规则',async()=>{
 await fixture(async e=>{
  const original=copy(e.runtime.settings),rules=e.ruleWrites,character=copy(e.character),state=copy(e.state());
  await e.runtime.saveSettings({atmosphere:mood,variable:{retries:'无关草稿错误'}},'atmosphere');
  assert.equal(e.sharedFiles.get('/user/files/valoran-v1-atmosphere.json').value,mood);assert.equal(JSON.parse(e.localFiles.get(atmosphereBrowserKey('test-account'))),mood);
  assert(![...e.sharedFiles.keys()].some(x=>x.includes('chengwan')));assert.deepEqual(e.character,character);assert.deepEqual(e.state(),state);assert.equal(e.ruleWrites,rules);assert.equal(e.requests.length,0);
  e.character.澄湾设置.atmosphere='旧卡偏好';e.localFiles.set(atmosphereBrowserKey('test-account'),JSON.stringify('旧浏览器偏好'));
  assert.equal((await createSettingsController().load()).value.atmosphere,mood);
  await e.runtime.saveSettings({atmosphere:''},'atmosphere');e.localFiles.clear();
  const loaded=await createSettingsController().load();assert.equal(loaded.value.atmosphere,'');
  for(const channel of ['variable','phone','information'])assert.deepEqual(e.runtime.settings[channel],original[channel]);
  await e.runtime.saveSettings({fontSize:19,atmosphere:'无关外观草稿'},'general');assert.equal(e.runtime.settings.atmosphere,'');
 });
});
test('没有API端点时仍可独立保存和读取氛围，重导旧卡基础值不能覆盖已保存空串',async()=>{
 await fixture(async e=>{
  e.runtime.settings.variable.apiurl='';e.runtime.settings.variable.model='';
  await e.runtime.saveSettings({atmosphere:''},'atmosphere');
  await e.runtime.reloadSettings('atmosphere');assert.equal(e.runtime.settings.atmosphere,'');
  assert.equal(e.requests.length,0);
 },{atmosphere:'旧值',informationAuto:false});
});
test('上传或读回失败明确报错；服务器已保存但浏览器失败给出警告',async()=>{
 await fixture(async e=>{
  await e.runtime.saveSettings({atmosphere:mood},'atmosphere');const native=global.fetch,oldLocal=e.localFiles.get(atmosphereBrowserKey('test-account'));
  global.fetch=(url,options)=>new URL(url).pathname==='/api/files/upload'?Promise.resolve(new Response('',{status:500})):native(url,options);
  await assert.rejects(e.runtime.saveSettings({atmosphere:'上传失败候选'},'atmosphere'),/保存酒馆共用配置失败/);
  assert.equal(e.runtime.settings.atmosphere,mood);assert.equal(e.localFiles.get(atmosphereBrowserKey('test-account')),oldLocal);
  global.fetch=(url,options)=>new URL(url).pathname==='/user/files/valoran-v1-atmosphere.json'?Promise.resolve(Response.json({version:1,value:'旧服务端内容'})):native(url,options);
  await assert.rejects(e.runtime.saveSettings({atmosphere:'读回不一致候选'},'atmosphere'),/读回不一致/);assert.equal(e.runtime.settings.atmosphere,mood);
  global.fetch=native;
  const set=window.parent.localStorage.setItem;window.parent.localStorage.setItem=()=>{throw Error('合成浏览器拒写');};
  const warning=await e.runtime.saveSettings({atmosphere:'服务端已确认'},'atmosphere');assert.match(warning,/酒馆共用配置已保存，浏览器副本保存失败/);
  assert.equal(e.sharedFiles.get('/user/files/valoran-v1-atmosphere.json').value,'服务端已确认');assert.equal(e.runtime.settings.atmosphere,'服务端已确认');window.parent.localStorage.setItem=set;
 });
});
test('服务器读取失败明确告警并保留浏览器副本；单独读取氛围不改其他通道',async()=>{
 await fixture(async e=>{
  e.localFiles.set(atmosphereBrowserKey('test-account'),JSON.stringify('浏览器可用值'));const native=global.fetch,apis=copy(e.runtime.settings.variable),rules=e.ruleWrites;
  global.fetch=(url,options)=>new URL(url).pathname==='/user/files/valoran-v1-atmosphere.json'?Promise.resolve(new Response('',{status:503})):native(url,options);
  const warning=await e.runtime.reloadSettings('atmosphere');assert.match(warning,/氛围设计共用配置读取失败，已使用浏览器副本/);assert.equal(e.runtime.settings.atmosphere,'浏览器可用值');assert.deepEqual(e.runtime.settings.variable,apis);assert.equal(e.ruleWrites,rules);
 });
});
for(const mode of ['main','extra'])for(const preset of [false,true])test(`正文、变量、资料选择、手机、奇遇各带一份氛围：${mode}，预设${preset}`,async()=>{
 await fixture(async e=>{
  await e.runtime.send('观察街区');await e.runtime.phoneAction({kind:'refresh',platform:'邻信'});await e.runtime.novelRefresh('shop');
  assert.deepEqual(e.requests.map(r=>r.stage),['knowledge','story','worker','knowledge','worker','novel']);
  for(const request of e.requests){
   const moods=request.messages.filter(m=>String(m.content).includes('<atmosphere_design>'));assert.equal(moods.length,1);assert.equal(moods[0].role,'system');assert(moods[0].content.includes(mood));
   const moodInput=request.config.injects.filter(p=>p.content.includes('<atmosphere_design>'));assert.equal(moodInput.length,1);assert.equal(moodInput[0].depth,4);
   assert.equal(request.postProcessing,'strict');assert.equal(request.messages.at(-1).role,'system');assert.notEqual(request.messages.at(-1),moods[0]);
   assert(!JSON.stringify(request.messages).includes('[chengwan-'));
   if(request.method==='generate'){
    const names=['NATIVE_PRESET','NATIVE_WORLD_BEFORE','NATIVE_CHARACTER','NATIVE_WORLD_AFTER','NATIVE_HISTORY','NATIVE_PRESET_TAIL'];
    const indexes=names.map(x=>request.messages.findIndex(m=>m.content===x));assert(indexes.every(x=>x>=0));assert.deepEqual(indexes,[...indexes].sort((a,b)=>a-b));
    if(request.stage==='story'){assert.deepEqual(request.messages,request.nativeMessages);assert(request.messages.indexOf(moods[0])<indexes.at(-1),'正文氛围由原生深度注入');}
    else assert(request.messages.indexOf(moods[0])<indexes.at(-1),'后台仍保留原生预设尾部');
   }else if(['novel','knowledge'].includes(request.stage)){
    assert.equal(request.messages.length,3);assert.equal(request.messages[0].role,'user');assert.equal(request.messages[1],moods[0]);
   }
  }
  assert.equal(e.requests.filter(x=>x.stage==='story').length,1);assert.equal(e.state().世界.异常入侵度,null);
 },{mode,preset});
});
test('留空不改变原请求形状；资料选择与奇遇仍是原生任务输入与预设尾部',async()=>{
 await fixture(async e=>{await e.runtime.send('观察');await e.runtime.novelRefresh('shop');for(const x of e.requests){assert(!JSON.stringify(x.messages).includes('atmosphere_design'));assert.equal(x.messages.at(-1).content,'NATIVE_PRESET_TAIL');}}, {atmosphere:''});
});
test('请求中保存新氛围不改已发正文；后续变量用新值且不写入无关API草稿',async()=>{
 await fixture(async e=>{
  const entered=deferred(),finish=deferred(),apis=copy(e.runtime.settings.variable);e.story=async()=>{entered.resolve();await finish.promise;return '合成街区正文';};
  const running=e.runtime.send('观察');await entered.promise;const rules=e.ruleWrites;
  try{await e.runtime.saveSettings({atmosphere:'新的安静方向',variable:{retries:'错误草稿'}},'atmosphere');assert.equal(e.ruleWrites,rules);assert.deepEqual(e.runtime.settings.variable,apis);}
  finally{finish.resolve();}
  await running;assert(e.requests.find(r=>r.stage==='story').messages.some(m=>String(m.content).includes(mood)));
  const worker=e.requests.find(r=>r.stage==='worker');assert(worker.messages.some(m=>String(m.content).includes('新的安静方向')));assert(!worker.messages.some(m=>String(m.content).includes(mood)));
 });
});
test('变量失败后清空氛围并重载，重试沿用原正文和提交身份',async()=>{
 await fixture(async e=>{
  e.update=async()=>{throw Error('合成变量失败');};await assert.rejects(e.runtime.send('观察街角'),/合成变量失败/);
  const id=e.vars.澄湾待更新正文.id,body=e.messages.at(-1).message;
  await e.runtime.saveSettings({atmosphere:''},'atmosphere');await e.runtime.dispose();e.runtime=createRuntime();await e.runtime.start();
  assert.equal(e.vars.澄湾待更新正文.id,id);e.update=async()=>block([]);await e.runtime.retry();
  assert.equal(e.requests.filter(x=>x.stage==='story').length,1);assert.equal(e.messages.at(-1).message,body);assert(e.state()._系统.提交记录[id]);assert.deepEqual(Object.keys(e.state()._系统.已计轮事件),[id]);
  assert(!JSON.stringify(e.requests.at(-1).messages).includes('atmosphere_design'));
 });
});
test('首次建档开场与独立结算均携带氛围，不把偏好写成聊天原文',async()=>{
 await fixture(async e=>{
  e.update=async()=>block([{op:'replace',path:'/玩家/外貌/体型',value:'合成建档描述'}]);
  await e.runtime.createProfile({player:{姓名:'合成玩家'},characters:[]});await e.runtime.startOpening();
  assert(e.requests.some(r=>r.stage==='story'));assert(e.requests.some(r=>r.stage==='worker'));
  for(const r of e.requests)assert.equal(r.messages.filter(m=>String(m.content).includes('<atmosphere_design>')).length,1);
  assert(!e.messages.some(m=>m.message?.includes('<atmosphere_design>')));
 },{initial:Schema.parse({}),informationAuto:false});
});

test('氛围只保存共用偏好，不创建或更新世界书，下一请求原生深度4生效',async()=>{
 await fixture(async e=>{
  const rules=copy(e.rules),writes=e.atmosphereWrites;
  assert.equal(e.atmosphereEntries.length,0);
  await e.runtime.saveSettings({atmosphere:'新方向'},'atmosphere');
  assert.equal(e.atmosphereEntries.length,0);assert.equal(e.atmosphereWrites,writes);
  await e.runtime.send('观察街区');
  for(const req of e.requests){
   const inputs=req.config.injects.filter(p=>p.content.includes('<atmosphere_design>'));
   assert.equal(inputs.length,1);assert.equal(inputs[0].depth,4);assert(inputs[0].content.includes('新方向'));
  }
  await e.runtime.saveSettings({atmosphere:''},'atmosphere');
  assert.equal(e.atmosphereWrites,writes);assert.deepEqual(e.rules,rules);
  e.requests.length=0;await e.runtime.send('继续观察');
  assert(e.requests.every(req=>!(req.config.injects??[]).some(p=>p.content.includes('<atmosphere_design>'))));
 });
});

test('旧氛围世界书仅启动时移除，保留偏好、其他条目和未完成操作',async()=>{
 const e=environment(seed(),{characterAuto:false,informationAuto:false,atmosphere:mood});
 e.atmosphereEntries.push({uid:52,name:'规则｜氛围设计',enabled:true,content:atmosphereRule+'\n<atmosphere_design>\n旧氛围\n</atmosphere_design>',position:{type:'at_depth',role:'system',depth:4,order:340}});
 await e.runtime.start();
 try{
  assert.equal(e.atmosphereEntries.length,0);assert.equal(e.runtime.settings.atmosphere,mood);
  assert(e.rules.every(entry=>!entry.enabled));assert.equal(e.requests?.length??0,0);
  const writes=e.atmosphereWrites;await e.runtime.saveSettings({atmosphere:'新偏好'},'atmosphere');
  assert.equal(e.atmosphereWrites,writes);
 }finally{await e.runtime.dispose();}
});
