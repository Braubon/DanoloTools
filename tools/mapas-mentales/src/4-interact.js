
/* =====================================================================
   Historial (deshacer / rehacer)
   ===================================================================== */
const H={stack:[],i:-1};
const btnUndo=$('#btn-undo'),btnRedo=$('#btn-redo');
function updUndo(){btnUndo.disabled=H.i<=0;btnRedo.disabled=H.i>=H.stack.length-1}
function resetHistory(){H.stack=[JSON.stringify(serialize(map,true))];H.i=0;updUndo()}
function commit(opts={}){
  if(!map)return;
  const s=JSON.stringify(serialize(map,true));
  if(H.stack[H.i]===s)return;
  H.stack.length=H.i+1;H.stack.push(s);
  if(H.stack.length>200)H.stack.shift();
  H.i=H.stack.length-1;
  map.updated=Date.now();updUndo();
  if(!opts.noSave)scheduleSave();
  refreshTagPanel();
}
function restore(s){
  const o=JSON.parse(s);
  map.name=o.name;map.nodes=o.nodes;map.edges=o.edges;map.tags=o.tags;map.settings=o.settings;
  reindex();
  for(const id of [...S.sel])if(!byId.has(id))S.sel.delete(id);
  if(S.edge&&!map.edges.some(e=>e.id===S.edge))S.edge=null;
  for(const t of [...S.filter])if(!tagById(t))S.filter.delete(t);
  S.tagVer++;for(const el of els.values())el._sig=null;
  map.updated=Date.now();
  closePop();render();updUndo();scheduleSave();updateTitle();refreshTagPanel();updateFilterChip();
}
function undo(){if(S.editing)finishEdit();if(H.i<=0)return;H.i--;restore(H.stack[H.i]);toast('Deshecho',{ms:1200})}
function redo(){if(S.editing)finishEdit();if(H.i>=H.stack.length-1)return;H.i++;restore(H.stack[H.i]);toast('Rehecho',{ms:1200})}

/* =====================================================================
   Guardado
   ===================================================================== */
let saveT=null,quotaWarned=false;
const saveStateEl=$('#savestate');
function scheduleSave(){clearTimeout(saveT);saveT=setTimeout(saveNow,350);setSaveState('Guardando…')}
function saveNow(){
  clearTimeout(saveT);saveT=null;if(!map)return;
  const ok=Store.save(map);
  if(!ok&&!quotaWarned){quotaWarned=true;toast('No se pudo guardar en el navegador (almacenamiento lleno o bloqueado). Exporta el JSON para no perder cambios.',{ms:8000})}
  Cloud.queue(map.id);
  setSaveState();
  if(!$('#drawer').hidden)renderMapList();
}
function setSaveState(txt){
  saveStateEl.textContent=txt||(Cloud.status==='ok'?'Guardado y sincronizado':Store.persistent?'Guardado en este navegador':'Sin guardado local: exporta el JSON');
}
addEventListener('pagehide',()=>{saveNow();Cloud.flushAll()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){if(saveT)saveNow();Cloud.flushAll()}});

/* =====================================================================
   Sincronización con la cuenta (si la página se abre en Claude)
   ===================================================================== */
const Cloud={
  col:null,status:'local',pend:new Map(),busy:new Set(),ready:false,warnedBig:false,
  async init(){
    if(!(window.claude&&typeof window.claude.use==='function'))return;
    let db,user;
    try{[db,user]=await Promise.all([window.claude.use('db'),window.claude.use('user')])}catch{return}
    if(!db||!user)return;
    let id=null;try{id=await user.id()}catch{}
    if(!id)return;
    try{this.col=db.collection('data/users/'+id)}catch{return}
    this.setStatus('sync');
    const timer=setTimeout(()=>{if(!this.ready)this.setStatus('offline')},10000);
    this.col.onSnapshot(snap=>{if(!snap.metadata.fromCache)clearTimeout(timer);this.apply(snap)},
      ()=>{clearTimeout(timer);this.setStatus('error')});
  },
  setStatus(s){
    this.status=s;
    const txt={local:'Guardado en este navegador',sync:'Conectando con tu cuenta…',ok:'Sincronizado con tu cuenta: tus mapas aparecen en todos tus dispositivos',
      offline:'Sin conexión con tu cuenta; se guarda en este navegador',error:'La sincronización falló; se guarda en este navegador'}[s];
    $('#syncinfo').textContent=txt;$('#syncdot').className='syncdot '+s;
    setSaveState();
  },
  apply(snap){
    const remote=new Set();let cur=null;
    const tombs=Store.tombs();
    for(const d of snap.docs){
      remote.add(d.id);
      const v=d.data()||{},ru=num(v.updated,0),meta=Store.meta(d.id);
      if(v.deleted){if(meta&&meta.updated<=ru){Store.remove(d.id,false);if(map&&map.id===d.id)cur='deleted'}continue}
      if(tombs[d.id]&&tombs[d.id]>=ru){this.queue(d.id,0);continue}
      if(!meta||ru>meta.updated){
        try{const m=normalizeMap(JSON.parse(v.json),true);m.id=d.id;m.updated=ru;if(meta&&meta.updated)m.view=(Store.load(d.id)||{}).view||m.view;Store.save(m);if(map&&map.id===d.id)cur='changed'}catch{}
      }else if(meta.updated>ru)this.queue(d.id);
    }
    if(!snap.metadata.fromCache&&!this.ready){
      this.ready=true;
      for(const m of Store.index())if(!remote.has(m.id))this.queue(m.id,300);
      for(const id of Object.keys(tombs))if(!remote.has(id))Store.clearTomb(id);
      this.setStatus('ok');
    }else if(!snap.metadata.fromCache&&this.status!=='ok')this.setStatus('ok');
    if(cur==='deleted'){openMostRecent()}
    else if(cur==='changed'){if(G||S.editing||S.anim)S.pendingReload=true;else reloadCurrent()}
    if(!$('#drawer').hidden)renderMapList();
  },
  queue(id,delay=1500){
    if(!this.col)return;
    clearTimeout(this.pend.get(id));
    this.pend.set(id,setTimeout(()=>{this.pend.delete(id);this.flush(id)},delay));
  },
  flushAll(){if(!this.col)return;for(const [id,t] of this.pend){clearTimeout(t);this.pend.delete(id);this.flush(id)}},
  async flush(id){
    if(!this.col)return;
    if(this.busy.has(id)){this.queue(id,800);return}
    this.busy.add(id);
    try{
      const ref=this.col.doc(id),m=Store.load(id);
      if(!m){const t=Store.tombs()[id];await ref.set({deleted:true,updated:t||Date.now()});Store.clearTomb(id)}
      else{
        const json=JSON.stringify(m);
        if(json.length>240000){if(!this.warnedBig){this.warnedBig=true;toast('Este mapa es demasiado grande para sincronizarse; se guarda solo en este navegador.',{ms:7000})}}
        else await ref.set({name:m.name,updated:m.updated,json});
      }
      if(this.ready&&this.status!=='ok')this.setStatus('ok');
    }catch(e){
      if(e&&e.code==='unavailable'){this.queue(id,4000)}
      else if(e&&e.code==='quota_exceeded'){this.setStatus('error');toast('Tu espacio de sincronización está lleno; se guarda solo en este navegador.',{ms:7000})}
      else this.setStatus('error');
    }finally{this.busy.delete(id)}
  }
};
function reloadCurrent(){
  S.pendingReload=false;if(!map)return;
  const v={...S.view},sel=new Set(S.sel);
  if(openMap(map.id,{keep:true})){S.view=v;applyView();for(const id of sel)if(byId.has(id))S.sel.add(id);updateClasses()}
}
function maybePendingReload(){if(S.pendingReload&&!G&&!S.editing&&!S.anim)reloadCurrent()}

