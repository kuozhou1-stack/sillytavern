const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {test}=require('node:test'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),file=path.join(__dirname,'双API流程.spec.cjs');
const harness=new Module(file,module);harness.filename=file;harness.paths=Module._nodeModulePaths(__dirname);
const nativeRequire=harness.require.bind(harness);
harness.require=name=>name==='node:test'?{test(){}}:nativeRequire(name);
harness._compile(fs.readFileSync(file,'utf8').split('const novelGoodReply =')[0]+'\nmodule.exports={environment,block,endpoint,Schema,copy};',file);
const {environment,block,endpoint,Schema,copy}=harness.exports;
const {ApiSettingsSchema,SettingsSchema,apiConnection,validateApi,isApiConfigured,informationApi}=require('../运行/settings.ts');
const {informationSelectionPrompt,finalizeInformationPrompt}=require('../运行/knowledge-context.ts');
const worldVersion=require('../运行/world-information.json').版本;
function seed(){return Schema.parse({_系统:{建档完成:true,存档id:'api-contract',资料加载:{资料版本:worldVersion}},玩家:{id:'player',姓名:'合成玩家'},
  地点:{cafe:{名称:'合成咖啡馆',简介:'完整地点仍保存在存档'}},手机:{账号:{self:{人物id:'player',平台:'邻信',昵称:'合成玩家'}}}});}
