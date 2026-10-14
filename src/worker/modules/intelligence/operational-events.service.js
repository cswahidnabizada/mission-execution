import {missionTvCommandEvents} from "../../extensions/mission-tv-command/mission-tv-command.service.js";
import {operationalMissionHref} from "./operational-mission-route.js";
/**
 * Read-only operational event stream for Mission TV.
 * Derives events from authoritative D1 state; does not create notification records.
 * V7.6.2: each event has a trustworthy event timestamp and a permission-safe destination.
 */
export async function operationalEventsForSession(env,session,missions=[],limit=24){
  const events=[];
  events.push(...await missionTvCommandEvents(env,session,missions,12));
  const missionIds=[...new Set((missions||[]).map(m=>Number(m.id)).filter(Boolean))].slice(0,120);
  if(missionIds.length)events.push(...await missionEvents(env,session,missions,missionIds));
  if(session.role==='admin'||session.role==='executor')events.push(...await networkEvents(env,session));
  if(session.role==='admin'||session.role==='executor')events.push(...await forYouEvents(env,session));
  return dedupeEvents(events)
    .sort((a,b)=>Date.parse(b.at||0)-Date.parse(a.at||0))
    .slice(0,Math.max(1,Math.min(Number(limit)||24,50)));
}

async function missionEvents(env,session,missions,ids){
  const byId=new Map(missions.map(m=>[Number(m.id),m]));
  const q=ids.map(()=>'?').join(',');
  const out=[];
  try{
    const r=await env.DB.prepare(`SELECT h.mission_id,h.status,h.created_at FROM mission_status_history h WHERE h.mission_id IN (${q}) ORDER BY h.id DESC LIMIT 80`).bind(...ids).all();
    for(const row of r.results||[]){
      const m=byId.get(Number(row.mission_id));if(!m)continue;
      out.push(eventForMission(m,{kind:'flow',code:`status:${row.status}`,icon:statusIcon(row.status),label:statusSentence(m,row.status,session),at:row.created_at}));
    }
  }catch(err){logOperationalEventError("mission_status_history",err,session);}
  try{
    const r=await env.DB.prepare(`SELECT mm.mission_id,mm.sender_role,mm.message,mm.created_at FROM mission_messages mm WHERE mm.mission_id IN (${q}) ORDER BY mm.id DESC LIMIT 60`).bind(...ids).all();
    for(const row of r.results||[]){
      const m=byId.get(Number(row.mission_id));if(!m)continue;
      const text=String(row.message||'').trim();if(!text)continue;
      const assignment=assignmentEventFromSystemMessage(row,m,session);
      if(assignment){out.push(eventForMission(m,assignment));continue;}
      if(isStructuralSystemMessage(row.sender_role,text))continue;
      out.push(eventForMission(m,{kind:'message',code:'mission_message',icon:'💬',label:`${actorLabel(row.sender_role,m,session)}: ${short(text,105)}`,at:row.created_at,href:operationalMissionHref(m.id,{role:session.role,context:"chat"})}));
    }
  }catch(err){logOperationalEventError("mission_messages",err,session);}
  try{
    const r=await env.DB.prepare(`SELECT e.mission_id,e.exception_type,e.resolved_at,e.created_at,e.created_by_role,e.resolved_by_role FROM mission_exceptions e WHERE e.mission_id IN (${q}) AND e.status='resolved' AND e.resolved_at IS NOT NULL ORDER BY e.resolved_at DESC LIMIT 40`).bind(...ids).all();
    for(const row of r.results||[]){
      const m=byId.get(Number(row.mission_id));if(!m)continue;
      const label=exceptionResolvedLabel(row,m,session);
      out.push(eventForMission(m,{kind:'resolution',code:`exception_resolved:${row.exception_type}`,icon:'✓',label,at:row.resolved_at,href:operationalMissionHref(m.id,{role:session.role,context:"attention"})}));
    }
  }catch(err){logOperationalEventError("mission_resolutions",err,session);}
  return out;
}

