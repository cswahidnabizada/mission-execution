import {RELEASE_VERSION} from '../../core/release.js';
import {buildMissionContext} from "../../modules/intelligence/mission-context.js";
import {routeReadinessState} from "../mission-readiness/providers/route-readiness.provider.js";

/**
 * Marketplace Intelligence Exchange.
 * Read-only bridge between canonical mission truth and existing operational intelligence.
 * It never assigns, approves, transfers custody, or changes mission state.
 */
export function buildMarketplaceMissionIntelligence(mission,{drivers=[],networkExecutors=[],now=Date.now()}={}){
  const context=buildMissionContext(mission,{role:"admin",accessKind:"marketplace",now});
  const route=routeReadinessState(mission);
  const published=Boolean(context.distribution.publicEnabled);
  const eligible=published && route.state==="READY" && !context.execution.hasExecutor && ["Pending"].includes(context.lifecycle.status);
  const candidates=eligible?drivers.filter(d=>Number(d.active)===1).map(d=>scoreDriverFit(context,d,now)).filter(Boolean).sort((a,b)=>b.score-a.score||a.driverName.localeCompare(b.driverName)):[];
  const networkCandidates=eligible?networkExecutors.map(x=>scoreNetworkExecutorFit(context,x,now)).filter(Boolean).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)):[ ];
  const best=candidates.slice(0,3);
  const coordinated=[...best.map(x=>({...x,channel:"LOCAL"})),...networkCandidates.slice(0,3).map(x=>({...x,channel:"TRUSTED_NETWORK"}))].sort((a,b)=>b.score-a.score||String(a.name||a.driverName||"").localeCompare(String(b.name||b.driverName||"")));
  const top=coordinated[0]||null;
  const evidence=buildOpportunityEvidence({context,route,published,eligible,top,networkCandidates,drivers});
  const opportunity=buildOpportunityIntelligence({context,route,published,eligible,top,evidence});
  return Object.freeze({
    kind:"marketplace_intelligence",
    missionId:context.identity.missionId,
    route:{state:route.state,pickupCity:context.route.pickupCity,pickupZipCode:context.route.pickupZipCode,deliveryCity:context.route.deliveryCity,deliveryZipCode:context.route.deliveryZipCode},
    eligibility:{published,routeReady:route.state==="READY",eligible,reason:!published?"not_published":route.state!=="READY"?"route_incomplete":context.execution.hasExecutor?"execution_owner_active":!eligible?"lifecycle_not_available":null},
    recommendation:top?{available:true,channel:top.channel,driverId:top.driverId||null,executorId:top.executorId||null,name:top.name||top.driverName||"",driverName:top.driverName||"",score:top.score,band:band(top.score),routeSource:top.routeSource,reasons:top.reasons}: {available:false,channel:null,driverId:null,executorId:null,name:"",driverName:"",score:0,band:"none",routeSource:null,reasons:[]},
    economics:top?opportunityEconomics(top):{valueBand:"none",deadheadRisk:"unknown",timingQuality:"unknown",vehicleFit:"unknown",basis:[]},
    matches:coordinated.slice(0,6),
    rankedRecommendations:coordinated.slice(0,6),
    coordination:Object.freeze({available:networkCandidates.length>0,networkCandidateCount:networkCandidates.length,topNetworkCandidate:networkCandidates[0]||null,channels:[...new Set(coordinated.map(x=>x.channel))]}),
    signals:Object.freeze({routeAware:true,nextLocationAware:best.some(x=>x.routeSource==="next_mission"),vehicleAware:true,timeAware:true,networkAware:networkCandidates.length>0}),
    opportunity:Object.freeze(opportunity)
  });
}

