import test from 'node:test';
import assert from 'node:assert/strict';
import {qualifyResearch,formatResearch} from '../lib/research-quality.mjs';
const lead={company:'New Contractor Ltd',group:'',companyType:'Contractor',website:'https://contractor.example.org',area:'Birmingham',buyingSignal:'Housing roof programme',signalType:'Live programme',evidenceDate:'2026-10-01',closingDate:'',startDate:'',signalSource:'https://contractor.example.org/news',contactName:'Alex Smith',contactRole:'Supply chain',email:'alex@contractor.example.org',phone:'01922 123456',contactSource:'https://contractor.example.org/contact',nextAction:'Ask about scaffold packages',missing:'Confirm site volume'};
const sources=[{url:lead.signalSource,date:'2026-10-01',snippet:'Housing roof programme in Birmingham. Engagement deadline 1 October 2026. Future programme starts 1 April 2027.'},{url:lead.contactSource,snippet:'Alex Smith, Supply chain. alex@contractor.example.org. 01922 123456'}];
const check=(prospects,overrides={},evidence=sources)=>qualifyResearch({prospects,nextActions:['Call the buyer']},[{toolResults:[{toolName:'search',output:{results:evidence}}]}],{today:'2026-10-28',count:5,...overrides});
test('literal company-source contact details survive evidence checks',()=>{
 const r=check([lead]);assert.equal(r.leads.length,1);assert.equal(r.leads[0].email,lead.email);assert.equal(r.leads[0].phone,lead.phone);assert.equal(r.leads[0].priority,'Contact now');
});
test('guessed email is removed from fields, next actions and summary actions',()=>{
 const guessed='guessed@contractor.example.org';const r=check([{...lead,email:guessed,nextAction:'Email '+guessed}]);
 assert.equal(r.leads[0].email,'');assert.equal(r.withheld,1);assert.doesNotMatch(formatResearch(r,{today:'2026-10-28',count:5}),/guessed@/);
});
test('directory emails and unobserved contact sources cannot qualify',()=>{
 const directory={url:'https://directory.example.org/contact',snippet:'alex@contractor.example.org'};
 const r=check([{...lead,contactSource:directory.url}],{},[...sources,directory]);assert.equal(r.leads[0].email,'');
 const missing=check([{...lead,contactSource:'https://contractor.example.org/not-retrieved'}]);assert.equal(missing.leads[0].email,'');
});
test('email domain belonging to another business is withheld even on a retrieved page',()=>{
 const r=check([{...lead,email:'sales@another.example.org'}],{},[{...sources[0]}, {...sources[1],snippet:'Contact sales@another.example.org'}]);assert.equal(r.leads[0].email,'');
});
test('existing names, legal-name variants, corporate groups and known customer aliases are excluded',()=>{
 assert.equal(check([lead],{excludedNames:['New Contractor Limited']}).leads.length,0);
 assert.equal(check([lead,{...lead,company:'New Contractor Limited'}]).leads.length,1);
 assert.equal(check([{...lead,company:'Brand One',group:'Shared Group'}, {...lead,company:'Brand Two',group:'Shared Group'}]).leads.length,1);
 assert.equal(check([{...lead,company:'Fortem Solutions Limited'}],{excludedNames:['Fortem']}).leads.length,0);
});
test('unsupported programme source removes candidate rather than fabricating evidence',()=>{
 const r=check([{...lead,signalSource:'https://contractor.example.org/invented'}]);assert.equal(r.leads.length,0);assert.equal(r.removed,1);
});
test('expired engagement and awarded frameworks are never marked contact-now opportunities',()=>{
 const expired=check([{...lead,closingDate:'2026-10-01',nextAction:'Register for tender'}]).leads[0];assert.match(expired.priority,/Closed/);assert.match(expired.nextAction,/appointed delivery contractors/);
 const awarded=check([{...lead,signalType:'Awarded/closed'}]).leads[0];assert.match(awarded.priority,/Closed/);
});
test('future programmes, old/invalid dates and generic repair policies are clearly downgraded',()=>{
 assert.equal(check([{...lead,startDate:'2027-04-01'}]).leads[0].priority,'Longer term');
 assert.equal(check([{...lead,evidenceDate:'2024-01-01'}]).leads[0].priority,'Check timing');
 assert.equal(check([{...lead,evidenceDate:'2026-99-99'}]).leads[0].evidenceDate,'');
 assert.equal(check([{...lead,signalType:'General fit only'}]).leads[0].priority,'Research further');
});
test('procurement routes point to appointed contractors and returned counts remain honest',()=>{
 const r=check([{...lead,companyType:'Procurement route'}]);assert.equal(r.leads[0].priority,'Find appointed contractors');
 assert.match(r.leads[0].nextAction,/Do not assume/);assert.match(formatResearch(r,{today:'2026-10-28',count:5}),/1 account returned of 5/);
});

test('published recruitment/privacy contacts are withheld from sales outreach',()=>{
 const r=check([{...lead,email:'careers@contractor.example.org',contactRole:'Recruitment'}],{},[sources[0],{...sources[1],snippet:'Recruitment careers@contractor.example.org. 01922 123456'}]);
 assert.equal(r.leads[0].email,'');assert.equal(r.leads[0].phone,'');
});

test('trade-source buying signals need a primary announcement',()=>{
 const secondary={url:'https://www.locarla.com/insight/award',snippet:'Contractor appointed to housing works'};
 const r=check([{...lead,signalSource:secondary.url}],{},[...sources,secondary]);assert.equal(r.leads.length,0);assert.equal(r.removed,1);
});
test('crawl timestamps and a general framework portfolio cannot create contact-now leads',()=>{
 const r=check([{...lead,buyingSignal:'Lists multiple framework appointments in the West Midlands',evidenceDate:'2026-10-26'}],{},[{...sources[0],date:undefined,lastUpdated:'2026-10-26',snippet:'Framework portfolio across Midlands'},sources[1]]);
 assert.equal(r.leads[0].evidenceDate,'');assert.equal(r.leads[0].priority,'Research further');
});
