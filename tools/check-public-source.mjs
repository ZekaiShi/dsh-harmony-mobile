import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),staged=process.argv.includes('--staged');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:32*1024*1024});
const files=git('ls-files','-z').split('\0').filter(Boolean),issues=[];
for(const file of files){
  if(/(^|\/)(node_modules|oh_modules|\.cache|\.tools|\.research|reports|deliveries|build|\.idea)(\/|$)|\.(p12|p7b|cer|keystore|pem|key|p8|der|jks|hap|app|log)$|(^|\/)(\.env[^/]*|local\.properties|signing\.local\.json5)$/.test(file)){issues.push(file+': private/generated path');continue;}
  if(!/\.(ets|ts|mjs|ps1|json5?|md|ya?ml|txt|svg)$|(^|\/)(LICENSE|pre-commit)$/.test(file))continue;
  const text=staged?git('show',':'+file):await readFile(path.join(root,file),'utf8');
  if(/^-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/m.test(text)||/["']\s*(?:sk-(?:proj-|or-v1-)?[a-z0-9_-]{24,}|AKIA[A-Z0-9]{16})\s*["']/i.test(text))issues.push(file+': recognized credential pattern');
  if(file==='build-profile.json5'){
    const profile=JSON.parse(text);
    if(profile.app.signingConfigs?.length||profile.app.products?.some(p=>p.signingConfig)||/storePassword|keyPassword|certpath|storeFile|profileFile/.test(text))issues.push(file+': signing configuration');
  }
}
if(issues.length){console.error('Public-source checks failed (filenames only):\n'+issues.join('\n'));process.exitCode=1;}else console.log('Public-source checks passed for '+files.length+' tracked files. Pattern checks do not replace manual review.');
