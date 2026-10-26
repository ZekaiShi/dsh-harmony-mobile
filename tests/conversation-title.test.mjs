import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ConversationTitle} from '../.cache/core/ConversationTitle.mjs';
import {AssistantCore,ModelProfile,LocalMessage} from '../.cache/core/AssistantCore.mjs';
test('automatic naming is once-only and never replaces a manual or migrated title',()=>{
 const profile=new ModelProfile();Object.assign(profile,{base:'https://api.example/v1',model:'qa'});
 const c=AssistantCore.create('title-test',profile,1),u=new LocalMessage(),a=new LocalMessage();u.text='问题';a.role='assistant';a.text='完成的回复';c.messages=[u,a];
 assert.equal(ConversationTitle.eligible(c,true),true);assert.equal(ConversationTitle.eligible(c,false),false);
 c.titleSource='manual';assert.equal(ConversationTitle.eligible(c,true),false);c.titleSource='local';c.titleState='running';assert.equal(ConversationTitle.eligible(c,true),false);
 c.titleState='done';assert.equal(ConversationTitle.eligible(c,true),false);
});
test('title request is bounded and excludes attachments, reasoning and original system instructions',()=>{
 const profile=new ModelProfile();Object.assign(profile,{base:'https://api.example/v1',model:'qa',system:'private instruction'});
 const c=AssistantCore.create('title-test',profile,1),u=new LocalMessage(),a=new LocalMessage();u.text='题'.repeat(5000);u.attachments=[{name:'private-file.pdf'}];a.role='assistant';a.text='答'.repeat(9000);a.reasoning='hidden-thought';c.messages=[u,a];
 const request=ConversationTitle.request(c),serialized=JSON.stringify(request);
 assert.equal(request.maxOutputTokens,512);assert.ok(serialized.length<6500);
 for(const excluded of ['private instruction','private-file.pdf','hidden-thought','api.example'])assert.equal(serialized.includes(excluded),false);
 assert.equal(ConversationTitle.profile(profile).system.includes('private instruction'),false);assert.equal(profile.system,'private instruction');
 assert.equal(ConversationTitle.clean('“标题：庄园规划”\n更多解释'),'庄园规划');assert.throws(()=>ConversationTitle.clean(''),/标题/);
});
