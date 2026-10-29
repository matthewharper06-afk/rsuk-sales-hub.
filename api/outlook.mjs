import {randomUUID} from 'node:crypto';
import {allowedSender,bearer,outlookConfigured,pkce,publicKey,redirectUri,seal,supabaseUrl,unseal} from '../lib/outlook-auth.mjs';

export const config={maxDuration:30};
const validId=x=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(x||''));
const emailOk=x=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(x||''));
const safeJson=async r=>{try{return await r.json();}catch{return {};}}

export function createOutlookHandler({fetchImpl=fetch,env=process.env}={}){
  return async function handler(req,res){
    res.setHeader('Cache-Control','no-store');
    if(req.method!=='POST')return res.status(405).json({error:'Use POST.'});
    const accessToken=bearer(req);if(!accessToken)return res.status(401).json({error:'Sign in to connect Outlook.'});
    const headers={apikey:publicKey,Authorization:'Bearer '+accessToken};
    const read=async path=>{
      const r=await fetchImpl(supabaseUrl+path,{headers,signal:AbortSignal.timeout(12000)});
      if(!r.ok)throw Object.assign(new Error('Sales Hub access check failed.'),{status:r.status===401?401:502});
      return safeJson(r);
    };
    const write=async(path,method,body)=>{
      const r=await fetchImpl(supabaseUrl+path,{method,headers:{...headers,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
      if(!r.ok)throw Object.assign(new Error('Sales Hub could not save the Outlook activity.'),{status:502});
      return r;
    };
    try{
      const user=await read('/auth/v1/user');
      if(!user?.id)return res.status(401).json({error:'Sign in again.'});
      const member=await read('/rest/v1/team_members?select=active&user_id=eq.'+encodeURIComponent(user.id));
      if(!member.some(x=>x.active))return res.status(403).json({error:'Active RSUK team membership required.'});
      let input=req.body;
      if(typeof input==='string'){try{input=JSON.parse(input)}catch{return res.status(400).json({error:'Invalid request.'})}}
      const action=input?.action;
      if(action==='status'){
        const records=await read('/rest/v1/activities?select=details,created_at&actor_id=eq.'+encodeURIComponent(user.id)+'&action=eq.sales_outlook_connection&order=created_at.desc&limit=1');
        if(!records.length)return res.status(200).json({configured:outlookConfigured(env),connected:false,expectedSender:allowedSender});
        try{
          const detail=JSON.parse(records[0].details||'{}');
          const tokenData=unseal(detail.token,env);
          return res.status(200).json({configured:outlookConfigured(env),connected:Boolean(tokenData.refreshToken),sender:detail.sender||'',expectedSender:allowedSender});
        }catch{return res.status(200).json({configured:outlookConfigured(env),connected:false,expectedSender:allowedSender});}
      }
      if(action==='connect'){
        if(!outlookConfigured(env))return res.status(503).json({error:'Microsoft Outlook is not configured yet. Add the Entra app settings in Vercel first.'});
        const {verifier,challenge}=pkce();
        const state=seal({userId:user.id,supabaseToken:accessToken,verifier,exp:Date.now()+10*60*1000,nonce:randomUUID()},env);
        const authUrl=new URL('https://login.microsoftonline.com/'+encodeURIComponent(env.OUTLOOK_TENANT_ID)+'/oauth2/v2.0/authorize');
        authUrl.searchParams.set('client_id',env.OUTLOOK_CLIENT_ID);
        authUrl.searchParams.set('response_type','code');
        authUrl.searchParams.set('redirect_uri',redirectUri(env));
        authUrl.searchParams.set('response_mode','query');
        authUrl.searchParams.set('scope','openid profile offline_access User.Read Mail.Send');
        authUrl.searchParams.set('state',state);
        authUrl.searchParams.set('code_challenge',challenge);
        authUrl.searchParams.set('code_challenge_method','S256');
        authUrl.searchParams.set('prompt','select_account');
        authUrl.searchParams.set('login_hint',allowedSender);
        return res.status(200).json({authUrl:authUrl.toString(),expectedSender:allowedSender});
      }
      if(action!=='send')return res.status(400).json({error:'Choose status, connect or send.'});
      if(!outlookConfigured(env))return res.status(503).json({error:'Microsoft Outlook is not configured yet.'});
      const {contactId,subject,body,campaignId,corporateOrConsentConfirmed}=input||{};
      if(!validId(contactId)||!validId(campaignId)||typeof subject!=='string'||typeof body!=='string'||subject.length<1||subject.length>180||body.length<1||body.length>8000||/[\r\n]/.test(subject)||corporateOrConsentConfirmed!==true)
        return res.status(400).json({error:'A saved contact, campaign ID, email subject and body are required. Confirm the recipient is eligible for RSUK marketing.'});
      const contacts=await read('/rest/v1/contacts?select=id,company_id,name,email,opted_out&id=eq.'+encodeURIComponent(contactId)+'&limit=1');
      const contact=contacts[0];
      if(!contact||contact.opted_out||!emailOk(contact.email))return res.status(409).json({error:'Contact is unavailable, has opted out, or has no valid email.'});
      const companies=await read('/rest/v1/companies?select=id,stage&id=eq.'+encodeURIComponent(contact.company_id)+'&limit=1');
      if(!companies[0]||companies[0].stage==='Not suitable')return res.status(409).json({error:'This company is marked not suitable for outreach.'});
      const states=await read('/rest/v1/activities?select=details&contact_id=eq.'+encodeURIComponent(contactId)+'&action=eq.contact_pipeline&order=created_at.desc&limit=1');
      let pipelineState={};if(states[0]){try{pipelineState=JSON.parse(states[0].details||'{}')}catch{}if(pipelineState.stage==='Not suitable')return res.status(409).json({error:'This contact is marked not suitable for outreach.'});}
      const prior=await read('/rest/v1/activities?select=id,details&actor_id=eq.'+encodeURIComponent(user.id)+'&contact_id=eq.'+encodeURIComponent(contactId)+'&action=eq.outbound_email_sent&limit=100');
      const already=prior.some(a=>{try{return JSON.parse(a.details||'{}').campaign_id===campaignId}catch{return false}});
      if(already)return res.status(200).json({sent:true,alreadySent:true});
      const today=new Date();today.setUTCHours(0,0,0,0);
      const daily=await read('/rest/v1/activities?select=id&actor_id=eq.'+encodeURIComponent(user.id)+'&action=eq.outbound_email_sent&created_at=gte.'+encodeURIComponent(today.toISOString())+'&limit=25');
      if(daily.length>=20)return res.status(429).json({error:'Daily Sales Hub send limit reached (20 emails).'});
      const saved=await read('/rest/v1/activities?select=id,details&actor_id=eq.'+encodeURIComponent(user.id)+'&action=eq.sales_outlook_connection&order=created_at.desc&limit=1');
      if(!saved.length)return res.status(409).json({error:'Connect the RSUK Outlook mailbox before sending.'});
      let connection;
      try{const details=JSON.parse(saved[0].details||'{}');connection={details,token:unseal(details.token,env)};}catch{return res.status(409).json({error:'Outlook connection expired or unreadable. Reconnect the mailbox.'});}
      const tokenResponse=await fetchImpl('https://login.microsoftonline.com/'+encodeURIComponent(env.OUTLOOK_TENANT_ID)+'/oauth2/v2.0/token',{
        method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({client_id:env.OUTLOOK_CLIENT_ID,client_secret:env.OUTLOOK_CLIENT_SECRET,grant_type:'refresh_token',refresh_token:connection.token.refreshToken,scope:'openid profile offline_access User.Read Mail.Send'}),
        signal:AbortSignal.timeout(15000),
      });
      if(!tokenResponse.ok)return res.status(409).json({error:'Outlook needs to be reconnected. Use Connect RSUK Outlook and try again.'});
      const refreshed=await safeJson(tokenResponse);
      const graphHeaders={Authorization:'Bearer '+refreshed.access_token};
      const meResponse=await fetchImpl('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName',{headers:graphHeaders,signal:AbortSignal.timeout(12000)});
      if(!meResponse.ok)return res.status(502).json({error:'Could not confirm the connected Outlook mailbox.'});
      const me=await safeJson(meResponse),sender=String(me.mail||me.userPrincipalName||'').toLowerCase();
      if(sender!==allowedSender)return res.status(403).json({error:'The connected Outlook account does not match the RSUK sender address.'});
      const sendResponse=await fetchImpl('https://graph.microsoft.com/v1.0/me/sendMail',{
        method:'POST',headers:{...graphHeaders,'Content-Type':'application/json'},
        body:JSON.stringify({message:{subject,body:{contentType:'Text',content:body},toRecipients:[{emailAddress:{address:contact.email,name:contact.name||undefined}}]},saveToSentItems:true}),
        signal:AbortSignal.timeout(20000),
      });
      if(!sendResponse.ok)return res.status(502).json({error:'Outlook did not accept this email. Check the connection and recipient, then retry.'});
      const details=JSON.stringify({campaign_id:campaignId,subject,sender:allowedSender,recipient:contact.email,sent_at:new Date().toISOString(),source:'Sales Hub'});
      try{await write('/rest/v1/activities','POST',{actor_id:user.id,company_id:contact.company_id,contact_id:contact.id,action:'outbound_email_sent',details});}
      catch{return res.status(200).json({sent:true,logged:false,error:'Outlook accepted the email, but the Sales Hub could not save its activity. Do not resend it.'});}
      let pipelineUpdated=true;
      if((pipelineState.stage||'Not contacted')==='Not contacted'){
        try{await write('/rest/v1/activities','POST',{actor_id:user.id,company_id:contact.company_id,contact_id:contact.id,action:'contact_pipeline',details:JSON.stringify({...pipelineState,stage:'Contacted',last_contact:new Date().toISOString().slice(0,10)})});}
        catch{pipelineUpdated=false;}
      }
      const refreshedToken={refreshToken:refreshed.refresh_token||connection.token.refreshToken};
      const updatedDetails={...connection.details,token:seal(refreshedToken,env),sender:allowedSender};
      try{await write('/rest/v1/activities?id=eq.'+encodeURIComponent(saved[0].id),'PATCH',{details:JSON.stringify(updatedDetails)});}catch{}
      return res.status(200).json({sent:true,recipient:contact.email,pipelineUpdated});
    }catch(error){
      const status=error.status||502;
      console.error('sales_outlook_failed',JSON.stringify({status,category:String(error.name||'Error').replace(/[^a-zA-Z]/g,'').slice(0,40)}));
      return res.status(status).json({error:status===401?'Sign in again.':status===403?'Active RSUK team membership required.':'The Outlook action failed safely. Please retry or reconnect the mailbox.'});
    }
  };
}

export default createOutlookHandler();
