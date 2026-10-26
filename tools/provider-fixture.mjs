import http from 'node:http';
// Isolated contract server. It never contacts a model or records credential values.
export async function createProviderFixture() {
  const requests=[]; const key='provider-isolated-test-key'; let canceled=0; let delay=8;
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://fixture');const route=url.pathname;let raw='';for await(const chunk of req)raw+=chunk;
    let body={};try{if(raw)body=JSON.parse(raw);}catch{res.writeHead(400).end('{}');return;}
    const protocol=route.includes('/anthropic')?'anthropic':route.includes('/gemini')?'gemini':route.includes('/responses')?'responses':'chat';
    const authorized=protocol==='anthropic'?req.headers['x-api-key']===key&&req.headers['anthropic-version']==='2023-06-01':protocol==='gemini'?req.headers['x-goog-api-key']===key:req.headers.authorization==='Bearer '+key;
    const wrongAuth=protocol==='anthropic'?!!(req.headers.authorization||req.headers['x-goog-api-key']):protocol==='gemini'?!!(req.headers.authorization||req.headers['x-api-key']):!!(req.headers['x-api-key']||req.headers['x-goog-api-key']);
    requests.push({method:req.method,route,query:url.search,body,authorized,wrongAuth,hasCookie:!!req.headers.cookie});
    if(!authorized||wrongAuth){res.writeHead(401).end('{"error":{"message":"fixture"}}');return;}
    if(req.method==='GET'){
      res.setHeader('content-type','application/json');
      if(route.includes('/unauthorized')){res.writeHead(403).end('{}');return;}
      if(protocol==='gemini')res.end(JSON.stringify({models:[{name:'models/qa-gemini',displayName:'Gemini 隔离模型',supportedGenerationMethods:['generateContent']},{name:'models/embedding',supportedGenerationMethods:['embedContent']}]}));
      else if(route.endsWith('/images/models'))res.end(JSON.stringify({data:[{id:'vendor/qa-image',name:'隔离图像模型',architecture:{input_modalities:['text','image'],output_modalities:['image']}}]}));
      else res.end(JSON.stringify({data:[{id:protocol==='chat'?'vendor/qa-chat':'qa-'+protocol,display_name:protocol+' 隔离模型',architecture:{input_modalities:['text'],output_modalities:['text']}}]}));
      return;
    }
    res.setHeader('content-type','text/event-stream');res.flushHeaders();let complete=false;res.on('close',()=>{if(!complete)canceled++;});
    const frames=protocol==='anthropic'?[
      {type:'message_start',message:{role:'assistant',content:[]}},
      {type:'content_block_delta',delta:{type:'thinking_delta',thinking:'协议已核对。'}},
      {type:'content_block_delta',delta:{type:'text_delta',text:'Claude 原生协议通过。'}},
      {type:'message_delta',delta:{stop_reason:'end_turn'}},{type:'message_stop'}
    ]:protocol==='responses'?[
      {type:'response.created'},{type:'response.reasoning_summary_text.delta',delta:'协议已核对。'},
      {type:'response.output_text.delta',delta:'Responses 原生协议通过。'},
      {type:'response.completed',response:{status:'completed'}}
    ]:protocol==='gemini'?[
      {candidates:[{content:{parts:[{thought:true,text:'协议已核对。'}]}}]},
      {candidates:[{content:{parts:[{text:'Gemini 原生协议通过。'}]},finishReason:'STOP'}]}
    ]:[{choices:[{delta:{content:'兼容协议通过。'},finish_reason:'stop'}]}];
    for(const frame of frames){if(res.destroyed)return;res.write('data: '+JSON.stringify(frame)+'\n\n');await new Promise(r=>setTimeout(r,delay));}
    complete=true;res.end();
  });
  await new Promise(resolve=>server.listen(0,'0.0.0.0',resolve));
  return {base:'http://127.0.0.1:'+server.address().port,key,requests,get canceled(){return canceled;},setDelay(ms){delay=ms;},async close(){server.closeAllConnections();await new Promise(r=>server.close(r));}};
}
