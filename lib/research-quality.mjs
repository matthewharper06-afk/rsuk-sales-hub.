const text=description=>({type:'string',description});
const fields={
  company:text('Legal or trading company name. One account per corporate group.'),
  group:text('Parent corporate group, or empty string if not known.'),
  companyType:{type:'string',enum:['Contractor','Housing provider','Procurement route']},
  website:text('Company website URL, evidenced by a retrieved result. Empty if unknown.'),
  area:text('Specific evidenced Midlands operating area, not just head-office address.'),
  buyingSignal:text('One concise evidenced scaffolding/access requirement in the selected sector: programme, industrial maintenance, engineering project, outage or buying event. Sector membership alone is not a scaffold opportunity.'),
  signalType:{type:'string',enum:['Live programme','Open tender','Awarded/closed','General fit only','Unknown']},
  evidenceDate:text('Publication or contract evidence date in YYYY-MM-DD, or empty if unknown. Never invent a date.'),
  closingDate:text('Submission/engagement deadline YYYY-MM-DD, or empty if unknown.'),
  startDate:text('Programme/contract start YYYY-MM-DD, or empty if unknown.'),
  signalSource:text('Exact primary-source URL returned by search that supports the buying signal.'),
  contactName:text('Published buying contact name only where evidenced, otherwise empty.'),
  contactRole:text('Published role, or general enquiries/tender contact where appropriate.'),
  email:text('Literal published professional email from search evidence. Never infer a format. Empty if not found.'),
  phone:text('Published business phone, otherwise empty.'),
  contactSource:text('Exact returned source URL containing this contact, or empty.'),
  nextAction:text('Specific next action, including actual buying route. Do not suggest joining an already awarded framework.'),
  missing:text('Key unresolved qualification fact: buyer, volume, timing or onboarding.'),
};
export const researchSchema={type:'object',additionalProperties:false,properties:{
  prospects:{type:'array',items:{type:'object',additionalProperties:false,properties:fields,required:Object.keys(fields)}},
  nextActions:{type:'array',items:{type:'string'}},
},required:['prospects','nextActions']};

export function canonicalCompany(value){return String(value||'').toLowerCase().replace(/&/g,' and ').replace(/\b(limited|ltd|plc|llp)\b/g,'').replace(/[^a-z0-9]/g,'').replace(/^fortemsolutions$/,'fortem').replace(/^novuspropertysolutions$/,'novus');}
function urlKey(value){try{const u=new URL(value);if(!['https:','http:'].includes(u.protocol))return '';u.hash='';for(const k of [...u.searchParams.keys()])if(k.startsWith('utm_'))u.searchParams.delete(k);return u.href.replace(/\/$/,'');}catch{return '';}}
function host(value){try{return new URL(value).hostname.toLowerCase().replace(/^www\./,'');}catch{return '';}}
function sameSite(a,b){return Boolean(a&&b&&(a===b||a.endsWith('.'+b)||b.endsWith('.'+a)));}
const procurementHosts=['delta-esourcing.com','mytenders.co.uk','procontract.due-north.com','in-tendhost.co.uk','eu-supply.com','fusion21.co.uk','procure-plus.com','pfh.co.uk','scapegroup.co.uk','scapegroup.com','pagabo.co.uk'];
function primarySource(url,website){const h=host(url);if(['locarla.com','stotles.com','bidstats.uk','opentenders.co.uk','theconstructionindex.co.uk','scaffmag.com'].some(p=>sameSite(h,p)))return false;return sameSite(h,host(website))||/(^|\.)(gov\.uk|gov\.wales)$/.test(h)||procurementHosts.some(p=>sameSite(h,p));}
function dateInText(value,snippet){
 if(!value)return false;const [year,month,day]=value.split('-');const d=Number(day),m=Number(month);
 const date=new Date(value+'T00:00:00Z');const long=date.toLocaleString('en-GB',{month:'long',timeZone:'UTC'}).toLowerCase();const short=long.slice(0,3);
 const norm=s=>String(s).toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g,'$1').replace(/[^a-z0-9]/g,'');
 const raw=norm(snippet);return [value,`${day}/${month}/${year}`,`${d}/${m}/${year}`,`${d} ${long} ${year}`,`${d} ${short} ${year}`,`${long} ${d} ${year}`,`${short} ${d} ${year}`].some(form=>raw.includes(norm(form)));
}
const clean=value=>String(value||'').trim().slice(0,1800);
const isoDate=value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return '';const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value?value:'';};

