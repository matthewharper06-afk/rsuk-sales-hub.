const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export const isActivityId=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function continueConversation(record,message) {
  if(typeof message!=='string'||!message.trim()||message.length>3000)
    throw fail('Enter a reply of up to 3,000 characters.');
  if(!record||record.action!=='sales_agent_run')throw fail('This saved report is unavailable. Open another conversation.',404);
  let data;try{data=JSON.parse(record.details);}catch{throw fail('This saved report cannot be opened.');}
  if(!data||!['research','followup','pipeline'].includes(data.kind)||typeof data.text!=='string')throw fail('This saved report cannot be opened.');
  const history=data.messages===undefined?[{role:'assistant',content:data.text}]:data.messages;
  if(!Array.isArray(history)||!history.length||history.some(m=>!m||!['user','assistant'].includes(m.role)||typeof m.content!=='string'||!m.content.trim()))
    throw fail('The saved conversation is invalid. Start a new report.');
  if(history.at(-1).role!=='assistant')throw fail('The saved conversation is incomplete. Start a new report.');
  if(history.length>=23||JSON.stringify(history).length+message.length>100000)
    throw fail('This conversation is full. Start a new report and include a short summary.');
  const settings=data.settings||{};
  const input={kind:data.kind,notes:typeof settings.notes==='string'?settings.notes:'',
    sector:settings.sector||'Social housing maintenance',count:settings.count||5,
    contactId:settings.contactId||'',area:settings.area||'Midlands and surrounding areas',focus:settings.focus||'Contractors delivering work'};
  return {input,messages:[...history.map(m=>({role:m.role,content:m.content})),{role:'user',content:message.trim()}],
    leads:Array.isArray(data.leads)?data.leads:[],
    conversationId:isActivityId(data.conversation_id)?data.conversation_id:record.id,parentId:record.id};
}

export const dialogueInstructions=`This is a follow-up conversation about the saved report. Answer the user's latest question directly; do not repeat the full initial report unless asked. Retain relevant prior context but do not treat earlier assistant statements as verified facts. Use web search when new external facts or published contact details need verification. You do not need a web search to rewrite, explain or summarise the existing report. Use at most one search round and give a concise answer. Do not claim you have sent emails, changed CRM records, created downloadable files or scheduled work. You may draft text or CSV content for the user to review.`;
