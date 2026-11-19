const test=require('node:test'),assert=require('node:assert/strict');
const {component,html,seed,scopes,vue}=require('./手机重构测试夹具.cjs');
const {SettingsSchema,ApiProfileSchema,ApiSettingsSchema,VariableApiSettingsSchema,InformationApiSettingsSchema}=require('../运行/settings.ts');
const {klona}=require('klona');
test.afterEach(()=>{for(const scope of scopes.splice(0))scope.stop();});
function setup(channel='variable',sharedWindow={}) {
  const settings=vue.reactive(SettingsSchema.parse({variable:{apiurl:'https://fixture.invalid/v1',model:'original'}}));
  const calls=[],runtime={settings,view:vue.reactive({busy:false,updating:false,settingsWarning:''}),
    async saveSettings(input,selected){calls.push({kind:'save',selected,input});Object.assign(settings,{[selected]:input[selected]});return '';},
    async reloadSettings(selected){calls.push({kind:'read',selected});return '';}};
  const additions={window:sharedWindow,AbortController,vertexThinkingLevels:require('../运行/vertex.ts').vertexThinkingLevels,withDefaults:(props,defaults)=>({...defaults,...props}),klona,z:global.z,
    ApiProfileSchema,ApiSettingsSchema,VariableApiSettingsSchema,InformationApiSettingsSchema,validateApi:require('../运行/settings.ts').validateApi,getModelList:async()=>['model-a']};
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

test('API表单：旧设置默认独立结算，同次开关支持草稿、保存重开与切回', async () => {
  const e = setup();
  assert.equal(e.view.draft.independent, true);
  assert((await html(e.fixture)).includes('独立正文变量结算'));
  e.view.draft.independent = false;
  e.view.draft.apiurl = '';
  e.view.draft.model = '';
  await vue.nextTick();
  assert.equal(e.mount().view.draft.independent, false);
  await e.view.save();
  assert.equal(e.calls[0].input.variable.independent, false);
  const reopened = e.mount().view;
  assert.equal(reopened.draft.independent, false);
  assert.equal(reopened.isDirty.value, false);
  reopened.draft.independent = true;
  reopened.connectionMode.value = 'main';
  await reopened.save();
  assert.equal(e.runtime.settings.variable.independent, true);
  assert.equal(e.runtime.settings.variable.mode, 'main');
  for (const channel of ['phone', 'information']) {
    const fixture = e.mount(channel);
    assert(!(await html(fixture)).includes('独立正文变量结算</span>'));
    await fixture.view.save();
    assert.equal(Object.hasOwn(e.runtime.settings[channel], 'independent'), false);
  }
});

test('API表单：main隐藏独立认证字段，切回extra保留连接草稿',async()=>{
  const e=setup();e.view.draft.key='SYNTHETIC_ONLY';e.view.connectionMode.value='main';
  let markup=await html(e.fixture);assert(markup.includes('使用酒馆当前正文 API'));
  assert(!markup.includes('API 访问密钥'));assert(!markup.includes('SYNTHETIC_ONLY'));
  await e.view.save();assert.equal(e.runtime.settings.variable.mode,'main');
  e.view.connectionMode.value='extra';assert.equal(e.view.draft.model,'original');assert.equal(e.view.draft.key,'SYNTHETIC_ONLY');
  markup=await html(e.fixture);assert(markup.includes('API 访问密钥'));
});

test('资料连接：跟随配置时只显示继承值，单独选择酒馆与自定义连接时保留各自草稿',async()=>{
  const e=setup('information');
  for(const mode of ['reuse','main','extra']){
    e.view.connectionMode.value=mode;e.view.draft.sendPreset=true;
    if(mode==='extra'){e.view.draft.apiurl='https://selection.invalid';e.view.draft.model='selector';}
    const markup=await html(e.fixture);
    assert.equal(markup.includes('跟随正文变量配置'),true);
    assert.equal(markup.includes('aria-label="资料选择使用的连接"'),mode!=='reuse');
    assert.equal(markup.includes('API 访问密钥'),mode==='extra');
    await e.view.save();assert.equal(Object.hasOwn(e.runtime.settings.information,'sendPreset'),false);
    assert.equal(e.runtime.settings.information.reuseVariable,mode==='reuse');
    assert.equal(Object.hasOwn(e.runtime.settings.variable,'sendPreset'),false);
  }
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
  await e.view.save();assert.equal(e.view.notice.value,'');assert.match(e.view.error.value,/酒馆共用配置已保存，浏览器副本保存失败/);
  const markup=await html(e.fixture);assert(markup.includes('role="alert"'));assert(!markup.includes('role="status"'));
});
test('API表单：更换连接后迟到模型列表不覆盖新连接',async()=>{
  const e=setup();let release;e.additions.getModelList=()=>new Promise(resolve=>{release=resolve;});
  const fixture=e.mount(),v=fixture.view;const loading=v.fetchModels();
  v.draft.apiurl='https://new.invalid/v1';release(['old-model']);await loading;
  assert.deepEqual(Array.from(v.models.value),[]);assert.equal(v.loadingModels.value,false);
});
test('API表单：编辑多个连接并调整首选，保存重开后保留顺序、自动切换与通道选项',async()=>{
  const e=setup(), v=e.view;
  assert.equal(v.draft.autoFailover,false);
  v.draft.name='原首选';v.draft.retries=2;
  v.addProfile();Object.assign(v.currentProfile.value,{name:'备用一',apiurl:'https://backup.invalid/v1',model:'backup-model'});
  v.addProfile();Object.assign(v.currentProfile.value,{name:'备用二',apiurl:'https://second.invalid/v1',model:'second-model'});
  v.moveProfile(-1);v.moveProfile(-1);v.draft.autoFailover=true;
  assert.equal(v.selectedIndex.value,0);assert.equal(v.draft.name,'备用二');
  assert.deepEqual(Array.from(v.draft.backups,p=>p.name),['原首选','备用一']);
  const markup=await html(e.fixture);assert.match(markup,/首选 · 备用二/);assert.match(markup,/全部连接失败后的重试轮数/);
  await v.save();
  assert.equal(e.runtime.settings.variable.retries,2);
  assert.equal(e.runtime.settings.variable.autoFailover,true);
  assert.equal(e.runtime.settings.variable.independent,true);
  assert.equal(Object.hasOwn(e.runtime.settings.variable.backups[0],'backups'),false);
  const reopened=e.mount().view;reopened.removeProfile();assert.equal(reopened.draft.name,'原首选');
  reopened.selectedIndex.value=1;reopened.removeProfile();assert.equal(reopened.draft.backups.length,0);
  reopened.reset();assert.equal(reopened.draft.name,'备用二');
  assert.equal(e.runtime.settings.phone.backups.length,0);
});

test('Vertex导入：只保存凭据引用，导入后立即按项目和区域取最新列表，切换后可重新拉取',async()=>{
  const e=setup();let pulls=0;
  e.additions.importVertexServiceAccount=async text=>{
    assert.equal(text,'account-fixture');return {projectId:'fixture-project',vertexCredentialId:'opaque-reference'};
  };
  e.additions.listVertexModels=async({projectId,region,vertexCredentialId})=>{
    assert.equal(projectId,'fixture-project');assert.equal(vertexCredentialId,'opaque-reference');
    pulls++;return region==='global'?['gemini-first']:['gemini-10','gemini-3'];
  };
  const fixture=e.mount(),v=fixture.view;v.addProfile();v.currentProfile.value.source='vertex';
  const input={files:[{text:async()=>'account-fixture'}],value:'fixture.json'};
  await v.importCredential({target:input});assert.equal(input.value,'');assert.equal(pulls,1);
  assert.equal(v.draft.model,'original');assert.equal(v.currentProfile.value.model,'gemini-first');
  v.currentProfile.value.region='us-central1';assert.equal(v.models.value.length,0);
  await v.fetchModels();assert.deepEqual(Array.from(v.models.value),['gemini-10','gemini-3']);
  const markup=await html(fixture);assert(markup.includes('重新导入服务账号 JSON'));assert(!markup.includes('API 访问密钥'));
  assert(!markup.includes('account-fixture'));assert(!markup.includes('opaque-reference'));
  await v.save();assert.equal(e.runtime.settings.variable.backups[0].vertexCredentialId,'opaque-reference');
  assert(!JSON.stringify(e.calls).includes('account-fixture'));
});

test('Vertex表单用原生按钮选择服务账号，按模型提供思考强度并随连接保存',async()=>{
  const e=setup(),v=e.view;
  v.addProfile();v.currentProfile.value.source='vertex';
  v.selectedModel.value='gemini-3.1-pro-preview';
  const levels=Array.from(v.thinkingLevels.value);
  assert.deepEqual(levels,['default','low','medium','high']);
  v.currentProfile.value.vertexThinkingLevel='high';
  const markup=await html(e.fixture);
  assert.match(markup,/<button[^>]*cw-vertex-file-button[^>]*>[\s\S]*?导入服务账号 JSON[\s\S]*?<\/button>/);
  assert.match(markup,/<input[^>]*type="file"[^>]*hidden/);
  assert.match(markup,/思考强度/);
  await v.save();assert.equal(e.runtime.settings.variable.backups[0].vertexThinkingLevel,'high');
  v.moveProfile(-1);assert.equal(v.draft.vertexThinkingLevel,'high');
  v.selectedModel.value='unknown-fixture';assert.deepEqual(Array.from(v.thinkingLevels.value),['default']);
  assert.equal(v.currentProfile.value.vertexThinkingLevel,'default');
  v.currentProfile.value.source='google';assert(!(await html(e.fixture)).includes('思考强度'));
});
test('Vertex切换连接：迟到的文件读取不会写入刚选中的连接',async()=>{
  const e=setup();let finishFile;let imports=0;
  e.additions.importVertexServiceAccount=async()=>{imports++;return {projectId:'late',vertexCredentialId:'late'};};
  const v=e.mount().view;v.addProfile();v.currentProfile.value.source='vertex';
  const pending=v.importCredential({target:{files:[{text:()=>new Promise(resolve=>{finishFile=resolve;})}],value:''}});
  v.selectedIndex.value=0;finishFile('discarded');await pending;
  assert.equal(imports,0);assert.equal(v.draft.projectId,'');assert.equal(v.draft.backups[0].projectId,'');
});
test('API三通道：折叠保留实例、模型摘要及旧手机入口定位',async()=>{
  const e=setup();
  const defaultPage=component('../settings/TabApiSettings',vue.ref(seed()),e.runtime).view;
  assert(Object.values(defaultPage.expanded).every(open=>!open));
  const fixture=component('../settings/TabApiSettings',vue.ref(seed()),e.runtime,{initialSection:'phone'});
  const v=fixture.view;assert.equal(v.expanded.phone,true);assert.equal(v.expanded.variable,false);
  v.toggleAll(true);assert(Object.values(v.expanded).every(Boolean));v.toggleAll(false);assert(Object.values(v.expanded).every(x=>!x));
  assert.match(v.getSummaryBadge('information'),/跟随正文变量/);
  assert.equal(v.sections.length,3);
});
test('API表单：实际模板含按区读取、保存、撤销与复用说明，不输出明文密钥',async()=>{
  const e=setup('information');const markup=await html(e.fixture);
  assert(markup.includes('读取共用配置'));assert(markup.includes('保存资料选择配置'));
  assert(markup.includes('跟随正文变量配置'));assert(markup.includes('当前连接'));
  assert(markup.includes('original'));assert(!markup.includes('API 访问密钥'));
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
