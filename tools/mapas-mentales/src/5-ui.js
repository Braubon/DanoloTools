
/* =====================================================================
   Paneles emergentes
   ===================================================================== */
let popState=null;
function openPop(key,anchor,htmlFn,handlers={},opts={}){
  const isEl=anchor instanceof Element;
  popState={key,anchorEl:isEl?anchor:null,pt:isEl?null:anchor,htmlFn,h:handlers,onClose:opts.onClose,wide:opts.wide};
  popEl.hidden=false;popEl.style.width=opts.wide?'340px':'';
  renderPop();positionPop();
  if(opts.focus){const f=popEl.querySelector(opts.focus);if(f&&!(matchMedia('(pointer:coarse)').matches&&opts.noTouchFocus))f.focus()}
}
function togglePop(key,anchor,htmlFn,handlers,opts){if(popState&&popState.key===key){closePop();return}openPop(key,anchor,htmlFn,handlers,opts)}
function renderPop(){
  if(!popState)return;
  const st=popEl.scrollTop,fid=document.activeElement&&popEl.contains(document.activeElement)?document.activeElement.id:null;
  popEl.innerHTML=popState.htmlFn();paintIcons(popEl);popEl.scrollTop=st;
  if(fid){const f=document.getElementById(fid);if(f){f.focus();if(f.setSelectionRange&&f.value!=null){try{f.setSelectionRange(f.value.length,f.value.length)}catch{}}}}
}
function positionPop(){
  if(!popState)return;
  const sheet=innerWidth<640;popEl.classList.toggle('sheet',sheet);
  if(sheet){popEl.style.left='';popEl.style.top='';return}
  let ax,ay,atop;
  if(popState.anchorEl){const r=popState.anchorEl.getBoundingClientRect();ax=r.left;ay=r.bottom;atop=r.top}else{ax=popState.pt.x;ay=popState.pt.y;atop=popState.pt.top}
  popEl.style.left='0px';popEl.style.top='0px';
  const pr=popEl.getBoundingClientRect();
  let x=ax-(popState.anchorEl?pr.width/2-14:0),y=ay+8;
  x=clamp(x,8,innerWidth-pr.width-8);
  if(y+pr.height>innerHeight-8)y=Math.max(8,atop-pr.height-8);
  popEl.style.left=x+'px';popEl.style.top=y+'px';
}
function closePop(){if(!popState)return;const st=popState;popState=null;popEl.hidden=true;popEl.innerHTML='';st.onClose&&st.onClose()}
for(const ev of ['click','input','change','keydown','submit'])popEl.addEventListener(ev,e=>{if(popState&&popState.h[ev])popState.h[ev](e)});
document.addEventListener('pointerdown',e=>{
  if(popState&&!popEl.contains(e.target)&&!(popState.anchorEl&&popState.anchorEl.contains(e.target))){
    if(e.target.closest&&e.target.closest('.node button[data-act]'))return;
    closePop();
  }
},true);
addEventListener('resize',()=>{positionPop();scheduleMinimap()});

const seg=(attr,opts,cur)=>`<div class="seg">${opts.map(([v,l])=>`<button data-${attr}="${v}" aria-pressed="${String(v)===String(cur)}">${l}</button>`).join('')}</div>`;

