export function showActionConfirm(label="Updated",icon="✓"){
  let layer=document.querySelector("#globalActionConfirm");
  if(!layer){
    layer=document.createElement("div");
    layer.id="globalActionConfirm";
    layer.className="action-confirm";
    layer.innerHTML='<div class="action-confirm-card"><div class="action-confirm-icon"></div><div class="action-confirm-label"></div></div>';
    document.body.appendChild(layer);
  }
  layer.querySelector(".action-confirm-icon").textContent=icon;
  layer.querySelector(".action-confirm-label").textContent=label;
  clearTimeout(layer._timer);
  layer.classList.remove("show");
  requestAnimationFrame(()=>requestAnimationFrame(()=>layer.classList.add("show")));
  layer._timer=setTimeout(()=>layer.classList.remove("show"),1050);
}

export function bindFreshOnReturn(loadFn){
  let hiddenAt=0;
  document.addEventListener("visibilitychange",()=>{
    if(document.hidden)hiddenAt=Date.now();
    else if(hiddenAt)loadFn();
  });
  window.addEventListener("pageshow",event=>{if(event.persisted)loadFn();});
}