async function networkEvents(env,session){
  const out=[];
  try{
    if(session.role==='admin'){
      const incoming=await env.DB.prepare(`SELECT ni.id,ni.mission_id,ni.status,ni.created_at,ni.responded_at,ni.updated_at,ni.recipient_type,m.reference,m.status AS mission_status,m.state_version AS mission_state_version,m.pickup_address,m.pickup_street,m.pickup_zip_code,m.pickup_city,m.delivery_address,m.delivery_street,m.delivery_zip_code,m.delivery_city,m.pickup_company,m.delivery_company,m.object_type,m.object_description,m.weight_kg,m.volume_m3,m.pallet_count,m.vehicle_requirement,m.loading_type,m.unloading_type,m.matching_notes,c.name owner_company_name,
        cc.id AS custody_case_id
      FROM network_mission_invitations ni
      JOIN mission_canonical_projection m ON m.id=ni.mission_id AND m.company_id=ni.owner_company_id
      JOIN companies c ON c.id=ni.owner_company_id
      LEFT JOIN mission_custody_cases cc ON cc.company_id=ni.owner_company_id AND cc.mission_id=ni.mission_id
        AND cc.transfer_channel='network' AND cc.status='ready_to_transfer' AND cc.distribution_status='network_pending'
      WHERE ni.recipient_type='tenant' AND ni.recipient_company_id=? ORDER BY ni.updated_at DESC LIMIT 20`).bind(Number(session.tenantId)).all();
      for(const n of incoming.results||[])out.push(networkIncoming(n,session));
      const outgoing=await env.DB.prepare(`SELECT ni.id,ni.mission_id,ni.status,ni.created_at,ni.responded_at,ni.updated_at,m.reference,m.status AS mission_status,m.state_version AS mission_state_version,m.pickup_address,m.pickup_street,m.pickup_zip_code,m.pickup_city,m.delivery_address,m.delivery_street,m.delivery_zip_code,m.delivery_city,m.pickup_company,m.delivery_company,COALESCE(c.name,pei.display_name,'Network partner') partner_name FROM network_mission_invitations ni JOIN mission_canonical_projection m ON m.id=ni.mission_id AND m.company_id=ni.owner_company_id LEFT JOIN companies c ON c.id=ni.recipient_company_id LEFT JOIN public_executor_identities pei ON pei.id=ni.recipient_executor_id WHERE ni.owner_company_id=? ORDER BY ni.updated_at DESC LIMIT 20`).bind(Number(session.tenantId)).all();
      for(const n of outgoing.results||[]){
        if(n.status!=='Accepted'&&n.status!=='Rejected')continue;
        out.push(eventForMission(n,{kind:'network',code:`network_response:${n.status}`,icon:n.status==='Accepted'?'✓':'↩',label:`${n.partner_name} ${n.status.toLowerCase()} Mission ${n.reference}`,detail:n.status==='Accepted'?'Execution access is now active.':'The network invitation was declined.',at:n.responded_at||n.updated_at||n.created_at,missionId:Number(n.mission_id),reference:n.reference||'',href:operationalMissionHref(n.mission_id,{role:session.role}),actions:[{label:'CHECK',href:operationalMissionHref(n.mission_id,{role:session.role})}]}));
      }
    }else if(session.role==='executor'){
      const incoming=await env.DB.prepare(`SELECT ni.id,ni.mission_id,ni.status,ni.created_at,ni.responded_at,ni.updated_at,ni.recipient_type,m.reference,m.status AS mission_status,m.state_version AS mission_state_version,m.pickup_address,m.pickup_street,m.pickup_zip_code,m.pickup_city,m.delivery_address,m.delivery_street,m.delivery_zip_code,m.delivery_city,m.pickup_company,m.delivery_company,m.object_type,m.object_description,m.weight_kg,m.volume_m3,m.pallet_count,m.vehicle_requirement,m.loading_type,m.unloading_type,m.matching_notes,c.name owner_company_name,
        cc.id AS custody_case_id
      FROM network_mission_invitations ni
      JOIN mission_canonical_projection m ON m.id=ni.mission_id AND m.company_id=ni.owner_company_id
      JOIN companies c ON c.id=ni.owner_company_id
      LEFT JOIN mission_custody_cases cc ON cc.company_id=ni.owner_company_id AND cc.mission_id=ni.mission_id
        AND cc.transfer_channel='network' AND cc.status='ready_to_transfer' AND cc.distribution_status='network_pending'
      WHERE ni.recipient_type='executor' AND ni.recipient_executor_id=? ORDER BY ni.updated_at DESC LIMIT 20`).bind(Number(session.executorId)).all();
      for(const n of incoming.results||[])out.push(networkIncoming(n,session));
    }
  }catch(err){logOperationalEventError("network_events",err,session);}
  return out;
}
function networkIncoming(n,session){
  const pending=n.status==='Pending',accepted=n.status==='Accepted';
  const route=`${routePlace(n.pickup_address,n.pickup_company)} to ${routePlace(n.delivery_address,n.delivery_company)}`;
  const href=pending||!accepted?(n.recipient_type==='tenant'?`/app#work?mission=${Number(n.mission_id)}`:'/foryou'):(n.recipient_type==='tenant'?`/app#work?mission=${Number(n.mission_id)}`:operationalMissionHref(n.mission_id,{role:session.role}));
  return eventForMission(n,{
    kind:'network',code:`network_invitation:${n.status}`,icon:pending?'🤝':accepted?'✓':'↩',
    label:pending?`${n.owner_company_name} sent you a new mission from ${route}`:accepted?`You accepted Mission ${n.reference} from ${n.owner_company_name}`:`Mission ${n.reference} invitation was ${String(n.status).toLowerCase()}`,
    at:n.responded_at||n.updated_at||n.created_at,missionId:Number(n.mission_id),reference:n.reference||'',persistent:pending,detail:pending?'Trusted-network mission waiting for your decision.':'Network invitation updated.',href,
    actions:pending?(n.custody_case_id&&n.recipient_type==='tenant'?[
      {code:'open_custody_handoff',label:'CHOOSE DRIVER',kind:'navigate',href: n.recipient_type==='tenant'?`/app#work?mission=${Number(n.mission_id)}`:'/foryou'},
      {code:'dismiss',label:'NOT NOW',dismiss:true}
    ]:[
      {code:'accept_network_mission',label:n.custody_case_id?'ACCEPT HANDOFF':'ACCEPT',kind:'command',method:'POST',endpoint:`/api/network/invitations/${n.id}/accept`,confirm:n.custody_case_id?`Accept custody handoff for Mission ${n.reference}? You remain pending until you physically accept custody.`:`Accept Mission ${n.reference} from ${n.owner_company_name}?`},
      {code:'open_mission',label:'OPEN',href: n.recipient_type==='tenant'?`/app#work?mission=${Number(n.mission_id)}`:'/foryou'},
      {code:'dismiss',label:'NOT NOW',dismiss:true}
    ]):[{label:'OPEN',href}]
  });
}