/* ---------- Ajustes del cuadro ---------- */
function styleHTML(id){
  const ts=targetsFor(id),n=ts[0];if(!n)return'';
  const kids=(S.outCount.get(n.id)||0)>0;
  return `<div class="pop-h">Ajustes${ts.length>1?` <small>${ts.length} cuadros</small>`:''}</div>
  <div class="field"><label>Color</label><div class="swatches">${NODE_COLORS.map(c=>`<button class="sw${c===n.color?' on':''}" data-color="${c}" style="--sw:${c}" aria-label="Color ${c}"></button>`).join('')}
    <label class="sw sw-custom${NODE_COLORS.includes(n.color)?'':' on'}" title="Color personalizado"><input type="color" id="pcol" value="${n.color}" aria-label="Color personalizado"></label></div></div>
  <div class="field"><label>Tamaño de letra</label><div class="row">
    <button class="btn sm" data-fs="-2" aria-label="Reducir letra">A−</button><output class="fsout">${n.fontSize}</output><button class="btn sm" data-fs="2" aria-label="Aumentar letra">A+</button>
    ${seg('fset',[[13,'S'],[16,'M'],[22,'L'],[30,'XL']],n.fontSize)}</div></div>
  <div class="field"><label>Estilo y ancho</label><div class="row">${seg('bold',[['0','Normal'],['1','<b>Negrita</b>']],n.bold?'1':'0')}</div>
    ${seg('w',[['auto','Auto'],[160,'Estrecho'],[240,'Medio'],[320,'Ancho']],n.width)}</div>
  <div class="pop-actions">
    <button class="btn" data-a="edit">${I.edit}Editar texto</button>
    <button class="btn" data-a="child">${I.child}Añadir hijo</button>
    <button class="btn" data-a="dup">${I.copy}Duplicar</button>
    ${kids?`<button class="btn" data-a="collapse">${I.chev}${n.collapsed?'Desplegar':'Plegar'}</button>`:''}
    <button class="btn danger" data-a="del">${I.trash}Eliminar</button>
  </div>`;
}
function bindStylePop(id){
  const apply=(fn,save=true)=>{for(const n of targetsFor(id)){fn(n);const el=els.get(n.id);if(el)el._sig=null}render();if(save)commit();renderPop()};
  return{
    click(e){
      const b=e.target.closest('button');if(!b)return;const d=b.dataset;
      if(d.color)apply(n=>n.color=d.color);
      else if(d.fs)apply(n=>n.fontSize=clamp(n.fontSize+ +d.fs,10,64));
      else if(d.fset)apply(n=>n.fontSize=+d.fset);
      else if(d.bold)apply(n=>n.bold=d.bold==='1');
      else if(d.w)apply(n=>n.width=d.w==='auto'?'auto':+d.w);
      else if(d.a==='edit'){closePop();startEdit(id)}
      else if(d.a==='child'){closePop();addChild(id)}
      else if(d.a==='dup'){closePop();if(!S.sel.has(id))S.sel=new Set([id]);duplicateSel()}
      else if(d.a==='collapse'){closePop();toggleCollapse(id)}
      else if(d.a==='del'){closePop();if(!S.sel.has(id))S.sel=new Set([id]);deleteSelection()}
    },
    input(e){if(e.target.id==='pcol'){const c=e.target.value;for(const n of targetsFor(id)){n.color=c;const el=els.get(n.id);if(el)el._sig=null}render()}},
    change(e){if(e.target.id==='pcol'){commit();renderPop()}}
  };
}

