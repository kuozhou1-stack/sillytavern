const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {test}=require('node:test'),assert=require('node:assert/strict');
const file=path.join(__dirname,'双API流程.spec.cjs'),harness=new Module(file,module);
harness.filename=file;harness.paths=Module._nodeModulePaths(__dirname);
const nativeRequire=harness.require.bind(harness);
harness.require=n=>n==='node:test'?{test(){}}:nativeRequire(n);
harness._compile(fs.readFileSync(file,'utf8').split('const novelGoodReply =')[0]+
 '\nmodule.exports={environment,createRuntime,block,endpoint};',file);
const {environment,createRuntime,block,endpoint}=harness.exports;
const {variableResponseBlock,variableResponseSchema}=require('../运行/variable-response.ts');
const {updateBlock}=require('../运行/message-protocol.ts');
const YAML = require('yaml');

const { Schema } = require('../schema.ts');
const outputFile = path.join(__dirname, '../世界书/变量/变量输出格式.yaml');
const { format, rule } = YAML.parse(fs.readFileSync(outputFile, 'utf8')).变量输出格式;

test('世界书的新增人物示例与空补丁均可从结构化回包解析', () => {
  const commands = updateBlock(variableResponseBlock(format)).commands;
  assert.equal(commands.length, 1);
  assert.equal(commands[0].op, 'insert');
  assert.match(commands[0].path, /^\/玩家\/已知信息\/已认识人物\/[^/]+$/);
  assert.deepEqual(Object.keys(commands[0].value).sort(), ['来源', '称呼']);
  assert.deepEqual(commands[0].value.来源, { 方式: '观察' });

  const emptyExamples = rule.flatMap(text => text.match(/\{\s*"JSONPatch"\s*:\s*"\[\]"\s*\}/g) ?? []);
  assert.equal(emptyExamples.length, 1);
  assert.deepEqual(updateBlock(variableResponseBlock(emptyExamples[0])).commands, []);
});

test('新认识人物可省缺省字段，旧记录改单个字段保留其他已知事实', async () => {
  const [example] = updateBlock(variableResponseBlock(format)).commands;
  const id = example.path.split('/').at(-1);
  const previous = { 称呼: '旧称呼', 已知资料: '常在此带路', 来源: { 方式: '被告知', 说明: '本人介绍' } };
  const initial = Schema.parse({
    _系统: { 建档完成: true },
    玩家: { id: 'player', 已知信息: { 已认识人物: { known: previous } } },
    角色: { [id]: { 姓名: example.value.称呼, 层级: '次要' }, known: { 姓名: '旧识', 层级: '次要' } },
  });
  const e = environment(initial);
  await e.runtime.start();
  try {
    e.update = async () => format;
    await e.runtime.send('认识带路的人');
    const person = e.state().玩家.已知信息.已认识人物[id];
    assert.equal(person.称呼, example.value.称呼);
    assert.equal(person.来源.方式, '观察');
    assert.equal(person.来源.记录id, null);
    assert.equal(person.上次已知地点id, null);
    assert.equal(person.已明确不在场, false);
    const oldPerson = initial.玩家.已知信息.已认识人物.known;
    e.update = async () => block([{ op: 'replace', path: '/玩家/已知信息/已认识人物/known/称呼', value: '新称呼' }]);
    await e.runtime.send('旧识告诉我新的称呼');
    assert.deepEqual(e.state().玩家.已知信息.已认识人物.known, { ...oldPerson, 称呼: '新称呼' });
    assert.deepEqual(e.state().玩家.已知信息.已认识人物[id], person);

    e.update = async () => block([{ op: 'replace', path: example.path + '/来源/方式', value: '亲眼看到' }]);
    await assert.rejects(e.runtime.send('测试来源枚举边界'), /来源[\s\S]*方式/);
    assert.deepEqual(e.state().玩家.已知信息.已认识人物[id], person);
  } finally {
    await e.runtime.dispose();
  }
});

test('结构化补丁保留具体值与字面协议标签，转换后仍由MVU解析',()=>{
 const commands=[{op:'replace',path:'/玩家/资金/余额分',value:50012},
  {op:'insert',path:'/玩家/个人记录/个人备忘/note',value:{内容:'字面示例 </JSONPatch> 不应截断'}}];
 const result=variableResponseBlock(JSON.stringify({JSONPatch:JSON.stringify(commands)}));
 assert.deepEqual(updateBlock(result).commands,commands);
 assert.equal(variableResponseSchema.value.additionalProperties,false);
});

test('新响应拒绝正文加合法补丁，不把新剧情变成结算依据',()=>{
 const patch='<UpdateVariable><JSONPatch>[{"op":"delta","path":"/玩家/资金/余额分","value":2500}]</JSONPatch></UpdateVariable>';
 assert.throws(()=>variableResponseBlock('<tucao>继续营业</tucao>新顾客付款。'+patch));
 assert.throws(()=>variableResponseBlock(JSON.stringify({JSONPatch:'新顾客付款。'+patch})));
 assert.throws(()=>variableResponseBlock(JSON.stringify({JSONPatch:'[]',story:'继续营业'})));
});

test('无变化保留空补丁，字段必须是可解析的补丁数组字符串',()=>{
 assert.deepEqual(updateBlock(variableResponseBlock('{"JSONPatch":"[]"}')).commands,[]);
 assert.throws(()=>variableResponseBlock('{"JSONPatch":[]}'));
 assert.throws(()=>variableResponseBlock('{"JSONPatch":"{}"}'));
});

for(const structured of [false,true])test(`持久化手机回包按已记录格式恢复，不按正文内容猜测/${structured}`,async()=>{
 const e=environment(undefined,{characterAuto:false,informationAuto:false,
  variable:endpoint('variable'),phone:endpoint('phone')});
 await e.runtime.start();
 e.update=async()=>{throw Error('模拟网络中断以保留待恢复操作');};
 await assert.rejects(e.runtime.phoneAction({kind:'refresh',platform:'邻信'}),/模拟网络中断/);
 const cached=e.vars.澄湾待更新手机;
 assert(cached);
 cached.reply=block([]);
 if(structured)cached.replyFormat='structured';
 const requests=e.calls.length,balance=e.state().玩家.资金.余额分;
 await e.runtime.dispose();
 e.runtime=createRuntime();
 await e.runtime.start();
 try {
  if(structured){
   await assert.rejects(e.runtime.retry(),/JSON补丁/);
   assert.equal(e.parses,0,'新格式违约回复不能按旧XML格式进入MVU');
  }else{
   await e.runtime.retry();
   assert.equal(e.vars.澄湾待更新手机,null,'旧缓存仍可恢复');
  }
  assert.equal(e.calls.length,requests,'使用缓存恢复时不额外请求模型');
  assert.equal(e.state().玩家.资金.余额分,balance);
 }finally{await e.runtime.dispose();}
});