async function forYouEvents(env,session){
  const out=[];
  try{
    if(session.role==='admin'){
      const owner=await env.DB.prepare(`SELECT r.id,r.mission_id,r.status,r.created_at,r.updated_at,m.reference,m.status AS mission_status,m.state_version AS mission_state_version,COALESCE(c.name,pei.display_name,r.requester_name,'Requester') requester_name FROM public_mission_requests r JOIN mission_canonical_projection m ON m.id=r.mission_id AND m.company_id=r.company_id LEFT JOIN companies c ON c.id=r.requester_company_id LEFT JOIN public_executor_identities pei ON pei.id=r.executor_id WHERE r.company_id=? ORDER BY COALESCE(r.updated_at,r.created_at) DESC LIMIT 20`).bind(Number(session.tenantId)).all();
      for(const r of owner.results||[]){
        const missionHref=`/app#work?mission=${r.mission_id}&request=${r.id}`;
        out.push(eventForMission(r,{kind:'foryou',code:`foryou_request:${r.status}`,icon:r.status==='Pending'?'🌐':'✓',label:r.status==='Pending'?`${r.requester_name} requested Mission ${r.reference}`:`ForYou request for Mission ${r.reference} was ${String(r.status).toLowerCase()}`,at:r.updated_at||r.created_at,missionId:Number(r.mission_id),reference:r.reference||'',persistent:r.status==='Pending',detail:r.status==='Pending'?'A ForYou request is waiting for review.':'ForYou request state changed.',href:missionHref,actions:[{label:r.status==='Pending'?'REVIEW':'CHECK',href:missionHref}]}));
      }
      const mine=await env.DB.prepare(`SELECT r.id,r.mission_id,r.status,r.created_at,r.updated_at,m.reference,m.status AS mission_status,m.state_version AS mission_state_version,m.pickup_address,m.pickup_street,m.pickup_zip_code,m.pickup_city,m.delivery_address,m.delivery_street,m.delivery_zip_code,m.delivery_city,m.pickup_company,m.delivery_company,m.pickup_at_utc,m.pickup_at_utc,c.name owner_name,sd.assignee_id shared_driver_id,d.name shared_driver_name FROM public_mission_requests r JOIN mission_canonical_projection m ON m.id=r.mission_id JOIN companies c ON c.id=r.company_id LEFT JOIN mission_active_assignment_projection sd ON sd.mission_id=m.id AND sd.company_id=m.company_id AND sd.assignee_company_id=r.requester_company_id LEFT JOIN drivers d ON d.id=sd.assignee_id AND d.company_id=r.requester_company_id WHERE r.requester_company_id=? ORDER BY COALESCE(r.updated_at,r.created_at) DESC LIMIT 20`).bind(Number(session.tenantId)).all();
      for(const r of mine.results||[])out.push(forYouRequesterEvent(r,'tenant'));
    }else if(session.role==='executor'){
      const mine=await env.DB.prepare(`SELECT r.id,r.mission_id,r.status,r.created_at,r.updated_at,m.reference,m.status AS mission_status,m.state_version AS mission_state_version,c.name owner_name FROM public_mission_requests r JOIN mission_canonical_projection m ON m.id=r.mission_id JOIN companies c ON c.id=r.company_id WHERE r.executor_id=? ORDER BY COALESCE(r.updated_at,r.created_at) DESC LIMIT 20`).bind(Number(session.executorId)).all();
      for(const r of mine.results||[])out.push(forYouRequesterEvent(r,'executor'));
    }
  }catch(err){logOperationalEventError("foryou_events",err,session);}
  return out;
}
function forYouRequesterEvent(r,requesterType){
  const approved=r.status==='Approved',pending=r.status==='Pending';
  const href=approved?(requesterType==='tenant'?`/app#work?mission=${Number(r.mission_id)}&request=${Number(r.id)}`:operationalMissionHref(r.mission_id,{role:requesterType})):(requesterType==='tenant'?`/marketplace?mission=${Number(r.mission_id)}`:'/foryou');
  if(approved&&requesterType==='tenant'){
    const assigned=Boolean(r.shared_driver_id),driver=String(r.shared_driver_name||'');
    const route=`${routePlace(r.pickup_address,r.pickup_company)} to ${routePlace(r.delivery_address,r.delivery_company)}`;
    return eventForMission(r,{
      kind:'foryou',code:assigned?'foryou_tenant:ApprovedAssigned':'foryou_tenant:ApprovedNeedsDriver',icon:assigned?'🚚':'✓',
      label:assigned?`${driver} is assigned to Mission ${r.reference}`:`You are responsible for Mission ${r.reference} from ${r.owner_name}`,
      detail:assigned?`${route}. Execution is assigned to your driver.`:`${route}. Assign one of your drivers to start execution.`,
      at:r.updated_at||r.created_at,missionId:Number(r.mission_id),reference:r.reference||'',persistent:!assigned,
      href,actions:assigned?[{label:'OPEN',href}]:[{label:'ASSIGN DRIVER',href:`${href}#assignment`},{label:'OPEN',href}]
    });
  }
  return eventForMission(r,{kind:'foryou',code:`foryou_${requesterType}:${r.status}`,icon:approved?'✓':pending?'🌐':'↩',label:approved?`${r.owner_name} accepted Mission ${r.reference}`:`ForYou request for Mission ${r.reference}: ${r.status}`,at:r.updated_at||r.created_at,missionId:Number(r.mission_id),reference:r.reference||'',persistent:pending,detail:approved?'Your ForYou request was accepted.':pending?'Your ForYou request is still being tracked.':'Your ForYou request was updated.',href,actions:[{label:approved?'CHECK':'OPEN',href}]});
}