/* ---------- Etiquetas del cuadro ---------- */
let tagQ='',tagAct=0;
function tagSuggestions(id){
  const ts=targetsFor(id),q=norm(tagQ);
  const list=map.tags.filter(t=>!ts.every(n=>n.tags.includes(t.id))&&(!q||norm(t.name).includes(q)));
  const exact=map.tags.some(t=>norm(t.name)===q);
  return{list:list.slice(0,6),create:q&&!exact?tagQ.trim().replace(/^#/,''):null};
}
function suggHTML(id){
  const sg=tagSuggestions(id);
  const items=[...sg.list.map(t=>`<button data-add="${t.id}" style="--tc:${t.color}"><i></i>${esc(t.name)}</button>`),
    ...(sg.create?[`<button data-create="1">${I.plus}Crear «${esc(sg.create)}»</button>`]:[])];
  return items.map((h,i)=>h.replace('<button',`<button class="${i===tagAct?'act':''}"`)).join('');
}
function tagsHTML(id){
  const ts=targetsFor(id),n=ts[0];if(!n)return'';
  const on=map.tags.filter(t=>ts.every(x=>x.tags.includes(t.id)));
  return `<div class="pop-h">Etiquetas${ts.length>1?` <small>${ts.length} cuadros</small>`:''}</div>
  <div class="field"><div class="tagchips">${on.length?on.map(t=>`<span class="tchip" style="--tc:${t.color}"><i></i>${esc(t.name)}<button class="x" data-rm="${t.id}" aria-label="Quitar ${esc(t.name)}" style="border:0;background:none;padding:0;cursor:pointer">${I.x}</button></span>`).join(''):'<span class="empty">Sin etiquetas todavía.</span>'}</div></div>
  <div class="field"><label for="tagq">Añadir</label><input class="textin" id="tagq" placeholder="Escribe y pulsa Intro" autocomplete="off" maxlength="40" value="${esc(tagQ)}">
    <div class="sugg">${suggHTML(id)}</div></div>
  ${map.tags.length?`<div class="field"><span class="mini-h">Todas las etiquetas del mapa</span><div class="tagchips">${map.tags.map(t=>`<button class="tchip" data-toggle="${t.id}" aria-pressed="${on.includes(t)}" style="--tc:${t.color}"><i></i>${esc(t.name)}</button>`).join('')}</div></div>`:''}
  <button class="linkbtn" data-a="manage">Gestionar etiquetas y filtrar…</button>`;
}
function bindTagsPop(id){
  tagQ='';tagAct=0;
  const refreshSugg=()=>{const s=popEl.querySelector('.sugg');if(s)s.innerHTML=suggHTML(id)};
  const add=tid=>{for(const n of targetsFor(id))if(!n.tags.includes(tid))n.tags.push(tid);tagQ='';tagAct=0;render();commit();renderPop();$('#tagq')?.focus()};
  return{
    click(e){
      const b=e.target.closest('button');if(!b)return;const d=b.dataset;
      if(d.rm){for(const n of targetsFor(id))n.tags=n.tags.filter(t=>t!==d.rm);render();commit();renderPop()}
      else if(d.add)add(d.add);
      else if(d.create){const t=ensureTag(tagQ);if(t)add(t.id)}
      else if(d.toggle){const ts=targetsFor(id),all=ts.every(n=>n.tags.includes(d.toggle));
        for(const n of ts){if(all)n.tags=n.tags.filter(t=>t!==d.toggle);else if(!n.tags.includes(d.toggle))n.tags.push(d.toggle)}render();commit();renderPop()}
      else if(d.a==='manage'){closePop();openTagPanel()}
    },
    input(e){if(e.target.id==='tagq'){tagQ=e.target.value;tagAct=0;refreshSugg()}},
    keydown(e){
      if(e.target.id!=='tagq')return;
      const sg=tagSuggestions(id),n=sg.list.length+(sg.create?1:0);
      if(e.key==='ArrowDown'){e.preventDefault();tagAct=(tagAct+1)%Math.max(n,1);refreshSugg()}
      else if(e.key==='ArrowUp'){e.preventDefault();tagAct=(tagAct-1+Math.max(n,1))%Math.max(n,1);refreshSugg()}
      else if(e.key==='Enter'){e.preventDefault();
        if(tagAct<sg.list.length)add(sg.list[tagAct].id);else if(sg.create){const t=ensureTag(sg.create);if(t)add(t.id)}}
    }
  };
}

/* ---------- Ajustes de la línea ---------- */
const EDGE_COLORS=['#B98A2E','#C46A1C','#C2483A','#B9506E','#9A55AA','#6352C4','#3569D1','#2B88AE','#1E8F7A','#4C9450','#7F8A3A','#5F6878','#1F2329'];
function openEdgePop(eid,pt,focusLabel){
  const e=map.edges.find(x=>x.id===eid);if(!e)return;
  if(S.editing)finishEdit();
  S.edge=eid;S.sel.clear();updateClasses();renderEdges();
  openPop('edge:'+eid,pt,()=>{
    const e=map.edges.find(x=>x.id===eid);if(!e)return'';
    const a=byId.get(e.from),b=byId.get(e.to);
    return `<div class="pop-h">Línea <small>${esc((a?.text||'').slice(0,18))} → ${esc((b?.text||'').slice(0,18))}</small></div>
    <div class="field"><label for="elab">Texto de la línea</label><input class="textin" id="elab" value="${esc(e.label)}" placeholder="Sin texto" maxlength="200" autocomplete="off"></div>
    <div class="field"><label>Flecha</label>${seg('arrow',[['none','Sin flecha'],['end','→'],['start','←'],['both','↔']],e.arrow)}</div>
    <div class="field"><label>Trazo</label>${seg('style',[['curve','Curva'],['straight','Recta'],['ortho','En ángulo']],e.style)}</div>
    <div class="field"><label>Línea</label>${seg('dashed',[['0','Continua'],['1','Discontinua']],e.dashed?'1':'0')}${seg('width',[[1,'Fina'],[2,'Normal'],[3,'Gruesa'],[5,'Muy gruesa']],e.width)}</div>
    <div class="field"><label>Color</label><div class="swatches"><button class="sw sw-auto${e.color?'':' on'}" data-ecolor="" title="Automático: el color del cuadro de origen" aria-label="Color automático">A</button>${EDGE_COLORS.map(c=>`<button class="sw${c===e.color?' on':''}" data-ecolor="${c}" style="--sw:${c}" aria-label="Color ${c}"></button>`).join('')}</div></div>
    <div class="pop-actions">
      <button class="btn" data-a="reverse">Invertir sentido</button>
      <button class="btn" data-a="default">Usar por defecto</button>
      <button class="btn" data-a="all">Aplicar a todas</button>
      <button class="btn danger" data-a="del">${I.trash}Eliminar</button>
    </div>`;
  },{
    click(ev){
      const bt=ev.target.closest('button');if(!bt)return;const d=bt.dataset;
      const e=map.edges.find(x=>x.id===eid);if(!e)return;
      const done=()=>{renderEdges();commit();renderPop()};
      if(d.arrow){e.arrow=d.arrow;done()}
      else if(d.style){e.style=d.style;done()}
      else if(d.dashed){e.dashed=d.dashed==='1';done()}
      else if(d.width){e.width=+d.width;done()}
      else if(d.ecolor!==undefined){e.color=d.ecolor||null;done()}
      else if(d.a==='reverse'){[e.from,e.to]=[e.to,e.from];render();commit();renderPop()}
      else if(d.a==='default'){map.settings.edge={style:e.style,arrow:e.arrow,color:e.color,dashed:e.dashed,width:e.width};commit();toast('Las líneas nuevas usarán este estilo',{ms:2200})}
      else if(d.a==='all'){for(const x of map.edges){x.style=e.style;x.arrow=e.arrow;x.color=e.color;x.dashed=e.dashed;x.width=e.width}
        map.settings.edge={style:e.style,arrow:e.arrow,color:e.color,dashed:e.dashed,width:e.width};done();toast('Estilo aplicado a todas las líneas',{ms:2200})}
      else if(d.a==='del'){closePop();S.edge=eid;deleteSelection()}
    },
    input(ev){if(ev.target.id==='elab'){const e=map.edges.find(x=>x.id===eid);if(e){e.label=ev.target.value;renderEdges()}}},
    change(ev){if(ev.target.id==='elab')commit()},
    keydown(ev){if(ev.target.id==='elab'&&ev.key==='Enter'){ev.preventDefault();commit();closePop()}}
  },{focus:focusLabel?'#elab':null,onClose:()=>{if(S.edge===eid){S.edge=null;renderEdges()}}});
}

/* ---------- Menú organizar ---------- */
function layoutHTML(){
  return `<div class="pop-h">Organizar automáticamente</div><div class="menu">${Object.entries(LAYOUTS).map(([k,[t,s]])=>
    `<button data-layout="${k}">${L_ICONS[k]}<span class="mi-t"><b>${t}</b><small>${s}</small></span></button>`).join('')}</div>
  <div class="field"><label>Separación</label>${seg('sp',[[.75,'Compacta'],[1,'Normal'],[1.4,'Amplia']],P.spacing)}</div>
  <p class="note">La idea central es el cuadro sin padre del que cuelgan más ramas. Las ramas plegadas se mueven con su cuadro. Puedes deshacer con Ctrl+Z.</p>`;
}
const layoutHandlers={click(e){const b=e.target.closest('button');if(!b)return;
  if(b.dataset.layout){closePop();runLayout(b.dataset.layout)}
  else if(b.dataset.sp){P.spacing=+b.dataset.sp;savePrefs();renderPop()}}};

/* ---------- Menú imán ---------- */
const MAGNETS=[['guides','Guías de alineación','Al mover, el cuadro se pega a bordes y centros de otros'],['grid','Ajustar a la rejilla','Las posiciones caen en múltiplos de 24 px'],
  ['magnet','Conexión magnética','La línea se engancha al cuadro más cercano'],['repel','Repulsión','Al soltar, aparta los cuadros que se solapan'],['animate','Animar transiciones','Movimiento suave al organizar']];
function magnetHTML(){
  return `<div class="pop-h">Imán</div><div class="menu">${MAGNETS.map(([k,t,s])=>
    `<label class="mi" for="mg-${k}"><span class="mi-t"><b>${t}</b><small>${s}</small></span><input type="checkbox" class="switch" id="mg-${k}" data-pref="${k}"${P[k]?' checked':''}></label>`).join('')}</div>
    <button class="btn" data-a="spread" style="width:100%">Separar ahora los cuadros solapados</button>`;
}
const magnetHandlers={
  change(e){const k=e.target.dataset.pref;if(!k)return;P[k]=e.target.checked;savePrefs();updateMagnetUI()},
  click(e){if(e.target.closest('[data-a="spread"]')){closePop();measure();animateNodes(resolveOverlaps(()=>false),()=>commit())}}
};
function updateMagnetUI(){VP.classList.toggle('grid-on',P.grid);const on=P.guides||P.grid||P.magnet||P.repel;$('#btn-magnet').setAttribute('aria-pressed',String(on))}

/* ---------- Menú archivo ---------- */
function fileHTML(){
  return `<div class="pop-h">Exportar e importar</div><div class="menu">
    <button data-f="json">${I.json}<span class="mi-t"><b>Descargar este mapa (JSON)</b><small>Para guardarlo o abrirlo en otro dispositivo</small></span></button>
    <button data-f="jsonall">${I.json}<span class="mi-t"><b>Descargar todos los mapas (JSON)</b><small>Copia de seguridad completa</small></span></button>
    <button data-f="copy">${I.copy}<span class="mi-t"><b>Copiar JSON</b><small>Al portapapeles</small></span></button>
    <button data-f="png">${I.image}<span class="mi-t"><b>Imagen PNG</b><small>Alta resolución</small></span></button>
    <button data-f="svg">${I.image}<span class="mi-t"><b>Imagen SVG</b><small>Vectorial, editable</small></span></button>
    <hr>
    <button data-f="import">${I.upload}<span class="mi-t"><b>Importar archivo JSON…</b><small>Se añade como mapa nuevo; también puedes soltarlo en el lienzo</small></span></button>
    <button data-f="paste">${I.paste}<span class="mi-t"><b>Pegar JSON…</b></span></button>
  </div>`;
}
const fileHandlers={click(e){const b=e.target.closest('button[data-f]');if(!b)return;const f=b.dataset.f;closePop();
  if(f==='json')exportJSON(false);else if(f==='jsonall')exportJSON(true);else if(f==='copy')copyJSON();
  else if(f==='png')exportImage('png');else if(f==='svg')exportImage('svg');
  else if(f==='import')$('#fileinp').click();else if(f==='paste')pasteDialog()}};

/* =====================================================================
   Panel de etiquetas y filtro
   ===================================================================== */
const tagPanel=$('#tagpanel');
let tagEditing=null,tagDeleting=null;
function openTagPanel(){$('#drawer').hidden=true;tagPanel.hidden=false;refreshTagPanel()}
function refreshTagPanel(){
  if(tagPanel.hidden||!map)return;
  for(const b of $$('#fmode button'))b.setAttribute('aria-pressed',String((b.dataset.m==='hide')===S.filterHide));
  const cnt=new Map();for(const n of map.nodes)for(const t of n.tags)cnt.set(t,(cnt.get(t)||0)+1);
  $('#taglist').innerHTML=map.tags.length?map.tags.map(t=>{
    let extra='';
    if(tagEditing===t.id)extra=`<div class="tagedit"><input class="textin" id="tren" value="${esc(t.name)}" maxlength="40" aria-label="Nombre de la etiqueta"><div class="swatches">${TAG_COLORS.map(c=>`<button class="sw${c===t.color?' on':''}" data-tcolor="${c}" style="--sw:${c}" aria-label="Color ${c}"></button>`).join('')}</div><div class="row"><button class="btn sm primary" data-tsave="${t.id}">Guardar</button><button class="btn sm" data-tcancel>Cancelar</button></div></div>`;
    if(tagDeleting===t.id)extra=`<div class="confirm-inline">¿Eliminar «${esc(t.name)}» de ${cnt.get(t.id)||0} cuadros?<button class="btn sm danger" data-tdelok="${t.id}">Eliminar</button><button class="btn sm" data-tcancel>No</button></div>`;
    return `<li><div class="tagrow"><button class="tchip" data-tf="${t.id}" aria-pressed="${S.filter.has(t.id)}" style="--tc:${t.color}"><i></i>${esc(t.name)}<em>${cnt.get(t.id)||0}</em></button>
      <button class="ibtn" data-tedit="${t.id}" title="Renombrar o cambiar color" aria-label="Editar ${esc(t.name)}">${I.edit}</button>
      <button class="ibtn" data-tdel="${t.id}" title="Eliminar etiqueta" aria-label="Eliminar ${esc(t.name)}">${I.trash}</button></div>${extra}</li>`}).join('')
    :'<li class="empty" style="padding:8px">Este mapa aún no tiene etiquetas. Crea una aquí o desde el icono de etiqueta de cualquier cuadro.</li>';
  const ren=$('#tren');if(ren&&document.activeElement!==ren){ren.focus();ren.select()}
}
let tagEditColor=null;
$('#taglist').addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;const d=b.dataset;
  if(d.tf){S.filter.has(d.tf)?S.filter.delete(d.tf):S.filter.add(d.tf);applyFilter()}
  else if(d.tedit){tagEditing=tagEditing===d.tedit?null:d.tedit;tagDeleting=null;tagEditColor=null;refreshTagPanel()}
  else if(d.tdel){tagDeleting=d.tdel;tagEditing=null;refreshTagPanel()}
  else if(d.tcancel!==undefined){tagEditing=tagDeleting=null;refreshTagPanel()}
  else if(d.tcolor){tagEditColor=d.tcolor;for(const s of $$('[data-tcolor]',$('#taglist')))s.classList.toggle('on',s.dataset.tcolor===d.tcolor)}
  else if(d.tsave){saveTagEdit(d.tsave)}
  else if(d.tdelok){const id=d.tdelok;map.tags=map.tags.filter(t=>t.id!==id);for(const n of map.nodes)n.tags=n.tags.filter(t=>t!==id);S.filter.delete(id);tagDeleting=null;S.tagVer++;render();commit();applyFilter()}
});
$('#taglist').addEventListener('keydown',e=>{if(e.target.id==='tren'&&e.key==='Enter'){e.preventDefault();saveTagEdit(tagEditing)}});
function saveTagEdit(id){
  const t=tagById(id);if(!t)return;
  const nm=($('#tren')?.value||'').trim().replace(/^#/,'').slice(0,40);
  if(nm&&map.tags.some(x=>x!==t&&norm(x.name)===norm(nm))){toast('Ya existe una etiqueta con ese nombre',{ms:2200});return}
  if(nm)t.name=nm;if(tagEditColor)t.color=tagEditColor;
  tagEditing=null;S.tagVer++;render();commit();refreshTagPanel();updateFilterChip();
}
$('#fmode').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;S.filterHide=b.dataset.m==='hide';applyFilter()});
$('#newtag').addEventListener('submit',e=>{e.preventDefault();const inp=$('#newtagname');const nm=inp.value.trim();if(!nm)return;
  if(map.tags.some(t=>norm(t.name)===norm(nm))){toast('Esa etiqueta ya existe',{ms:1800});return}
  ensureTag(nm);inp.value='';commit();refreshTagPanel()});
