import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ChatStream,ChatProtocol} from '../.cache/core/ChatProtocol.mjs';
import {AssistantCore,AssistantData,ModelProfile,LocalConversation,LocalMessage} from '../.cache/core/AssistantCore.mjs';
test('usage-only chunks and late Gemini metadata survive content completion',()=>{
  const chat=new ChatStream('chat');chat.packet(JSON.stringify({choices:[{delta:{content:'你好'},finish_reason:'stop'}]}),true);
  chat.packet(JSON.stringify({choices:[],usage:{prompt_tokens:5,completion_tokens:2,total_tokens:7}}),true);chat.packet('[DONE]',true);
  assert.equal(chat.text,'你好');assert.equal(chat.usage.total,7);
  const gemini=new ChatStream('gemini');gemini.packet(JSON.stringify({candidates:[{content:{parts:[{text:'回答'}]},finishReason:'STOP'}]}),true);
  gemini.packet(JSON.stringify({usageMetadata:{promptTokenCount:2,candidatesTokenCount:3,totalTokenCount:5}}),true);
  assert.equal(gemini.text,'回答');assert.equal(gemini.usage.total,5);
});
test('short title requests set protocol-native output limits without carrying keys in JSON',()=>{
  for(const protocol of ['chat','responses','anthropic','gemini']){
    const profile=new ModelProfile();Object.assign(profile,{base:'https://api.example/v1',model:'qa',protocol,provider:'custom'});
    const wire=ChatProtocol.wire(profile,{model:'qa',stream:true,maxOutputTokens:512,messages:[{role:'user',content:'命名'}]},'test-only-key','https://api.example/v1/chat/completions');
    const body=JSON.parse(wire.body);assert.equal(body.max_tokens??body.max_output_tokens??body.generationConfig?.maxOutputTokens,512);
    assert.equal(wire.body.includes('test-only-key'),false);
    if(protocol==='chat')assert.equal(body.stream_options,undefined,'Unknown compatible services are not forced to support extra options');
  }
});
test('legacy history never becomes eligible for an automatic paid title request on upgrade',()=>{
  const data=new AssistantData(),profile=new ModelProfile();Object.assign(profile,{base:'https://api.example/v1',model:'qa'});
  const conversation=AssistantCore.create('old',profile,1);conversation.title='用户已经写好的名称';
  const raw=JSON.parse(JSON.stringify(conversation));delete raw.titleState;delete raw.titleSource;delete raw.usageEntries;
  data.conversations=[raw];const restored=AssistantCore.restore(JSON.stringify(data));
  assert.equal(restored.conversations[0].titleSource,'manual');assert.equal(restored.conversations[0].titleState,'failed');assert.equal(restored.conversations[0].title,'用户已经写好的名称');
});
