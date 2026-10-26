import {createServer} from 'node:http';
import {deflateSync} from 'node:zlib';
function png(){
  const crc=b=>{let c=0xffffffff;for(const byte of b){c^=byte;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
  const chunk=(type,data)=>{const name=Buffer.from(type);const out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);name.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc(Buffer.concat([name,data])),data.length+8);return out;};
  const w=256,h=192;const raw=Buffer.alloc((w*3+1)*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const at=y*(w*3+1)+1+x*3;raw[at]=80+Math.floor(x/2);raw[at+1]=60+Math.floor(y/2);raw[at+2]=((x>>5)+(y>>5))%2?170:220;}
  const head=Buffer.alloc(13);head.writeUInt32BE(w);head.writeUInt32BE(h,4);head[8]=8;head[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',head),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
export async function createMediaFixture(){
  const requests=[],downloads=[],timers=new Set();const key='qa-media-not-real-key';const bytes=png();let delay=50,canceled=0,trapRequests=0,closed=false;
  const trap=createServer((req,res)=>{trapRequests++;res.end('{}');});await new Promise(r=>trap.listen(0,'0.0.0.0',r));
  const images=createServer((req,res)=>{downloads.push({path:req.url,hasAuthorization:!!req.headers.authorization,hasGoogleKey:!!req.headers['x-goog-api-key'],hasCookie:!!req.headers.cookie});const host=req.headers.host?.startsWith('10.0.2.2:')?'10.0.2.2':'127.0.0.1';if(req.url.startsWith('/redirect')){res.writeHead(302,{location:`http://${host}:${trap.address().port}/image`});res.end();return;}res.writeHead(200,{'content-type':'image/png'});res.end(bytes);});await new Promise(r=>images.listen(0,'0.0.0.0',r));
  const server=createServer(async(req,res)=>{
    if(req.method==='GET'){
      const authorized=req.headers.authorization==='Bearer '+key;
      requests.push({path:req.url,body:{},authorized,authType:'bearer',hasCookie:!!req.headers.cookie,hasOrigin:!!req.headers.origin,wrongAuth:!!req.headers['x-goog-api-key']});
      res.writeHead(authorized?200:401,{'content-type':'application/json'});res.end(JSON.stringify({data:[{id:'vendor/qa-image',name:'隔离图像模型',architecture:{input_modalities:['text','image'],output_modalities:['image']}}]}));return;
    }
    let source='';for await(const chunk of req)source+=chunk;let body;try{body=JSON.parse(source);}catch{res.writeHead(400);res.end('{}');return;}
    const google=req.url.startsWith('/gemini/');const authorized=google?req.headers['x-goog-api-key']===key:req.headers.authorization==='Bearer '+key;
    requests.push({path:req.url,body,authorized,authType:google?'google':'bearer',hasCookie:!!req.headers.cookie,hasOrigin:!!req.headers.origin,wrongAuth:google?!!req.headers.authorization:!!req.headers['x-goog-api-key']});
    if(!authorized||req.url.startsWith('/unauthorized/')){res.writeHead(401);res.end('{"error":{"message":"fixture fake key should not be shown"}}');return;}
    const host=req.headers.host?.startsWith('10.0.2.2:')?'10.0.2.2':'127.0.0.1';
    if(req.url.startsWith('/redirect/')){res.writeHead(302,{location:`http://${host}:${trap.address().port}/api`});res.end();return;}
    let complete=false;const timer=setTimeout(()=>{timers.delete(timer);if(res.destroyed)return;complete=true;res.setHeader('content-type','application/json');
      const isVision=google?!body.generationConfig:!!body.messages;
      if(isVision){res.end(JSON.stringify(google?{candidates:[{content:{role:'model',parts:[{text:'隔离视觉验收：已收到图片与问题。'}]}}]}:{choices:[{message:{content:'隔离视觉验收：已收到图片与问题。'}}]}));return;}
      if(google){res.end(JSON.stringify({candidates:[{content:{role:'model',parts:[{text:'Gemini 隔离图片响应'},{inlineData:{mimeType:'image/png',data:bytes.toString('base64')}}]}}]}));return;}
      const image=body.model==='qa-url'||req.url.startsWith('/ark/')?{url:`http://${host}:${images.address().port}/image.png?sig=fixture`}:{b64_json:bytes.toString('base64')};res.end(JSON.stringify(req.url.startsWith('/silicon/')?{images:[{url:`http://${host}:${images.address().port}/image.png?sig=fixture`}]}:{data:[image]}));
    },delay);timers.add(timer);res.on('close',()=>{if(!complete){canceled++;clearTimeout(timer);timers.delete(timer);}});
  });await new Promise(r=>server.listen(0,'0.0.0.0',r));
  return{base:`http://127.0.0.1:${server.address().port}`,key,bytes,requests,downloads,setDelay(ms){delay=ms;},get canceled(){return canceled;},get trapRequests(){return trapRequests;},async close(){if(closed)return;closed=true;for(const t of timers)clearTimeout(t);for(const s of[server,images,trap])s.closeAllConnections();await Promise.all([server,images,trap].map(s=>new Promise(r=>s.close(r))));}};
}