export function qualifyResearch(output,steps,{today,count,excludedNames=[]}){
  if(!output||!Array.isArray(output.prospects))throw Object.assign(new Error('Research returned an incomplete shortlist. Try fewer accounts.'),{status:502});
  const sources=new Map();
  for(const step of steps||[])for(const tool of step.toolResults||[])if(tool.toolName==='search'&&!tool.output?.error)
    for(const result of tool.output?.results||[]){const key=urlKey(result.url);if(key){const old=sources.get(key);sources.set(key,{...result,snippet:(old?.snippet||'')+'\n'+String(result.snippet||'')});}}
  const excluded=new Set(excludedNames.map(canonicalCompany));const seen=new Set();const leads=[];let removed=0,withheld=0;
  for(const raw of output.prospects.slice(0,30)){
    const p=Object.fromEntries(Object.keys(fields).map(k=>[k,clean(raw?.[k])]));
    const companyKey=canonicalCompany(p.company),groupKey=canonicalCompany(p.group)||companyKey;
    const signal=sources.get(urlKey(p.signalSource));
    if(!companyKey||excluded.has(companyKey)||excluded.has(groupKey)||seen.has(companyKey)||seen.has(groupKey)||!signal||!p.buyingSignal||!primarySource(signal.url,p.website)){removed++;continue;}
    seen.add(companyKey);seen.add(groupKey);
    p.signalSource=signal.url;
    const websiteHost=host(p.website);
    // Do not accept an invented company website as contact provenance.
    const websiteSeen=[...sources.values()].some(s=>sameSite(host(s.url),websiteHost));
    if(!websiteSeen)p.website='';
    const contact=sources.get(urlKey(p.contactSource));
    const snippet=String(contact?.snippet||'').toLowerCase();
    const emailDomain=p.email.split('@')[1]?.toLowerCase();
    const companyPage=contact&&websiteSeen&&sameSite(host(contact.url),websiteHost);
    const businessSource=companyPage||(contact&&/\.(gov\.uk|gov\.wales)$/.test(host(contact.url))&&websiteSeen&&sameSite(emailDomain,websiteHost));
    const unsuitableContact=/^(privacy|dataprotection|dpo|careers|jobs|recruitment|apprenticeships|noreply|no-reply|unsubscribe|abuse|postmaster|webmaster)@/i.test(p.email)||/privacy|data protection|recruitment|human resources/i.test(p.contactRole);
    const publishedEmail=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)&&snippet.includes(p.email.toLowerCase())&&businessSource&&sameSite(emailDomain,websiteHost)&&!unsuitableContact;
    if(p.email&&!publishedEmail)withheld++;
    if(!publishedEmail)p.email='';
    const phoneDigits=p.phone.replace(/\D/g,'');
    if(unsuitableContact||!businessSource||phoneDigits.length<10||!snippet.replace(/\D/g,'').includes(phoneDigits))p.phone='';
    if(!contact||!snippet.includes(p.contactName.toLowerCase()))p.contactName='';
    if(!p.email&&!p.phone){p.contactName='';p.contactRole='';p.contactSource='';}else p.contactSource=contact.url;
    p.evidenceDate=isoDate(p.evidenceDate);p.closingDate=isoDate(p.closingDate);p.startDate=isoDate(p.startDate);
    const sourceDate=String(signal.date||'').slice(0,10);
    if(p.evidenceDate&&!dateInText(p.evidenceDate,signal.snippet)&&sourceDate!==p.evidenceDate)p.evidenceDate='';
    const unverifiedDeadline=Boolean(p.closingDate&&!dateInText(p.closingDate,signal.snippet));
    if(unverifiedDeadline)p.closingDate='';
    if(p.startDate&&!dateInText(p.startDate,signal.snippet))p.startDate='';
    if(/framework/i.test(p.buyingSignal)&&/\b(lists|listing|appointments|portfolio)\b/i.test(p.buyingSignal))p.signalType='General fit only';
    let priority=p.email||p.phone?'Contact now':'Find buyer contact';
    if(!p.evidenceDate||unverifiedDeadline||Date.parse(today)-Date.parse(p.evidenceDate)>366*86400000)priority='Check timing';
    if(p.signalType==='General fit only'||p.signalType==='Unknown')priority='Research further';
    if(p.companyType==='Procurement route')priority='Find appointed contractors';
    if(p.startDate>'2027-01-31')priority='Longer term';
    if(p.signalType==='Awarded/closed'||(p.closingDate&&p.closingDate<today))priority='Closed — check successor or contractor';
    if(p.companyType==='Procurement route'||p.signalType==='Awarded/closed'||(p.closingDate&&p.closingDate<today))p.nextAction='Confirm the current procurement status and appointed delivery contractors; explore subcontract scaffolding opportunities. Do not assume an awarded or closed framework can be joined.';
    leads.push({...p,priority,verification:p.email?'Published email found in returned source text; delivery not tested':'No source-evidenced email found'});
  }
  const order=['Contact now','Find buyer contact','Check timing','Find appointed contractors','Closed — check successor or contractor','Longer term','Research further'];
  leads.sort((a,b)=>order.indexOf(a.priority)-order.indexOf(b.priority)||(a.companyType==='Contractor'?0:1)-(b.companyType==='Contractor'?0:1));
  const selected=leads.slice(0,count);
  const allowedEmails=new Set(selected.map(p=>p.email.toLowerCase()).filter(Boolean));
  const redact=value=>String(value).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,email=>allowedEmails.has(email.toLowerCase())?email:'[email not evidenced]');
  for(const p of selected)for(const key of ['company','group','area','buyingSignal','contactName','contactRole','nextAction','missing'])p[key]=redact(p[key]);
  return {leads:selected,removed,withheld,actions:[]};
}

