/* Reports and replies are rendered as text, never trusted HTML. */
window.RSUKSalesAgents = (() => {
  const titles={research:'Business Development Manager',followup:'Follow-up assistant',pipeline:'Pipeline reviewer'};
  let busy=false,active=null;
  const drafts=new Map();
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const reportFrom=item=>{
    try{const data=JSON.parse(item.details);if(typeof data.text!=='string')return null;return {
      reportId:item.id,conversationId:data.conversation_id||item.id,kind:data.kind,settings:data.settings||{},
      messages:Array.isArray(data.messages)?data.messages:[{role:'assistant',content:data.text}],saved:true,
      leads:Array.isArray(data.leads)?data.leads.filter(p=>p&&typeof p.email==='string'):[],createdAt:item.created_at,
    };}catch{return null;}
  };
  function mount({root,contacts,companies,activities,personPipeline,getSession,refresh,importLeads}) {
    const eligible=contacts.filter(c=>!c.opted_out&&personPipeline(c).stage!=='Not suitable');
    root.innerHTML=`<div class="card"><h2>RSUK sales assistants</h2><p><b>£215,000 → £250,000 per month excluding VAT, from January 2027.</b></p><p class="muted">Run an assistant, then reply to its report below. Conversations are saved in shared team history. Research prospects, save sourced contacts to the pipeline and send individual Outlook emails when you choose that action.</p><div class="grid">${Object.entries(titles).map(([key,title])=>`<div class="card"><h3>${title}</h3><p>${{research:'Find relevant buyers and published business emails, check buying signals and recommend your next sales action.',followup:'Prepare an email, call opener and next action for an existing contact.',pipeline:'Review opportunities and follow-ups, then prioritise your 30-hour sales week.'}[key]}</p></div>`).join('')}</div><form id="agentForm"><label for="agentKind">Assistant</label><select id="agentKind">${Object.entries(titles).map(([key,title])=>`<option value="${key}">${title}</option>`).join('')}</select><div id="agentResearchFields" class="grid"><div><label for="agentSector">Target sector</label><select id="agentSector"><option>Social housing maintenance</option><option>Roofing</option><option>Solar</option><option>Factory maintenance and manufacturing</option><option>Pharmaceutical and life sciences</option><option>Power generation and energy</option><option>Food and beverage manufacturing</option><option>Water and wastewater</option><option>Facilities management and building maintenance</option><option>Mechanical and electrical engineering</option><option>Industrial shutdowns and process maintenance</option><option>Warehousing and logistics</option><option>Commercial refurbishment and fit-out</option><option>Infrastructure and civil engineering</option></select></div><div><label for="agentCount">Accounts to research (1–10)</label><input id="agentCount" type="number" min="1" max="10" value="5"></div><div><label for="agentArea">Operating area</label><input id="agentArea" maxlength="150" value="Midlands and surrounding areas"></div><div><label for="agentFocus">Research focus</label><select id="agentFocus"><option>Contractors delivering work</option><option>Housing providers and procurement</option></select></div></div><div id="agentContactField" hidden><label for="agentContact">Contact</label><select id="agentContact"><option value="">Choose a contact</option>${eligible.map(c=>`<option value="${esc(c.id)}">${esc(companies.find(x=>x.id===c.company_id)?.name)} — ${esc(c.name||c.email)}</option>`).join('')}</select></div><label for="agentNotes">Additional context (optional)</label><textarea id="agentNotes" maxlength="3000" placeholder="Name companies to investigate, ask for direct buyer emails, or describe the Midlands contractors you want to target."></textarea><p class="muted">New research uses live web search. Other work uses current CRM records and your context. Runs and replies use your Vercel AI Gateway credits. New research also uses Hunter credits when connected: up to 3 domain searches and 3 email checks per report.</p><button class="primary" id="agentRun" type="submit">Find contacts</button><button type="button" id="agentConnect">Connect RSUK Outlook</button><p id="outlookStatus" class="muted" role="status"></p><p id="agentStatus" role="status" aria-live="polite"></p></form></div><section class="card" id="agentReportCard" hidden aria-label="Agent conversation"><div class="row"><h2 id="agentConversationTitle" style="flex:1">Conversation</h2><button id="agentCsv" type="button" hidden>Download shortlist contacts</button><button id="agentImport" type="button" hidden>Save contacts to pipeline</button><button id="agentSendLeads" class="primary" type="button" hidden>Save contacts &amp; send individual emails</button><button id="agentCopy" type="button">Copy conversation</button></div><div id="agentMessages" aria-live="polite"></div><form id="agentReplyForm"><label for="agentReply">Reply to this agent</label><textarea id="agentReply" maxlength="3000" required placeholder="For example: find published email addresses for these companies, or draft an introduction for the first prospect."></textarea><div class="row" style="margin-top:10px"><button class="primary" id="agentSend" type="submit">Send reply</button><span class="muted">Up to 3,000 characters</span></div><p id="agentReplyStatus" role="status" aria-live="polite"></p></form></section><div class="card"><h2>Saved conversations</h2><p class="muted">Open a report to read it and continue the conversation. Shared with approved RSUK team members.</p><div id="agentHistory"></div></div>`;
    const $=id=>root.querySelector('#'+id);
    const setBusy=value=>{busy=value;for(const id of ['agentRun','agentSend']){const b=$(id);if(b)b.disabled=value||(id==='agentSend'&&!active?.reportId);}};
    const show=report=>{
      if(!report||!$('agentMessages'))return;
      active=report;$('agentReportCard').hidden=false;
      const exportable=(report.leads||[]).filter(p=>p.email);$('agentCsv').hidden=!exportable.length;$('agentImport').hidden=!exportable.length||!report.reportId;$('agentSendLeads').hidden=!exportable.length||!report.reportId||report.kind!=='research';$('agentSendLeads').textContent='Save '+exportable.length+' contacts & send individual emails';$('agentCsv').textContent='Download shortlist contacts ('+exportable.length+')';
      $('agentConversationTitle').textContent=(titles[report.kind]||'Agent')+' conversation';
      const area=$('agentMessages');area.replaceChildren();
      for(const message of report.messages){
        if(!message||!['assistant','user'].includes(message.role)||typeof message.content!=='string')continue;
        const item=document.createElement('div');item.className='item';
        const label=document.createElement('h3');label.textContent=message.role==='user'?'You':titles[report.kind]||'Agent';label.style.fontSize='14px';
        const text=document.createElement('div');text.textContent=message.content;text.style.whiteSpace='pre-wrap';text.style.overflowWrap='anywhere';text.style.lineHeight='1.6';
        item.append(label,text);area.append(item);
      }
      $('agentReply').value=drafts.get(report.reportId)||'';
      $('agentReplyStatus').textContent=report.reportId?'':'This report was not saved. Copy the conversation before leaving; replies require a saved report.';
      setBusy(busy);
    };
    const history=activities.filter(a=>a.action==='sales_agent_run').sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).map(reportFrom).filter(Boolean);
    // Show the latest saved turn for each conversation, including legacy reports.
    const seen=new Set();
    for(const report of history){
      if(seen.has(report.conversationId))continue;seen.add(report.conversationId);
      if(seen.size>10)break;
      const row=document.createElement('div');row.className='item';const label=document.createElement('span');
      label.textContent=(titles[report.kind]||'Agent')+' · '+new Date(report.createdAt).toLocaleString('en-GB',{timeZone:'Europe/London'})+' ';
      const open=document.createElement('button');open.type='button';open.textContent='Open conversation';open.onclick=()=>{show(report);$('agentReportCard').scrollIntoView?.({behavior:'smooth',block:'start'});};
      row.append(label,open);$('agentHistory').append(row);
    }
    if(!$('agentHistory').children.length)$('agentHistory').textContent='No saved conversations yet.';
    if(active)show(active);
    async function outlookRequest(body){const session=await getSession();if(!session?.access_token)throw Error('Please sign in again.');const response=await fetch('/api/outlook',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw Error(data.error||'Outlook action failed.');return data;}
    async function updateOutlookStatus(){try{const data=await outlookRequest({action:'status'});$('outlookStatus').textContent=data.connected?'Connected as '+data.sender+' · Daily send limit 20':'Outlook '+(data.configured?'is ready to connect as '+data.expectedSender:'needs Microsoft app setup before connection.');$('agentConnect').textContent=data.connected?'Outlook connected':'Connect RSUK Outlook';$('agentSendLeads').disabled=!data.connected;}catch(error){$('outlookStatus').textContent=error.message;}}
    const callback=new URLSearchParams(location.search).get('outlook');if(callback){$('outlookStatus').textContent=callback==='connected'?'RSUK Outlook connected.':callback==='wrong-account'?'Connect the RSUK business mailbox matthew.harper@risescaffolding.co.uk.':'Outlook connection did not complete.';window.history.replaceState({},'',location.pathname+location.hash);}
    $('agentConnect').onclick=async()=>{const button=$('agentConnect');button.disabled=true;try{const state=await outlookRequest({action:'status'});if(state.connected){$('outlookStatus').textContent='Connected as '+state.sender+' · Daily send limit 20';return;}const result=await outlookRequest({action:'connect'});location.assign(result.authUrl);}catch(error){$('outlookStatus').textContent=error.message;}finally{button.disabled=false;}};
    $('agentImport').onclick=async()=>{if(!active?.reportId||active.kind!=='research')return;const button=$('agentImport');button.disabled=true;try{const saved=await importLeads(active.leads,active.settings,active.reportId);$('agentReplyStatus').textContent=saved.length+' contacts saved or matched in the pipeline.';await refresh();}catch(error){$('agentReplyStatus').textContent=error.message;}finally{button.disabled=false;}};
    $('agentSendLeads').onclick=async()=>{if(!active?.reportId||active.kind!=='research')return;const found=(active.leads||[]).filter(p=>p.email);if(!found.length)return;try{const connection=await outlookRequest({action:'status'});if(!connection.connected)throw Error('Connect RSUK Outlook before sending.');}catch(error){$('outlookStatus').textContent=error.message;return;}const accepted=confirm('This will save sourced contacts and send '+found.length+' separate emails from matthew.harper@risescaffolding.co.uk. Confirm each recipient is a company/LLP, or a sole trader/partnership RSUK may contact, and none has opted out. Continue?');if(!accepted)return;const button=$('agentSendLeads');button.disabled=true;let sent=0,skipped=0,failed=0;try{$('agentReplyStatus').textContent='Saving contacts to the pipeline…';const saved=await importLeads(active.leads,active.settings,active.reportId);for(const p of saved){if(p.opted_out){skipped++;continue;}const lead=found.find(x=>x.email?.toLowerCase()===p.email?.toLowerCase());if(!lead){skipped++;continue;}const company=lead.company||'your organisation',first=(p.name||'there').trim().split(/\s+/)[0]||'there',sector=active.settings?.sector||'scaffolding and access work';const subject='Scaffolding support for '+company;const body='Good morning '+first+',\n\nI’m contacting you from RSUK Scaffolding to ask whether '+company+' has upcoming '+sector+' works where we could support with scaffolding or temporary access. We cover the Midlands and surrounding areas from our Coventry and Birmingham depots, and can support planned and reactive projects.\n\nWould you be the right person to speak with about upcoming requirements and subcontractor onboarding?\n\nIf you would prefer not to receive further emails, reply to let us know and we will update our records.\n\nKind regards,\nRSUK Scaffolding\n07768 290310\nmatthew.harper@risescaffolding.co.uk\n\nHarper Lee Enterprises Limited trading as RSUK Scaffolding\nUnit 16 The Arches Industrial Estate, Spon End, Coventry, West Midlands, CV1 3JQ';try{const result=await outlookRequest({action:'send',contactId:p.id,campaignId:active.conversationId||active.reportId,subject,body,corporateOrConsentConfirmed:true});if(result.sent)sent++;else failed++;}catch(error){failed++;$('agentReplyStatus').textContent='Sent '+sent+' of '+saved.length+' so far. '+error.message;break;}$('agentReplyStatus').textContent='Sent '+sent+' of '+saved.length+'; skipped '+skipped+'; failed '+failed+'.';}await refresh();}catch(error){$('agentReplyStatus').textContent='Sent '+sent+'; skipped '+skipped+'; error: '+error.message;}finally{button.disabled=false;updateOutlookStatus();}};
    updateOutlookStatus();
    $('agentKind').onchange=()=>{const kind=$('agentKind').value;$('agentResearchFields').hidden=kind!=='research';$('agentContactField').hidden=kind!=='followup';$('agentContact').required=kind==='followup';$('agentCount').required=kind==='research';};
    $('agentReply').oninput=()=>{if(active?.reportId)drafts.set(active.reportId,$('agentReply').value);};
    $('agentCsv').onclick=()=>{
      const leads=(active?.leads||[]).filter(p=>p.email);if(!leads.length)return;
      const cell=value=>{let text=String(value??'');if(/^\s*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
      const rows=[['company','name','role','email','phone','verified'],...leads.map(p=>[p.company,p.contactName,p.contactRole,p.email,p.phone,(p.verification||'Published email; delivery not tested')+' Source: '+p.contactSource])];
      const csv='\ufeff'+rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
      const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='RSUK_Research_Contacts_'+new Date().toISOString().slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    };
    $('agentCopy').onclick=async()=>{
      const text=(active?.messages||[]).map(m=>(m.role==='user'?'You':titles[active.kind]||'Agent')+'\n'+m.content).join('\n\n');
      try{await navigator.clipboard.writeText(text);$('agentReplyStatus').textContent='Conversation copied.';}catch{$('agentReplyStatus').textContent='Copy unavailable. Select and copy the conversation text.';}
    };
    setBusy(busy);
    if(busy)$('agentStatus').textContent='An assistant is running. Please wait.';
    async function submit(payload,isReply) {
      if(busy)return;
      const parent=isReply?active?.reportId:null;
      const prior=isReply?active:null;
      setBusy(true);
      const statusId=isReply?'agentReplyStatus':'agentStatus';
      $(statusId).textContent=isReply?'Preparing your reply… this can take up to three minutes.':'Working… this can take up to three minutes.';
      try{
        const session=await getSession();if(!session?.access_token)throw Error('Please sign in again.');
        const response=await fetch('/api/sales-agent',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify(payload),signal:AbortSignal.timeout(185000)});
        const data=await response.json();if(!response.ok)throw Error(data.error||'Could not run the assistant.');
        active={reportId:data.reportId||null,conversationId:data.conversationId,kind:data.kind||prior?.kind||payload.kind,settings:data.settings||prior?.settings||payload,
          messages:Array.isArray(data.messages)?data.messages:[...(prior?.messages||[]),...(isReply?[{role:'user',content:payload.message}]:[]),{role:'assistant',content:data.text}],leads:Array.isArray(data.leads)?data.leads:prior?.leads||[],saved:data.saved};
        if(parent)drafts.delete(parent);
        try{await refresh();}catch{/* The result remains visible even if refreshing CRM fails. */}
        if($('agentMessages')){
          show(active);$(statusId).textContent=(data.saved?'Conversation saved.':'Saving failed. Copy the conversation before leaving.')+(data.truncated?' The CRM snapshot was limited.':'');
          $('agentReply').value='';
        }
      }catch(error){if($(statusId))$(statusId).textContent=error.name==='TimeoutError'?'The run timed out. Your reply is kept below; check saved history before retrying.':error.message;}
      finally{setBusy(false);}
    }
    $('agentForm').onsubmit=async event=>{
      event.preventDefault();const kind=$('agentKind').value;
      if(kind==='followup'&&!$('agentContact').value){$('agentStatus').textContent='Choose a contact first.';return;}
      await submit({kind,sector:$('agentSector').value,count:Number($('agentCount').value),contactId:$('agentContact').value,notes:$('agentNotes').value,area:$('agentArea').value,focus:$('agentFocus').value},false);
    };
    $('agentReplyForm').onsubmit=async event=>{
      event.preventDefault();const message=$('agentReply').value.trim();
      if(!active?.reportId||!message){$('agentReplyStatus').textContent='Open a saved report and enter your reply.';return;}
      await submit({parentId:active.reportId,message},true);
    };
  }
  return {mount};
})();
