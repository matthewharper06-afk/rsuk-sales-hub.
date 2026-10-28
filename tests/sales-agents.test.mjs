import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../api/sales-agent.mjs';
import {buildContext,brief,eligible} from '../lib/sales-agents.mjs';

const companies=[{id:'co1',name:'Example contractor',stage:'Contacted',value:900}];
const contacts=[{id:'p1',company_id:'co1',name:'Example person',email:'example@example.org',opted_out:false}];
function setup({active=true,expired=false,runs=[],generateError=false,search=true,creditBalance=null,resolveOidc=async()=>undefined,env={VERCEL_OIDC_TOKEN:'test-token'}}={}) {
  let generations=0,sentOptions,writes=[];
  const fetchImpl=async(url,options)=>{
    if(url.includes('ai-gateway.vercel.sh/v1/credits'))return {ok:true,status:200,json:async()=>({balance:creditBalance})};
    if(options.method==='POST'){writes.push(JSON.parse(options.body));return {ok:true};}
    let data=[];
    if(url.includes('/auth/')){if(expired)return {ok:false,status:401};data={id:'user1'};}
    else if(url.includes('team_members'))data=[{active}];
    else if(url.includes('sales_agent_started'))data=runs;
    else if(url.includes('/companies'))data=companies;
    else if(url.includes('/contacts'))data=contacts;
    return {ok:true,json:async()=>data};
  };
  const handler=createHandler({fetchImpl,env,resolveOidc,generate:async options=>{generations++;sentOptions=options;if(generateError)throw generateError instanceof Error?generateError:Error('secret-token-and-private-context');return {text:'Example report',steps:search?[{toolResults:[{toolName:'search',output:{results:[]}}]}]:[]};}});
  const invoke=async(body={kind:'pipeline',notes:''},authorization='Bearer example')=>{let status,result;const res={setHeader(){},status(s){status=s;return this;},json(b){result=b;return b;}};await handler({method:'POST',headers:{authorization},body},res);return {status,result};};
  return {invoke,writes,get generations(){return generations;},get options(){return sentOptions;}};
}
test('unauthenticated and inactive members cannot invoke the model',async()=>{
  const a=setup();assert.equal((await a.invoke(undefined,'')).status,401);assert.equal(a.generations,0);
  const b=setup({active:false});assert.equal((await b.invoke()).status,403);assert.equal(b.generations,0);
  const c=setup({expired:true});assert.equal((await c.invoke()).status,401);
});
test('invalid inputs and missing AI connection fail before generation',async()=>{
  const a=setup();assert.equal((await a.invoke({kind:'__proto__',notes:''})).status,400);
  assert.equal((await a.invoke({kind:'research',notes:'',sector:'Solar',count:100})).status,400);
  assert.equal((await a.invoke({kind:'pipeline',notes:'x'.repeat(3001)})).status,400);
  const b=setup({env:{}});assert.equal((await b.invoke()).status,503);assert.equal(b.generations,0);
});
test('rate limits prevent model invocation',async()=>{
  const a=setup({runs:[{created_at:new Date().toISOString()}]});assert.equal((await a.invoke()).status,429);assert.equal(a.generations,0);
  const b=setup({runs:Array.from({length:20},()=>({created_at:'2026-01-01'}))});assert.equal((await b.invoke()).status,429);
});
test('pipeline uses server CRM data, saves reports, and never writes sales records',async()=>{
  const a=setup();const r=await a.invoke();assert.equal(r.status,200);assert.equal(r.result.saved,true);
  assert.match(a.options.prompt,/Example contractor/);assert.match(a.options.system,/Only explicit, confirmed recurring/);
  assert.deepEqual(a.writes.map(w=>w.action),['sales_agent_started','sales_agent_run']);assert.equal(a.options.tools,undefined);assert.equal(a.options.model,'openai/gpt-5-mini');
});
test('research requires search and excludes private contact details from web context',async()=>{
  const a=setup();assert.equal((await a.invoke({kind:'research',notes:'',sector:'Solar',count:5})).status,200);
  assert.ok(a.options.tools.search);assert.equal(a.options.prepareStep({stepNumber:0}).toolChoice,'required');
  assert.doesNotMatch(a.options.prompt,/example@example.org/);
  const b=setup({search:false});assert.equal((await b.invoke({kind:'research',notes:'',sector:'Solar',count:5})).status,502);
});
test('provider errors never expose credentials or private context',async()=>{
  const a=setup({generateError:true});const r=await a.invoke();assert.equal(r.status,502);assert.doesNotMatch(r.result.error,/secret-token/);
});
test('opt-outs and individual disqualification override company state',()=>{
  assert.equal(eligible({...contacts[0],opted_out:true},companies,[]),false);
  const activities=[{contact_id:'p1',action:'contact_pipeline',created_at:'2026-10-28',details:'{"stage":"Not suitable"}'}];
  assert.equal(eligible(contacts[0],companies,activities),false);
  assert.throws(()=>buildContext('followup',{contactId:'p1'}, {companies,contacts,activities},'2026-10-28'),/eligible/);
});
test('brief retains agreed gap and one-off values are never labelled recurring',()=>{
  assert.equal(brief.targetMonthly-brief.baselineMonthly,35000);
  const context=buildContext('pipeline',{notes:''},{companies,contacts,activities:[],truncated:true},'2026-10-28');
  assert.equal(context.truncated,true);assert.equal(context.companies[0].value,900);assert.equal(context.recurringRevenue,undefined);
});

test('deployed request-context OIDC works without an environment token',async()=>{
  const a=setup({env:{},resolveOidc:async()=> 'request-context-test-token'});
  assert.equal((await a.invoke()).status,200);assert.equal(a.generations,1);
});

test('empty Gateway balance gives an actionable error before generation or CRM writes',async()=>{
  const a=setup({creditBalance:'0'});const r=await a.invoke();
  assert.equal(r.status,402);assert.match(r.result.error,/no available credits/);assert.equal(a.generations,0);assert.equal(a.writes.length,0);
});

test('model-tier rejection is distinct from an empty credit balance',async()=>{
  const error=Object.assign(new Error('Free tier users do not have access. Upgrade to paid credits.'),{statusCode:403,name:'GatewayInternalServerError'});
  const a=setup({generateError:error,creditBalance:'10'});const r=await a.invoke();
  assert.equal(r.status,403);assert.match(r.result.error,/restricting access/);assert.doesNotMatch(r.result.error,/Upgrade to paid/);
});