function eventForMission(m,event){
  const missionId=Number(event.missionId||m.mission_id||m.id||0)||null;
  const reference=String(event.reference||m.reference||'');
  // For workflow/request rows, m.status is NOT the mission status. Only use the
  // explicit mission_status alias; ordinary mission objects may use m.status.
  const missionStatus=event.status||m.mission_status||(!m.mission_id?m.status:null)||null;
  const version=Number(event.stateVersion||m.mission_state_version||m.state_version||0);
  const stateToken=String(event.stateToken||"")|| (version>0?`v:${version}`:null);
  return {...event,missionId,reference,status:missionStatus,stateToken,persistent:Boolean(event.persistent),alert:Boolean(event.alert),href:event.href||missionHref(missionId)};
}
function missionHref(id,role){return operationalMissionHref(id,{role});}
function sessionRoleForNetwork(n){return n?.recipient_type==='tenant'?'admin':'executor';}
function statusSentence(m,status,session){const ref=m.reference||m.id;const who=session.role==='driver'||session.role==='executor'?`Your Mission ${ref}`:`Mission ${ref}`;const labels={Pending:'is ready for pickup',Arrived:'arrived at pickup',PickedUp:'was picked up',InTransit:'is in transit to delivery',Delivered:'arrived at delivery',Completed:'was completed'};return `${who} ${labels[status]||`changed to ${status}`}`;}
function statusIcon(s){return ({Pending:'○',Arrived:'◎',PickedUp:'↗',InTransit:'→',Delivered:'◎',Completed:'✓'})[s]||'•';}
function actorLabel(role,m,session){if(role==='system')return 'Mission';if(role==='admin')return m.company_name||'Dispatcher';if(role==='driver')return session.role==='driver'?'You':(m.shared_driver_name||m.driver_name||'Driver');if(role==='executor')return session.role==='executor'?'You':(m.executor_name||'Executor');return 'Mission';}
function routePlace(address,company){const raw=String(address||'').trim();if(raw){const parts=raw.split(',').map(x=>x.trim()).filter(Boolean);const last=parts[parts.length-1]||raw;return last.replace(/^\d{4,6}\s+/,'')||last;}return String(company||'location').trim()||'location';}
function exceptionResolvedLabel(row,m,session){
  const resolver=resolutionActor(row.resolved_by_role,m,session);
  const type=row.exception_type;
  if(type==='AddressProblem')return `${resolver} corrected the address problem on Mission ${m.reference||m.id}`;
  if(type==='ReceiverMissing')return `${resolver} resolved the missing receiver problem on Mission ${m.reference||m.id}`;
  if(type==='Damage')return `${resolver} resolved the damage report on Mission ${m.reference||m.id}`;
  if(type==='Traffic')return `${resolver} resolved the traffic report on Mission ${m.reference||m.id}`;
  if(type==='Waiting')return `${resolver} resolved the waiting problem on Mission ${m.reference||m.id}`;
  if(type==='LoadingDelay')return `${resolver} resolved the loading delay on Mission ${m.reference||m.id}`;
  if(type==='UnloadingDelay')return `${resolver} resolved the unloading delay on Mission ${m.reference||m.id}`;
  return `${resolver} resolved a reported problem on Mission ${m.reference||m.id}`;
}
function resolutionActor(role,m,session){
  if(role==='admin')return m.company_name||session.companyName||'The company';
  if(role==='driver')return session.role==='driver'?'You':(m.shared_driver_name||m.driver_name||'Driver');
  if(role==='executor')return session.role==='executor'?'You':(m.executor_name||'Executor');
  return 'The mission team';
}

