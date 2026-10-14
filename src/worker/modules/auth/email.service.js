import {resolveExternalProviderGovernance} from '../../security/external-provider-governance.service.js';
export async function sendPasswordResetEmail(env,{to,resetUrl}){
  if(!env.RESEND_API_KEY||!env.PASSWORD_RESET_FROM_EMAIL){
    const e=new Error('PASSWORD_RECOVERY_EMAIL_NOT_CONFIGURED');e.status=503;throw e;
  }
  await resolveExternalProviderGovernance(env,{providerCode:'resend',purposeCode:'account_management',classification:'PERSONAL',dataFields:['recipient_email','message_type','verification_code_or_reset_link'],authorizationScope:'transactional_email',authorizationGranted:true,operation:'password_reset_email'});
  const response=await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{
      'Authorization':`Bearer ${env.RESEND_API_KEY}`,
      'Content-Type':'application/json',
      'User-Agent':'ONMission-Worker/1.0'
    },
    body:JSON.stringify({
      from:env.PASSWORD_RESET_FROM_EMAIL,
      to:[to],
      subject:'Reset your ON Mission password',
      html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h2>Reset your ON Mission password</h2><p>A password reset was requested for your account.</p><p><a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:12px 18px;background:#0f172a;color:#fff;text-decoration:none;border-radius:8px">Reset password</a></p><p>This link expires in 30 minutes. If you did not request this, you can ignore this email.</p></div>`,
      text:`Reset your ON Mission password: ${resetUrl}\nThis link expires in 30 minutes.`
    })
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const e=new Error(data?.message||'PASSWORD_RESET_EMAIL_FAILED');e.status=502;throw e;}
  return data;
}
function escapeHtml(v){return String(v||'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}


export async function sendVerificationCodeEmail(env,{to,code}){
  return sendTransactional(env,{
    to,
    subject:"Verify your ON Mission email",
    html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h2>Verify your email</h2><p>Your ON Mission verification code is:</p><div style="font-size:28px;font-weight:800;letter-spacing:6px;padding:14px;background:#f1f5f9;border-radius:10px;text-align:center">${escapeHtml(code)}</div><p>This code expires in 15 minutes.</p></div>`,
    text:`Your ON Mission verification code is ${code}. It expires in 15 minutes.`
  });
}

export async function sendTrustKeyEmail(env,{to,trustKey}){
  return sendTransactional(env,{
    to,
    subject:"Your ON Mission Trust Key",
    html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h2>ON Mission verification approved</h2><p>Your one-time Trust Key is:</p><div style="font-size:24px;font-weight:800;letter-spacing:3px;padding:14px;background:#ecfdf5;border:2px solid #10b981;border-radius:10px;text-align:center">${escapeHtml(trustKey)}</div><p>Sign in to ON Mission, open Account → Verification, and activate this key. Do not share it.</p></div>`,
    text:`Your ON Mission Trust Key is ${trustKey}. Activate it in Account → Verification. Do not share it.`
  });
}

async function sendTransactional(env,{to,subject,html,text}){
  if(!env.RESEND_API_KEY||!env.PASSWORD_RESET_FROM_EMAIL){
    const e=new Error("VERIFICATION_EMAIL_NOT_CONFIGURED");e.status=503;throw e;
  }
  await resolveExternalProviderGovernance(env,{providerCode:'resend',purposeCode:'account_management',classification:'PERSONAL',dataFields:['recipient_email','message_type','verification_code_or_reset_link'],authorizationScope:'transactional_email',authorizationGranted:true,operation:'transactional_email'});
  const response=await fetch("https://api.resend.com/emails",{
    method:"POST",
    headers:{
      Authorization:`Bearer ${env.RESEND_API_KEY}`,
      "Content-Type":"application/json",
      "User-Agent":"ONMission-Worker/1.0"
    },
    body:JSON.stringify({
      from:env.PASSWORD_RESET_FROM_EMAIL,
      to:[to],
      subject,html,text
    })
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const e=new Error(data?.message||"VERIFICATION_EMAIL_FAILED");e.status=502;throw e;}
  return data;
}

export async function sendOrganizationInvitationEmail(env,{to,organizationName,roleLabel,invitationUrl,expiresAt}){
  return sendTransactional(env,{
    to,
    subject:`You're invited to ${organizationName} on ON Mission`,
    html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h2>You're invited to ON Mission</h2><p><strong>${escapeHtml(organizationName)}</strong> invited you as <strong>${escapeHtml(roleLabel)}</strong>.</p><p><a href="${escapeHtml(invitationUrl)}" style="display:inline-block;padding:12px 18px;background:#0f172a;color:#fff;text-decoration:none;border-radius:8px">Accept invitation</a></p><p>This invitation expires ${escapeHtml(expiresAt)}. If you were not expecting it, you can ignore this message.</p></div>`,
    text:`You are invited to ${organizationName} on ON Mission as ${roleLabel}. Accept: ${invitationUrl}\nThis invitation expires ${expiresAt}.`
  });
}
