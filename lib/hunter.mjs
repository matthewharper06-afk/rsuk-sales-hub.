// Hunter is called only after staff authentication and web-evidence qualification.
// Credentials stay in request headers; provider error bodies are never exposed.
const rejected=/privacy|data.?protection|recruit|careers|human resources|noreply|no-reply|unsubscribe|abuse|postmaster|webmaster/i;
const emailOK=e=>typeof e==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
function domainOf(website){try{const u=new URL(website);const h=u.hostname.toLowerCase().replace(/^www\./,'');return u.protocol==='https:'&&/^[a-z0-9.-]+\.[a-z]{2,}$/.test(h)?h:'';}catch{return '';}}
function sourceURL(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)?u.href:'';}catch{return '';}}
export async function enrichWithHunter(leads,{apiKey,fetchImpl=fetch,blockedEmails=[]}={}){
  if(!apiKey)return {leads,status:'not configured',attempted:0};
  const blocked=new Set(blockedEmails.map(e=>String(e).toLowerCase()));
  const out=leads.map(p=>({...p}));let attempted=0,failures=0,found=0;
  const call=async(endpoint,params)=>{
    const url=new URL('https://api.hunter.io/v2/'+endpoint);
    for(const [key,value]of Object.entries(params))url.searchParams.set(key,value);
    const r=await fetchImpl(url.href,{headers:{'X-API-KEY':apiKey},redirect:'error',signal:AbortSignal.timeout(9000)});
    if(r.status!==200)throw Error('Hunter unavailable');
    return (await r.json()).data;
  };
  // Parallel bounded work keeps total enrichment below the function timeout.
  await Promise.all(out.slice(0,3).map(async p=>{
    const domain=domainOf(p.website);if(!domain)return;attempted++;
    try{
      const data=await call('domain-search',{domain,limit:'10'});
      const candidates=(data?.emails||[]).filter(e=>emailOK(e.value)&&e.value.split('@')[1].toLowerCase()===domain&&!blocked.has(e.value.toLowerCase())&&!rejected.test(e.value+' '+(e.position||''))&&e.verification?.status!=='invalid'&&(e.sources||[]).some(s=>sourceURL(s.uri)));
      const rank=e=>(/procurement|buyer|commercial|contracts|estimating|estimator|supply chain/i.test(e.position||'')?100:0)+(e.type==='personal'?10:0)+(Number(e.confidence)||0)/100;
      candidates.sort((a,b)=>rank(b)-rank(a));const candidate=candidates[0];
      const address=candidate?.value||p.email;
      if(!emailOK(address)||blocked.has(address.toLowerCase())){p.hunterStatus='No suitable published email found';return;}
      const check=await call('email-verifier',{email:address});
      if(check?.email?.toLowerCase()!==address.toLowerCase())throw Error('Hunter response mismatch');
      const status=['valid','invalid','accept_all','unknown','webmail','disposable'].includes(check.status)?check.status:'unknown';
      p.hunterStatus=status;
      if(['invalid','disposable'].includes(status)){
        if(p.email?.toLowerCase()===address.toLowerCase()){p.email='';p.verification='Hunter reports '+status+'; email withheld';}
        return;
      }
      if(candidate){
        p.email=candidate.value;p.contactName=[candidate.first_name,candidate.last_name].filter(Boolean).join(' ');
        p.contactRole=candidate.position||(candidate.type==='generic'?'General business inbox':'Business contact; role unconfirmed');
        p.contactSource=candidate.sources.map(s=>sourceURL(s.uri)).find(Boolean);
        // Existing phone came from a different contact source, so do not reassign it.
        p.phone='';found++;
      }
      p.verification='Hunter-sourced/check status: '+status+'; checked '+new Date().toISOString().slice(0,10)+(status==='valid'?'; delivery not guaranteed':'; uncertain — review before outreach');
    }catch{failures++;p.hunterStatus='Unavailable or timed out; web research retained';}
  }));
  return {leads:out,status:failures?'partially unavailable':'completed',attempted,found,failures};
}
