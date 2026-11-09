const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {test}=require('node:test'),assert=require('node:assert/strict');
const file=path.join(__dirname,'双API流程.spec.cjs'),harness=new Module(file,module);
harness.filename=file;harness.paths=Module._nodeModulePaths(__dirname);
const nativeRequire=harness.require.bind(harness);harness.require=n=>n==='node:test'?{test(){}}:nativeRequire(n);
harness._compile(fs.readFileSync(file,'utf8').split('const novelGoodReply =')[0]+'\nmodule.exports={environment,block,endpoint,Schema,copy};',file);
const {environment,block,endpoint,Schema,copy}=harness.exports;
const {ApiSettingsSchema}=require('../运行/settings.ts');
const {nativePromptConfig}=require('../运行/prompts.ts');
const {promptContextText,variableRuleText,withPromptContext}=require('../运行/prompt-context.ts');
const version=require('../运行/world-information.json').版本;
const seed=()=>Schema.parse({_系统:{建档完成:true,资料加载:{资料版本:version}},玩家:{id:'player',姓名:'合成玩家'},
 地点:{cafe:{名称:'合成咖啡馆',简介:'SELECTED_DETAIL'},remote:{名称:'远处地点',简介:'UNSELECTED_DETAIL'}},
 手机:{账号:{self:{人物id:'player',平台:'邻信',昵称:'合成玩家'}}}});
const configured=mode=>({mode,...(mode==='extra'?endpoint('isolated-extra'):{})});
async function withRuntime(settings,fn){const e=environment(seed(),{characterAuto:false,informationAuto:false,
 variable:endpoint('variable'),phone:endpoint('phone'),...settings});await e.runtime.start();
 try{await fn(e);}finally{await e.runtime.dispose();}}
for(const mode of ['main','extra'])for(const channel of ['variable','phone','information','novel'])test(
 `所有通道携带预设并保留原生尾部：${channel}/${mode}`,async()=>{
 const config=configured(mode);await withRuntime({[channel==='novel'?'phone':channel]:{...config,...(channel==='information'?{reuseVariable:false}:{})},informationAuto:channel==='information'},async e=>{
 e.update=async c=>{
  if(e.runtime.view.phase==='information')return '<InformationSelection>{"地点":["cafe"],"组织":[]}</InformationSelection>';
  if(e.runtime.view.phase==='novel')return JSON.stringify({任务:[{名称:'合成任务',类型:'探索',难度:'基础',目标:'观察公开标记'}],商品:[{名称:'便签',价格:1,类别:'工具',描述:'记录事项',稀有:false}]});
  return block([]);
 };
 if(channel==='phone')await e.runtime.phoneAction({kind:'refresh',platform:'邻信'});
 else if(channel==='novel'){await e.runtime.novelAction({kind:'enable',operationId:'enable'});await e.runtime.novelRefresh('initial');}
 else await e.runtime.send('观察合成咖啡馆');
 assert(e.calls.length);for(const call of e.calls){const c=call.config;
  assert.equal((c.injects??[]).length,call.stage==='variables'?2:0);assert.equal(c.ordered_prompts,undefined);
  if(call.stage==='variables')assert(c.injects.every(p=>p.position==='in_chat'&&p.depth===0));
  assert.equal(c.finalMessages[0].content,'模拟原生世界书/预设');
  assert.equal(c.finalMessages.at(-1).content,'模拟原生预设尾部');
  assert(!JSON.stringify(c).includes('[chengwan-'));}
 assert.equal(e.listeners.has('completion_settings'),false);
 const stage=channel==='novel'?'novel':channel==='information'?'information':'variables';
 const target=e.calls.find(c=>c.stage===stage);assert(target);
 assert.equal(target.config.custom_api?.model,mode==='main'?undefined:'isolated-extra');
 });
});
test('旧配置的关闭预设字段不再产生无预设请求',()=>{
 const config=ApiSettingsSchema.parse({...endpoint('saved'),sendPreset:false});
 assert.equal(Object.hasOwn(config,'sendPreset'),false);assert.equal(config.model,'saved');
});
test('原生输入准备保留事实、端点与槽位参数，不修改原对象',()=>{
 const source={user_input:'事实资料',custom_api:{model:'合成模型'},overrides:{char_description:''},
 injects:[{role:'system',position:'in_chat',depth:0,content:'本轮任务'}]};
 const before=copy(source),result=nativePromptConfig(source);assert.deepEqual(source,before);
 assert.equal(result.user_input,'本轮任务\n\n事实资料');assert.equal(result.injects,undefined);
 assert.deepEqual(result.custom_api,source.custom_api);assert.deepEqual(result.overrides,source.overrides);
});
test('本轮候选状态用于变量世界书，异常后恢复正常正文资料',async()=>{
 const base=seed(),draft=copy(base);draft.玩家.姓名='未提交候选';
 await assert.rejects(withPromptContext({purpose:'variables',state:draft},async()=>{
  assert(promptContextText(()=>base).includes('未提交候选'));assert.equal(variableRuleText('规则原文'),'规则原文');
  throw Error('合成失败');}),/合成失败/);
 assert(!promptContextText(()=>base).includes('未提交候选'));assert.equal(variableRuleText('规则原文'),'');
 assert.equal(base.玩家.姓名,'合成玩家');
});
test('独立资料与奇遇任务不展开完整状态或变量格式',async()=>{
 for(const purpose of ['knowledge','novel'])await withPromptContext({purpose,state:seed()},async()=>{
  assert.equal(promptContextText(()=>{throw Error('不应读取存档');}),'');assert.equal(variableRuleText('格式'),'');
 });
});
test('变量失败重试保留正文与提交身份，不重新生成正文',async()=>{
 await withRuntime({variable:configured('main')},async e=>{let fail=true;e.update=async()=>{if(fail){fail=false;throw Error('合成变量失败');}return block([]);};
 await assert.rejects(e.runtime.send('观察'),/合成变量失败/);const body=e.messages.at(-1).message,id=e.vars.澄湾待更新正文.id;
 await e.runtime.retry();assert.equal(e.messages.at(-1).message,body);assert.equal(e.calls.filter(c=>c.stage==='story').length,1);
 assert.deepEqual(Object.keys(e.state()._系统.已计轮事件),[id]);assert.equal(e.vars.澄湾待更新正文,null);
 });
});

