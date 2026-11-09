const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {test}=require('node:test'),assert=require('node:assert/strict');
const file=path.join(__dirname,'双API流程.spec.cjs'),h=new Module(file,module);
h.filename=file;h.paths=Module._nodeModulePaths(__dirname);
const req=h.require.bind(h);h.require=n=>n==='node:test'?{test(){}}:req(n);
h._compile(fs.readFileSync(file,'utf8').split('const novelGoodReply =')[0]+'\nmodule.exports={Schema,copy,environment,block};',file);
const {Schema,copy,environment,block}=h.exports;
const {prepareOpeningCharacterRoster,characterSelectionContext}=require('../运行/character-roster.ts');
const {libraryView,prepareLibraryCommand}=require('../运行/character-library.ts');
const {informationSelectionPrompt,parseInformationSelection,applyInformationSelectionValues,effectiveInformationIds}=require('../运行/knowledge-context.ts');
const version=require('../运行/world-information.json').版本;
const options={majorLimit:1,minorLimit:0,majorRotation:1,minorRotation:0};
const quotas={地点:{limit:6,rotation:2},组织:{limit:3,rotation:1}};
function seed(){return Schema.parse({_系统:{建档完成:true,资料加载:{资料版本:version}},玩家:{id:'player',背景:{教育经历:'刚到学校参加课程'}},
  角色:{first:{姓名:'队首人物',层级:'主要',身份:'远处商店店主'},filler:{姓名:'另一人物',层级:'主要'},
    fit:{姓名:'课程老师',层级:'主要',身份:'大学教师',重要记录:{unique:{内容:'UNIQUE_ARCHIVE_FACT',事件id:null,约定id:null}}}},
  地点:Object.fromEntries(Array.from({length:10},(_,i)=>['p'+i,{名称:'地点'+i}])),
  组织:Object.fromEntries(Array.from({length:6},(_,i)=>['o'+i,{名称:'组织'+i}])),
  手机:{账号:{me:{人物id:'player',平台:'邻信'},first:{人物id:'first',平台:'邻信'}},会话:{chat:{类型:'私聊',参与账号id:['me','first']}}},
});}

test('开局按模型推荐挑中后排相关人物，未选档案和独有记录保留',()=>{
 const state=seed(),original=copy(state);
 const prepared=prepareOpeningCharacterRoster(state,{},options,[],['fit']);
 assert.deepEqual(Object.keys(prepared.state.角色),['fit']);
 const all=libraryView(prepared.state,prepared.library).characters;
 assert.deepEqual(Object.keys(all).sort(),['filler','first','fit']);
 assert.equal(all.fit.重要记录.unique.内容,'UNIQUE_ARCHIVE_FACT');
 assert.deepEqual(state,original);
});

test('人物目录提供身份和生活线索，不发送完整档案；手动关闭不被模型重新打开',()=>{
 const state=seed(),context=characterSelectionContext(state,{},options,'准备上课');
 const config=informationSelectionPrompt(state,'准备上课',[],{characters:context,quotas});
 const input=JSON.parse(config.user_input);
 assert.equal(input.目录.人物.fit.身份,'大学教师');
 assert(!config.user_input.includes('UNIQUE_ARCHIVE_FACT'));
 assert(!Object.hasOwn(input.人物选择,'目录'),'候选详情只出现一份');
 const disabled=prepareLibraryCommand(state,{}, {kind:'enabled',ids:['fit'],enabled:false});
 assert(!Object.hasOwn(characterSelectionContext(disabled.state,disabled.library,options).目录,'fit'));
 assert.throws(()=>prepareOpeningCharacterRoster(disabled.state,disabled.library,options,[],['fit']),/手动关闭/);
});

test('真实参与者保留可超过资料上限，相识不因此全部强制开启',()=>{
 const state=seed();state.世界.当前场景.在场人物=['filler','fit'];
 const prepared=prepareOpeningCharacterRoster(state,{},options,['first'],['first']);
 assert.deepEqual(Object.keys(prepared.state.角色).sort(),['filler','fit']);
});

test('首次资料选择允许准备完整配额，后续按相关性最多换地点2、组织1',()=>{
 const state=seed();state.玩家.当前状态.当前地点id='p0';
 const first=applyInformationSelectionValues(state,{地点:Object.keys(state.地点),组织:Object.keys(state.组织)},'first',false,quotas);
 assert.equal(effectiveInformationIds(first,'地点').size,6);assert.equal(effectiveInformationIds(first,'组织').size,3);
 const next=applyInformationSelectionValues(first,{地点:['p6','p7','p8','p1','p2','p3','p4','p5'],组织:['o3','o4','o0','o1','o2']},'next',false,quotas);
 const places=effectiveInformationIds(next,'地点'),orgs=effectiveInformationIds(next,'组织');
 assert(places.has('p0'));assert(places.has('p6'));assert(places.has('p7'));assert(!places.has('p8'));
 assert(orgs.has('o3'));assert(!orgs.has('o4'));assert.equal(places.size,6);assert.equal(orgs.size,3);
 assert.deepEqual(next.地点,state.地点);assert.deepEqual(next.组织,state.组织);
});

test('没有相关新资料时不强制换满，轮候只推进候选机会',()=>{
 const state=seed();state._系统.资料加载.地点=['p0','p1','p2'];state._系统.资料加载.组织=['o0'];state._系统.资料加载.选择依据='old';
 const result=applyInformationSelectionValues(state,{地点:['p0','p1','p2'],组织:['o0']},'new',false,quotas);
 assert.deepEqual(result._系统.资料加载.地点,['p0','p1','p2']);assert.deepEqual(result._系统.资料加载.组织,['o0']);
 assert(!result._系统.资料加载.轮候.地点.slice(0,2).includes('p3'),'已给过的轮候建议移到队尾');
});