/* =====================================================================
   Edición de texto
   ===================================================================== */
function startEdit(id,selectAll=true){
  const n=byId.get(id),el=els.get(id);if(!n||!el)return;
  if(S.editing&&S.editing!==id)finishEdit();
  closePop();
  S.editing=id;S.sel=new Set([id]);S.edge=null;
  const tx=el.querySelector('.ntext');
  try{tx.contentEditable='plaintext-only'}catch{}
  if(tx.contentEditable!=='plaintext-only')tx.contentEditable='true';
  tx.spellcheck=true;
  updateClasses();renderEdges();
  tx.focus({preventScroll:true});
  const r=document.createRange();r.selectNodeContents(tx);if(!selectAll)r.collapse(false);
  const sl=getSelection();sl.removeAllRanges();sl.addRange(r);
  ensureVisible(n);
}
function finishEdit(){
  const id=S.editing;if(!id)return;
  S.editing=null;
  const n=byId.get(id),el=els.get(id);
  if(el){
    const tx=el.querySelector('.ntext');
    const txt=tx.innerText.replace(/ /g,' ').replace(/\n+$/,'');
    tx.removeAttribute('contenteditable');
    try{getSelection().removeAllRanges()}catch{}
    if(n&&txt!==n.text){n.text=txt;el._sig=null;render();commit()}
    else{if(n)tx.textContent=n.text;render()}
  }
  maybePendingReload();
}
function onEditKey(e){
  if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();e.stopPropagation();finishEdit();return}
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();finishEdit();return}
  if(e.key==='Tab'){e.preventDefault();e.stopPropagation();const id=S.editing;finishEdit();if(id)(e.shiftKey?addSibling:addChild)(id);return}
  e.stopPropagation();
}
function onEditInput(){
  const id=S.editing;if(!id)return;const n=byId.get(id),el=els.get(id);
  if(n&&el){n._w=el.offsetWidth;n._h=el.offsetHeight;renderEdges()}
}
function onEditPaste(e){
  e.preventDefault();
  const t=(e.clipboardData||window.clipboardData).getData('text/plain');
  document.execCommand('insertText',false,t);
}

/* =====================================================================
   Acciones sobre cuadros
   ===================================================================== */
function freeSpot(n){
  const others=new Set(map.nodes.filter(x=>x.id!==n.id).map(x=>x.id));
  const res=resolveOverlaps(id=>others.has(id));
  const p=res.get(n.id);if(p){n.x=p.x;n.y=p.y}
}
function createNodeAt(w,o={}){
  const n=addNode({x:w.x-75,y:w.y-35,...o});
  render();
  n.x=w.x-n._w/2;n.y=w.y-n._h/2;
  if(P.grid){n.x=Math.round(n.x/GRID)*GRID;n.y=Math.round(n.y/GRID)*GRID}
  return n;
}
function addChild(pid){
  const p=byId.get(pid);if(!p)return;
  if(p.collapsed)p.collapsed=false;
  render();
  const kids=childIds(pid).map(i=>byId.get(i)).filter(shown);
  let x,y;
  if(kids.length){const last=kids.reduce((a,b)=>a.y+a._h>b.y+b._h?a:b);x=last.x;y=last.y+last._h+20}
  else{x=p.x+p._w+80;y=p.y+p._h/2-30}
  const n=addNode({x,y,color:p.color});addEdge(pid,n.id);
  render();if(!kids.length)n.y=p.y+p._h/2-n._h/2;
  if(P.repel)freeSpot(n);
  S.sel=new Set([n.id]);render();commit();startEdit(n.id);
}
function addSibling(id){
  const pid=parentId(id);if(!pid)return addChild(id);
  const s=byId.get(id);
  const n=addNode({x:s.x,y:s.y+s._h+20,color:s.color});addEdge(pid,n.id);
  render();if(P.repel)freeSpot(n);
  S.sel=new Set([n.id]);render();commit();startEdit(n.id);
}
function deleteSelection(){
  if(S.edge){map.edges=map.edges.filter(e=>e.id!==S.edge);S.edge=null;closePop();render();commit();toast('Línea eliminada',{action:'Deshacer',fn:undo});return}
  const ids=[...S.sel].filter(id=>byId.has(id));if(!ids.length)return;
  deleteNodes(ids);closePop();render();commit();
  toast(ids.length>1?`${ids.length} cuadros eliminados`:'Cuadro eliminado',{action:'Deshacer',fn:undo});
}
function duplicateSel(){
  const ids=[...S.sel].filter(id=>byId.has(id));if(!ids.length)return;
  const mapping=new Map();
  for(const id of ids){const c=cleanNode(byId.get(id));delete c.id;const n=addNode({...c,x:c.x+32,y:c.y+32,tags:[...c.tags]});mapping.set(id,n.id)}
  for(const e of [...map.edges])if(mapping.has(e.from)&&mapping.has(e.to))
    addEdge(mapping.get(e.from),mapping.get(e.to),{label:e.label,style:e.style,arrow:e.arrow,color:e.color,dashed:e.dashed,width:e.width});
  S.sel=new Set(mapping.values());render();commit();
  toast(ids.length>1?`${ids.length} cuadros duplicados`:'Cuadro duplicado',{ms:1500});
}
function toggleCollapse(id,force){
  const n=byId.get(id);if(!n)return;
  n.collapsed=force!==undefined?force:!n.collapsed;
  if(n.collapsed)for(const d of descendants(id))S.sel.delete(d);
  render();commit();
}
function targetsFor(id){return S.sel.has(id)&&S.sel.size>1?[...S.sel].map(i=>byId.get(i)).filter(Boolean):[byId.get(id)].filter(Boolean)}
function selectOnly(id){S.sel=new Set([id]);S.edge=null;updateClasses();renderEdges()}