export function buildMarketplaceExchange(missions=[],{drivers=[],networkExecutors=[],now=Date.now()}={}){
  const results=(missions||[]).map(m=>buildMarketplaceMissionIntelligence(m,{drivers,networkExecutors,now}));
  const recommendations=results.filter(x=>x.recommendation.available).sort((a,b)=>b.recommendation.score-a.recommendation.score||Number(b.economics?.valueBand==="high")-Number(a.economics?.valueBand==="high"));
  return Object.freeze({
    kind:"marketplace_intelligence_exchange",
    version:RELEASE_VERSION,
    economicsVersion:RELEASE_VERSION,
    coordinationVersion:RELEASE_VERSION,
    generatedAt:new Date(now).toISOString(),
    missionCount:results.length,
    routeReadyCount:results.filter(x=>x.route.state==="READY").length,
    recommendationCount:recommendations.length,
    networkOpportunityCount:results.filter(x=>x.coordination?.available).length,
    missions:results,
    topRecommendation:recommendations[0]||null
  });
}

function buildOpportunityEvidence({context,route,published,eligible,top,networkCandidates,drivers}){
  const items=[];
  const add=(code,type,value)=>items.push(Object.freeze({code,type,value}));
  add("published","fact",published);
  add("route_ready","derived",route.state==="READY");
  add("lifecycle_available","derived",eligible);
  if(context.route.pickupCity||context.route.pickupZipCode)add("pickup_location","fact",Boolean(context.route.pickupCity||context.route.pickupZipCode));
  if(context.route.deliveryCity||context.route.deliveryZipCode)add("delivery_location","fact",Boolean(context.route.deliveryCity||context.route.deliveryZipCode));
  if(context.schedule.pickupAt)add("pickup_time","fact",true);
  if(context.requirements.vehicle)add("vehicle_requirement","fact",true);
  if(top){
    add(top.routeSource==="next_mission"?"next_location_match":"current_location_match","derived",true);
    add("vehicle_fit","derived",top.reasons.some(x=>/Vehicle requirement fits/i.test(x)));
    add("availability","derived",top.reasons.some(x=>/operationally available/i.test(x)));
    add("timing_alignment","derived",top.reasons.some(x=>/Timing follows/i.test(x)));
  }
  if(networkCandidates.length)add("trusted_network_match","derived",true);
  const positive=items.filter(x=>x.value===true).length;
  const confidence=top&&positive>=6?"HIGH":top&&positive>=4?"MEDIUM":top&&positive>=2?"LOW":"UNSPECIFIED";
  return {items,positiveCount:positive,confidence,evidenceSufficient:Boolean(top&&positive>=4)};
}

function buildOpportunityIntelligence({context,route,published,eligible,top,evidence}){
  const actionable=Boolean(eligible&&top&&evidence.evidenceSufficient);
  const invalidators=[];
  if(!published)invalidators.push("publication_removed");
  if(route.state!=="READY")invalidators.push("route_no_longer_ready");
  if(context.execution.hasExecutor)invalidators.push("execution_owner_active");
  if(!top)invalidators.push("no_matching_capacity");
  return {
    state:actionable?"ACTIONABLE":eligible?top?"REVIEW":"NO_MATCH":"NOT_READY",
    actionable,
    confidence:evidence.confidence,
    evidenceCount:evidence.items.length,
    evidenceSufficient:evidence.evidenceSufficient,
    evidence:evidence.items,
    invalidators,
    recommendation:top?{channel:top.channel,name:top.name||top.driverName||"",score:top.score,band:top.band}:null,
    why:actionable?"A matching capacity candidate is supported by current marketplace evidence.":eligible?"The opportunity exists, but current evidence is not sufficient for an immediate recommendation.":"The opportunity is not currently ready for marketplace action.",
    readOnly:true,
    authoritative:false
  };
}

