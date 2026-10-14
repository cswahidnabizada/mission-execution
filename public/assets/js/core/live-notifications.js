const POLL_VISIBLE_MS=900000;
const POLL_HIDDEN_MS=900000;
let pollTimer=0,lastId=0,firstPoll=true,polling=false,audioUnlocked=false,lastSoundAt=0,currentIntelligence=null;
const originalTitle=document.title;

bootLiveNotifications();

function bootLiveNotifications(){
  mount();
  unlockAudioOnInteraction();
  document.addEventListener("visibilitychange",scheduleNow);
  window.addEventListener("onmission:network-state",e=>{if(e.detail?.online)scheduleNow();else setConnection(false);});
  window.addEventListener("onmission:intelligence",e=>{currentIntelligence=e.detail||null;});
  poll();
}

function mount(){
  if(!document.querySelector('link[href="/assets/css/notifications.css"]')){
    const link=document.createElement("link");link.rel="stylesheet";link.href="/assets/css/notifications.css";document.head.appendChild(link);
  }
  const root=document.createElement("div");root.className="live-notification-root";root.innerHTML=`
    <button id="liveBell" class="live-bell" type="button" title="Notifications" aria-label="Notifications">🔔<span id="liveCount" class="live-notification-count hidden">0</span></button>
    <section id="livePanel" class="live-panel hidden" aria-label="Notifications">
      <div class="live-panel-head"><div class="live-panel-title"><small>● LIVE</small><strong>Notifications</strong></div><div class="live-panel-actions"><button id="liveReadAll" type="button">READ ALL</button><button id="liveClose" class="icon-only" type="button">✕</button></div></div>
      <div id="liveList" class="live-list"><div class="live-empty">Loading…</div></div>
      <div class="live-panel-foot"><label class="live-sound"><input id="liveSound" type="checkbox"> 🔊 Sound</label><span id="liveOffline" class="live-offline-note hidden">OFFLINE</span><span>Secure live polling</span></div>
    </section>`;
  document.body.appendChild(root);
  const bell=root.querySelector("#liveBell");
  const bellMount=document.querySelector("#globalNotificationMount");
  if(bell&&bellMount)bellMount.appendChild(bell);
  const stack=document.createElement("div");stack.id="liveToastStack";stack.className="live-toast-stack";document.body.appendChild(stack);
  const sound=document.querySelector("#liveSound");sound.checked=localStorage.getItem("onmissionNotificationSound")!=="off";
  sound.onchange=()=>localStorage.setItem("onmissionNotificationSound",sound.checked?"on":"off");
  document.querySelector("#liveBell").onclick=togglePanel;
  document.querySelector("#liveClose").onclick=()=>document.querySelector("#livePanel").classList.add("hidden");
  document.querySelector("#liveReadAll").onclick=markAllRead;
  document.querySelector("#liveList").addEventListener("click",handleNotificationClick);
}

async function poll(){
  clearTimeout(pollTimer);
  if(polling)return;
  if(navigator.onLine===false){setConnection(false);schedule();return;}
  polling=true;
  try{
    const r=await fetch(`/api/notifications/live?after=${encodeURIComponent(lastId)}`,{credentials:"same-origin",headers:{"Accept":"application/json"}});
    if(r.status===401||r.status===403){stopPolling();return;}
    if(!r.ok)throw new Error("live poll failed");
    const d=await r.json();
    setConnection(true);updateUnread(Number(d.unread||0));
    window.dispatchEvent(new CustomEvent("onmission:heartbeat",{detail:{serverTime:d.serverTime}}));
    const incoming=d.notifications||[];
    if(incoming.length){
      const newLast=Number(d.lastId||incoming.at(-1)?.id||lastId);lastId=Math.max(lastId,newLast);
      if(!firstPoll){
        const surfaced=incoming.filter(n=>!isDuplicateOfFocus(n));
        surfaced.forEach(showToast);
        maybeSound(surfaced);
        window.dispatchEvent(new CustomEvent("onmission:live-notifications",{detail:{notifications:incoming,serverTime:d.serverTime}}));
      }
    }
    firstPoll=false;
  }catch{setConnection(false);}finally{polling=false;schedule();}
}

function schedule(){clearTimeout(pollTimer);pollTimer=setTimeout(poll,document.hidden?POLL_HIDDEN_MS:POLL_VISIBLE_MS);}
function scheduleNow(){clearTimeout(pollTimer);pollTimer=setTimeout(poll,250);}
function stopPolling(){clearTimeout(pollTimer);pollTimer=0;setConnection(false);}