/* =====================================================================
   Gestos: ratón y táctil
   ===================================================================== */
const pointers=new Map();
let G=null,lastTap=null,lastBgTap=null;
const isMod=e=>e.shiftKey||e.metaKey||e.ctrlKey;

VP.addEventListener('pointerdown',e=>{
  if(e.button===2)return;
  const t=e.target;
  if(S.editing){const ed=els.get(S.editing)?.querySelector('.ntext');if(ed&&ed.contains(t))return;finishEdit()}
  if(t.closest('button'))return;
  pointers.set(e.pointerId,local(e));
  try{VP.setPointerCapture(e.pointerId)}catch{}
  if(pointers.size===2){startPinch();return}
  if(pointers.size>2)return;
  e.preventDefault();
  if(document.activeElement&&document.activeElement!==document.body&&!popEl.contains(document.activeElement))document.activeElement.blur();
  const p=local(e),nodeEl=t.closest('.node');
  if(nodeEl&&e.button===0){
    const id=nodeEl.dataset.id;
    if(t.closest('.nhead'))G={type:'move',id,p0:p,moved:false,mod:isMod(e)};
    else G={type:'link',id,p0:p,active:false,mod:isMod(e),target:null};
    return;
  }
  if(e.button===1){G={type:'pan',p0:p,v0:{...S.view},moved:false};return}
  const eid=t.closest('[data-eid]')?.dataset.eid;
  if(!eid&&(S.tool==='select'||e.shiftKey)){G={type:'rect',p0:p,add:e.shiftKey};return}
  G={type:'pan',p0:p,v0:{...S.view},moved:false,eid};
});
VP.addEventListener('pointermove',e=>{
  if(!pointers.has(e.pointerId))return;
  pointers.set(e.pointerId,local(e));
  if(!G)return;
  if(G.type==='pinch'){doPinch();return}
  const p=local(e),dx=p.x-G.p0.x,dy=p.y-G.p0.y,dist=Math.hypot(dx,dy);
  if(G.type==='pan'){
    if(!G.moved&&dist<5)return;
    G.moved=true;VP.classList.add('panning');
    S.view.x=G.v0.x+dx;S.view.y=G.v0.y+dy;applyView();
  }else if(G.type==='move'){
    if(!G.moved){if(dist<4)return;beginMove()}
    dragMove(dx/S.view.k,dy/S.view.k);
  }else if(G.type==='link'){
    if(!G.active){if(dist<7)return;G.active=true;VP.classList.add('linking');closePop()}
    linkMove(e);
  }else if(G.type==='rect'){
    const x=Math.min(p.x,G.p0.x),y=Math.min(p.y,G.p0.y);
    Object.assign(selRect.style,{left:x+'px',top:y+'px',width:Math.abs(dx)+'px',height:Math.abs(dy)+'px'});
    selRect.hidden=false;G.p1=p;
  }
});
VP.addEventListener('pointerup',e=>endPointer(e,false));
VP.addEventListener('pointercancel',e=>endPointer(e,true));
function endPointer(e,cancel){
  const had=pointers.delete(e.pointerId);
  if(!had)return;
  if(G&&G.type==='pinch'){if(pointers.size<2){G=null;saveViewSoon()}return}
  if(!G)return;
  const g=G;G=null;
  VP.classList.remove('panning','dragging','linking');
  ovgG.innerHTML='';tempLink.style.display='none';
  if(g.type==='link'&&g.target)els.get(g.target)?.classList.remove('link-target');
  if(cancel){if(g.type==='move'&&g.moved)commit();maybePendingReload();return}
  if(g.type==='pan'){
    if(g.moved)saveViewSoon();
    else if(g.eid)tapEdge(g.eid,e);
    else tapBackground(e);
  }else if(g.type==='move'){
    if(g.moved)afterMove(g);else tapNode(g.id,e,false,g.mod);
  }else if(g.type==='link'){
    if(!g.active)tapNode(g.id,e,true,g.mod);else endLink(g,e);
  }else if(g.type==='rect'){
    selRect.hidden=true;
    if(g.p1){
      const a=toWorld(Math.min(g.p0.x,g.p1.x)+vpSize().l,Math.min(g.p0.y,g.p1.y)+vpSize().t);
      const b=toWorld(Math.max(g.p0.x,g.p1.x)+vpSize().l,Math.max(g.p0.y,g.p1.y)+vpSize().t);
      if(!g.add)S.sel.clear();
      for(const n of map.nodes)if(shown(n)&&n.x<b.x&&n.x+n._w>a.x&&n.y<b.y&&n.y+n._h>a.y)S.sel.add(n.id);
      S.edge=null;updateClasses();renderEdges();
    }else if(!g.add){S.sel.clear();updateClasses()}
  }
  maybePendingReload();
}
function tapNode(id,e,body,mod){
  const now=performance.now();
  const dbl=body&&lastTap&&lastTap.id===id&&now-lastTap.t<400;
  lastTap={id,t:now};
  if(dbl){lastTap=null;startEdit(id);return}
  if(mod){S.sel.has(id)?S.sel.delete(id):S.sel.add(id)}else S.sel=new Set([id]);
  S.edge=null;closePop();updateClasses();renderEdges();
}
function tapBackground(e){
  const now=performance.now(),p=local(e);
  const dbl=lastBgTap&&now-lastBgTap.t<400&&Math.hypot(p.x-lastBgTap.p.x,p.y-lastBgTap.p.y)<24;
  lastBgTap={t:now,p};
  closePop();
  if(dbl){
    lastBgTap=null;
    const n=createNodeAt(toWorld(e.clientX,e.clientY));
    S.sel=new Set([n.id]);render();commit();startEdit(n.id);return;
  }
  if(S.sel.size||S.edge){S.sel.clear();S.edge=null;updateClasses();renderEdges()}
}
function tapEdge(eid,e){
  const now=performance.now();
  const dbl=lastTap&&lastTap.id===eid&&now-lastTap.t<400;
  lastTap={id:eid,t:now};
  openEdgePop(eid,{x:e.clientX,y:e.clientY,top:e.clientY},dbl);
}