for(const mode of ['main','extra'])for(const role of ['system','user'])test(`正文交接保留结算边界且只发送一份事实/${mode}/${role}`,async()=>{
 const action='把报到路线记在便签，准备下午出门';
 const story='上午十点十五分，玩家把报到路线记在便签上，尚未出门，也没有接待顾客或收款。';
 await withRuntime({variable:configured(mode)},async e=>{
  const formatEntry=e.rules.find(entry=>entry.name.includes('变量输出格式'));
  formatEntry.content=fs.readFileSync(path.join(__dirname,'../世界书/变量/变量输出格式.yaml'),'utf8');
  formatEntry.position={...formatEntry.position,role};
  e.story=async()=>story;
  e.update=async()=>block([]);
  await e.runtime.send(action);
  const worker=e.calls.find(c=>c.stage==='variables').config;
  assert(worker.user_input.includes('正文已经完整输出。'),'交接职责不能在整理原生输入时丢失');
  assert(worker.user_input.includes('不续写面向玩家的正文。'));
  const taskMessages=worker.finalMessages.filter(m=>m.content.includes('不是新的正文回合。'));
  assert.equal(taskMessages.length,1,'完整职责只由本次读取的变量规则提供一份');
  assert.equal(taskMessages[0].role,role,'沿用变量格式条目的原生角色');
  assert.match(taskMessages[0].content,/<advice>\s*本次执行变量更新[\s\S]*?<\/advice>/,
   '预设要求执行最新advice时，任务标签应指向后台结算职责');
  assert.equal(worker.user_input.split(story).length-1,1,'已完成正文只交接一份');
  assert.equal(worker.user_input.split(action).length-1,1,'玩家输入只交接一份');
  assert.equal(worker.finalMessages.at(-1).content,'模拟原生预设尾部');
  assert.equal(worker.injects.length,2);
  assert(e.rules.every(entry=>!entry.enabled),'规则持续关闭，不在请求前后切换');
  assert.equal(worker.ordered_prompts,undefined);
 });
});