test('空位补足不算替换，组织尚未展开时可一次准备相关资料',()=>{
 const state=seed();state._系统.资料加载.选择依据='old';
 state._系统.资料加载.地点=['p0','p1','p2'];
 const result=applyInformationSelectionValues(state,{地点:['p0','p1','p2','p3','p4','p5'],组织:['o0','o1','o2']},'next',false,quotas);
 assert.equal(effectiveInformationIds(result,'地点').size,6);
 assert.deepEqual([...effectiveInformationIds(result,'组织')],['o0','o1','o2']);
});

test('必要资料和手动模式优先，补齐结算上下文不丢旧值或重复轮换',()=>{
 const state=seed();state.玩家.当前状态.当前地点id='p0';state.玩家.身份.组织id=['o0'];
 state._系统.资料加载.地点覆盖={p0:'仅名称',p8:'展开'};
 const selected=applyInformationSelectionValues(state,{地点:['p0'],组织:[]},'zero',false,{地点:{limit:0,rotation:0},组织:{limit:0,rotation:0}});
 assert.deepEqual([...effectiveInformationIds(selected,'地点')],['p8']);assert.deepEqual([...effectiveInformationIds(selected,'组织')],['o0']);
 const queue=copy(selected._系统.资料加载.轮候);
 const settled=applyInformationSelectionValues(selected,{地点:['p9'],组织:['o5']},'settlement',true,quotas);
 assert(effectiveInformationIds(settled,'地点').has('p8'));assert(effectiveInformationIds(settled,'地点').has('p9'));
 assert.deepEqual(settled._系统.资料加载.轮候,queue);
});

test('人物字段只在启用人物选择时属于输出契约',()=>{
 assert.deepEqual(parseInformationSelection('{"人物":["fit"],"地点":[],"组织":[]}',true).人物,['fit']);
 assert.throws(()=>parseInformationSelection('{"地点":[],"组织":[]}',true));
 assert.throws(()=>parseInformationSelection('{"人物":[],"地点":[],"组织":[]}'));
});

test('实际Runtime同一选择请求决定人物和资料，再生成正文，重试不重复选择',async()=>{
 const e=environment(seed(),{characterAuto:true,informationAuto:true,characterRoster:options,variable:{mode:'main'},phone:{mode:'main'}});
 let choices=0,fail=true;await e.runtime.start();
 e.update=async()=>{
  if(e.runtime.view.phase==='information'){choices++;return JSON.stringify({人物:['fit'],地点:['p0'],组织:[]});}
  if(fail){fail=false;throw Error('模拟结算中断');}return block([]);
 };
 try{
  await assert.rejects(e.runtime.send('准备上课'),/模拟结算中断/);
  assert.deepEqual(Object.keys(e.state().角色),['fit']);assert.equal(choices,1);
  const phases=e.calls.map(c=>c.stage);assert.deepEqual(phases,['information','story','variables']);
  const body=e.messages.at(-1).message;await e.runtime.retry();
  assert.equal(choices,1);assert.equal(e.messages.at(-1).message,body);
  assert.equal(e.calls.filter(c=>c.stage==='story').length,1);
 }finally{await e.runtime.dispose();}
});

test('保存建档先完整入库，开场用同一次资料选择启用相关人物并结算',async()=>{
 const raw=seed(),characters=Object.entries(raw.角色).map(([id,person])=>({id,...person}));
 raw.角色={};raw.手机=Schema.parse({}).手机;raw._系统.建档完成=false;
 const e=environment(raw,{characterAuto:true,informationAuto:true,characterRoster:options,variable:{mode:'main'},phone:{mode:'main'}});
 await e.runtime.start();e.update=async()=>e.runtime.view.phase==='information'
  ? JSON.stringify({人物:['fit'],地点:[],组织:[]}) : block([]);
 try{
  await e.runtime.createProfile({player:{姓名:'测试玩家',教育经历:'到大学参加课程'},characters});
  assert.equal(e.calls.length,0);assert.equal(Object.keys(e.state().角色).length,0,'不能先用固定队首补位');
  assert.equal(Object.keys(libraryView(e.state(),e.vars.澄湾角色库).characters).length,3);
  await e.runtime.startOpening();
  assert.deepEqual(Object.keys(e.state().角色),['fit']);
  assert.deepEqual(e.calls.map(c=>c.stage),['information','story','variables']);
  assert.equal(Object.keys(e.state()._系统.已计轮事件).length,1);
 }finally{await e.runtime.dispose();}
});

test('手机先准备实际联系人，再用同次选择细化资料，不把自动待机误作无法发送',async()=>{
 const e=environment(seed(),{characterAuto:true,informationAuto:true,characterRoster:options,variable:{mode:'main'},phone:{mode:'main'}});
 let selection=0;await e.runtime.start();
 e.update=async()=>e.runtime.view.phase==='information'
  ? JSON.stringify({人物:[++selection===1?'fit':'first'],地点:[],组织:[]}) : block([]);
 try{
  await e.runtime.send('准备上课');assert(!e.state().角色.first);
  const result=await e.runtime.phoneAction({kind:'send',id:'chat',text:'请问咨询安排？'});
  assert.equal(result.status,'confirmed');assert(e.state().角色.first);
  assert.equal(e.calls.filter(c=>c.stage==='information').length,2);
  assert.equal(e.calls.filter(c=>c.stage==='story').length,1);
 }finally{await e.runtime.dispose();}
});