export function formatResearch(report,{today,count}){
  const {leads,removed,withheld,actions}=report;
  const lines=[`RSUK prospect shortlist — checked ${today}`,`${leads.length} ${leads.length===1?'account':'accounts'} returned of ${count} requested. ${leads.filter(p=>p.email).length} with a sourced business email.`,''];
  for(const [i,p] of leads.entries())lines.push(`${i+1}. ${p.company} — ${p.priority}`,`${p.companyType} | ${p.area||'Operating area needs confirmation'}`,`Buying signal: ${p.buyingSignal}`,`Evidence date: ${p.evidenceDate||'Not established'}${p.closingDate?' | Deadline: '+p.closingDate:''}${p.startDate?' | Starts: '+p.startDate:''}`,`Source: ${p.signalSource}`,`Contact: ${p.contactName||'Name not established'}${p.contactRole?' — '+p.contactRole:''}`,`Email: ${p.email||'Not found in source evidence'}${p.phone?' | Phone: '+p.phone:''}`,p.contactSource?'Contact source: '+p.contactSource:'',p.verification?'Email checks: '+p.verification:'',p.hunterStatus?'Hunter status: '+p.hunterStatus:'',`Next action: ${p.nextAction}`,`To qualify: ${p.missing||'Confirm current demand, buyer and expected frequency.'}`,'');
  if(!leads.length)lines.push('No candidates met the source and duplicate checks. Narrow the area or ask about a specific contractor.','');
  if(removed||withheld)lines.push(`Evidence checks: ${removed} duplicate/existing/unsupported candidates removed; ${withheld} unsupported email addresses withheld.`,'');
  if(actions.length)lines.push('Next actions',...actions.map((s,i)=>`${i+1}. ${s}`),'');
  lines.push('Weekly account value is unconfirmed. £500/week minimum and £5,000/week ideal are RSUK targets, not verified customer budgets. Web-only contacts have not been delivery-tested. Hunter checks are labelled separately; accept-all/unknown results are uncertain and no status guarantees delivery.');
  return lines.filter(x=>x!==undefined).join('\n');
}