function assignmentEventFromSystemMessage(row,m,session){
  if(row.sender_role!=='system')return null;
  const text=String(row.message||'').trim();
  const shared=text.match(/^(.+?) assigned driver (.+)$/i);
  const owned=text.match(/^Admin assigned mission to (.+)$/i);
  if(!shared&&!owned)return null;

  const driverName=String((shared?.[2]||owned?.[1]||m.shared_driver_name||m.driver_name||'Driver')).trim();
  const assigningCompany=String(shared?.[1]||m.company_name||m.owner_company_name||session.companyName||'The company').trim();
  const personal=session.role==='driver'||session.role==='executor';
  const pickupAt=m.pickup_at_utc||m.pickup_at||null;
  const pickupMs=parseUtcTime(pickupAt);
  const remainingMinutes=pickupMs===null?null:Math.ceil((pickupMs-Date.now())/60000);
  const route=`${routePlace(m.pickup_address,m.pickup_company)} to ${routePlace(m.delivery_address,m.delivery_company)}`;
  return {
    kind:'assignment',
    code:personal?'assignment_you':'assignment_driver',
    icon:'🚚',
    label:personal?`${assigningCompany} assigned you`:`${assigningCompany} assigned ${driverName} as driver for Mission ${m.reference||m.id}`,
    detail:personal?route:`Driver responsibility is now assigned.`,
    at:row.created_at||m.updated_at||m.created_at,
    href:operationalMissionHref(m.id,{role:session.role}),
    assignment:{personal,assigningCompany,driverName,route,pickupAt,remainingMinutes}
  };
}
function parseUtcTime(v){
  if(!v)return null;const raw=String(v).trim();
  const normalized=/Z$|[+-]\d\d:\d\d$/.test(raw)?raw:(raw.includes('T')?`${raw}Z`:`${raw.replace(' ','T')}Z`);
  const n=Date.parse(normalized);return Number.isFinite(n)?n:null;
}

function isStructuralSystemMessage(role,text){
  if(role!=='system')return false;
  return [
    'Mission invitation sent to a trusted network partner',
    'Trusted network partner accepted the mission invitation',
    'A logistics tenant was approved for shared mission access',
    'Independent executor approved for mission access',
    'Admin published mission to ForYou'
  ].some(x=>text===x||text.startsWith(x));
}

function logOperationalEventError(scope,err,session){
  // Optional TV event sources must fail open, but never silently. Keep the log
  // deliberately free of mission content, messages, addresses and user identity.
  try{console.error("[MissionTV operational-events]",{scope,role:String(session?.role||"unknown"),error:String(err?.message||err||"unknown").slice(0,240)});}catch{}
}

function dedupeEvents(events){
  const seen=new Set(),out=[];
  for(const e of events||[]){
    const key=`${e.kind||'event'}:${e.code||''}:${e.missionId||0}:${String(e.label||'').toLowerCase()}`;
    if(seen.has(key))continue;seen.add(key);out.push(e);
  }
  return out;
}
function short(v,n){const s=String(v||'');return s.length>n?s.slice(0,n-1)+'…':s;}
