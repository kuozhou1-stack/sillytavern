const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {test}=require('node:test'),assert=require('node:assert/strict');
const file=path.join(__dirname,'双API流程.spec.cjs'),h=new Module(file,module);
h.filename=file;h.paths=Module._nodeModulePaths(__dirname);
const req=h.require.bind(h);h.require=n=>n==='node:test'?{test(){}}:req(n);
h._compile(fs.readFileSync(file,'utf8').split('const novelGoodReply =')[0]+'\nmodule.exports={environment,seed,Schema,copy};',file);
const {environment,seed,Schema,copy}=h.exports;
const {registerPromptMacros,withPromptContext,promptContextText,preparePromptWorldbook}=require('../运行/prompt-context.ts');

test('世界书内容宏允许原生模板合并换行，正文不带变量规则，变量保留一份正式契约',async()=>{
 const callbacks=[];global.registerMacroLike=(regex,replace)=>{const entry={regex,replace};callbacks.push(entry);return {unregister(){callbacks.splice(callbacks.indexOf(entry),1);}};};
 const state=seed(),stop=registerPromptMacros(()=>state);
 try{
  const render=text=>callbacks.reduce((result,m)=>result.replace(m.regex,(match,...args)=>m.replace({},match,...args)),text);
  for(const separator of ['\n','']){
   const source='预设前文\n# {{valoran_variables}}'+separator+'变量输出格式: CONTRACT\n# {{valoran_variables_end}}\n预设尾部';
   await withPromptContext({purpose:'story',state},async()=>{const result=render(source);assert(!result.includes('CONTRACT'));assert(result.includes('预设前文'));assert(result.endsWith('预设尾部'));});
   await withPromptContext({purpose:'variables',state},async()=>{const result=render(source);assert.equal(result.split('CONTRACT').length-1,1);assert(!result.includes('valoran_variables'));assert(result.endsWith('预设尾部'));});
  }
 }finally{stop();}assert.equal(callbacks.length,0);
});

test('选中人物的角色包独有信息保留，未选人物的来源档案不进入正文，存档不变',async()=>{
 const state=seed();
 state.角色.npc._管理.来源档案id='selected';
 state._系统.来源档案=Schema.parse({_系统:{来源档案:{
  selected:{人物id:'npc',原始快照JSON:JSON.stringify({角色:state.角色.npc,独有设定:'SELECTED_PACKAGE_ONLY'})},
  inactive:{人物id:'inactive',原始快照JSON:JSON.stringify({角色:{姓名:'未选角色'},独有设定:'UNSELECTED_PACKAGE_ONLY'})},
 }}})._系统.来源档案;
 const before=copy(state);
 await withPromptContext({purpose:'story',state},async()=>{const text=promptContextText(()=>state);assert(text.includes('SELECTED_PACKAGE_ONLY'));assert(!text.includes('UNSELECTED_PACKAGE_ONLY'));assert(text.includes('readonly_source_context'));});
 assert.deepEqual(state,before);
});

test('旧内容升级仅替换宏，保留规则原文、位置、开关及其他条目，重复准备不写入',async()=>{
 const e=environment();
 e.rules=[{uid:19,name:'变量列表',content:'---\n<status_current_variable>\n{{format_message_variable::stat_data}}\n</status_current_variable>',
  enabled:true,position:{type:'at_depth',role:'system',depth:0,order:14720}},
 {uid:20,name:'[mvu_update]变量更新规则',content:'用户编辑的规则正文',enabled:false,position:{type:'at_depth',role:'system',depth:0,order:14730}},
 {uid:80,name:'其他条目',content:'不相关正文',enabled:true,position:{type:'before_character_definition',order:20}}];
 const before=copy(e.rules);
 await preparePromptWorldbook();assert.equal(e.rules[0].content,'{{valoran_context}}');
 assert(e.rules[1].content.includes('用户编辑的规则正文'));assert(e.rules[1].content.includes('valoran_variables_end'));
 for(let i=0;i<before.length;i++)assert.deepEqual({...e.rules[i],content:before[i].content},before[i]);
 const writes=e.ruleWrites;await preparePromptWorldbook();assert.equal(e.ruleWrites,writes);
});