/* ---------- Mover cuadros ---------- */
function beginMove(){
  closePop();
  if(!S.sel.has(G.id)){if(!G.mod)S.sel.clear();S.sel.add(G.id);S.edge=null;updateClasses();renderEdges()}
  G.ids=[...S.sel].filter(id=>shown(byId.get(id)));
  const extra=new Set();
  for(const id of G.ids)if(byId.get(id).collapsed)for(const d of descendants(id))if(S.hidden.has(d))extra.add(d);
  G.all=[...new Set([...G.ids,...extra])];
  G.orig=new Map(G.all.map(id=>{const n=byId.get(id);return[id,{x:n.x,y:n.y}]}));
  const moving=new Set(G.all);
  G.others=map.nodes.filter(n=>!moving.has(n.id)&&shown(n)).map(rectOf);
  G.moved=true;VP.classList.add('dragging');
}
function dragMove(dx,dy){
  const a=byId.get(G.id),o=G.orig.get(G.id);
  let nx=o.x+dx,ny=o.y+dy;
  if(P.grid){nx=Math.round(nx/GRID)*GRID;ny=Math.round(ny/GRID)*GRID}
  const lines=[];
  if(P.guides&&G.others.length){
    const th=7/S.view.k,w=a._w,h=a._h;
    let bx=null,by=null;
    for(const r of G.others){
      for(const cx of [r.x,r.cx,r.x+r.w])for(const off of [0,w/2,w]){const d=cx-(nx+off);if(Math.abs(d)<th&&(!bx||Math.abs(d)<Math.abs(bx.d)))bx={d,v:cx}}
      for(const cy of [r.y,r.cy,r.y+r.h])for(const off of [0,h/2,h]){const d=cy-(ny+off);if(Math.abs(d)<th&&(!by||Math.abs(d)<Math.abs(by.d)))by={d,v:cy}}
    }
    if(bx)nx+=bx.d;if(by)ny+=by.d;
    const me={x:nx,y:ny,w,h,cx:nx+w/2,cy:ny+h/2};
    if(bx){const rs=[me,...G.others.filter(r=>[r.x,r.cx,r.x+r.w].some(v=>Math.abs(v-bx.v)<.6))];
      lines.push({x1:bx.v,y1:Math.min(...rs.map(r=>r.y))-12,x2:bx.v,y2:Math.max(...rs.map(r=>r.y+r.h))+12})}
    if(by){const rs=[me,...G.others.filter(r=>[r.y,r.cy,r.y+r.h].some(v=>Math.abs(v-by.v)<.6))];
      lines.push({x1:Math.min(...rs.map(r=>r.x))-12,y1:by.v,x2:Math.max(...rs.map(r=>r.x+r.w))+12,y2:by.v})}
  }
  const ddx=nx-o.x,ddy=ny-o.y;
  for(const id of G.all){const n=byId.get(id),q=G.orig.get(id);n.x=q.x+ddx;n.y=q.y+ddy;setNodePos(n)}
  ovgG.innerHTML=lines.map(l=>`<line class="guide" x1="${f1(l.x1)}" y1="${f1(l.y1)}" x2="${f1(l.x2)}" y2="${f1(l.y2)}"/>`).join('');
  renderEdges();scheduleMinimap();
}
function afterMove(g){
  if(P.repel){
    const fixed=new Set(g.ids);
    const res=resolveOverlaps(id=>fixed.has(id));
    animateNodes(res,()=>commit());
  }else commit();
}

