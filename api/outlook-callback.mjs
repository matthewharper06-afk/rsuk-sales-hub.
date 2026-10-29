import {allowedSender,outlookConfigured,publicKey,redirectUri,supabaseUrl,unseal,seal} from '../lib/outlook-auth.mjs';

const safeJson=async r=>{try{return await r.json();}catch{return {};}}
export const config={maxDuration:30};

export function createOutlookCallback({fetchImpl=fetch,env=process.env}={}){
  return async function handler(req,res){
    res.setHeader('Cache-Control','no-store');
    const fail=()=>res.redirect(303,(env.RSUK_SALES_HUB_URL||'https://rsuk-sales-hub.vercel.app')+'/?outlook=error');
    try{
      if(req.method!=='GET'||!outlookConfigured(env)||req.query?.error||!req.query?.code||!req.query?.state)return fail();
      const state=unseal(req.query.state,env);
      if(!state?.userId||!state?.supabaseToken||!state?.verifier||state.exp<Date.now())return fail();
      const tokenResponse=await fetchImpl('https://login.microsoftonline.com/'+encodeURIComponent(env.OUTLOOK_TENANT_ID)+'/oauth2/v2.0/token',{
        method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({client_id:env.OUTLOOK_CLIENT_ID,client_secret:env.OUTLOOK_CLIENT_SECRET,grant_type:'authorization_code',code:String(req.query.code),redirect_uri:redirectUri(env),code_verifier:state.verifier,scope:'openid profile offline_access User.Read Mail.Send'}),
        signal:AbortSignal.timeout(15000),
      });
      if(!tokenResponse.ok)return fail();
      const tokens=await safeJson(tokenResponse);
      if(!tokens.refresh_token||!tokens.access_token)return fail();
      const meResponse=await fetchImpl('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName',{headers:{Authorization:'Bearer '+tokens.access_token},signal:AbortSignal.timeout(12000)});
      if(!meResponse.ok)return fail();
      const me=await safeJson(meResponse),sender=String(me.mail||me.userPrincipalName||'').toLowerCase();
      if(sender!==allowedSender)return res.redirect(303,(env.RSUK_SALES_HUB_URL||'https://rsuk-sales-hub.vercel.app')+'/?outlook=wrong-account');
      const authHeaders={apikey:publicKey,Authorization:'Bearer '+state.supabaseToken,'Content-Type':'application/json',Prefer:'return=minimal'};
      const memberResponse=await fetchImpl(supabaseUrl+'/rest/v1/team_members?select=active&user_id=eq.'+encodeURIComponent(state.userId),{headers:authHeaders,signal:AbortSignal.timeout(12000)});
      const members=memberResponse.ok?await safeJson(memberResponse):[];
      if(!members.some(x=>x.active))return fail();
      const url=supabaseUrl+'/rest/v1/activities?select=id&actor_id=eq.'+encodeURIComponent(state.userId)+'&action=eq.sales_outlook_connection&order=created_at.desc&limit=1';
      const existingResponse=await fetchImpl(url,{headers:authHeaders,signal:AbortSignal.timeout(12000)});
      const existing=existingResponse.ok?await safeJson(existingResponse):[];
      const details=JSON.stringify({sender,token:seal({refreshToken:tokens.refresh_token},env),connected_at:new Date().toISOString(),scopes:'Mail.Send'});
      const saveUrl=existing[0]?supabaseUrl+'/rest/v1/activities?id=eq.'+encodeURIComponent(existing[0].id):supabaseUrl+'/rest/v1/activities';
      const saveResponse=await fetchImpl(saveUrl,{method:existing[0]?'PATCH':'POST',headers:authHeaders,body:JSON.stringify(existing[0]?{details}:{actor_id:state.userId,action:'sales_outlook_connection',details}),signal:AbortSignal.timeout(12000)});
      if(!saveResponse.ok)return fail();
      return res.redirect(303,(env.RSUK_SALES_HUB_URL||'https://rsuk-sales-hub.vercel.app')+'/?outlook=connected');
    }catch{return fail();}
  };
}

export default createOutlookCallback();