$('#tagpanelclose').addEventListener('click',()=>tagPanel.hidden=true);
function applyFilter(){
  if(S.filterHide)for(const id of [...S.sel]){const n=byId.get(id);if(n&&!matchFilter(n))S.sel.delete(id)}
  render();refreshTagPanel();updateFilterChip();
}
function updateFilterChip(){
  const chip=$('#filterchip');
  if(!S.filter.size){chip.hidden=true;return}
  const names=[...S.filter].map(id=>tagById(id)?.name).filter(Boolean);
  $('#filtertext').textContent=(S.filterHide?'Mostrando solo: ':'Destacando: ')+names.join(', ');
  chip.hidden=false;
}
$('#filterclear').addEventListener('click',()=>{S.filter.clear();applyFilter()});

/* =====================================================================
   Búsqueda
   ===================================================================== */
const sbar=$('#searchbar'),sq=$('#sq');
function openSearch(){sbar.hidden=false;sq.focus();sq.select();runSearch()}
function closeSearch(){sbar.hidden=true;S.search={q:'',hits:[],i:-1};sq.value='';$('#scount').textContent='';updateClasses()}
function runSearch(){
  const q=norm(sq.value);S.search.q=q;
  if(!q){S.search.hits=[];S.search.i=-1;$('#scount').textContent='';updateClasses();return}
  S.search.hits=map.nodes.filter(n=>norm(n.text).includes(q)||n.tags.some(t=>norm(tagById(t)?.name||'').includes(q))).map(n=>n.id);
  S.search.i=S.search.hits.length?0:-1;
  showHit();
}
function showHit(){
  const h=S.search.hits;$('#scount').textContent=h.length?`${S.search.i+1} de ${h.length}`:'Sin resultados';
  const id=h[S.search.i];
  if(id){
    let changed=false;
    for(const n of map.nodes)if(n.collapsed&&S.hidden.has(id)&&descendants(n.id).has(id)){n.collapsed=false;changed=true}
    if(S.filterHide&&!matchFilter(byId.get(id))){S.filterHide=false;changed=true}
    if(changed){render();commit()}
    S.sel=new Set([id]);centerOn(byId.get(id));
  }
  updateClasses();
}
sq.addEventListener('input',runSearch);
sq.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();stepHit(e.shiftKey?-1:1)}});
function stepHit(d){const n=S.search.hits.length;if(!n)return;S.search.i=(S.search.i+d+n)%n;showHit()}
$('#snext').addEventListener('click',()=>stepHit(1));
$('#sprev').addEventListener('click',()=>stepHit(-1));
$('#sclose').addEventListener('click',closeSearch);

