/* Sales assistants UI. Reports are rendered as text, never trusted HTML. */
window.RSUKSalesAgents = (() => {
  const titles={research:'Prospect researcher',followup:'Follow-up assistant',pipeline:'Pipeline reviewer'};
  let busy=false,lastReport='';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function mount({root,contacts,companies,activities,personPipeline,getSession,refresh}) {
    const eligible=contacts.filter(c=>!c.opted_out&&personPipeline(c).stage!=='Not suitable');
    root.innerHTML=`<div class="card"><h2>RSUK sales assistants</h2><p><b>£215,000 → £250,000 per month excluding VAT, from January 2027.</b></p><p class="muted">Run an assistant when you need it. Review its findings and drafts before taking action. Results are saved to shared team history; no emails are sent or CRM sales records changed.</p><div class="grid">${Object.entries(titles).map(([key,title])=>`<div class="card"><h3>${title}</h3><p>${{research:'Find evidenced opportunities in social housing maintenance, roofing and solar across the Midlands.',followup:'Prepare a relevant email, call opener and next action for an existing contact.',pipeline:'Review current opportunities and follow-ups, then prioritise your 30-hour sales week.'}[key]}</p></div>`).join('')}</div><form id="agentForm"><label for="agentKind">Assistant</label><select id="agentKind">${Object.entries(titles).map(([key,title])=>`<option value="${key}">${title}</option>`).join('')}</select><div id="agentResearchFields" class="grid"><div><label for="agentSector">Target sector</label><select id="agentSector"><option>Social housing maintenance</option><option>Roofing</option><option>Solar</option></select></div><div><label for="agentCount">Accounts to research (1–10)</label><input id="agentCount" type="number" min="1" max="10" value="5"></div></div><div id="agentContactField" hidden><label for="agentContact">Contact</label><select id="agentContact"><option value="">Choose a contact</option>${eligible.map(c=>`<option value="${esc(c.id)}">${esc(companies.find(x=>x.id===c.company_id)?.name)} — ${esc(c.name||c.email)}</option>`).join('')}</select></div><label for="agentNotes">Additional context (optional)</label><textarea id="agentNotes" maxlength="3000" placeholder="For example: focus on roofing programmes around Birmingham, or paste the customer's latest reply."></textarea><p class="muted">Research uses live web search. Follow-up and pipeline reviews use current CRM records and the context you provide. AI usage is charged through your Vercel AI Gateway account.</p><button class="primary" id="agentRun" type="submit">Run assistant</button><p id="agentStatus" role="status" aria-live="polite"></p></form></div><div class="card" id="agentReportCard" hidden><div class="row"><h2 style="flex:1">Report for review</h2><button id="agentCopy" type="button">Copy report</button></div><pre id="agentReport" style="white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;line-height:1.6"></pre></div><div class="card"><h2>Recent assistant reports</h2><p class="muted">Shared with approved RSUK team members.</p><div id="agentHistory"></div></div>`;
    const $=id=>root.querySelector('#'+id);
    const show=text=>{lastReport=text;$('agentReport').textContent=text;$('agentReportCard').hidden=false;};
    if(lastReport)show(lastReport);
    const history=activities.filter(a=>a.action==='sales_agent_run').sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,10);
    for(const item of history){let data;try{data=JSON.parse(item.details);}catch{continue;}if(!data.text)continue;const row=document.createElement('div');row.className='item';const label=document.createElement('span');label.textContent=(titles[data.kind]||'Assistant')+' · '+new Date(item.created_at).toLocaleString('en-GB',{timeZone:'Europe/London'})+' ';const open=document.createElement('button');open.type='button';open.textContent='Read report';open.onclick=()=>show(data.text);row.append(label,open);$('agentHistory').append(row);}
    if(!$('agentHistory').children.length)$('agentHistory').textContent='No saved reports yet.';
    $('agentKind').onchange=()=>{const kind=$('agentKind').value;$('agentResearchFields').hidden=kind!=='research';$('agentContactField').hidden=kind!=='followup';$('agentContact').required=kind==='followup';$('agentCount').required=kind==='research';};
    $('agentCopy').onclick=async()=>{try{await navigator.clipboard.writeText(lastReport);$('agentStatus').textContent='Report copied.';}catch{$('agentStatus').textContent='Copy unavailable. Select and copy the report text.';}};
    $('agentRun').disabled=busy;
    if(busy)$('agentStatus').textContent='An assistant is running. Please wait.';
    $('agentForm').onsubmit=async event=>{
      event.preventDefault();if(busy)return;
      const kind=$('agentKind').value;
      if(kind==='followup'&&!$('agentContact').value){$('agentStatus').textContent='Choose a contact first.';return;}
      busy=true;$('agentRun').disabled=true;$('agentStatus').textContent='Working… this can take up to three minutes.';
      try{
        const session=await getSession();if(!session?.access_token)throw Error('Please sign in again.');
        const response=await fetch('/api/sales-agent',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({kind,sector:$('agentSector').value,count:Number($('agentCount').value),contactId:$('agentContact').value,notes:$('agentNotes').value}),signal:AbortSignal.timeout(185000)});
        const data=await response.json();if(!response.ok)throw Error(data.error||'Could not run the assistant.');
        lastReport=data.text;
        await refresh();
        // The user may have navigated away while generation was in progress.
        if(root.querySelector('#agentReport')){show(data.text);$('agentStatus').textContent=(data.saved?'Report ready and saved.':'Report ready, but saving failed. Copy it before leaving.')+(data.truncated?' Review used a limited CRM snapshot.':'');}
      }catch(error){if(root.querySelector('#agentStatus'))$('agentStatus').textContent=error.name==='TimeoutError'?'The run timed out. Check recent history before retrying.':error.message;}
      finally{busy=false;const button=root.querySelector('#agentRun');if(button)button.disabled=false;}
    };
  }
  return {mount};
})();
