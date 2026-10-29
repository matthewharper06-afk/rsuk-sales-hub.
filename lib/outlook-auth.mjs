import {createCipheriv,createDecipheriv,randomBytes,createHash} from 'node:crypto';

export const supabaseUrl='https://fcbvdolppevhouwdrjfu.supabase.co';
export const publicKey='sb_publishable_tftDnEvxuBcAG1JItM40yw_17WlvFcS';
export const allowedSender='matthew.harper@risescaffolding.co.uk';
export const redirectUri=(env=process.env)=>env.OUTLOOK_REDIRECT_URI||'https://rsuk-sales-hub.vercel.app/api/outlook-callback';

export function outlookConfigured(env=process.env){
  return Boolean(env.OUTLOOK_CLIENT_ID&&env.OUTLOOK_CLIENT_SECRET&&env.OUTLOOK_TENANT_ID&&env.OUTLOOK_TOKEN_ENCRYPTION_KEY);
}

function key(env=process.env){
  const raw=String(env.OUTLOOK_TOKEN_ENCRYPTION_KEY||'');
  let bytes;
  try{bytes=Buffer.from(raw,'base64');}catch{}
  if(!bytes||bytes.length!==32)bytes=Buffer.from(raw,'hex');
  if(bytes.length!==32)throw new Error('Outlook encryption key is unavailable.');
  return bytes;
}

export function seal(value,env=process.env){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(env),iv);
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join('.');
}

export function unseal(value,env=process.env){
  const [version,iv,tag,data]=String(value||'').split('.');
  if(version!=='v1'||!iv||!tag||!data)throw new Error('Stored Outlook connection is invalid.');
  const decipher=createDecipheriv('aes-256-gcm',key(env),Buffer.from(iv,'base64url'));
  decipher.setAuthTag(Buffer.from(tag,'base64url'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]).toString('utf8'));
}

export function bearer(req){
  return /^Bearer ([^\s]+)$/.exec(req.headers.authorization||'')?.[1]||'';
}

export function pkce(){
  const verifier=randomBytes(32).toString('base64url');
  return {verifier,challenge:createHash('sha256').update(verifier).digest('base64url')};
}