/* =====================================================================
   Diálogos y avisos
   ===================================================================== */
function openModal(html,bind){modalEl.innerHTML=`<div class="dialog" role="dialog" aria-modal="true">${html}</div>`;paintIcons(modalEl);modalEl.hidden=false;bind&&bind(modalEl);
  const f=modalEl.querySelector('[autofocus]')||modalEl.querySelector('button');f&&f.focus()}
function closeModal(){modalEl.hidden=true;modalEl.innerHTML=''}
modalEl.addEventListener('pointerdown',e=>{if(e.target===modalEl)closeModal()});
function confirmDialog(title,text,ok='Eliminar'){
  return new Promise(res=>{
    openModal(`<h2>${esc(title)}</h2><p>${esc(text)}</p><div class="acts"><button class="btn" data-r="0">Cancelar</button><button class="btn primary" data-r="1" autofocus>${esc(ok)}</button></div>`,
      m=>m.addEventListener('click',e=>{const b=e.target.closest('[data-r]');if(b){closeModal();res(b.dataset.r==='1')}}));
  });
}
function toast(msg,o={}){
  const t=document.createElement('div');t.className='toast';t.innerHTML=`<span>${esc(msg)}</span>`;
  if(o.action){const b=document.createElement('button');b.textContent=o.action;b.onclick=()=>{t.remove();o.fn&&o.fn()};t.appendChild(b)}
  const box=$('#toasts');box.appendChild(t);while(box.children.length>3)box.firstChild.remove();
  setTimeout(()=>t.remove(),o.ms||(o.action?5000:3200));
}
function helpDialog(){
  openModal(`<h2>Cómo se usa</h2>
  <h3>Con ratón</h3><table class="keys">
  <tr><td>Mover un cuadro</td><td>Arrastra su barra superior</td></tr>
  <tr><td>Conectar dos cuadros</td><td>Arrastra desde el cuerpo de uno y suelta sobre otro</td></tr>
  <tr><td>Crear un cuadro conectado</td><td>Arrastra desde el cuerpo y suelta en el vacío</td></tr>
  <tr><td>Crear un cuadro suelto</td><td>Doble clic en el fondo</td></tr>
  <tr><td>Editar el texto</td><td>Doble clic en el cuadro · <kbd>Mayús</kbd>+<kbd>Intro</kbd> salto de línea</td></tr>
  <tr><td>Editar una línea</td><td>Clic sobre ella (texto, flecha, trazo, color)</td></tr>
  <tr><td>Selección múltiple</td><td><kbd>Mayús</kbd>+clic, o <kbd>Mayús</kbd>+arrastrar en el fondo</td></tr>
  <tr><td>Desplazar y hacer zoom</td><td>Arrastra el fondo · rueda del ratón</td></tr></table>
  <h3>En táctil</h3><table class="keys">
  <tr><td>Editar el texto</td><td>Doble toque en el cuadro</td></tr>
  <tr><td>Zoom</td><td>Pellizca con dos dedos</td></tr>
  <tr><td>Selección múltiple</td><td>Activa el modo selección en la barra y arrastra</td></tr></table>
  <h3>Atajos de teclado</h3><table class="keys">
  <tr><td><kbd>Tab</kbd></td><td>Nuevo cuadro hijo</td></tr>
  <tr><td><kbd>Intro</kbd></td><td>Nuevo cuadro hermano</td></tr>
  <tr><td><kbd>F2</kbd> o <kbd>Espacio</kbd></td><td>Editar el texto</td></tr>
  <tr><td><kbd>Supr</kbd></td><td>Eliminar la selección</td></tr>
  <tr><td>Flechas</td><td>Moverse entre cuadros</td></tr>
  <tr><td><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd></td><td>Deshacer / rehacer</td></tr>
  <tr><td><kbd>Ctrl</kbd>+<kbd>D</kbd></td><td>Duplicar</td></tr>
  <tr><td><kbd>Ctrl</kbd>+<kbd>A</kbd></td><td>Seleccionar todo</td></tr>
  <tr><td><kbd>Ctrl</kbd>+<kbd>F</kbd></td><td>Buscar</td></tr>
  <tr><td><kbd>.</kbd></td><td>Plegar o desplegar la rama</td></tr>
  <tr><td><kbd>F</kbd> · <kbd>+</kbd> · <kbd>−</kbd></td><td>Encajar todo · acercar · alejar</td></tr>
  <tr><td><kbd>Esc</kbd></td><td>Cerrar paneles o quitar la selección</td></tr></table>
  <h3>Dónde se guarda</h3><p>Cada cambio se guarda solo en este navegador. Si abres la página dentro de Claude con tu cuenta, los mapas también se sincronizan entre tus dispositivos. Para tener una copia propia, usa Exportar → JSON.</p>
  <div class="acts"><button class="btn primary" data-close autofocus>Entendido</button></div>`,m=>m.querySelector('[data-close]').onclick=closeModal);
}
