export function localScheduleToUtc(date,time){
  if(!date||!time)return "";
  const d=new Date(`${date}T${time}:00`);
  return Number.isNaN(d.getTime())?"":d.toISOString();
}

export function localDateTimeToUtc(value){
  if(!value)return "";
  const d=new Date(value);
  return Number.isNaN(d.getTime())?"":d.toISOString();
}

export function utcToLocalTime(value){
  const d=parseUtc(value);
  if(!d)return "";
  return new Intl.DateTimeFormat(undefined,{hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(d);
}

export function utcToLocalDate(value){
  const d=parseUtc(value);
  if(!d)return "";
  const p=new Intl.DateTimeFormat("en-CA",{year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
  const get=t=>p.find(x=>x.type===t)?.value||"";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function utcToLocalDateTimeInput(value){
  const d=parseUtc(value);
  if(!d)return "";
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");
  const h=String(d.getHours()).padStart(2,"0"),min=String(d.getMinutes()).padStart(2,"0");
  return `${y}-${m}-${day}T${h}:${min}`;
}

export function formatLocalDateTime(value){
  const d=parseUtc(value);
  if(!d)return "";
  return new Intl.DateTimeFormat(undefined,{
    year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"
  }).format(d);
}

export function formatLocalScheduleTime(utcValue,legacy=""){
  return utcToLocalTime(utcValue)||legacy||"--:--";
}

export function deadlineCountdown(value,status=""){
  if(status==="Completed")return "Completed";
  const d=parseUtc(value);
  if(!d)return "";
  let ms=d.getTime()-Date.now();
  const overdue=ms<0;
  ms=Math.abs(ms);
  const totalMin=Math.floor(ms/60000);
  const days=Math.floor(totalMin/1440);
  const hours=Math.floor((totalMin%1440)/60);
  const mins=totalMin%60;
  const body=days?`${days}d ${hours}h`:hours?`${hours}h ${mins}m`:`${mins}m`;
  return overdue?`${body} overdue`:`${body} left`;
}

export function browserTimeZone(){
  return Intl.DateTimeFormat().resolvedOptions().timeZone||"local";
}

export function parseUtc(value){
  if(!value)return null;
  const d=new Date(value);
  return Number.isNaN(d.getTime())?null:d;
}