function scoreDriverFit(context,driver,now){
  const pickupCity=norm(context.route.pickupCity),pickupZip=norm(context.route.pickupZipCode);
  const current=norm(driver.current_location||"");
  const activeCity=norm(driver.next_location_city||"");
  const activeZip=norm(driver.next_location_zip||"");
  const currentMatch=Boolean(pickupZip&&current.includes(pickupZip))||Boolean(pickupCity&&current.includes(pickupCity));
  const nextMatch=Boolean(pickupZip&&activeZip&&pickupZip===activeZip)||Boolean(pickupCity&&activeCity&&pickupCity===activeCity);
  if(!currentMatch&&!nextMatch)return null;

  let score=nextMatch?50:40;
  const reasons=[nextMatch?"Next mission ends near pickup":"Current location is near pickup"];
  const required=norm(context.requirements.vehicle);
  const vehicle=norm(driver.vehicle_type||driver.vehicle_types||"");
  if(required){
    const reqTokens=[...terms(required)],vehTokens=terms(vehicle);
    if(reqTokens.some(t=>vehTokens.has(t))){score+=25;reasons.push("Vehicle requirement fits");}
    else if(vehicle)score+=0;
  }else{score+=10;reasons.push("Vehicle requirement is flexible");}

  const pickupAt=context.schedule.pickupAt;
  const nextDeliveryAt=parseTime(driver.next_location_at);
  if(pickupAt&&nextDeliveryAt){
    if(pickupAt>=nextDeliveryAt){score+=15;reasons.push("Timing follows current mission");}
    else score-=20;
  }else score+=5;

  if(driver.situation&&["Unavailable","Break"].includes(String(driver.situation)))return null;
  score+=10;
  reasons.push("Driver is operationally available");
  return {driverId:Number(driver.id),driverName:String(driver.name||"Driver"),score:Math.max(0,Math.min(100,score)),band:band(score),routeSource:nextMatch?"next_mission":"current_location",reasons};
}

function scoreNetworkExecutorFit(context,executor,now){
  const pickupCity=norm(context.route.pickupCity),pickupZip=norm(context.route.pickupZipCode);
  const cities=norm(executor.working_cities||"");
  const zips=norm(executor.working_zip_codes||"");
  const cityMatch=Boolean(pickupCity&&cities&&cities.includes(pickupCity));
  const zipMatch=Boolean(pickupZip&&zips&&zips.includes(pickupZip));
  if(!cityMatch&&!zipMatch)return null;
  let score=zipMatch?52:42;
  const reasons=[zipMatch?"Trusted executor covers pickup ZIP":"Trusted executor covers pickup city"];
  const required=norm(context.requirements.vehicle),vehicles=norm(executor.vehicle_types||"");
  if(required){
    if([...terms(required)].some(t=>terms(vehicles).has(t))){score+=25;reasons.push("Vehicle requirement fits");}
  }else{score+=8;reasons.push("Vehicle requirement is flexible");}
  if(executor.status==="trusted")score+=10;
  return {executorId:Number(executor.executor_id),name:String(executor.display_name||executor.registered_company_name||"Trusted executor"),score:Math.max(0,Math.min(100,score)),band:band(score),routeSource:"trusted_network",reasons};
}

function opportunityEconomics(match){
  const deadheadRisk=match.routeSource==="next_mission"?"low":"medium";
  const timingQuality=match.reasons.some(x=>/Timing follows/i.test(x))?"strong":match.reasons.some(x=>/Timing/i.test(x))?"weak":"unknown";
  const vehicleFit=match.reasons.some(x=>/Vehicle requirement fits/i.test(x))?"fit":"unknown";
  const valueBand=match.score>=85&&deadheadRisk==="low"?"high":match.score>=65?"good":"possible";
  return {valueBand,deadheadRisk,timingQuality,vehicleFit,basis:[...match.reasons].slice(0,4)};
}
function band(score){return score>=80?"strong":score>=60?"good":score>0?"possible":"none";}
function norm(v){return String(v??"").trim().toLowerCase().replace(/[.,]/g," ").replace(/\s+/g," ");}
function terms(v){return new Set(v.split(/\s+/).filter(x=>x.length>=3));}
function parseTime(v){if(!v)return null;const n=Date.parse(String(v).includes("T")?String(v).endsWith("Z")?String(v):`${v}Z`:`${String(v).replace(" ","T")}Z`);return Number.isFinite(n)?n:null;}
