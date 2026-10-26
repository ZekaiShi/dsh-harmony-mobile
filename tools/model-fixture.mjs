import { createServer } from 'node:http';
export async function createModelFixture(options = {}) {
  const requests=[]; const timers=new Set(); let delay=100; let canceled=0; let trapRequests=0;
  const key='qa-not-a-real-model-key';
  const trap=createServer((req,res)=>{trapRequests++;res.end('{}');});
  await new Promise(resolve=>trap.listen(0,'0.0.0.0',resolve));
  const server=createServer(async(req,res)=>{
    let source='';for await(const chunk of req)source+=chunk;
    let body;try{body=JSON.parse(source||'{}');}catch{res.writeHead(400);res.end('{}');return;}
    requests.push({path:req.url,body,authorized:req.headers.authorization==='Bearer '+key,hasCookie:!!req.headers.cookie,hasOrigin:!!req.headers.origin});
    if(req.url.startsWith('/redirect/')){const host=req.headers.host?.startsWith('10.0.2.2:')?'10.0.2.2':'127.0.0.1';res.writeHead(302,{location:`http://${host}:${trap.address().port}/trap`});res.end();return;}
    if(req.url.startsWith('/unauthorized/')||req.headers.authorization!=='Bearer '+key){res.writeHead(401,{'content-type':'application/json'});res.end('{"error":{"message":"fixture credential rejected"}}');return;}
    if(req.url.startsWith('/json/')){res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{message:{content:'非流式兼容回复'},finish_reason:'stop'}]}));return;}
    res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'});
    const text=body.messages?.filter(m=>m.role==='user').at(-1)?.content||'';
    const emit=value=>res.write('data: '+JSON.stringify(value)+'\r\n\r\n');
    emit({choices:[{delta:{reasoning_content:'检查当前请求格式。'}}]});
    let complete=false;
    const timer=setTimeout(()=>{
      timers.delete(timer);if(res.destroyed)return;
      const title = options.accounting && body.messages?.[0]?.content?.includes('只负责给对话命名');
      emit({choices:[{delta:{content:title ? '虚构对话验收' : '## 独立聊天已就绪\n\n收到：'+text+'\n\n- 手机直连模型服务\n- 支持**本机历史**与 `Markdown`'}}]});
      if(req.url.startsWith('/abrupt/')){complete=true;res.end();return;}
      emit({choices:[{delta:{},finish_reason:'stop'}]});
      if (options.accounting) emit({choices:[],usage:{prompt_tokens:title?28:120,completion_tokens:title?8:24,total_tokens:title?36:144}});
      res.end('data: [DONE]\r\n\r\n');complete=true;
    },delay);timers.add(timer);
    res.on('close',()=>{if(!complete){canceled++;clearTimeout(timer);timers.delete(timer);}});
  });
  await new Promise(resolve=>server.listen(0,'0.0.0.0',resolve));
  return {base:`http://127.0.0.1:${server.address().port}/v1`,key,requests,setDelay(ms){delay=ms;},get canceled(){return canceled;},get trapRequests(){return trapRequests;},async close(){for(const t of timers)clearTimeout(t);server.closeAllConnections();trap.closeAllConnections();await Promise.all([new Promise(r=>server.close(r)),new Promise(r=>trap.close(r))]);}};
}
