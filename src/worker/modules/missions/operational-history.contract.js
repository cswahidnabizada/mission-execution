import {isLifecycleTerminal} from "../../domains/logistics/logistics-lifecycle.contract.js";
/**
 * ON Mission 9.1.6 — Unified Operational History Contract
 *
 * Read-only presentation adapter over already-authorized historical sources.
 * It does not query storage, authorize access, mutate records, or redefine
 * canonical mission truth. Completed/cancelled history, events, exceptions,
 * messages, files, and delivery proof remain sourced from existing services.
 */


export const OPERATIONAL_HISTORY_CONTRACT_VERSION="1.0";

export function buildOperationalHistoryContract({
  mission=null,
  statusHistory=[],
  eventHistory=[],
  exceptions=[],
  messages=[],
  files=[],
  proof=null
}={}){
  const missionId=Number(mission?.id||mission?.missionId||0)||null;
  const status=String(mission?.status||"");
  const terminal=isLifecycleTerminal(status);
  const timeline=buildTimeline({statusHistory,eventHistory});
  const evidence=buildEvidence({files,proof});
  const responsibility=buildResponsibility({statusHistory,eventHistory,mission});

  return Object.freeze({
    version:OPERATIONAL_HISTORY_CONTRACT_VERSION,
    missionId,
    state:terminal?"CLOSED":"ACTIVE_RECORD",
    terminal,
    status:status||null,
    timeline,
    responsibility,
    exceptions:normalizeExceptions(exceptions),
    collaboration:normalizeMessages(messages),
    evidence,
    summary:Object.freeze({
      timelineCount:timeline.length,
      statusChangeCount:Array.isArray(statusHistory)?statusHistory.length:0,
      eventCount:Array.isArray(eventHistory)?eventHistory.length:0,
      exceptionCount:Array.isArray(exceptions)?exceptions.length:0,
      messageCount:Array.isArray(messages)?messages.length:0,
      fileCount:Array.isArray(files)?files.length:0,
      deliveryProofRecorded:Boolean(proof)
    }),
    readOnly:true,
    authoritative:false,
    tenantScoped:true
  });
}

export function validateOperationalHistoryContract(contract){
  const problems=[];
  if(!contract?.missionId)problems.push("mission_id_missing");
  if(!contract?.readOnly)problems.push("history_not_read_only");
  if(contract?.authoritative)problems.push("history_claims_authority");
  if(!contract?.tenantScoped)problems.push("history_not_tenant_scoped");
  if(contract?.terminal&&contract?.state!=="CLOSED")problems.push("terminal_history_not_closed");
  return problems;
}

function buildTimeline({statusHistory,eventHistory}){
  const values=[];
  for(const x of statusHistory||[])values.push({kind:"status",at:dateOrNull(x.created_at||x.occurred_at||x.at),status:String(x.status||""),actor:String(x.actor_role||x.role||x.created_by_role||""),source:"status_history"});
  for(const x of eventHistory||[])values.push({kind:"event",at:dateOrNull(x.created_at||x.occurred_at||x.at),status:String(x.to_status||x.status||""),actor:String(x.actor_role||x.role||x.created_by_role||""),action:String(x.action_code||x.action||x.event_type||""),outcome:String(x.outcome||""),source:"event_ledger"});
  values.sort((a,b)=>Date.parse(b.at||0)-Date.parse(a.at||0));
  const seen=new Set(),out=[];
  for(const x of values){const key=JSON.stringify([x.kind,x.at,x.status,x.actor,x.action,x.outcome]);if(seen.has(key))continue;seen.add(key);out.push(Object.freeze(x));if(out.length>=160)break;}
  return Object.freeze(out);
}

function buildResponsibility({statusHistory,eventHistory,mission}){
  const actors=[];
  const seed=mission?.driver_name||mission?.executor_name;
  if(seed)actors.push({name:String(seed),source:"mission"});
  for(const x of [...(statusHistory||[]),...(eventHistory||[])]){
    const name=x.actor_name||x.actor||x.created_by_name;
    const role=x.actor_role||x.role||x.created_by_role;
    if(name||role)actors.push({name:String(name||""),role:String(role||""),source:"history"});
  }
  const seen=new Set(),out=[];
  for(const x of actors){const key=JSON.stringify(x);if(seen.has(key))continue;seen.add(key);out.push(Object.freeze(x));if(out.length>=32)break;}
  return Object.freeze(out);
}

function buildEvidence({files,proof}){
  const items=(files||[]).map(x=>Object.freeze({kind:"file",id:Number(x.id||0)||null,name:String(x.original_name||x.name||`File ${Number(x.id||0)||""}`),at:dateOrNull(x.created_at||x.uploaded_at),actor:String(x.uploaded_by_role||x.uploaded_by_name||""),source:"mission_file"}));
  if(proof)items.unshift(Object.freeze({kind:"delivery_proof",id:Number(proof.file_id||0)||null,name:String(proof.file_name||"Delivery proof"),at:dateOrNull(proof.created_at||proof.recorded_at),actor:String(proof.recorded_by_role||proof.recorded_by_name||""),source:"delivery_proof"}));
  return Object.freeze(items.slice(0,80));
}

function normalizeExceptions(values){return Object.freeze((values||[]).slice(0,80).map(x=>Object.freeze({id:Number(x.id||0)||null,type:String(x.exception_type||x.type||"Exception"),status:String(x.status||""),at:dateOrNull(x.created_at||x.occurred_at),resolvedAt:dateOrNull(x.resolved_at),note:String(x.note||x.message||"")})));}
function normalizeMessages(values){return Object.freeze((values||[]).slice(0,120).map(x=>Object.freeze({id:Number(x.id||0)||null,at:dateOrNull(x.created_at||x.at),actor:String(x.sender_name||x.sender_role||x.created_by_role||""),message:String(x.message||"")})));}
function dateOrNull(v){return v?String(v):null;}
