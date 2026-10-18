const test=require('node:test'),assert=require('node:assert/strict');
const {component,html,seed,scopes,vue}=require('./手机重构测试夹具.cjs');
const {SettingsSchema,ApiSettingsSchema,InformationApiSettingsSchema}=require('../运行/settings.ts');
const {klona}=require('klona');
test.afterEach(()=>{for(const scope of scopes.splice(0))scope.stop();});
function setup(channel='variable',sharedWindow={}) {
  const settings=vue.reactive(SettingsSchema.parse({variable:{apiurl:'https://fixture.invalid/v1',model:'original'}}));
  const calls=[],runtime={settings,view:vue.reactive({busy:false,updating:false,settingsWarning:''}),
    async saveSettings(input,selected){calls.push({kind:'save',selected,input});Object.assign(settings,{[selected]:input[selected]});return '';},
    async reloadSettings(selected){calls.push({kind:'read',selected});return '';}};
  const additions={window:sharedWindow,withDefaults:(props,defaults)=>({...defaults,...props}),klona,z:global.z,
    ApiSettingsSchema,InformationApiSettingsSchema,validateApi:require('../运行/settings.ts').validateApi,getModelList:async()=>['model-a']};
  const mount=(selected=channel)=>component('../settings/ExtraApiForm',vue.ref(seed()),runtime,{channel:selected},additions);
  const fixture=mount();return {runtime,calls,mount,fixture,view:fixture.view,sharedWindow,additions};
}
test('API表单：按通道保存，草稿跨关闭重开保留，撤销回到确认配置',async()=>{
  const e=setup();e.view.draft.model='unsaved';await vue.nextTick();
  const reopened=e.mount().view;
  assert.equal(reopened.draft.model,'unsaved');assert.equal(reopened.isDirty.value,true);
  reopened.reset();assert.equal(reopened.draft.model,'original');assert.equal(reopened.isDirty.value,false);
  e.view.draft.model='saved-new';await e.view.save();
  assert.equal(e.calls.length,1);assert.equal(e.calls[0].selected,'variable');
  assert.equal(e.runtime.settings.variable.model,'saved-new');assert.equal(e.view.error.value,'');
});
test('API表单：资料默认复用变量，独立端点保留草稿，保存不触发模型',async()=>{
  const e=setup('information');assert.equal(e.view.draft.reuseVariable,true);
  await e.view.save();assert.equal(e.calls[0].selected,'information');
  e.view.draft.reuseVariable=false;e.view.draft.apiurl='https://selection.invalid/v1';e.view.draft.model='selector';
  await e.view.save();assert.equal(e.runtime.settings.information.model,'selector');
  assert.equal(e.runtime.settings.variable.model,'original');
});
test('API表单：读取共用配置只指定当前通道，失败提示不清未保存草稿',async()=>{
  const e=setup('phone');e.view.draft.model='phone-draft';
  e.runtime.reloadSettings=async channel=>{e.calls.push({kind:'read',selected:channel});return '服务器读取失败，已使用浏览器副本';};
  await e.view.syncShared();assert.equal(e.calls[0].selected,'phone');
  assert.equal(e.view.draft.model,'phone-draft');assert.match(e.view.error.value,/读取失败/);
});
test('API表单：服务器读回失败保持草稿且不显示成功；仅浏览器副本失败明确区分',async()=>{
  const e=setup();e.view.draft.model='keep-draft';
  e.runtime.saveSettings=async()=>{throw Error('酒馆共用配置保存后读回不一致');};
  await e.view.save();assert.equal(e.view.draft.model,'keep-draft');assert.equal(e.view.notice.value,'');
  assert.match(e.view.error.value,/读回不一致/);
  e.runtime.saveSettings=async(input,channel)=>{e.runtime.settings[channel]=input[channel];return '酒馆共用配置已保存，浏览器副本保存失败：quota';};
  await e.view.save();assert.match(e.view.notice.value,/已保存到酒馆/);assert.match(e.view.error.value,/浏览器副本保存失败/);
});
test('API表单：更换连接后迟到模型列表不覆盖新连接',async()=>{
  const e=setup();let release;e.additions.getModelList=()=>new Promise(resolve=>{release=resolve;});
  const fixture=e.mount(),v=fixture.view;const loading=v.fetchModels();
  v.draft.apiurl='https://new.invalid/v1';release(['old-model']);await loading;
  assert.deepEqual(Array.from(v.models.value),[]);assert.equal(v.loadingModels.value,false);
});
test('API三通道：折叠保留实例、模型摘要及旧手机入口定位',async()=>{
  const e=setup();const fixture=component('../settings/TabApiSettings',vue.ref(seed()),e.runtime,{initialSection:'phone'});
  const v=fixture.view;assert.equal(v.expanded.phone,true);assert.equal(v.expanded.variable,false);
  v.toggleAll(true);assert(Object.values(v.expanded).every(Boolean));v.toggleAll(false);assert(Object.values(v.expanded).every(x=>!x));
  assert.match(v.getSummaryBadge('information'),/复用正文/);
  assert.equal(v.sections.length,3);
});
test('API表单：实际模板含按区读取、保存、撤销与复用说明，不输出明文密钥',async()=>{
  const e=setup('information');const markup=await html(e.fixture);
  assert(markup.includes('读取共用配置'));assert(markup.includes('保存资料选择配置'));
  assert(markup.includes('复用正文变量 API'));assert(markup.includes('当前复用正文变量连接'));
  assert(!markup.includes('一次选择地点、组织、角色'));
});

test('移植设置导航：旧入口仍能定位变量、手机、资料与对应资料子页',()=>{
  const e=setup();
  for(const [initialTab,tab,section,subTab] of [
    ['api','api','variable',undefined],['auxApi','api','phone',undefined],
    ['selectionApi','api','information',undefined],['characters','roster_knowledge',undefined,'roster'],
    ['information','roster_knowledge',undefined,'locations'],
  ]){
    const v=component('../settings/SettingsModal',vue.ref(seed()),e.runtime,{initialTab}).view;
    assert.equal(v.currentTab.value,tab);assert.equal(v.initialSection.value,section);assert.equal(v.initialSubTab.value,subTab);
  }
});

test('移植资料子页：地点与组织独立展示并沿用原资料操作归属',async()=>{
  const e=setup(),data=seed();data.组织.org={名称:'隔离协会',类型:'文化组织'};e.runtime.view.data=data;
  const operations=[];e.runtime.manageInformation=async(...args)=>operations.push(args);
  const props=vue.reactive({kind:'组织'});
  const fixture=component('../settings/TabWorldInformation',vue.ref(data),e.runtime,props,{
    klona,effectiveInformationIds:require('../运行/knowledge-context.ts').effectiveInformationIds,
    resolveCharacterName:(_state,id)=>id,
  });
  assert.equal(fixture.view.kind.value,'组织');assert.equal(fixture.view.allRows.value[0].name,'隔离协会');
  const markup=await html(fixture);assert(markup.includes('组织资料管理'));assert(!markup.includes('cw-kind-tabs'));
  await fixture.view.changeMode('org',{target:{value:'展开'}});assert.deepEqual(operations,[['组织','org','展开']]);
  props.kind='地点';await vue.nextTick();assert.equal(fixture.view.kind.value,'地点');assert.equal(fixture.view.selectedId.value,null);
  await fixture.view.changeMode('home',{target:{value:'仅名称'}});assert.deepEqual(operations[1],['地点','home','仅名称']);
});