const configured=(mode,sendPreset)=>({mode,sendPreset,...(mode==='extra'?endpoint('isolated-'+mode):{})});
async function withRuntime(config,fn,initial=seed()){
  const e=environment(initial,{characterAuto:false,informationAuto:false,variable:endpoint('variable'),phone:endpoint('phone'),...config});
  e.requests=[];
  const invoke=async(method,config)=>{
    const stage=config.user_input?.match(/\[chengwan-(knowledge|worker|novel|story):/)?.[1];
    assert(stage,'应有当前请求的归属标记');
    const messages=[...(method==='generate'?[{role:'system',content:'PRESET_GUIDANCE'},{role:'assistant',content:'PRESET_EXAMPLE'}]:[]),
      ...[...(config.ordered_prompts??[]),...(config.overrides?.chat_history?.prompts??[])]
        .filter(x=>x&&typeof x==='object').map(({role,content})=>({role,content})),
      {role:'user',content:config.user_input??''},
      ...(config.injects??[]).map(({role,content})=>({role,content})),
      ...(method==='generate'?[{role:'system',content:'PRESET_TAIL'}]:[])];
    const payload={messages,custom_prompt_post_processing:'strict',...e.transport};
    await e.listeners.get('completion_settings')?.(payload);
    const request={method,stage,config:copy(config),messages:copy(messages),postProcessing:payload.custom_prompt_post_processing,toolChoice:payload.tool_choice,phase:e.runtime.view.phase};e.requests.push(request);
    if(stage==='knowledge')return '<response><InformationSelection>'+JSON.stringify({地点:[],组织:[]})+'</InformationSelection></response>';
    if(stage==='story')return '合成正文：玩家停下脚步。';
    if(stage==='novel')return JSON.stringify({任务:[{名称:'合成可选任务',类型:'探索',难度:'基础',目标:'观察一处公开标记'}],
      商品:[{名称:'合成便签纸',价格:2,类别:'消耗品',描述:'用于记录公开事项的普通便签纸',稀有:false}]});
    if(e.failVariable){e.failVariable=false;throw Error('合成变量失败');}
    return block([]);
  };
  global.generate=config=>invoke('generate',config);global.generateRaw=config=>invoke('generateRaw',config);
  await e.runtime.start();try{await fn(e);}finally{await e.runtime.dispose();}
}

test('连接模式：默认extra，main不要求独立连接且不会发送旧独立密钥',()=>{
  assert.equal(ApiSettingsSchema.parse({}).mode,'extra');
  const api=ApiSettingsSchema.parse({mode:'main',...endpoint('legacy-extra')});
  assert.equal(api.mode,'main');assert.equal(api.model,'legacy-extra');assert.equal(api.key,'test-legacy-extra');
  assert.equal(apiConnection(api),undefined);assert.doesNotThrow(()=>validateApi(ApiSettingsSchema.parse({mode:'main'}),'通道'));
  assert(isApiConfigured(ApiSettingsSchema.parse({mode:'main'})));
  assert.throws(()=>validateApi(ApiSettingsSchema.parse({}),'通道'),/端点与模型/);
  assert.deepEqual(apiConnection(ApiSettingsSchema.parse({...endpoint('google'),source:'google'})),
    {apiurl:'https://google.invalid/v1',key:'test-google',model:'google',source:'makersuite'});
});

for(const mode of ['main','extra'])for(const sendPreset of [false,true]){
  test(`正文变量：${mode}连接、预设${sendPreset}仍独立结算一次`,async()=>{
    await withRuntime({variable:configured(mode,sendPreset)},async e=>{
      await e.runtime.send('合成输入');const calls=e.requests.filter(r=>r.stage==='worker');
      assert.equal(calls.length,1);assert.equal(calls[0].method,sendPreset?'generate':'generateRaw');
      assert.equal(calls[0].config.custom_api?.model,mode==='main'?undefined:'isolated-extra');
      assert.equal(JSON.stringify(calls[0].config).includes('test-legacy'),false);
      assert.equal(e.requests.filter(r=>r.stage==='story').length,1);
      assert.equal(Object.keys(e.state()._系统.已计轮事件).length,1);
      assert(calls[0].messages.some(m=>String(m.content).includes('变量更新')));
      assert(calls[0].messages.some(m=>String(m.content).includes('JSONPatch 操作数组，这就是本次完整回复')));
      assert(calls[0].messages.some(m=>String(m.content).includes('不附加 thinking、think、reasoning 思考区')));
      assert.equal(e.rules.every(r=>!r.enabled),true,'main也使用原后台变量规则联动');
    });
  });
  test(`手机变量：${mode}连接、预设${sendPreset}保留原请求通道`,async()=>{
    await withRuntime({phone:configured(mode,sendPreset)},async e=>{
      const result=await e.runtime.phoneAction({kind:'refresh',platform:'邻信'});
      assert.equal(result.status,'confirmed');const calls=e.requests.filter(r=>r.stage==='worker');
      assert.equal(calls.length,1);assert.equal(calls[0].method,sendPreset?'generate':'generateRaw');
      assert.equal(calls[0].config.custom_api?.model,mode==='main'?undefined:'isolated-extra');
      assert.equal(e.requests.filter(r=>r.stage==='story').length,0);
      assert(!JSON.stringify(calls[0].messages).includes('<InformationSelection>'));
      assert(calls[0].messages.some(m=>String(m.content).includes('手机消息、帖子、评论等新内容写入对应手机变量')));
      assert(calls[0].messages.some(m=>String(m.content).includes('JSONPatch 操作数组，这就是本次完整回复')));
      assert(calls[0].messages.some(m=>String(m.content).includes('不附加 thinking、think、reasoning 思考区')));
    });
  });
  test(`资料选择：${mode}连接、独立预设${sendPreset}保留任务和最终输入`,async()=>{
    await withRuntime({informationAuto:true,information:{...configured(mode,sendPreset),reuseVariable:false},
      variable:{...endpoint('variable'),sendPreset:!sendPreset}},async e=>{
      await e.runtime.send('合成输入');const call=e.requests.find(r=>r.stage==='knowledge');assert(call);
      assert.equal(e.requests.filter(r=>r.stage==='knowledge').length,1);
      assert.equal(call.method,sendPreset?'generate':'generateRaw');
      assert.equal(call.config.custom_api?.model,mode==='main'?undefined:'isolated-extra');
      assert.equal(call.messages.some(m=>m.content==='PRESET_GUIDANCE'),sendPreset);
      assert.equal(JSON.parse(call.messages.find(m=>m.role==='user'&&m.content.startsWith('{"目录":')).content).本轮输入,'合成输入');
      assert.equal(call.messages.at(-1).role,'system');
      assert.equal(call.messages.filter(m=>String(m.content).includes('你只负责决定')).length,1);
      const task=call.messages.find(m=>String(m.content).includes('你只负责决定')).content;
      assert(task.includes('资料选择输出格式:')&&task.includes('<InformationSelection>')&&task.includes('</InformationSelection>'));
      assert(task.includes('{"地点": [], "组织": []}'));
      for(const other of e.requests.filter(r=>r.stage!=='knowledge'))
        assert(!JSON.stringify(other.messages).includes('<InformationSelection>'),'格式说明只属于资料选择请求');
      assert(!JSON.stringify(call.messages).includes('[chengwan-'));
      assert(!JSON.stringify(call.messages).includes('[valoran-information-task:'));
      if(sendPreset)assert(!call.config.user_input.includes('合成输入'),'预设包装之前只交接归属标记');
      assert.equal(e.state().地点.cafe.简介,'完整地点仍保存在存档');
    });
  });
}

for(const mode of ['main','extra'])for(const preset of [false,true])test(`资料复用变量${mode}连接，但预设${preset}独立`,async()=>{
  await withRuntime({informationAuto:true,variable:configured(mode,!preset),information:{reuseVariable:true,sendPreset:preset}},async e=>{
    await e.runtime.send('合成输入');const select=e.requests.find(r=>r.stage==='knowledge'),worker=e.requests.find(r=>r.stage==='worker');
    assert.equal(select.method,preset?'generate':'generateRaw');assert.equal(worker.method,!preset?'generate':'generateRaw');
    assert.deepEqual(select.config.custom_api,worker.config.custom_api);
    assert.equal(informationApi(e.runtime.settings).sendPreset,preset);
  });
});

for(const mode of ['main','extra'])test(`奇遇${mode}连接仍使用独立内容任务，不随手机预设开关`,async()=>{
  await withRuntime({phone:configured(mode,true)},async e=>{
    await e.runtime.novelAction({kind:'enable',operationId:'audit-enable'});
    await e.runtime.novelRefresh('initial');const call=e.requests.find(r=>r.stage==='novel');
    assert.equal(call.method,'generateRaw');assert.equal(call.config.custom_api?.model,mode==='main'?undefined:'isolated-extra');
    assert(!JSON.stringify(call.messages).includes('PRESET_GUIDANCE'));
    assert.equal(e.state().奇遇系统._系统币,30);
  });
});

test('资料预设最终hook保留顺序、精确去状态块，原始JSON标签不被清洗',()=>{
  const marker='[selection:owned]',slot='[slot:owned]';
  const config=informationSelectionPrompt(seed(),'原始输入 <status_current_variable>字面数据</status_current_variable>');
  const messages=[{role:'system',content:'预设A'},{role:'system',content:'前文<status_current_variable>重复全档</status_current_variable>后文'},
    {role:'assistant',content:'预设示例'},{role:'system',content:slot},{role:'user',content:'<preset>'+marker+'</preset>'}];
  assert(finalizeInformationPrompt(messages,marker,config,true,slot));
  assert.equal(messages[0].content,'预设A');assert.equal(messages[1].content,'前文后文');
  assert.equal(messages[2].content,'预设示例');assert(messages.at(-1).content.includes('你只负责决定'));
  assert.equal(messages.at(-1).role,'system');
  assert.equal(JSON.parse(messages.find(m=>m.role==='user'&&m.content.startsWith('{"目录":')).content).本轮输入,'原始输入 <status_current_variable>字面数据</status_current_variable>');
  const unchanged=copy(messages);assert.equal(finalizeInformationPrompt(messages,'other-request',config,true,slot),false);assert.deepEqual(messages,unchanged);
  assert(!JSON.stringify(messages).includes(slot));assert(!JSON.stringify(messages).includes(marker));
});

test('main与独立预设沿用服务器及浏览器保存，重新启动读回且不生成',async()=>{
  await withRuntime({},async e=>{
    for(const channel of ['variable','phone','information']){
      const api={...copy(e.runtime.settings[channel]),mode:'main',sendPreset:channel==='information',...(channel==='information'?{reuseVariable:true}:{})};
      await e.runtime.saveSettings({...copy(e.runtime.settings),[channel]:api},channel);
      const shared=e.sharedFiles.get('/user/files/valoran-v1-api-'+channel+'.json');assert.equal(shared.value.mode,'main');
      assert.equal(shared.value.sendPreset,channel==='information');
    }
    assert.equal(e.requests.length,0);await e.runtime.dispose();
    e.runtime=require('../运行/host.ts').createRuntime();await e.runtime.start();
    for(const channel of ['variable','phone','information'])assert.equal(e.runtime.settings[channel].mode,'main');
    assert.equal(e.runtime.settings.information.sendPreset,true);assert.equal(e.runtime.settings.variable.sendPreset,false);
    assert.equal(e.requests.length,0);
  });
});

test('main变量失败只重试变量，原正文和提交身份不变',async()=>{
  await withRuntime({variable:configured('main',true)},async e=>{
    e.failVariable=true;await assert.rejects(e.runtime.send('合成输入'),/合成变量失败/);
    assert.equal(e.runtime.view.phase,'variables');
    const pending=copy(e.vars.澄湾待更新正文),body=e.messages.at(-1).message;
    await e.runtime.retry();assert.equal(e.messages.at(-1).message,body);
    assert.equal(e.requests.filter(r=>r.stage==='story').length,1);assert.equal(e.requests.filter(r=>r.stage==='worker').length,2);
    assert.deepEqual(Object.keys(e.state()._系统.已计轮事件),[pending.id]);
    assert(e.state()._系统.提交记录[pending.id]);assert.equal(e.vars.澄湾待更新正文,null);
    assert.equal(e.runtime.view.phase,'');
  });
});

test('保存确认失败停在保存阶段，同ID确认不重跑API，成功后清除阶段',async()=>{
  await withRuntime({variable:configured('main',true)},async e=>{
    let fail=true;
    global.SillyTavern.saveChat=async()=>{
      if(fail&&e.runtime.view.phase==='saving'&&e.messages.at(-1).extra?.cw_story_settlements){
        fail=false;throw Error('合成保存确认失败');
      }
     e.saveDisk(); };
    await assert.rejects(e.runtime.send('保存确认阶段测试'),/合成保存确认失败/);
    assert.equal(e.runtime.view.phase,'saving');
    const id=e.vars.澄湾待更新正文.id,calls=e.requests.length;
    await e.runtime.retry();
    assert.equal(e.requests.length,calls);
    assert.deepEqual(Object.keys(e.state()._系统.已计轮事件),[id]);
    assert(e.state()._系统.提交记录[id]);
    assert.equal(e.runtime.view.phase,'');
  });
});

let converter;
async function currentTavernConverter(){
  if(!converter)converter=(async()=>{
    const {pathToFileURL}=require('node:url');
    const tavern=path.resolve(__dirname,'../../../../SillyTavern');
    const util=await import(pathToFileURL(path.join(tavern,'src/util.js')));
    util.setConfigFilePath(path.join(tavern,'config.yaml'));
    return import(pathToFileURL(path.join(tavern,'src/prompt-converters.js')));
  })();
  return converter;
}
for(const mode of ['main','extra'])for(const sendPreset of [false,true])test(`最终顺序与身份：${mode}/预设${sendPreset}保留原生位置、正文写作要求最后`,async()=>{
  const state=seed();state._系统.角色停用标识.kassadin={姓名:'卡萨丁'};
  state.玩家.个人记录.个人备忘.history={内容:'曾在旧记录中见过卡萨丁（kassadin）',关联事项id:[]};
  const {postProcessPrompt}=await currentTavernConverter();
  await withRuntime({informationAuto:true,variable:configured(mode,sendPreset),phone:configured(mode,sendPreset),
    information:{...configured(mode,sendPreset),reuseVariable:false}},async e=>{
    await e.runtime.send('合成输入');
    await e.runtime.phoneAction({kind:'refresh',platform:'邻信'});
    await e.runtime.novelAction({kind:'enable',operationId:'prompt-enable'});
    await e.runtime.novelRefresh('initial');
    for(const stage of ['knowledge','story','worker','novel'])assert(e.requests.some(r=>r.stage===stage),stage);
    for(const request of e.requests){
      const {messages}=request,body=messages.map(m=>m.content).join('\n');
      assert.equal(request.phase,{knowledge:'information',story:'story',worker:'variables',novel:'novel'}[request.stage]);
      assert.equal(request.postProcessing,'','仅本次匹配marker的请求保留原始角色与顺序');
      assert.equal(request.toolChoice,request.stage==='story'?undefined:'none','后台返回数据，正文沿用预设工具协议');
      assert.equal(messages.at(-1).role,request.stage==='story'?'user':'system');
      const outputContract=request.stage==='story'?messages.findLast(m=>m.role==='system'&&String(m.content).includes('本次只生成剧情正文')):messages.at(-1);
      assert.match(outputContract.content,/输出格式/);
      const upstream=postProcessPrompt(copy(messages),request.postProcessing,{});
      assert.deepEqual(upstream,messages,'真实酒馆后处理没有重排、合并或降低system身份');
      if(request.method==='generate'){
        const native=['PRESET_GUIDANCE','PRESET_EXAMPLE','PRESET_TAIL'];
        const indices=native.map(s=>messages.findIndex(m=>m.content===s));
        assert(indices[0]>=0&&indices[0]<indices[1]&&indices[1]<indices[2]);
        assert(indices[2]<messages.length-1,'额外格式确实位于预设尾部之后');
      }
      if(request.stage==='knowledge'){
        const inputIndex=messages.findIndex(m=>m.role==='user'&&m.content.startsWith('{"目录":'));
        assert(inputIndex>=0);
        if(request.method==='generate')assert(inputIndex<messages.findIndex(m=>m.content==='PRESET_TAIL'),'恢复输入槽位，不移到预设尾部之后');
        assert.equal(body.split('你只负责决定本轮需要展开哪些地点和组织资料').length-1,1);
      }
      if(['story','worker'].includes(request.stage)){
        assert.equal(body.split('玩家暂时关闭的人物').length-1,1);
        assert(body.includes('"id":"kassadin"'));
      }
      if(request.stage==='story'){
        assert.equal(body.split('<status_current_variable>').length-1,1);
        assert(outputContract.content.includes('创作预设规定的正文及其配套格式'));
        assert(messages.at(-1).content.includes('不使用引导式结尾'));
        assert.equal(body.split('不使用引导式结尾').length-1,1,'本轮写作要求只发一份');
        assert(!messages.at(-1).content.includes('不附加 thinking'),'正文保留创作预设自己的格式');
      }
      if(request.stage==='worker'){
        assert(!body.includes('不使用引导式结尾'),'正文结尾要求不进入变量任务');
        assert(!body.includes('<LifeCheck>'),'变量请求不再要求独立生活回执');
        assert.equal(messages.filter(m=>m.content.startsWith('{"世界":')).length,1);
        for(const rule of e.rules)assert.equal(body.split(rule.content).length-1,1,rule.name);
        assert.deepEqual(messages.slice(-2),e.rules.map(rule=>({role:'system',content:rule.content})),
          '变量更新规则、变量输出格式按此顺序各一份，后面没有其他提示');
        assert(messages.findIndex(m=>m.content.includes('本次执行瓦洛兰变量更新'))<messages.length-2);
      }
      assert(!body.includes('[chengwan-'));
      assert(!body.includes('[valoran-context:'));
      if(request.messages.length>2){
        const strict=postProcessPrompt(copy(messages),'strict',{});
        assert.equal(strict.at(-1).role,'user','反例：沿用strict会降级同一末尾system，故需请求级处理');
      }
    }
  },state);
});

for(const sendPreset of [false,true])test(`Vertex变量系统末尾：预设${sendPreset}经实际Google转换后保留身份、唯一规则和事实`,async()=>{
  const {convertGooglePrompt}=await currentTavernConverter();
  await withRuntime({variable:configured('main',sendPreset)},async e=>{
    e.transport={chat_completion_source:'vertexai',use_sysprompt:true};
    await e.runtime.send('合成Vertex输入');
    const worker=e.requests.find(r=>r.stage==='worker');
    const converted=convertGooglePrompt(copy(worker.messages),'gemini-2.5-pro',true,{});
    const systems=converted.system_instruction.parts.map(p=>p.text);
    assert.deepEqual(systems.slice(-2),e.rules.map(r=>r.content));
    const facts=converted.contents.flatMap(m=>m.parts).map(p=>p.text??'').join('\n');
    assert(facts.includes('合成Vertex输入'));
    assert(facts.includes('合成正文：玩家停下脚步。'));
    assert(!facts.includes('本次执行瓦洛兰变量更新'));
    for(const rule of e.rules){
      assert.equal(systems.join('\n').split(rule.content).length-1,1);
      assert(!facts.includes(rule.content));
    }
    const native=worker.messages.filter(m=>!systems.includes(m.content));
    if(sendPreset)assert(native.some(m=>m.content==='PRESET_TAIL'),'原生预设尾部不自行移动');
    const story=e.requests.find(r=>r.stage==='story');
    const storyWire=convertGooglePrompt(copy(story.messages),'gemini-2.5-pro',true,{});
    assert(storyWire.system_instruction.parts.some(p=>p.text.includes('只生成剧情正文')));
  });
});

test('Vertex未开启原生系统指令时不暗改开关；其他供应商仍维持原顺序',()=>{
  const {appendVariableSystemPrompts}=require('../运行/worker-task.ts');
  for(const transport of [{chat_completion_source:'vertexai',use_sysprompt:false},
    {chat_completion_source:'openai',use_sysprompt:true},{chat_completion_source:'makersuite',use_sysprompt:false}]){
    const messages=[{role:'system',content:'WORLD'},{role:'user',content:'FACTS'}];
    appendVariableSystemPrompts(messages,[{content:'RULES'},{content:'FORMAT'}],transport);
    assert.deepEqual(messages.map(m=>m.content),['WORLD','FACTS','RULES','FORMAT']);
    assert.equal(transport.use_sysprompt,transport.chat_completion_source==='openai');
  }
});

module.exports={withRuntime,seed,configured};

for(const source of ['makersuite','vertexai'])for(const sendPreset of [false,true])
test(`Google真实转换器：${source}/预设${sendPreset}三个后台通道均保留任务系统身份`,async()=>{
  const {convertGooglePrompt}=await currentTavernConverter();
  await withRuntime({informationAuto:true,variable:configured('main',sendPreset),phone:configured('main',sendPreset),
    information:{...configured('main',sendPreset),reuseVariable:false}},async e=>{
    e.transport={chat_completion_source:source,use_sysprompt:true};
    await e.runtime.send('Google跨通道合成输入');
    await e.runtime.phoneAction({kind:'refresh',platform:'邻信'});
    await e.runtime.novelAction({kind:'enable',operationId:'google-enable'});
    await e.runtime.novelRefresh('initial');
    for(const request of e.requests){
      const converted=convertGooglePrompt(copy(request.messages),'gemini-2.5-pro',true,{});
      const systems=converted.system_instruction.parts.map(p=>p.text).join('\n');
      const facts=converted.contents.flatMap(m=>m.parts).map(p=>p.text??'').join('\n');
      const task={knowledge:'你只负责决定本轮需要展开',worker:'本次执行瓦洛兰变量更新',novel:'本次仅创作瓦洛兰奇遇系统',story:'本次只生成剧情正文'}[request.stage];
      assert(systems.includes(task),request.stage);
      assert(!facts.includes(task),request.stage);
      assert.equal(request.toolChoice,request.stage==='story'?undefined:'none');
      if(request.stage==='knowledge')assert(systems.includes('本次完整回复就是 format 所示的选择结果区块'));
      if(request.stage==='worker')assert(systems.includes('JSONPatch 操作数组，这就是本次完整回复'));
      if(request.stage==='novel')assert(systems.includes('奇遇内容输出格式:'));
      if(request.stage==='story'){
        assert(facts.includes('不使用引导式结尾'));
        assert(request.messages.at(-1).content.includes('不使用引导式结尾'),'原生Google提取系统任务后仍保留最后的写作要求');
      }
      if(request.stage==='worker')for(const rule of e.rules){
        assert.equal(systems.split(rule.content).length-1,1);
        assert(!facts.includes(rule.content));
      }
      assert(converted.contents.length,'用户事实仍在contents中');
    }
  });
});

test('完整预算使用现有额度，按消息计数并保留合法边界，不改写内容',async()=>{
  const {assertFinalPromptBudget}=require('../运行/worker-task.ts');
  const e=environment(seed()),payload={messages:[{role:'user',content:'完整变量事实'},{role:'system',content:'任务与规则'}],max_tokens:10};
  const original=copy(payload),seen=[];e.countTokens=async message=>{seen.push(copy(message));return 20;};
  e.presetBudget={max_context:53,max_completion_tokens:100};
  assert.deepEqual(await assertFinalPromptBudget(payload),{inputTokens:43,replyTokens:10,contextTokens:53});
  assert.deepEqual(seen,payload.messages);assert.deepEqual(payload,original);
  e.presetBudget.max_context=52;
  await assert.rejects(assertFinalPromptBudget(payload),/输入约 43 tokens.*上下文 52/);
  e.presetBudget.max_context=100000;
  await assert.doesNotReject(()=>assertFinalPromptBudget(payload));
});

for(const sendPreset of [false,true])test(`最终预算失败只取消本次请求，正文与原提交ID保留重试：预设${sendPreset}`,async()=>{
  const e=environment(seed(),{characterAuto:false,variable:{...endpoint('variable'),sendPreset},phone:endpoint('phone')});
  await e.runtime.start();
  try{
    e.story=async()=>{e.presetBudget.max_context=10;return '先保存的合成正文';};
    await assert.rejects(e.runtime.send('合成预算失败输入'),/完整请求超出酒馆当前上下文额度/);
    assert.equal(e.calls.filter(c=>c.kind==='story').length,1);
    assert.equal(e.calls.filter(c=>c.kind==='update'||c.kind==='preset-update').length,0,'超额未发往变量模型');
    assert.equal(e.stops.length,1);
    const id=e.vars.澄湾待更新正文.id;
    assert.equal(e.messages.filter(m=>m.role==='assistant'&&m.message==='先保存的合成正文').length,1);
    assert(!e.state()._系统.提交记录[id]);
    e.presetBudget.max_context=1000000;
    await e.runtime.retry();
    assert.equal(e.calls.filter(c=>c.kind==='story').length,1);
    assert(e.state()._系统.提交记录[id]);
    assert.equal(e.vars.澄湾待更新正文,null);
  }finally{await e.runtime.dispose();}
});