/* ---------- Conectar / crear arrastrando ---------- */
function linkMove(e){
  const w=toWorld(e.clientX,e.clientY);
  let tgt=null;
  const under=document.elementFromPoint(e.clientX,e.clientY)?.closest?.('.node');
  if(under&&under.dataset.id!==G.id)tgt=under.dataset.id;
  if(!tgt&&P.magnet){
    let best=Infinity;const R=42/S.view.k;
    for(const n of map.nodes){
      if(n.id===G.id||!shown(n))continue;
      const dx=Math.max(n.x-w.x,0,w.x-(n.x+n._w)),dy=Math.max(n.y-w.y,0,w.y-(n.y+n._h)),d=Math.hypot(dx,dy);
      if(d<R&&d<best){best=d;tgt=n.id}
    }
  }
  if(tgt!==G.target){els.get(G.target)?.classList.remove('link-target');G.target=tgt;if(tgt)els.get(tgt)?.classList.add('link-target')}
  const a=rectOf(byId.get(G.id));
  let end=w,ghost='';
  if(tgt){const b=rectOf(byId.get(tgt));end=borderPoint(b,a.cx,a.cy)}
  else ghost=`<rect class="ghost" x="${f1(w.x-70)}" y="${f1(w.y-26)}" width="140" height="52" rx="12"/><path class="ghost-plus" d="M${f1(w.x-7)} ${f1(w.y)}h14M${f1(w.x)} ${f1(w.y-7)}v14"/>`;
  const s=borderPoint(a,end.x,end.y);
  tempLink.setAttribute('d',`M${R2(s)}L${R2(end)}`);tempLink.style.display='';
  ovgG.innerHTML=ghost;
}
function endLink(g,e){
  if(g.target){
    const ed=addEdge(g.id,g.target);
    if(!ed){toast('Esos cuadros ya están conectados',{ms:1800});return}
    render();commit();return;
  }
  const src=byId.get(g.id);
  const n=createNodeAt(toWorld(e.clientX,e.clientY),{color:src.color});
  addEdge(src.id,n.id);
  S.sel=new Set([n.id]);render();commit();startEdit(n.id);
}

