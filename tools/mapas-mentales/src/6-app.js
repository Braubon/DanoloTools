
/* =====================================================================
   Exportar
   ===================================================================== */
let dlP=null;
function getDownloads(){
  if(!dlP)dlP=(window.claude&&typeof window.claude.use==='function')?Promise.resolve().then(()=>window.claude.use('downloads')).catch(()=>null):Promise.resolve(null);
  return dlP;
}
const fileBase=()=>(norm(map.name).replace(/[^\w\- ]+/g,'').trim().replace(/\s+/g,'-').slice(0,60))||'mapa';
async function saveFile(name,data){
  const dl=await Promise.race([getDownloads(),sleep(3000).then(()=>null)]);
  if(dl){
    try{await dl.save({filename:name,data});toast('Guardado: '+name);return}
    catch(e){const c=e&&e.code;if(c==='declined')return;if(c==='rate_limited'){toast('Espera un momento y vuelve a intentarlo.');return}}
  }
  try{
    const blob=data instanceof Blob?data:new Blob([data],{type:name.endsWith('.svg')?'image/svg+xml':'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),5000);
    if(window.claude&&name.endsWith('.json'))toast('Si la descarga no empieza, usa «Copiar JSON».',{ms:5000});
  }catch{toast('No se pudo descargar el archivo.')}
}
function mapJSON(){return JSON.stringify({...serialize(map),exported:new Date().toISOString()},null,2)}
function exportJSON(all){
  saveNow();
  if(!all){saveFile(fileBase()+'.json',mapJSON());return}
  const maps=Store.index().map(x=>Store.load(x.id)).filter(Boolean);
  saveFile('mapas-mentales.json',JSON.stringify({format:'mapamental-coleccion',version:1,exported:new Date().toISOString(),maps},null,2));
}
async function copyJSON(){
  const txt=mapJSON();
  try{await navigator.clipboard.writeText(txt);toast('JSON copiado al portapapeles');return}catch{}
  openModal(`<h2>Copiar JSON</h2><p>Tu navegador no deja copiar automáticamente. Selecciona el texto y cópialo.</p><textarea id="cpj" readonly></textarea><div class="acts"><button class="btn primary" data-close>Cerrar</button></div>`,
    m=>{const t=m.querySelector('#cpj');t.value=txt;setTimeout(()=>{t.focus();t.select()},30);m.querySelector('[data-close]').onclick=closeModal});
}

/* ---------- Imagen (PNG / SVG) ---------- */
const mctx=document.createElement('canvas').getContext('2d');
const FONT_STACK="Figtree, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
function wrapLines(text,font,maxW){
  mctx.font=font;const out=[];
  for(const para of String(text).split('\n')){
    const words=para.split(/(\s+)/);let line='';
    for(const w of words){
      const test=line+w;
      if(mctx.measureText(test.trimEnd()).width>maxW&&line.trim()){out.push(line.trimEnd());line=w.trimStart()}else line=test;
      while(mctx.measureText(line).width>maxW&&line.length>1){let i=line.length;while(i>1&&mctx.measureText(line.slice(0,i)).width>maxW)i--;out.push(line.slice(0,i));line=line.slice(i)}
    }
    out.push(line.trimEnd());
  }
  return out;
}
function buildScene(){
  measure();
  const nodes=map.nodes.filter(shown);if(!nodes.length)return null;
  const cs=getComputedStyle(document.documentElement),v=k=>cs.getPropertyValue(k).trim();
  const sc={bg:v('--bg'),panel:v('--panel'),ink:v('--ink'),nodes:[],edges:[],labels:[]};
  const boxes=[];
  for(const n of nodes){
    const el=els.get(n.id),tx=el.querySelector('.ntext'),head=el.querySelector('.nhead');
    const weight=n.bold?700:500,font=`${weight} ${n.fontSize}px ${FONT_STACK}`;
    const lh=parseFloat(getComputedStyle(tx).lineHeight)||n.fontSize*1.25;
    const ink=inkOn(n.color);
    sc.nodes.push({x:n.x,y:n.y,w:n._w,h:n._h,hh:head.offsetHeight,color:n.color,head:headOf(n.color),ink,
      tagbg:ink==='#FFFFFF'?'rgba(255,255,255,0.22)':'rgba(0,0,0,0.09)',
      lines:wrapLines(n.text,font,tx.clientWidth+1),font,size:n.fontSize,weight,lh,
      tx:n.x+tx.offsetLeft+tx.clientWidth/2,ty:n.y+tx.offsetTop,
      tags:[...el.querySelectorAll('.ntag')].map(c=>({x:n.x+c.offsetLeft,y:n.y+c.offsetTop,w:c.offsetWidth,h:c.offsetHeight,name:c.textContent,color:c.style.getPropertyValue('--tc')}))});
    boxes.push(rectOf(n));
  }
  for(const e of map.edges){
    const a=byId.get(e.from),b=byId.get(e.to);if(!shown(a)||!shown(b))continue;
    const as=arrowSize(e),hasE=e.arrow==='end'||e.arrow==='both',hasS=e.arrow==='start'||e.arrow==='both';
    const g=edgeGeom(e,a,b,hasS?as*.7:0,hasE?as*.7:0),col=edgeColor(e,a);
    sc.edges.push({d:g.d,col,w:e.width,dashed:e.dashed,arrows:[...(hasE?[arrowD(g.t,g.ed,as)]:[]),...(hasS?[arrowD(g.s,g.sd,as)]:[])]});
    if(e.label){mctx.font=`600 12px ${FONT_STACK}`;const lw=Math.min(220,mctx.measureText(e.label).width+18);sc.labels.push({x:g.mid.x-lw/2,y:g.mid.y-11,w:lw,h:22,text:e.label,col});boxes.push({x:g.mid.x-lw/2,y:g.mid.y-11,w:lw,h:22})}
  }
  const b=bboxOf(boxes),pad=40;
  sc.b={x:Math.floor(b.x-pad),y:Math.floor(b.y-pad),w:Math.ceil(b.w+pad*2),h:Math.ceil(b.h+pad*2)};
  return sc;
}
const topRound=(x,y,w,h,r)=>`M${x} ${y+h}V${y+r}A${r} ${r} 0 0 1 ${x+r} ${y}H${x+w-r}A${r} ${r} 0 0 1 ${x+w} ${y+r}V${y+h}Z`;
function sceneSVG(sc){
  const {x,y,w,h}=sc.b;
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}" font-family="${FONT_STACK.replace(/"/g,"'")}">`;
  s+=`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${sc.bg}"/>`;
  for(const e of sc.edges){
    s+=`<path d="${e.d}" fill="none" stroke="${e.col}" stroke-width="${e.w}" stroke-linecap="round" stroke-linejoin="round"${e.dashed?` stroke-dasharray="${e.w*3} ${e.w*2.6}"`:''}/>`;
    for(const a of e.arrows)s+=`<path d="${a}" fill="${e.col}"/>`;
  }
  for(const l of sc.labels){
    s+=`<rect x="${f1(l.x)}" y="${f1(l.y)}" width="${f1(l.w)}" height="${l.h}" rx="7" fill="${sc.panel}" stroke="${l.col}" stroke-width="1.5"/>`;
    s+=`<text x="${f1(l.x+l.w/2)}" y="${f1(l.y+l.h/2)}" font-size="12" font-weight="600" fill="${sc.ink}" text-anchor="middle" dominant-baseline="central">${esc(l.text)}</text>`;
  }
  for(const n of sc.nodes){
    s+=`<g><rect x="${f1(n.x)}" y="${f1(n.y)}" width="${n.w}" height="${n.h}" rx="14" fill="${n.color}"/>`;
    s+=`<path d="${topRound(f1(n.x),f1(n.y),n.w,n.hh,14)}" fill="${n.head}"/>`;
    n.lines.forEach((ln,i)=>{s+=`<text x="${f1(n.tx)}" y="${f1(n.ty+n.lh*i+n.lh/2)}" font-size="${n.size}" font-weight="${n.weight}" fill="${n.ink}" text-anchor="middle" dominant-baseline="central" xml:space="preserve">${esc(ln)}</text>`});
    for(const t of n.tags){
      s+=`<rect x="${f1(t.x)}" y="${f1(t.y)}" width="${t.w}" height="${t.h}" rx="${t.h/2}" fill="${n.tagbg}"/><circle cx="${f1(t.x+8.5)}" cy="${f1(t.y+t.h/2)}" r="3.5" fill="${t.color}"/>`;
      s+=`<text x="${f1(t.x+16)}" y="${f1(t.y+t.h/2)}" font-size="10.5" font-weight="600" fill="${n.ink}" dominant-baseline="central">${esc(t.name)}</text>`;
    }
    s+='</g>';
  }
  return s+'</svg>';
}
function scenePNG(sc){
  const {x,y,w,h}=sc.b;let scale=2;const mx=8000;if(Math.max(w,h)*scale>mx)scale=mx/Math.max(w,h);
  const c=document.createElement('canvas');c.width=Math.round(w*scale);c.height=Math.round(h*scale);
  const ctx=c.getContext('2d');ctx.scale(scale,scale);ctx.translate(-x,-y);
  ctx.fillStyle=sc.bg;ctx.fillRect(x,y,w,h);
  ctx.lineCap='round';ctx.lineJoin='round';
  for(const e of sc.edges){ctx.strokeStyle=e.col;ctx.lineWidth=e.w;ctx.setLineDash(e.dashed?[e.w*3,e.w*2.6]:[]);ctx.stroke(new Path2D(e.d));ctx.setLineDash([]);ctx.fillStyle=e.col;for(const a of e.arrows)ctx.fill(new Path2D(a))}
  const rr=(x,y,w,h,r)=>{const p=new Path2D();p.moveTo(x+r,y);p.arcTo(x+w,y,x+w,y+h,r);p.arcTo(x+w,y+h,x,y+h,r);p.arcTo(x,y+h,x,y,r);p.arcTo(x,y,x+w,y,r);p.closePath();return p};
  ctx.textBaseline='middle';
  for(const l of sc.labels){const p=rr(l.x,l.y,l.w,l.h,7);ctx.fillStyle=sc.panel;ctx.fill(p);ctx.strokeStyle=l.col;ctx.lineWidth=1.5;ctx.stroke(p);
    ctx.fillStyle=sc.ink;ctx.font=`600 12px ${FONT_STACK}`;ctx.textAlign='center';ctx.fillText(l.text,l.x+l.w/2,l.y+l.h/2,l.w-12)}
  for(const n of sc.nodes){
    ctx.save();ctx.shadowColor='rgba(20,24,33,0.14)';ctx.shadowBlur=10;ctx.shadowOffsetY=3;ctx.fillStyle=n.color;ctx.fill(rr(n.x,n.y,n.w,n.h,14));ctx.restore();
    ctx.fillStyle=n.head;ctx.fill(new Path2D(topRound(n.x,n.y,n.w,n.hh,14)));
    ctx.fillStyle=n.ink;ctx.font=n.font;ctx.textAlign='center';
    n.lines.forEach((ln,i)=>ctx.fillText(ln,n.tx,n.ty+n.lh*i+n.lh/2));
    ctx.textAlign='left';
    for(const t of n.tags){ctx.fillStyle=n.tagbg;ctx.fill(rr(t.x,t.y,t.w,t.h,t.h/2));ctx.fillStyle=t.color;ctx.beginPath();ctx.arc(t.x+8.5,t.y+t.h/2,3.5,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=n.ink;ctx.font=`600 10.5px ${FONT_STACK}`;ctx.fillText(t.name,t.x+16,t.y+t.h/2)}
  }
  return new Promise(res=>c.toBlob(res,'image/png'));
}
async function exportImage(kind){
  if(S.editing)finishEdit();
  try{await document.fonts.ready}catch{}
  const sc=buildScene();if(!sc){toast('No hay cuadros visibles que exportar.');return}
  if(kind==='svg'){saveFile(fileBase()+'.svg',sceneSVG(sc));return}
  const blob=await scenePNG(sc);if(!blob){toast('No se pudo generar la imagen.');return}
  saveFile(fileBase()+'.png',blob);
}

/* =====================================================================
   Importar
   ===================================================================== */
function importText(text){
  let obj;try{obj=JSON.parse(text)}catch{toast('El archivo no es un JSON válido.',{ms:4000});return false}
  const list=obj&&obj.format==='mapamental-coleccion'&&Array.isArray(obj.maps)?obj.maps:Array.isArray(obj)?obj:[obj];
  const names=new Set(Store.index().map(x=>x.name));let first=null,ok=0,bad=0;
  for(const raw of list){
    try{const m=normalizeMap(raw,false);if(names.has(m.name))m.name+=' (importado)';names.add(m.name);m.updated=Date.now();Store.save(m);Cloud.queue(m.id,500);ok++;first=first||m.id}
    catch{bad++}
  }
  if(!first){toast('No se encontró ningún mapa válido en el archivo.',{ms:4000});return false}
  if(map)saveNow();openMap(first);
  toast((ok>1?`${ok} mapas importados`:'Mapa importado')+(bad?` · ${bad} con errores`:''));
  if(!$('#drawer').hidden)renderMapList();
  return true;
}
$('#fileinp').addEventListener('change',async e=>{const f=e.target.files[0];e.target.value='';if(f)importText(await f.text())});
addEventListener('dragover',e=>{if([...(e.dataTransfer?.types||[])].includes('Files'))e.preventDefault()});
addEventListener('drop',async e=>{const f=e.dataTransfer?.files?.[0];if(!f)return;e.preventDefault();if(/json/i.test(f.type)||/\.json$/i.test(f.name))importText(await f.text());else toast('Suelta un archivo .json exportado desde esta aplicación.')});
function pasteDialog(){
  openModal(`<h2>Pegar JSON</h2><p>Pega un mapa exportado (o una copia de seguridad con varios mapas). Se añadirá como mapa nuevo.</p><textarea id="pj" placeholder='{"format":"mapamental", "nodes":[...], "edges":[...]}' autofocus></textarea>
  <div class="acts"><button class="btn" data-c>Cancelar</button><button class="btn primary" data-ok>Importar</button></div>`,
  m=>{m.querySelector('[data-c]').onclick=closeModal;m.querySelector('[data-ok]').onclick=()=>{if(importText(m.querySelector('#pj').value))closeModal()}});
}

/* =====================================================================
   Mis mapas
   ===================================================================== */
const drawer=$('#drawer');
let mapDeleting=null,mapRenaming=null;
const rtf=new Intl.RelativeTimeFormat('es',{numeric:'auto'});
function ago(t){const s=(t-Date.now())/1000,a=Math.abs(s);
  return a<60?'ahora mismo':a<3600?rtf.format(Math.round(s/60),'minute'):a<86400?rtf.format(Math.round(s/3600),'hour'):a<86400*30?rtf.format(Math.round(s/86400),'day'):new Date(t).toLocaleDateString('es')}
function renderMapList(){
  const idx=Store.index().sort((a,b)=>b.updated-a.updated);
  $('#maplist').innerHTML=idx.map(m=>{
    const cur=map&&m.id===map.id;
    if(mapRenaming===m.id)return`<li class="mapitem${cur?' cur':''}"><form data-ren="${m.id}" style="flex:1;display:flex;gap:6px;padding:6px"><input class="textin" id="mren" value="${esc(m.name)}" maxlength="120" aria-label="Nuevo nombre"><button class="btn sm primary">Guardar</button></form></li>`;
    if(mapDeleting===m.id)return`<li class="mapitem"><div class="confirm-inline" style="flex:1">¿Eliminar «${esc(m.name)}»?<button class="btn sm danger" data-delok="${m.id}">Eliminar</button><button class="btn sm" data-cancel>No</button></div></li>`;
    return`<li class="mapitem${cur?' cur':''}"><button class="mapopen" data-open="${m.id}"${cur?' aria-current="true"':''}><b>${esc(m.name)}</b><small>${m.count} cuadro${m.count===1?'':'s'} · ${ago(m.updated)}</small></button>
      <button class="ibtn" data-ren="${m.id}" title="Renombrar" aria-label="Renombrar ${esc(m.name)}">${I.edit}</button>
      <button class="ibtn" data-dup="${m.id}" title="Duplicar" aria-label="Duplicar ${esc(m.name)}">${I.copy}</button>
      <button class="ibtn" data-del="${m.id}" title="Eliminar" aria-label="Eliminar ${esc(m.name)}">${I.trash}</button></li>`;
  }).join('');
  const r=$('#mren');if(r&&document.activeElement!==r){r.focus();r.select()}
}
$('#maplist').addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;const d=b.dataset;
  if(d.open){if(!map||d.open!==map.id){saveNow();openMap(d.open)}if(innerWidth<900)drawer.hidden=true;else renderMapList()}
  else if(d.ren&&b.tagName==='BUTTON'&&!b.closest('form')){mapRenaming=d.ren;mapDeleting=null;renderMapList()}
  else if(d.dup){saveNow();const raw=Store.load(d.dup);if(raw){const m=normalizeMap(raw,false);m.name=raw.name+' (copia)';m.updated=Date.now();Store.save(m);Cloud.queue(m.id,500);renderMapList();toast('Mapa duplicado')}}
  else if(d.del){mapDeleting=d.del;mapRenaming=null;renderMapList()}
  else if(d.cancel!==undefined){mapDeleting=null;renderMapList()}
  else if(d.delok){
    const id=d.delok;Store.remove(id,true);Cloud.queue(id,0);mapDeleting=null;
    if(map&&map.id===id){map=null;openMostRecent()}
    renderMapList();toast('Mapa eliminado');
  }
});
$('#maplist').addEventListener('submit',e=>{
  e.preventDefault();const id=e.target.dataset.ren,nm=($('#mren').value||'').trim().slice(0,120);mapRenaming=null;
  if(nm){if(map&&map.id===id){map.name=nm;updateTitle();commit();saveNow()}else{const raw=Store.load(id);if(raw){const m=normalizeMap(raw,true);m.name=nm;m.updated=Date.now();Store.save(m);Cloud.queue(id)}}}
  renderMapList();
});
$('#maplist').addEventListener('keydown',e=>{if(e.key==='Escape'&&mapRenaming){e.stopPropagation();mapRenaming=null;renderMapList()}});
$('#newmap').onclick=()=>{saveNow();newMapFlow();if(innerWidth<900)drawer.hidden=true;else renderMapList()};
$('#importbtn2').onclick=()=>$('#fileinp').click();
$('#drawerclose').onclick=()=>drawer.hidden=true;

/* =====================================================================
   Abrir y crear mapas
   ===================================================================== */
function openMap(id,opts={}){
  const raw=Store.load(id);if(!raw)return false;
  if(S.editing){S.editing=null}
  if(S.anim){cancelAnimationFrame(S.anim.raf);S.anim=null}
  let m;try{m=normalizeMap(raw,true)}catch{return false}
  m.id=id;map=m;reindex();
  for(const el of els.values())el.remove();els.clear();
  S.sel.clear();S.edge=null;
  if(!opts.keep){S.filter.clear();S.filterHide=false;closeSearch()}
  closePop();Store.setLast(id);updateTitle();render();
  if(!opts.keep){
    if(map.view){S.view={...map.view};applyView();
      const vs=vpSize(),k=S.view.k,anyIn=map.nodes.filter(shown).some(n=>{const x=n.x*k+S.view.x,y=n.y*k+S.view.y;return x<vs.w&&y<vs.h&&x+n._w*k>0&&y+n._h*k>0});
      if(!anyIn)fitView(false)}
    else fitView(false)}
  resetHistory();refreshTagPanel();updateFilterChip();setSaveState();
  return true;
}
function openMostRecent(){
  const idx=Store.index().sort((a,b)=>b.updated-a.updated);
  for(const x of idx)if(openMap(x.id))return;
  newMapFlow(true);
}
function newMapFlow(silent){
  const m=blankMap('Mapa sin título');
  m.nodes.push({id:uid('n'),x:-110,y:-40,text:'Idea central',color:DEFAULT_COLOR,fontSize:22,bold:true,width:'auto',tags:[],collapsed:false});
  Store.save(m);Cloud.queue(m.id,500);openMap(m.id);
  const n=map.nodes[0];S.view.k=1;const vs=vpSize();S.view.x=vs.w/2-(n.x+n._w/2);S.view.y=vs.h/2-(n.y+n._h/2);applyView();
  if(!silent){startEdit(n.id);toast('Mapa nuevo creado',{ms:1500})}
}
function createSample(){
  const raw={name:'Viaje a Lisboa',
    tags:[{id:'t1',name:'pendiente',color:'#E5484D'},{id:'t2',name:'reservado',color:'#46A758'},{id:'t3',name:'idea',color:'#0090FF'}],
    nodes:[
      {id:'a',text:'Viaje a Lisboa',fontSize:24,bold:true,color:'#F2B544'},
      {id:'b',text:'Presupuesto',color:'#EF6F5E',tags:['t1']},{id:'b1',text:'Vuelos ida y vuelta\n~180 €',color:'#EF6F5E',tags:['t2']},{id:'b2',text:'Comidas: 40 € al día',color:'#EF6F5E'},
      {id:'c',text:'Alojamiento',color:'#5B8DEF'},{id:'c1',text:'Alfama',color:'#5B8DEF',tags:['t3']},{id:'c2',text:'Baixa-Chiado',color:'#5B8DEF',tags:['t2']},
      {id:'d',text:'Qué ver',color:'#3DBFA6'},{id:'d1',text:'Torre de Belém',color:'#3DBFA6'},{id:'d2',text:'Tranvía 28',color:'#3DBFA6',tags:['t3']},{id:'d3',text:'LX Factory',color:'#3DBFA6',tags:['t3','t1']},
      {id:'e',text:'Transporte',color:'#C77DD6'},{id:'e1',text:'Tarjeta Viva Viagem',color:'#C77DD6',tags:['t1']}],
    edges:[{from:'a',to:'b'},{from:'b',to:'b1'},{from:'b',to:'b2'},{from:'a',to:'c'},{from:'c',to:'c1',label:'opción A'},{from:'c',to:'c2',label:'opción B'},
      {from:'a',to:'d'},{from:'d',to:'d1'},{from:'d',to:'d2'},{from:'d',to:'d3'},{from:'a',to:'e'},{from:'e',to:'e1'},
      {from:'d2',to:'c1',label:'pasa por',dashed:true,arrow:'end',style:'curve',width:1.5,color:'#5F6878'}]};
  const m=normalizeMap(raw,false);
  m.nodes.forEach((n,i)=>{n.x=(i%5)*200;n.y=Math.floor(i/5)*130});
  Store.save(m);openMap(m.id);
  const lay=()=>{measure();S.sel.clear();runLayout('mindmap',{instant:true});resetHistory();saveNow()};
  lay();
  if(document.fonts&&document.fonts.status!=='loaded')document.fonts.ready.then(()=>{if(map&&map.id===m.id&&H.i===0){for(const el of els.values())el._sig=null;render();lay()}});
}

/* =====================================================================
   Título, tema y barra de herramientas
   ===================================================================== */
const titleBtn=$('#map-title');
function updateTitle(){titleBtn.textContent=map?map.name:'';document.title=map?`${map.name} · Mapas mentales`:'Mapas mentales'}
titleBtn.onclick=()=>{
  const inp=document.createElement('input');inp.className='map-title-input';inp.value=map.name;inp.maxLength=120;inp.setAttribute('aria-label','Nombre del mapa');
  titleBtn.replaceWith(inp);inp.focus();inp.select();
  let done=false;const end=ok=>{if(done)return;done=true;const v=inp.value.trim();inp.replaceWith(titleBtn);if(ok&&v&&v!==map.name){map.name=v;commit();saveNow()}updateTitle()};
  inp.onkeydown=e=>{e.stopPropagation();if(e.key==='Enter')end(true);if(e.key==='Escape')end(false)};inp.onblur=()=>end(true);
};
function applyTheme(){
  if(P.theme)document.documentElement.dataset.theme=P.theme;else delete document.documentElement.dataset.theme;
  const dark=P.theme?P.theme==='dark':matchMedia('(prefers-color-scheme: dark)').matches;
  const b=$('#btn-theme');b.innerHTML=dark?I.sun:I.moon;b.title=dark?'Cambiar a tema claro':'Cambiar a tema oscuro';
  scheduleMinimap();
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',applyTheme);
$('#btn-theme').onclick=()=>{const dark=P.theme?P.theme==='dark':matchMedia('(prefers-color-scheme: dark)').matches;P.theme=dark?'light':'dark';savePrefs();applyTheme()};
$('#btn-undo').onclick=undo;$('#btn-redo').onclick=redo;
$('#btn-layout').onclick=e=>togglePop('layout',e.currentTarget,layoutHTML,layoutHandlers,{wide:true});
$('#btn-magnet').onclick=e=>togglePop('magnet',e.currentTarget,magnetHTML,magnetHandlers,{wide:true});
$('#btn-file').onclick=e=>togglePop('file',e.currentTarget,fileHTML,fileHandlers,{wide:true});
$('#btn-select').onclick=e=>{S.tool=S.tool==='select'?'pan':'select';e.currentTarget.setAttribute('aria-pressed',String(S.tool==='select'));
  if(S.tool==='select')toast('Modo selección: arrastra sobre el fondo para seleccionar varios cuadros',{ms:2600})};
$('#btn-tags').onclick=()=>{if(tagPanel.hidden)openTagPanel();else tagPanel.hidden=true};
$('#btn-search').onclick=()=>{if(sbar.hidden)openSearch();else closeSearch()};
$('#btn-help').onclick=helpDialog;
$('#btn-maps').onclick=()=>{if(drawer.hidden){tagPanel.hidden=true;mapDeleting=mapRenaming=null;drawer.hidden=false;renderMapList()}else drawer.hidden=true};
$('#btn-zin').onclick=()=>{const v=vpSize();zoomAt({x:v.w/2,y:v.h/2},1.25)};
$('#btn-zout').onclick=()=>{const v=vpSize();zoomAt({x:v.w/2,y:v.h/2},.8)};
$('#zoomlbl').onclick=()=>{const v=vpSize();zoomAt({x:v.w/2,y:v.h/2},1/S.view.k)};
$('#btn-fit').onclick=()=>fitView(true);
function applyMini(){mmBox.hidden=!P.minimap;$('#btn-mini').setAttribute('aria-pressed',String(P.minimap));scheduleMinimap()}
$('#btn-mini').onclick=()=>{P.minimap=!P.minimap;savePrefs();applyMini()};
$('#hintclose').onclick=()=>{$('#hint').hidden=true;P.hint=false;savePrefs()};

/* =====================================================================
   Inicio
   ===================================================================== */
function init(){
  paintIcons();applyTheme();updateMagnetUI();applyMini();
  const idx=Store.index();let id=Store.last();
  if(!idx.some(x=>x.id===id))id=(idx.sort((a,b)=>b.updated-a.updated)[0]||{}).id;
  if(!(id&&openMap(id)))createSample();
  $('#hint').hidden=!P.hint;
  if(document.fonts)document.fonts.ready.then(()=>{if(!map)return;for(const el of els.values())el._sig=null;render()});
  setSaveState();
  Cloud.init();getDownloads();
}
init();
})();
</script>
</body>
</html>