async function togglePanel(){
  const panel=document.querySelector("#livePanel"),opening=panel.classList.contains("hidden");panel.classList.toggle("hidden");
  if(opening)await loadRecent();
}
async function loadRecent(){
  const list=document.querySelector("#liveList");
  try{
    const r=await fetch("/api/notifications",{credentials:"same-origin",headers:{"Accept":"application/json"}});if(!r.ok)throw new Error();const d=await r.json();updateUnread(Number(d.unread||0));renderList(d.notifications||[]);
  }catch{list.innerHTML='<div class="live-empty">Unable to load notifications.</div>';}
}
function renderList(items){
  const list=document.querySelector("#liveList");
  if(!items.length){list.innerHTML='<div class="live-empty">You are all caught up.</div>';return;}
  list.innerHTML=items.map(n=>`<a href="${escapeAttr(n.link||"#")}" class="live-item ${n.read_at?"":"unread"} ${n.priority==="high"?"high":""}" data-notification-id="${Number(n.id)}"><span class="live-item-top"><span class="live-item-title">${escapeHtml(n.title)}</span><span class="live-item-time">${relative(n.created_at)}</span></span><span class="live-item-body">${escapeHtml(n.body)}</span></a>`).join("");
}
async function handleNotificationClick(e){
  const item=e.target.closest("[data-notification-id]");if(!item)return;
  e.preventDefault();const id=Number(item.dataset.notificationId),href=item.getAttribute("href");
  try{await fetch(`/api/notifications/${id}/read`,{method:"PATCH",credentials:"same-origin"});}catch{}
  if(href&&href!=="#")location.href=href;else{item.classList.remove("unread");await loadRecent();}
}
async function markAllRead(){
  try{await fetch("/api/notifications/read-all",{method:"POST",credentials:"same-origin"});updateUnread(0);document.querySelectorAll(".live-item.unread").forEach(x=>x.classList.remove("unread"));}catch{}
}
function updateUnread(count){
  const el=document.querySelector("#liveCount");el.textContent=count>99?"99+":String(count);el.classList.toggle("hidden",count<=0);document.title=count>0?`(${count}) ${originalTitle}`:originalTitle;
}
function showToast(n){
  const stack=document.querySelector("#liveToastStack"),toast=document.createElement("div");toast.className=`live-toast ${n.priority==="high"?"high":""}`;toast.innerHTML=`<strong>${escapeHtml(n.title)}</strong><span>${escapeHtml(n.body)}</span>`;stack.appendChild(toast);while(stack.children.length>3)stack.firstElementChild.remove();setTimeout(()=>toast.remove(),5500);
}

function isDuplicateOfFocus(n){
  const focusMission=Number(currentIntelligence?.notification?.dedupeMissionId||currentIntelligence?.missionId||0);
  const notificationMission=Number(n?.mission_id||0);
  if(!focusMission||!notificationMission||focusMission!==notificationMission)return false;
  return Boolean(currentIntelligence?.notification?.suppressDuplicateToast);
}
function maybeSound(items){
  if(!items.some(n=>n.priority==="high"))return;if(localStorage.getItem("onmissionNotificationSound")==="off"||!audioUnlocked)return;if(Date.now()-lastSoundAt<1800)return;lastSoundAt=Date.now();playTone();
}
function unlockAudioOnInteraction(){
  const unlock=()=>{audioUnlocked=true;window.removeEventListener("pointerdown",unlock);window.removeEventListener("keydown",unlock);};window.addEventListener("pointerdown",unlock,{once:true});window.addEventListener("keydown",unlock,{once:true});
}
function playTone(){
  try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const ctx=new C(),gain=ctx.createGain();gain.gain.setValueAtTime(.0001,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.055,ctx.currentTime+.015);gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.28);gain.connect(ctx.destination);[0,.11].forEach((delay,i)=>{const o=ctx.createOscillator();o.type="sine";o.frequency.value=i?720:880;o.connect(gain);o.start(ctx.currentTime+delay);o.stop(ctx.currentTime+delay+.13);});setTimeout(()=>ctx.close(),500);}catch{}
}
function setConnection(ok){document.querySelector("#liveBell")?.classList.toggle("live",ok);document.querySelector("#liveOffline")?.classList.toggle("hidden",ok);}
function relative(value){const d=new Date(String(value||"").includes("T")?value:String(value||"").replace(" ","T")+"Z"),ms=Date.now()-d.getTime();if(!Number.isFinite(ms))return"";const min=Math.max(0,Math.floor(ms/60000));if(min<1)return"now";if(min<60)return`${min}m`;const h=Math.floor(min/60);if(h<24)return`${h}h`;return`${Math.floor(h/24)}d`;}
function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function escapeAttr(v){return escapeHtml(v);}
