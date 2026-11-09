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
