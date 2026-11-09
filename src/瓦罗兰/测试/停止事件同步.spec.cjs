const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {test}=require('node:test'),assert=require('node:assert/strict');
const file=path.join(__dirname,'双API流程.spec.cjs'),harness=new Module(file,module);
harness.filename=file;harness.paths=Module._nodeModulePaths(__dirname);
const req=harness.require.bind(harness);harness.require=n=>n==='node:test'?{test(){}}:req(n);
harness._compile(fs.readFileSync(file,'utf8').split('const novelGoodReply =')[0]+'\nmodule.exports={environment,block,deferred,until};',file);
const {environment,block,deferred,until}=harness.exports;

for(const source of ['native','helper'])test(`酒馆停止同步取消正文，不显示迟到片段或结算部分正文/${source}`,async()=>{
 const e=environment(),reply=deferred();await e.runtime.start();e.story=()=>reply.promise;
 const sending=e.runtime.send('玩家行动'),rejected=assert.rejects(sending,/停止/);
 try{
  await until(()=>e.calls.length===1);
  const id=e.calls[0].config.generation_id;
  e.listeners.get('stream')('取消前片段',id);assert.equal(e.runtime.view.streaming,'取消前片段');
  e.listeners.get('generation_stopped')(source==='helper'?id:undefined);
  assert.equal(e.runtime.view.streaming,'');
  e.listeners.get('stream')('取消后迟到片段',id);assert.equal(e.runtime.view.streaming,'');
  reply.resolve('后端停止后返回的部分正文');await rejected;
  assert.equal(e.calls.length,1);assert.equal(e.parses,0);assert.equal(e.messages.length,2);
  assert.equal(e.runtime.view.busy,false);assert.equal(e.runtime.view.updating,false);assert(e.vars.澄湾失败请求);
 }finally{reply.resolve('迟到正文');await rejected;await e.runtime.dispose();}
 assert.equal(e.listeners.has('generation_stopped'),false);
});

test('其他生成的停止事件不影响当前请求；本请求停止变量保留正文且拒绝迟到补丁',async()=>{
 const e=environment(),reply=deferred();await e.runtime.start();e.update=()=>reply.promise;
 const sending=e.runtime.send('观察'),rejected=assert.rejects(sending,/停止/);
 try{
  await until(()=>e.calls.length===2);
  const id=e.calls[1].config.generation_id,pending=e.vars.澄湾待更新正文.id,body=e.messages[2].message;
  e.listeners.get('generation_stopped')('another-generation');assert.equal(e.runtime.view.updating,true);
  e.listeners.get('generation_stopped')(id);
  reply.resolve(block([{op:'delta',path:'/玩家/资金/余额分',value:2500}]));await rejected;
  assert.equal(e.parses,0);assert.equal(e.vars.澄湾待更新正文.id,pending);assert.equal(e.messages[2].message,body);
  assert.equal(e.runtime.view.busy,false);assert.equal(e.runtime.view.updating,false);
 }finally{reply.resolve(block([]));await rejected;await e.runtime.dispose();}
});