/* ---------- Pellizco (zoom táctil) ---------- */
function startPinch(){
  if(G&&G.type==='move'&&G.moved){VP.classList.remove('dragging');ovgG.innerHTML='';commit()}
  if(G&&G.type==='link'){els.get(G.target)?.classList.remove('link-target');tempLink.style.display='none';ovgG.innerHTML='';VP.classList.remove('linking')}
  selRect.hidden=true;
  const [a,b]=[...pointers.values()];
  G={type:'pinch',d0:Math.hypot(a.x-b.x,a.y-b.y)||1,m0:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},v0:{...S.view}};
}
function doPinch(){
  const [a,b]=[...pointers.values()];if(!b)return;
  const d=Math.hypot(a.x-b.x,a.y-b.y),m={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  const k=clamp(G.v0.k*d/G.d0,KMIN,KMAX);
  const wx=(G.m0.x-G.v0.x)/G.v0.k,wy=(G.m0.y-G.v0.y)/G.v0.k;
  S.view={k,x:m.x-wx*k,y:m.y-wy*k};applyView();
}

/* ---------- Rueda ---------- */
VP.addEventListener('wheel',e=>{
  e.preventDefault();
  const p=local(e);
  const dy=e.deltaMode===1?e.deltaY*16:e.deltaMode===2?e.deltaY*400:e.deltaY;
  if(e.ctrlKey||e.metaKey)zoomAt(p,Math.exp(-dy*.01));
  else if(e.shiftKey){S.view.x-=dy;applyView();saveViewSoon()}
  else if(e.deltaMode===0&&Math.abs(e.deltaX)>.5){S.view.x-=e.deltaX;S.view.y-=e.deltaY;applyView();saveViewSoon()}
  else zoomAt(p,Math.exp(-dy*.0016));
},{passive:false});

/* ---------- Botones de la barra de cada cuadro ---------- */
nodesEl.addEventListener('click',e=>{
  const b=e.target.closest('button[data-act]');if(!b)return;
  const id=b.closest('.node').dataset.id,act=b.dataset.act;
  e.stopPropagation();
  if(S.editing)finishEdit();
  if(act==='del'){if(!S.sel.has(id))S.sel=new Set([id]);S.edge=null;deleteSelection()}
  else if(act==='collapse'||act==='expand')toggleCollapse(id,act==='expand'?false:undefined);
  else if(act==='style'){if(!S.sel.has(id))selectOnly(id);togglePop('style:'+id,b,()=>styleHTML(id),bindStylePop(id))}
  else if(act==='tags'){if(!S.sel.has(id))selectOnly(id);togglePop('tags:'+id,b,()=>tagsHTML(id),bindTagsPop(id))}
});
labelsEl.addEventListener('dblclick',e=>e.preventDefault());

/* =====================================================================
   Teclado
   ===================================================================== */
document.addEventListener('keydown',e=>{
  const t=e.target,mod=e.ctrlKey||e.metaKey,k=e.key;
  const typing=t&&t.closest&&t.closest('input,textarea,select,[contenteditable]');
  if(k==='Escape'){
    if(!modalEl.hidden){closeModal();return}
    if(popState){closePop();return}
    if(!$('#searchbar').hidden&&(typing||S.search.q)){closeSearch();return}
    if(!$('#tagpanel').hidden){$('#tagpanel').hidden=true;return}
    if(!$('#drawer').hidden){$('#drawer').hidden=true;return}
    if(S.sel.size||S.edge){S.sel.clear();S.edge=null;updateClasses();renderEdges()}
    return;
  }
  if(mod&&k.toLowerCase()==='f'){e.preventDefault();openSearch();return}
  if(typing||!modalEl.hidden)return;
  const prim=primary();
  if(mod&&k.toLowerCase()==='z'&&!e.shiftKey){e.preventDefault();undo();return}
  if(mod&&(k.toLowerCase()==='y'||(k.toLowerCase()==='z'&&e.shiftKey))){e.preventDefault();redo();return}
  if(mod&&k.toLowerCase()==='a'){e.preventDefault();S.sel=new Set(map.nodes.filter(shown).map(n=>n.id));updateClasses();return}
  if(mod&&k.toLowerCase()==='d'){e.preventDefault();duplicateSel();return}
  if(mod)return;
  if(k==='Tab'){e.preventDefault();if(prim)addChild(prim);return}
  if(k==='Enter'){if(prim){e.preventDefault();addSibling(prim)}return}
  if(k==='F2'||(k===' '&&prim)){if(prim){e.preventDefault();startEdit(prim,false)}return}
  if(k==='Delete'||k==='Backspace'){e.preventDefault();deleteSelection();return}
  if(k.startsWith('Arrow')){e.preventDefault();navigate(k);return}
  if(k==='f'||k==='F'){fitView(true);return}
  if(k==='+'||k==='='){const v=vpSize();zoomAt({x:v.w/2,y:v.h/2},1.2);return}
  if(k==='-'){const v=vpSize();zoomAt({x:v.w/2,y:v.h/2},1/1.2);return}
  if(k==='.'&&prim){toggleCollapse(prim);return}
});
function navigate(key){
  const vis=map.nodes.filter(shown);if(!vis.length)return;
  const prim=primary();
  if(!prim){const vs=vpSize(),c=toWorld(vs.l+vs.w/2,vs.t+vs.h/2);
    const n=vis.reduce((a,b)=>Math.hypot(a.x+a._w/2-c.x,a.y+a._h/2-c.y)<Math.hypot(b.x+b._w/2-c.x,b.y+b._h/2-c.y)?a:b);
    selectOnly(n.id);ensureVisible(n);return}
  const a=rectOf(byId.get(prim)),dir={ArrowRight:[1,0],ArrowLeft:[-1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[key];
  let best=null,bs=Infinity;
  for(const n of vis){if(n.id===prim)continue;const r=rectOf(n),vx=r.cx-a.cx,vy=r.cy-a.cy;
    const along=vx*dir[0]+vy*dir[1];if(along<=4)continue;
    const perp=Math.abs(vx*dir[1]-vy*dir[0]);const sc=along+perp*2.2;if(sc<bs){bs=sc;best=n}}
  if(best){selectOnly(best.id);ensureVisible(best)}
}

/* =====================================================================
   Organización automática
   ===================================================================== */
function forest(nodes,edges){
  const adj=new Map(nodes.map(n=>[n.id,[]])),indeg=new Map(nodes.map(n=>[n.id,0])),outdeg=new Map(nodes.map(n=>[n.id,0]));
  for(const e of edges){adj.get(e.from).push({id:e.to,out:1});adj.get(e.to).push({id:e.from,out:0});indeg.set(e.to,indeg.get(e.to)+1);outdeg.set(e.from,outdeg.get(e.from)+1)}
  const order=new Map(nodes.map((n,i)=>[n.id,i])),comp=new Set(),comps=[];
  for(const n of nodes){
    if(comp.has(n.id))continue;
    const list=[],st=[n.id];comp.add(n.id);
    while(st.length){const c=st.pop();list.push(c);for(const a of adj.get(c))if(!comp.has(a.id)){comp.add(a.id);st.push(a.id)}}
    comps.push(list);
  }
  const reach=id=>{const seen=new Set([id]),st=[id];while(st.length){const c=st.pop();for(const a of adj.get(c))if(a.out&&!seen.has(a.id)){seen.add(a.id);st.push(a.id)}}return seen.size};
  return comps.map(list=>{
    const c0=list.filter(id=>indeg.get(id)===0),pool=c0.length?c0:list;
    const sc=id=>(c0.length?reach(id)*1e3+outdeg.get(id):indeg.get(id)+outdeg.get(id))*1e6-order.get(id);
    const root=pool.reduce((a,b)=>sc(b)>sc(a)?b:a);
    const kids=new Map(),depth=new Map([[root,0]]),seen=new Set([root]),q=[root];
    while(q.length){
      const c=q.shift(),ch=[];
      for(const a of [...adj.get(c)].sort((x,y)=>y.out-x.out)){if(seen.has(a.id))continue;seen.add(a.id);ch.push(a.id);depth.set(a.id,depth.get(c)+1);q.push(a.id)}
      kids.set(c,ch);
    }
    return{root,kids,depth,list};
  });
}
const NW=id=>byId.get(id)._w,NH=id=>byId.get(id)._h;
function sortKids(T,key){for(const [id,ks] of T.kids)ks.sort((a,b)=>key(a,id)-key(b,id))}
function tidy(T,root,axis,sign,sp,subset){
  const gapD=(axis==='h'?80:64)*sp,gapB=(axis==='h'?18:26)*sp;
  const along=id=>axis==='h'?NW(id):NH(id),across=id=>axis==='h'?NH(id):NW(id);
  const kidsOf=id=>id===root&&subset?subset:(T.kids.get(id)||[]);
  const lv=[];(function walk(id,d){lv[d]=Math.max(lv[d]||0,along(id));for(const c of kidsOf(id))walk(c,d+1)})(root,0);
  const lp=[0];for(let d=1;d<lv.length;d++)lp[d]=lp[d-1]+lv[d-1]+gapD;
  const ext=new Map();
  const E=id=>{if(ext.has(id))return ext.get(id);let s=0;kidsOf(id).forEach((c,i)=>{s+=E(c)+(i?gapB:0)});const v=Math.max(across(id),s);ext.set(id,v);return v};
  E(root);
  const pos=new Map();
  (function place(id,start,d){
    const center=start+E(id)/2;
    let D=axis==='h'&&d>0?lp[d]:lp[d]+(lv[d]-along(id))/2;
    if(axis==='h'&&d===0)D=0;
    if(sign<0)D=along(root)-D-along(id);
    const B=center-across(id)/2;
    pos.set(id,axis==='h'?{x:D,y:B}:{x:B,y:D});
    const ks=kidsOf(id);let tot=0;ks.forEach((c,i)=>tot+=E(c)+(i?gapB:0));
    let s=center-tot/2;for(const c of ks){place(c,s,d+1);s+=E(c)+gapB}
  })(root,0,0);
  return pos;
}
function layoutTree(kind,T,sp){
  const cy=id=>{const n=byId.get(id);return n.y+n._h/2},cx=id=>{const n=byId.get(id);return n.x+n._w/2};
  if(kind==='tree-h'){sortKids(T,cy);return tidy(T,T.root,'h',1,sp)}
  if(kind==='tree-v'){sortKids(T,cx);return tidy(T,T.root,'v',1,sp)}
  if(kind==='mindmap'){
    sortKids(T,cy);
    const rk=T.kids.get(T.root)||[];
    const cnt=new Map();const C=id=>{if(cnt.has(id))return cnt.get(id);const v=1+(T.kids.get(id)||[]).reduce((s,c)=>s+C(c),0);cnt.set(id,v);return v};
    const total=rk.reduce((s,c)=>s+C(c),0);
    const rn=byId.get(T.root),rcx=rn.x+rn._w/2;
    let right=[],left=[];
    const hasSides=rk.some(c=>cx(c)<rcx-10)&&rk.some(c=>cx(c)>rcx+10);
    if(hasSides&&rk.length>1){for(const c of rk)(cx(c)>=rcx?right:left).push(c)}
    else{let acc=0;for(const c of rk){if(acc<total/2){right.push(c);acc+=C(c)}else left.push(c)}}
    const pr=tidy(T,T.root,'h',1,sp,right),pl=tidy(T,T.root,'h',-1,sp,left);
    const dy=pr.get(T.root).y-pl.get(T.root).y;
    for(const [id,p] of pl)if(id!==T.root)pr.set(id,{x:p.x,y:p.y+dy});
    return pr;
  }
  // radial
  const rn=byId.get(T.root),r0={x:rn.x+rn._w/2,y:rn.y+rn._h/2};
  const ang=id=>{let a=Math.atan2(cy(id)-r0.y,cx(id)-r0.x)+Math.PI/2;while(a<0)a+=Math.PI*2;return a%(Math.PI*2)};
  sortKids(T,ang);
  const lc=new Map();const Lc=id=>{if(lc.has(id))return lc.get(id);const ks=T.kids.get(id)||[];const v=ks.length?ks.reduce((s,c)=>s+Lc(c),0):1;lc.set(id,v);return v};Lc(T.root);
  const Rr=id=>Math.hypot(NW(id),NH(id))/2;
  const byD=[];for(const [id,d] of T.depth)(byD[d]=byD[d]||[]).push(id);
  const rad=[0];
  for(let d=1;d<byD.length;d++){
    const mp=Math.max(...byD[d-1].map(Rr)),mc=Math.max(...byD[d].map(Rr));
    const circ=byD[d].reduce((s,id)=>s+NW(id)*.95+26*sp,0);
    rad[d]=Math.max(rad[d-1]+mp+mc+40*sp,circ/(Math.PI*2));
  }
  const pos=new Map();
  pos.set(T.root,{x:-NW(T.root)/2,y:-NH(T.root)/2});
  const rk=T.kids.get(T.root)||[];
  const tot=Lc(T.root);
  const first=rk.length?Lc(rk[0]):0;
  (function assign(id,a0,a1){
    const ks=T.kids.get(id)||[];const L=ks.reduce((s,c)=>s+Lc(c),0)||1;let a=a0;
    for(const c of ks){const span=(a1-a0)*Lc(c)/L,m=a+span/2,r=rad[T.depth.get(c)];
      pos.set(c,{x:Math.cos(m)*r-NW(c)/2,y:Math.sin(m)*r-NH(c)/2});assign(c,a,a+span);a+=span}
  })(T.root,-Math.PI/2-Math.PI*first/tot,-Math.PI/2-Math.PI*first/tot+Math.PI*2);
  return pos;
}
function layoutForce(nodes,edges,sp){
  const pts=nodes.map(n=>({id:n.id,x:n.x+n._w/2,y:n.y+n._h/2,r:Math.hypot(n._w,n._h)/2}));
  const idx=new Map(pts.map((p,i)=>[p.id,i]));
  const seen=new Set();for(const p of pts){const k=Math.round(p.x)+','+Math.round(p.y);if(seen.has(k)){p.x+=Math.random()*40-20;p.y+=Math.random()*40-20}seen.add(k)}
  const E=edges.map(e=>[idx.get(e.from),idx.get(e.to)]);
  const avgR=pts.reduce((s,p)=>s+p.r,0)/pts.length,K=(avgR*2+70)*sp,N=pts.length;
  let temp=K*2;
  const fx=new Float64Array(N),fy=new Float64Array(N);
  for(let it=0;it<400;it++){
    fx.fill(0);fy.fill(0);
    for(let i=0;i<N;i++)for(let j=i+1;j<N;j++){
      let dx=pts[i].x-pts[j].x,dy=pts[i].y-pts[j].y,d=Math.hypot(dx,dy)||.01;
      const eff=Math.max(d-(pts[i].r+pts[j].r)*.5,d*.25);
      const f=K*K/eff;dx/=d;dy/=d;fx[i]+=dx*f;fy[i]+=dy*f;fx[j]-=dx*f;fy[j]-=dy*f;
    }
    for(const [i,j] of E){
      let dx=pts[i].x-pts[j].x,dy=pts[i].y-pts[j].y,d=Math.hypot(dx,dy)||.01;
      const rest=pts[i].r+pts[j].r+40*sp;const f=(d-rest)*(d-rest)/K*Math.sign(d-rest);
      dx/=d;dy/=d;fx[i]-=dx*f;fy[i]-=dy*f;fx[j]+=dx*f;fy[j]+=dy*f;
    }
    let mx=0,my=0;for(const p of pts){mx+=p.x;my+=p.y}mx/=N;my/=N;
    for(let i=0;i<N;i++){
      fx[i]-=(pts[i].x-mx)*.02*K/10;fy[i]-=(pts[i].y-my)*.02*K/10;
      const d=Math.hypot(fx[i],fy[i])||1,s=Math.min(d,temp)/d;pts[i].x+=fx[i]*s;pts[i].y+=fy[i]*s;
    }
    temp=Math.max(1,temp*.985);
  }
  const pos=new Map();for(const p of pts){const n=byId.get(p.id);pos.set(p.id,{x:p.x-n._w/2,y:p.y-n._h/2})}
  return resolveOverlaps(()=>false,pos,20);
}
function layoutGrid(trees,sp){
  const order=[];for(const T of trees){const q=[T.root];while(q.length){const c=q.shift();order.push(c);q.push(...(T.kids.get(c)||[]))}}
  const cols=Math.max(1,Math.ceil(Math.sqrt(order.length*1.4)));
  const cw=Math.max(...order.map(NW))+40*sp,ch=Math.max(...order.map(NH))+34*sp;
  const pos=new Map();
  order.forEach((id,i)=>{const c=i%cols,r=Math.floor(i/cols);pos.set(id,{x:c*cw+(cw-NW(id))/2,y:r*ch+(ch-NH(id))/2})});
  return pos;
}
function runLayout(kind,opts={}){
  if(!map)return;
  if(S.editing)finishEdit();
  closePop();measure();
  const nodes=map.nodes.filter(shown);if(!nodes.length)return;
  const ids=new Set(nodes.map(n=>n.id));
  const edges=map.edges.filter(e=>ids.has(e.from)&&ids.has(e.to));
  const sp=P.spacing,trees=forest(nodes,edges);
  let pos;
  if(kind==='force')pos=layoutForce(nodes,edges,sp);
  else if(kind==='grid')pos=layoutGrid(trees,sp);
  else{
    pos=new Map();
    const vertPack=kind==='tree-h'||kind==='mindmap';
    let cursor=0;
    const big=[...trees].sort((a,b)=>b.list.length-a.list.length);
    for(const T of big){
      let p=layoutTree(kind,T,sp);
      if(kind==='radial'){const keep=new Set(p.keys());p=new Map([...resolveOverlaps(()=>false,p,14)].filter(([id])=>keep.has(id)))}
      const b=bboxOf([...p].map(([id,q])=>({x:q.x,y:q.y,w:NW(id),h:NH(id)})));
      const ox=vertPack?-b.x:cursor-b.x,oy=vertPack?cursor-b.y:-b.y;
      for(const [id,q] of p)pos.set(id,{x:q.x+ox,y:q.y+oy});
      cursor+=(vertPack?b.h:b.w)+90*sp;
    }
  }
  const anchor=(trees.slice().sort((a,b)=>b.list.length-a.list.length)[0]||{}).root;
  map.settings.flow={mindmap:'h','tree-h':'h','tree-v':'v'}[kind]||'auto';
  if(anchor&&pos.has(anchor)){const n=byId.get(anchor),p=pos.get(anchor),dx=n.x-p.x,dy=n.y-p.y;for(const [id,q] of pos)pos.set(id,{x:q.x+dx,y:q.y+dy})}
  if(P.grid)for(const [id,q] of pos)pos.set(id,{x:Math.round(q.x/GRID)*GRID,y:Math.round(q.y/GRID)*GRID});
  const b=bboxOf([...pos].map(([id,q])=>({x:q.x,y:q.y,w:NW(id),h:NH(id)})));
  if(opts.instant){for(const [id,q] of withFollowers(pos)){const n=byId.get(id);if(n){n.x=q.x;n.y=q.y}}render();commit();if(b){S.view=viewForBox(b);applyView()}return}
  animateNodes(pos,()=>commit());
  if(b)animateView(viewForBox(b));
}

/* ---------- Separar cuadros solapados ---------- */
function resolveOverlaps(isFixed,base,pad=16){
  const items=map.nodes.filter(n=>base?base.has(n.id):shown(n)).map(n=>{const b=base&&base.get(n.id);return{id:n.id,x:b?b.x:n.x,y:b?b.y:n.y,w:n._w,h:n._h,f:isFixed(n.id)}});
  for(let it=0;it<150;it++){
    let any=false;
    for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
      const a=items[i],b=items[j];if(a.f&&b.f)continue;
      const ox=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)+pad,oy=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)+pad;
      if(ox<=0||oy<=0)continue;any=true;
      const sx=(b.x+b.w/2)>=(a.x+a.w/2)?1:-1,sy=(b.y+b.h/2)>=(a.y+a.h/2)?1:-1;
      let mx=0,my=0;if(ox<oy)mx=sx*ox;else my=sy*oy;
      if(a.f){b.x+=mx;b.y+=my}else if(b.f){a.x-=mx;a.y-=my}else{a.x-=mx/2;a.y-=my/2;b.x+=mx/2;b.y+=my/2}
    }
    if(!any)break;
  }
  return new Map(items.map(i=>[i.id,{x:i.x,y:i.y}]));
}
function withFollowers(targets){
  const out=new Map(targets);
  for(const [id,t] of targets){
    const n=byId.get(id);if(!n||!n.collapsed)continue;
    const dx=t.x-n.x,dy=t.y-n.y;if(!dx&&!dy)continue;
    for(const d of descendants(id))if(S.hidden.has(d)&&!out.has(d)){const h=byId.get(d);out.set(d,{x:h.x+dx,y:h.y+dy})}
  }
  return out;
}
function animateNodes(targets,done){
  targets=withFollowers(targets);
  if(S.anim){cancelAnimationFrame(S.anim.raf);const f=S.anim.finish;S.anim=null;f()}
  const list=[];
  for(const [id,t] of targets){const n=byId.get(id);if(!n)continue;if(Math.abs(n.x-t.x)<.5&&Math.abs(n.y-t.y)<.5)continue;list.push({n,x0:n.x,y0:n.y,x1:t.x,y1:t.y})}
  const finish=()=>{for(const l of list){l.n.x=l.x1;l.n.y=l.y1}render();done&&done();maybePendingReload()};
  if(!list.length){done&&done();return}
  if(!P.animate||reduceMotion){finish();return}
  const t0=performance.now(),dur=440;
  const step=now=>{
    if(!S.anim)return;
    const k=Math.min(1,(now-t0)/dur),e=k<.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2;
    for(const l of list){l.n.x=l.x0+(l.x1-l.x0)*e;l.n.y=l.y0+(l.y1-l.y0)*e;setNodePos(l.n)}
    renderEdges();scheduleMinimap();
    if(k<1)S.anim.raf=requestAnimationFrame(step);else{S.anim=null;finish()}
  };
  S.anim={raf:requestAnimationFrame(step),finish};
}
