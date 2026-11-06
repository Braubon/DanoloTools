<script>
(()=>{
'use strict';

/* =====================================================================
   Utilidades
   ===================================================================== */
const $=(s,el=document)=>el.querySelector(s);
const $$=(s,el=document)=>[...el.querySelectorAll(s)];
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const num=(v,d)=>{const n=Number(v);return Number.isFinite(n)?n:d};
const f1=v=>Math.round(v*10)/10;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let uidC=0;
const uid=p=>p+Date.now().toString(36)+(uidC++).toString(36)+Math.random().toString(36).slice(2,6);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
const hexOk=c=>typeof c==='string'&&/^#[0-9a-fA-F]{6}$/.test(c);
const hex2rgb=h=>{const n=parseInt(h.slice(1),16);return[(n>>16)&255,(n>>8)&255,n&255]};
const rgb2hex=(r,g,b)=>'#'+[r,g,b].map(v=>Math.round(clamp(v,0,255)).toString(16).padStart(2,'0')).join('');
function mix(a,b,t){const A=hex2rgb(a),B=hex2rgb(b);return rgb2hex(A[0]+(B[0]-A[0])*t,A[1]+(B[1]-A[1])*t,A[2]+(B[2]-A[2])*t)}
function lum(h){const[r,g,b]=hex2rgb(h).map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4});return .2126*r+.7152*g+.0722*b}
const INK_DARK='#1F1A14';
function inkOn(h){const L=lum(h);return (1.05/(L+.05))>((L+.05)/(lum(INK_DARK)+.05))?'#FFFFFF':INK_DARK}
const headOf=c=>mix(c,'#000000',.14);
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;

/* =====================================================================
   Constantes
   ===================================================================== */
const GRID=24;
const KMIN=.12,KMAX=3;
const NODE_COLORS=['#F2B544','#F28C38','#EF6F5E','#E8708F','#C77DD6','#8C7AE6','#5B8DEF','#4FB3D9','#3DBFA6','#6CC070','#B5C35A','#8A94A6','#FFFFFF','#2B2F36'];
const TAG_COLORS=['#E5484D','#F76B15','#FFC53D','#46A758','#12A594','#0090FF','#6E56CF','#D6409F','#8D8D8D','#A18072'];
const DEFAULT_COLOR='#F2B544';
const DEFAULT_EDGE={style:'curve',arrow:'none',color:null,dashed:false,width:2};
const WIDTHS=['auto',160,240,320];
const LAYOUTS={
  mindmap:['Mapa mental','Ramas a izquierda y derecha de la idea central'],
  radial:['Radial','En círculos alrededor de la idea central'],
  'tree-h':['Árbol horizontal','De izquierda a derecha'],
  'tree-v':['Árbol vertical','De arriba abajo, como un organigrama'],
  force:['Orgánico','Por fuerzas; ideal para redes sin jerarquía'],
  grid:['Rejilla','Filas y columnas compactas']
};

/* =====================================================================
   Iconos
   ===================================================================== */
function gearPath(){let d='';for(let i=0;i<8;i++){const a=i*Math.PI/4;d+=`M${f1(12+Math.cos(a)*7.2)} ${f1(12+Math.sin(a)*7.2)}L${f1(12+Math.cos(a)*9.6)} ${f1(12+Math.sin(a)*9.6)}`}return d}
const P_=d=>`<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const I={
  back:P_('<path d="M19 12H5M12 19l-7-7 7-7"/>'),
  menu:P_('<path d="M4 7h16M4 12h16M4 17h10"/>'),
  undo:P_('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>'),
  redo:P_('<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 000 11H13"/>'),
  layout:P_('<rect x="9" y="3" width="6" height="5" rx="1.2"/><rect x="3" y="16" width="6" height="5" rx="1.2"/><rect x="15" y="16" width="6" height="5" rx="1.2"/><path d="M12 8v4M6 16v-2a2 2 0 012-2h8a2 2 0 012 2v2"/>'),
  magnet:P_('<path d="M5 4h4v7a3 3 0 006 0V4h4v7a7 7 0 01-14 0z"/><path d="M5 8h4M15 8h4"/>'),
  select:P_('<path d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3" /><path d="M11 4h2M11 20h2M4 11v2M20 11v2"/>'),
  tags:P_('<path d="M3 12.2V4.5A1.5 1.5 0 014.5 3h7.7l8.3 8.3a1.5 1.5 0 010 2.1l-7.1 7.1a1.5 1.5 0 01-2.1 0z"/><circle cx="8" cy="8" r="1.6"/>'),
  tag:P_('<path d="M3 12.2V4.5A1.5 1.5 0 014.5 3h7.7l8.3 8.3a1.5 1.5 0 010 2.1l-7.1 7.1a1.5 1.5 0 01-2.1 0z"/><circle cx="8" cy="8" r="1.6"/>'),
  gear:P_(`<circle cx="12" cy="12" r="5.4"/><circle cx="12" cy="12" r="1.9"/><path d="${gearPath()}" stroke-width="2.6"/>`),
  x:P_('<path d="M6 6l12 12M18 6L6 18"/>'),
  chev:P_('<path d="M6 9l6 6 6-6"/>'),
  up:P_('<path d="M6 15l6-6 6 6"/>'),
  down:P_('<path d="M6 9l6 6 6-6"/>'),
  search:P_('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>'),
  file:P_('<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5"/><path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3"/>'),
  upload:P_('<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5"/><path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3"/>'),
  moon:P_('<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>'),
  sun:P_('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>'),
  help:P_('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1.1-1.5 2.2"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>'),
  plus:P_('<path d="M12 5v14M5 12h14"/>'),
  minus:P_('<path d="M5 12h14"/>'),
  fit:P_('<path d="M4 9V5a1 1 0 011-1h4M15 4h4a1 1 0 011 1v4M20 15v4a1 1 0 01-1 1h-4M9 20H5a1 1 0 01-1-1v-4"/><rect x="9" y="9" width="6" height="6" rx="1"/>'),
  mini:P_('<rect x="3" y="5" width="18" height="14" rx="2"/><rect x="12" y="11" width="6" height="5" rx="1"/>'),
  edit:P_('<path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
  copy:P_('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>'),
  trash:P_('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3"/>'),
  image:P_('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>'),
  json:P_('<path d="M8 4H7a2 2 0 00-2 2v3.5A1.5 1.5 0 013.5 11v2A1.5 1.5 0 015 14.5V18a2 2 0 002 2h1M16 4h1a2 2 0 012 2v3.5a1.5 1.5 0 001.5 1.5v2a1.5 1.5 0 00-1.5 1.5V18a2 2 0 01-2 2h-1"/>'),
  paste:P_('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 11h6M9 15h4"/>'),
  child:P_('<rect x="3" y="4" width="8" height="6" rx="1.5"/><rect x="13" y="14" width="8" height="6" rx="1.5"/><path d="M7 10v5a2 2 0 002 2h4"/>'),
  cloud:P_('<path d="M7 18a4.5 4.5 0 01-.5-9 6 6 0 0111.5 1.5A3.8 3.8 0 0117.5 18z"/>')
};
const L_ICONS={
  mindmap:P_('<rect x="9" y="10" width="6" height="4" rx="1"/><rect x="2" y="4" width="4" height="3" rx=".8"/><rect x="2" y="17" width="4" height="3" rx=".8"/><rect x="18" y="4" width="4" height="3" rx=".8"/><rect x="18" y="17" width="4" height="3" rx=".8"/><path d="M9 12H7.5L6 5.5M9 12H7.5L6 18.5M15 12h1.5L18 5.5M15 12h1.5L18 18.5"/>'),
  radial:P_('<circle cx="12" cy="12" r="2.5"/><circle cx="12" cy="3.5" r="1.5"/><circle cx="20" cy="15" r="1.5"/><circle cx="4" cy="15" r="1.5"/><circle cx="12" cy="12" r="8" stroke-dasharray="2 3"/>'),
  'tree-h':P_('<rect x="2" y="10" width="5" height="4" rx="1"/><rect x="16" y="3" width="6" height="4" rx="1"/><rect x="16" y="10" width="6" height="4" rx="1"/><rect x="16" y="17" width="6" height="4" rx="1"/><path d="M7 12h4M11 5v14M11 5h5M11 12h5M11 19h5"/>'),
  'tree-v':I.layout,
  force:P_('<circle cx="6" cy="7" r="2.2"/><circle cx="17" cy="5" r="2.2"/><circle cx="12" cy="14" r="2.2"/><circle cx="5" cy="19" r="2.2"/><circle cx="19" cy="17" r="2.2"/><path d="M8 8.3l2.6 4M15.8 7l-2.8 5M10.4 15.4L6.8 17.6M14.1 14.6l2.9 1.6"/>'),
  grid:P_('<rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/><rect x="14" y="14" width="7" height="7" rx="1.2"/>')
};
function paintIcons(root=document){for(const el of $$('[data-i]',root)){const k=el.dataset.i;if(I[k])el.innerHTML=I[k]}}

/* =====================================================================
   Estado
   ===================================================================== */
let map=null;
let byId=new Map();
const S={sel:new Set(),edge:null,editing:null,tool:'pan',filter:new Set(),filterHide:false,hidden:new Set(),outCount:new Map(),
  view:{x:0,y:0,k:1},tagVer:0,anim:null,vanim:null,search:{q:'',hits:[],i:-1},pendingReload:false};

/* =====================================================================
   Modelo
   ===================================================================== */
function reindex(){byId=new Map(map.nodes.map(n=>[n.id,n]))}
function blankMap(name){return{id:uid('m'),name:name||'Mapa sin título',nodes:[],edges:[],tags:[],settings:{edge:{...DEFAULT_EDGE},flow:'auto'},view:null,created:Date.now(),updated:Date.now()}}
function addNode(o={}){
  const n={id:uid('n'),x:0,y:0,text:'Nueva idea',color:DEFAULT_COLOR,fontSize:16,bold:false,width:'auto',tags:[],collapsed:false,...o};
  n.id=o.id&&!byId.has(o.id)?o.id:uid('n');
  n._w=150;n._h=70;
  map.nodes.push(n);byId.set(n.id,n);return n;
}
function edgeBetween(a,b){return map.edges.find(e=>(e.from===a&&e.to===b)||(e.from===b&&e.to===a))}
function addEdge(a,b,o={}){
  if(a===b||!byId.has(a)||!byId.has(b)||edgeBetween(a,b))return null;
  const d=map.settings.edge;
  const e={id:uid('e'),from:a,to:b,label:'',style:d.style,arrow:d.arrow,color:d.color,dashed:d.dashed,width:d.width,...o};
  map.edges.push(e);return e;
}
function deleteNodes(ids){
  const s=new Set(ids);
  map.nodes=map.nodes.filter(n=>!s.has(n.id));
  map.edges=map.edges.filter(e=>!s.has(e.from)&&!s.has(e.to));
  for(const i of s){byId.delete(i);S.sel.delete(i)}
}
const childIds=id=>map.edges.filter(e=>e.from===id).map(e=>e.to);
const parentId=id=>{const e=map.edges.find(e=>e.to===id);return e?e.from:null};
function descendants(id){
  const adj=outAdj();const out=new Set();const st=[id];
  while(st.length){const c=st.pop();for(const t of adj.get(c)||[])if(t!==id&&!out.has(t)){out.add(t);st.push(t)}}
  return out;
}
function outAdj(){const adj=new Map();for(const e of map.edges){if(!adj.has(e.from))adj.set(e.from,[]);adj.get(e.from).push(e.to)}return adj}
function computeHidden(){
  const adj=outAdj();const hid=new Set();S.outCount=new Map([...adj].map(([k,v])=>[k,v.length]));
  for(const n of map.nodes){
    if(!n.collapsed)continue;
    const st=[n.id],seen=new Set([n.id]);
    while(st.length){const c=st.pop();for(const t of adj.get(c)||[])if(!seen.has(t)){seen.add(t);hid.add(t);st.push(t)}}
  }
  return hid;
}
const tagById=id=>map.tags.find(t=>t.id===id);
const matchFilter=n=>!S.filter.size||n.tags.some(t=>S.filter.has(t));
const shown=n=>!!n&&!S.hidden.has(n.id)&&!(S.filterHide&&S.filter.size&&!matchFilter(n));
const primary=()=>{let p=null;for(const id of S.sel)if(byId.has(id))p=id;return p};

function ensureTag(name){
  const nm=String(name).trim().replace(/^#/,'').slice(0,40);
  if(!nm)return null;
  let t=map.tags.find(t=>norm(t.name)===norm(nm));
  if(!t){t={id:uid('t'),name:nm,color:TAG_COLORS[map.tags.length%TAG_COLORS.length]};map.tags.push(t);S.tagVer++}
  return t;
}

/* ---------- Serialización ---------- */
function cleanNode(n){return{id:n.id,x:f1(n.x),y:f1(n.y),text:n.text,color:n.color,fontSize:n.fontSize,bold:n.bold,width:n.width,tags:[...n.tags],collapsed:!!n.collapsed}}
function serialize(m,forHistory){
  const o={format:'mapamental',version:1,id:m.id,name:m.name,
    nodes:m.nodes.map(cleanNode),
    edges:m.edges.map(e=>({id:e.id,from:e.from,to:e.to,label:e.label,style:e.style,arrow:e.arrow,color:e.color,dashed:e.dashed,width:e.width})),
    tags:m.tags.map(t=>({id:t.id,name:t.name,color:t.color})),
    settings:{edge:{...m.settings.edge},flow:m.settings.flow||'auto'}};
  if(!forHistory){o.view=m.view;o.created=m.created;o.updated=m.updated}
  return o;
}
function normalizeMap(raw,keepId){
  if(!raw||typeof raw!=='object'||!Array.isArray(raw.nodes))throw new Error('No contiene un mapa válido (falta la lista "nodes").');
  const m=blankMap(String(raw.name||'Mapa importado').slice(0,120));
  if(keepId&&typeof raw.id==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(raw.id))m.id=raw.id;
  m.created=num(raw.created,Date.now());m.updated=num(raw.updated,Date.now());
  const tagByName=new Map(),tagIds=new Set();
  for(const t of Array.isArray(raw.tags)?raw.tags:[]){
    if(!t||typeof t!=='object')continue;
    const name=String(t.name||t.id||'').trim().slice(0,40);if(!name||tagByName.has(norm(name)))continue;
    let id=String(t.id||uid('t'));if(tagIds.has(id))id=uid('t');
    const tag={id,name,color:hexOk(t.color)?t.color:TAG_COLORS[m.tags.length%TAG_COLORS.length]};
    m.tags.push(tag);tagIds.add(id);tagByName.set(norm(name),tag);
    if(t.id&&t.id!==id)tagByName.set('#id:'+t.id,tag);
  }
  const ids=new Set();
  raw.nodes.forEach((r,i)=>{
    if(!r||typeof r!=='object')return;
    let id=r.id!=null?String(r.id):uid('n');if(ids.has(id))id=uid('n');ids.add(id);
    const tags=[];
    for(const t of Array.isArray(r.tags)?r.tags:[]){
      const s=String(t);
      if(tagIds.has(s)){tags.push(s);continue}
      let tg=tagByName.get(norm(s));
      if(!tg){tg={id:uid('t'),name:s.slice(0,40),color:TAG_COLORS[m.tags.length%TAG_COLORS.length]};m.tags.push(tg);tagIds.add(tg.id);tagByName.set(norm(s),tg)}
      tags.push(tg.id);
    }
    m.nodes.push({id,x:num(r.x,(i%6)*230),y:num(r.y,Math.floor(i/6)*150),text:String(r.text??''),
      color:hexOk(r.color)?r.color:DEFAULT_COLOR,fontSize:clamp(num(r.fontSize,16),10,64),bold:!!r.bold,
      width:WIDTHS.includes(r.width)?r.width:'auto',tags:[...new Set(tags)],collapsed:!!r.collapsed});
  });
  const nid=new Set(m.nodes.map(n=>n.id)),seen=new Set(),eids=new Set();
  for(const e of Array.isArray(raw.edges)?raw.edges:[]){
    if(!e||typeof e!=='object')continue;
    const f=String(e.from),t=String(e.to);
    if(!nid.has(f)||!nid.has(t)||f===t)continue;
    const k=[f,t].sort().join('|');if(seen.has(k))continue;seen.add(k);
    let id=String(e.id||uid('e'));if(eids.has(id))id=uid('e');eids.add(id);
    m.edges.push({id,from:f,to:t,label:String(e.label||'').slice(0,200),
      style:['curve','straight','ortho'].includes(e.style)?e.style:'curve',
      arrow:['none','end','start','both'].includes(e.arrow)?e.arrow:'none',
      color:hexOk(e.color)?e.color:null,dashed:!!e.dashed,width:clamp(num(e.width,2),1,8)});
  }
  const se=(raw.settings&&raw.settings.edge)||{};
  m.settings.edge={style:['curve','straight','ortho'].includes(se.style)?se.style:'curve',arrow:['none','end','start','both'].includes(se.arrow)?se.arrow:'none',
    color:hexOk(se.color)?se.color:null,dashed:!!se.dashed,width:clamp(num(se.width,2),1,8)};
  m.settings.flow=['h','v','auto'].includes(raw.settings&&raw.settings.flow)?raw.settings.flow:'auto';
  const v=raw.view;
  if(v&&Number.isFinite(+v.x)&&Number.isFinite(+v.y)&&Number.isFinite(+v.k))m.view={x:+v.x,y:+v.y,k:clamp(+v.k,KMIN,KMAX)};
  return m;
}

/* =====================================================================
   Almacenamiento local
   ===================================================================== */
const Store=(()=>{
  const PFX='mapamental.';let ls=null;
  try{ls=window.localStorage;ls.setItem(PFX+'__t','1');ls.removeItem(PFX+'__t')}catch{ls=null}
  const mem=new Map();
  const get=k=>{try{return ls?ls.getItem(PFX+k):(mem.has(k)?mem.get(k):null)}catch{return mem.has(k)?mem.get(k):null}};
  const set=(k,v)=>{try{if(ls)ls.setItem(PFX+k,v);else mem.set(k,v);return true}catch{mem.set(k,v);return false}};
  const del=k=>{try{ls?ls.removeItem(PFX+k):mem.delete(k)}catch{mem.delete(k)}};
  const rj=(k,d)=>{try{const v=get(k);return v?JSON.parse(v):d}catch{return d}};
  return{
    persistent:!!ls,
    index:()=>rj('index',[]),
    setIndex:a=>set('index',JSON.stringify(a)),
    load:id=>rj('map.'+id,null),
    save(m){
      const ok=set('map.'+m.id,JSON.stringify(serialize(m)));
      const idx=this.index().filter(x=>x.id!==m.id);
      idx.push({id:m.id,name:m.name,updated:m.updated,count:m.nodes.length});
      this.setIndex(idx);
      const tb=this.tombs();if(tb[m.id]){delete tb[m.id];set('tombs',JSON.stringify(tb))}
      return ok;
    },
    remove(id,tomb){
      del('map.'+id);this.setIndex(this.index().filter(x=>x.id!==id));
      if(tomb){const tb=this.tombs();tb[id]=Date.now();set('tombs',JSON.stringify(tb))}
    },
    tombs:()=>rj('tombs',{}),
    clearTomb(id){const tb=this.tombs();if(id in tb){delete tb[id];set('tombs',JSON.stringify(tb))}},
    meta(id){return this.index().find(x=>x.id===id)},
    prefs:()=>rj('prefs',{}),
    setPrefs:p=>set('prefs',JSON.stringify(p)),
    last:()=>get('last'),
    setLast:id=>set('last',id)
  };
})();

const P=Object.assign({guides:true,grid:false,magnet:true,repel:true,animate:true,spacing:1,theme:'dark',minimap:innerWidth>700,hint:true},Store.prefs());
const savePrefs=()=>Store.setPrefs(P);

/* =====================================================================
   DOM
   ===================================================================== */
const VP=$('#viewport'),world=$('#world'),nodesEl=$('#nodes'),labelsEl=$('#labels'),
  evG=$('#ev'),egG=$('#eg'),ovG=$('#ov'),ovgG=$('#ovg'),tempLink=$('#templink'),selRect=$('#selrect'),
  popEl=$('#pop'),modalEl=$('#modal');
const els=new Map();

/* =====================================================================
   Renderizado de cuadros
   ===================================================================== */
function buildNodeEl(n){
  const el=document.createElement('div');
  el.className='node';el.dataset.id=n.id;
  el.innerHTML=`<div class="nhead"><span class="grip" aria-hidden="true"></span>`+
    `<button class="nb" data-act="tags" title="Etiquetas" aria-label="Etiquetas">${I.tag}</button>`+
    `<button class="nb" data-act="style" title="Ajustes: color, tamaño…" aria-label="Ajustes">${I.gear}</button>`+
    `<button class="nb nb-col" data-act="collapse" title="Plegar o desplegar la rama" aria-label="Plegar o desplegar la rama">${I.chev}</button>`+
    `<button class="nb" data-act="del" title="Eliminar (Supr)" aria-label="Eliminar">${I.x}</button></div>`+
    `<div class="nbody"><div class="ntext"></div><div class="ntags"></div></div>`+
    `<button class="nbadge" data-act="expand" title="Desplegar la rama"></button>`;
  const tx=el.querySelector('.ntext');
  tx.addEventListener('keydown',onEditKey);
  tx.addEventListener('input',onEditInput);
  tx.addEventListener('paste',onEditPaste);
  tx.addEventListener('blur',()=>{if(S.editing===n.id)finishEdit()});
  nodesEl.appendChild(el);
  return el;
}
function updateNodeContent(n,el){
  const h=headOf(n.color),ink=inkOn(n.color);
  el.style.setProperty('--c',n.color);el.style.setProperty('--h',h);
  el.style.setProperty('--t',ink);el.style.setProperty('--ht',inkOn(h));
  el.style.setProperty('--tagbg',ink==='#FFFFFF'?'rgba(255,255,255,.22)':'rgba(0,0,0,.09)');
  const tx=el.querySelector('.ntext');
  if(S.editing!==n.id)tx.textContent=n.text;
  tx.style.fontSize=n.fontSize+'px';tx.style.fontWeight=n.bold?700:500;
  if(n.width==='auto'){el.style.width='';el.style.maxWidth=Math.max(280,n.fontSize*12)+'px'}
  else{el.style.width=n.width+'px';el.style.maxWidth=''}
  const tg=el.querySelector('.ntags');
  tg.innerHTML=n.tags.map(id=>{const t=tagById(id);return t?`<span class="ntag" style="--tc:${t.color}"><i></i>${esc(t.name)}</span>`:''}).join('');
  tg.hidden=!n.tags.length;
  const kids=S.outCount.get(n.id)||0;
  el.classList.toggle('has-kids',kids>0);
  el.classList.toggle('collapsed',!!n.collapsed&&kids>0);
  if(n.collapsed&&kids>0)el.querySelector('.nbadge').textContent='+'+descendants(n.id).size;
}
function nodeSig(n){return[n.text,n.color,n.fontSize,n.bold,n.width,n.tags.join(','),S.tagVer,n.collapsed,S.outCount.get(n.id)||0,n.collapsed?map.edges.length:0].join('|')}
function render(){
  if(!map)return;
  S.hidden=computeHidden();
  const live=new Set();
  for(const n of map.nodes){
    live.add(n.id);
    let el=els.get(n.id);
    if(!el){el=buildNodeEl(n);els.set(n.id,el)}
    const sig=nodeSig(n);
    if(el._sig!==sig){updateNodeContent(n,el);el._sig=sig}
    el.style.transform=`translate(${n.x}px,${n.y}px)`;
    el.hidden=!shown(n);
  }
  for(const [id,el] of els)if(!live.has(id)){el.remove();els.delete(id)}
  measure();updateClasses();renderEdges();scheduleMinimap();
}
function measure(){
  for(const n of map.nodes){
    const el=els.get(n.id);
    if(el&&!el.hidden){n._w=el.offsetWidth||n._w||150;n._h=el.offsetHeight||n._h||70}
    else if(!n._w){n._w=150;n._h=70}
  }
}
function updateClasses(){
  const hits=new Set(S.search.hits),cur=S.search.hits[S.search.i];
  for(const n of map.nodes){
    const el=els.get(n.id);if(!el)continue;
    const c=el.classList;
    c.toggle('sel',S.sel.has(n.id));
    c.toggle('dim',!!S.filter.size&&!S.filterHide&&!matchFilter(n));
    c.toggle('hit',hits.has(n.id));
    c.toggle('cur',cur===n.id);
    c.toggle('editing',S.editing===n.id);
  }
}
function setNodePos(n){const el=els.get(n.id);if(el)el.style.transform=`translate(${n.x}px,${n.y}px)`}

/* =====================================================================
   Geometría de líneas
   ===================================================================== */
const rectOf=n=>({x:n.x,y:n.y,w:n._w,h:n._h,cx:n.x+n._w/2,cy:n.y+n._h/2});
function borderPoint(r,tx,ty){
  const dx=tx-r.cx,dy=ty-r.cy;
  if(!dx&&!dy)return{x:r.cx,y:r.cy};
  const s=Math.min(dx?(r.w/2)/Math.abs(dx):Infinity,dy?(r.h/2)/Math.abs(dy):Infinity);
  return{x:r.cx+dx*s,y:r.cy+dy*s};
}
const unit=v=>{const L=Math.hypot(v.x,v.y)||1;return{x:v.x/L,y:v.y/L}};
const R2=p=>`${f1(p.x)} ${f1(p.y)}`;
function edgeGeom(e,A,B,trimS=0,trimE=0){
  const a=rectOf(A),b=rectOf(B);
  let s,t,d,mid,sd,ed;
  if(e.style==='straight'){
    s=borderPoint(a,b.cx,b.cy);t=borderPoint(b,a.cx,a.cy);
    ed=unit({x:t.x-s.x,y:t.y-s.y});sd={x:-ed.x,y:-ed.y};
    const s2={x:s.x-sd.x*trimS,y:s.y-sd.y*trimS},t2={x:t.x-ed.x*trimE,y:t.y-ed.y*trimE};
    d=`M${R2(s2)}L${R2(t2)}`;mid={x:(s.x+t.x)/2,y:(s.y+t.y)/2};
  }else{
    const dx=b.cx-a.cx,dy=b.cy-a.cy;
    const gx=Math.abs(dx)-(a.w+b.w)/2,gy=Math.abs(dy)-(a.h+b.h)/2,flow=(map&&map.settings.flow)||'auto';
    const ratio=Math.abs(dx)/(a.w/2+b.w/2+1)>=Math.abs(dy)/(a.h/2+b.h/2+1);
    let hor;
    if(flow==='h')hor=gx>0?true:gy>0?false:ratio;
    else if(flow==='v')hor=gy>0?false:gx>0?true:ratio;
    else hor=gx>0&&gy>0?gx>=gy:gx>0?true:gy>0?false:ratio;
    if(hor){const sg=dx>=0?1:-1;s={x:sg>0?a.x+a.w:a.x,y:a.cy};t={x:sg>0?b.x:b.x+b.w,y:b.cy};sd={x:-sg,y:0};ed={x:sg,y:0}}
    else{const sg=dy>=0?1:-1;s={x:a.cx,y:sg>0?a.y+a.h:a.y};t={x:b.cx,y:sg>0?b.y:b.y+b.h};sd={x:0,y:-sg};ed={x:0,y:sg}}
    const s2={x:s.x-sd.x*trimS,y:s.y-sd.y*trimS},t2={x:t.x-ed.x*trimE,y:t.y-ed.y*trimE};
    if(e.style==='ortho'){
      if(hor){const mx=(s.x+t.x)/2;d=`M${R2(s2)}H${f1(mx)}V${f1(t.y)}H${f1(t2.x)}`;mid={x:mx,y:(s.y+t.y)/2}}
      else{const my=(s.y+t.y)/2;d=`M${R2(s2)}V${f1(my)}H${f1(t.x)}V${f1(t2.y)}`;mid={x:(s.x+t.x)/2,y:my}}
    }else{
      const off=hor?Math.max(28,Math.abs(t.x-s.x)/2):Math.max(28,Math.abs(t.y-s.y)/2);
      const c1={x:s.x-sd.x*off,y:s.y-sd.y*off},c2={x:t.x-ed.x*off,y:t.y-ed.y*off};
      d=`M${R2(s2)}C${R2(c1)} ${R2(c2)} ${R2(t2)}`;
      mid={x:.125*s.x+.375*c1.x+.375*c2.x+.125*t.x,y:.125*s.y+.375*c1.y+.375*c2.y+.125*t.y};
    }
  }
  return{d,s,t,mid,sd,ed};
}
function arrowD(tip,dir,size){
  const u=unit(dir),bx=tip.x-u.x*size,by=tip.y-u.y*size,px=-u.y*size*.5,py=u.x*size*.5;
  return`M${R2(tip)}L${f1(bx+px)} ${f1(by+py)}L${f1(bx-px)} ${f1(by-py)}Z`;
}
const arrowSize=e=>Math.max(9,e.width*4.2);
const edgeColor=(e,a)=>e.color||headOf(a.color);
function renderEdges(){
  if(!map)return;
  let s='',lab='';
  for(const e of map.edges){
    const a=byId.get(e.from),b=byId.get(e.to);
    if(!shown(a)||!shown(b))continue;
    const as=arrowSize(e),hasE=e.arrow==='end'||e.arrow==='both',hasS=e.arrow==='start'||e.arrow==='both';
    const g=edgeGeom(e,a,b,hasS?as*.7:0,hasE?as*.7:0);
    const col=edgeColor(e,a),sel=S.edge===e.id;
    const dim=S.filter.size&&!S.filterHide&&!(matchFilter(a)&&matchFilter(b));
    s+=`<g class="edge${sel?' sel':''}${dim?' dim':''}" data-eid="${e.id}" style="--ec:${col}"><path class="ehit" d="${g.d}"/>`+
      `<path class="eline" d="${g.d}" stroke-width="${e.width}"${e.dashed?` stroke-dasharray="${e.width*3} ${e.width*2.6}"`:''}/>`;
    if(hasE)s+=`<path class="earrow" d="${arrowD(g.t,g.ed,as)}"/>`;
    if(hasS)s+=`<path class="earrow" d="${arrowD(g.s,g.sd,as)}"/>`;
    s+='</g>';
    if(e.label)lab+=`<div class="elabel${sel?' sel':''}${dim?' dim':''}" data-eid="${e.id}" style="transform:translate(${f1(g.mid.x)}px,${f1(g.mid.y)}px) translate(-50%,-50%);--ec:${col}">${esc(e.label)}</div>`;
  }
  egG.innerHTML=s;labelsEl.innerHTML=lab;
}

/* =====================================================================
   Vista (desplazamiento y zoom)
   ===================================================================== */
const zoomLbl=$('#zoomlbl');
let viewSaveT=null;
function applyView(){
  const v=S.view;
  world.style.transform=`translate(${v.x}px,${v.y}px) scale(${v.k})`;
  const t=`translate(${v.x} ${v.y}) scale(${v.k})`;
  evG.setAttribute('transform',t);ovG.setAttribute('transform',t);
  let gs=GRID*v.k;while(gs<12)gs*=2;
  VP.style.backgroundSize=`${gs}px ${gs}px`;VP.style.backgroundPosition=`${v.x}px ${v.y}px`;
  zoomLbl.textContent=Math.round(v.k*100)+'%';
  scheduleMinimap();
}
function saveViewSoon(){
  if(!map)return;map.view={...S.view};
  clearTimeout(viewSaveT);viewSaveT=setTimeout(()=>{if(map)Store.save(map)},700);
}
function vpSize(){const r=VP.getBoundingClientRect();return{w:r.width,h:r.height,l:r.left,t:r.top}}
function local(e){const r=VP.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
function toWorld(cx,cy){const r=VP.getBoundingClientRect();return{x:(cx-r.left-S.view.x)/S.view.k,y:(cy-r.top-S.view.y)/S.view.k}}
function zoomAt(p,f){
  const k=S.view.k,k2=clamp(k*f,KMIN,KMAX);
  S.view.x=p.x-(p.x-S.view.x)*k2/k;S.view.y=p.y-(p.y-S.view.y)*k2/k;S.view.k=k2;
  applyView();saveViewSoon();
}
function animateView(target,dur=420){
  if(S.vanim)cancelAnimationFrame(S.vanim);
  if(!P.animate||reduceMotion){S.view={...target};applyView();saveViewSoon();return}
  const v0={...S.view},t0=performance.now();
  const step=now=>{
    const k=Math.min(1,(now-t0)/dur),e=k<.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2;
    S.view={x:v0.x+(target.x-v0.x)*e,y:v0.y+(target.y-v0.y)*e,k:v0.k+(target.k-v0.k)*e};
    applyView();
    if(k<1)S.vanim=requestAnimationFrame(step);else{S.vanim=null;saveViewSoon()}
  };
  S.vanim=requestAnimationFrame(step);
}
function bboxOf(list){
  if(!list.length)return null;
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const r of list){x0=Math.min(x0,r.x);y0=Math.min(y0,r.y);x1=Math.max(x1,r.x+r.w);y1=Math.max(y1,r.y+r.h)}
  return{x:x0,y:y0,w:x1-x0,h:y1-y0};
}
function viewForBox(b){
  const vs=vpSize(),top=70,bottom=60,side=30;
  const aw=Math.max(100,vs.w-side*2),ah=Math.max(100,vs.h-top-bottom);
  const k=clamp(Math.min(aw/Math.max(b.w,1),ah/Math.max(b.h,1)),KMIN,1.25);
  return{k,x:side+aw/2-(b.x+b.w/2)*k,y:top+ah/2-(b.y+b.h/2)*k};
}
function fitView(animate){
  if(!map)return;
  const b=bboxOf(map.nodes.filter(shown).map(rectOf));
  if(!b){const vs=vpSize();S.view={x:vs.w/2,y:vs.h/2,k:1};applyView();return}
  const t=viewForBox(b);
  animate?animateView(t):(S.view=t,applyView(),saveViewSoon());
}
function centerOn(n,keepZoom=true){
  const vs=vpSize(),k=keepZoom?Math.max(S.view.k,.6):1;
  animateView({k,x:vs.w/2-(n.x+n._w/2)*k,y:vs.h/2-(n.y+n._h/2)*k});
}
function ensureVisible(n){
  const vs=vpSize(),k=S.view.k;
  const sx=n.x*k+S.view.x,sy=n.y*k+S.view.y,sw=n._w*k,sh=n._h*k;
  if(sx<20||sy<70||sx+sw>vs.w-20||sy+sh>vs.h-70)centerOn(n);
}

/* =====================================================================
   Minimapa
   ===================================================================== */
const mmBox=$('#minimap'),mmC=$('#minimap canvas');
let mmQ=false,mmT=null;
function scheduleMinimap(){if(!P.minimap||mmQ)return;mmQ=true;requestAnimationFrame(()=>{mmQ=false;drawMinimap()})}
function drawMinimap(){
  if(!map||!P.minimap)return;
  const dpr=devicePixelRatio||1,cw=mmC.clientWidth,ch=mmC.clientHeight;if(!cw)return;
  if(mmC.width!==Math.round(cw*dpr)){mmC.width=Math.round(cw*dpr);mmC.height=Math.round(ch*dpr)}
  const ctx=mmC.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,cw,ch);
  const vs=vpSize(),vw={x:-S.view.x/S.view.k,y:-S.view.y/S.view.k,w:vs.w/S.view.k,h:vs.h/S.view.k};
  const ns=map.nodes.filter(shown);
  const b=bboxOf([...ns.map(rectOf),vw]);const pad=40;
  b.x-=pad;b.y-=pad;b.w+=pad*2;b.h+=pad*2;
  const s=Math.min(cw/b.w,ch/b.h),ox=(cw-b.w*s)/2-b.x*s,oy=(ch-b.h*s)/2-b.y*s;
  mmT={s,ox,oy};
  const cs=getComputedStyle(document.documentElement);
  ctx.strokeStyle=cs.getPropertyValue('--line');ctx.lineWidth=1;
  ctx.beginPath();
  for(const e of map.edges){const a=byId.get(e.from),c=byId.get(e.to);if(!shown(a)||!shown(c))continue;
    ctx.moveTo((a.x+a._w/2)*s+ox,(a.y+a._h/2)*s+oy);ctx.lineTo((c.x+c._w/2)*s+ox,(c.y+c._h/2)*s+oy)}
  ctx.stroke();
  for(const n of ns){ctx.fillStyle=S.filter.size&&!matchFilter(n)?cs.getPropertyValue('--line'):n.color;ctx.fillRect(n.x*s+ox,n.y*s+oy,Math.max(2,n._w*s),Math.max(2,n._h*s))}
  const acc=cs.getPropertyValue('--accent').trim();
  ctx.strokeStyle=acc;ctx.lineWidth=1.5;ctx.fillStyle=cs.getPropertyValue('--accent-soft');
  ctx.fillRect(vw.x*s+ox,vw.y*s+oy,vw.w*s,vw.h*s);ctx.strokeRect(vw.x*s+ox,vw.y*s+oy,vw.w*s,vw.h*s);
}
function mmNavigate(e){
  if(!mmT)return;const r=mmC.getBoundingClientRect();
  const wx=(e.clientX-r.left-mmT.ox)/mmT.s,wy=(e.clientY-r.top-mmT.oy)/mmT.s,vs=vpSize();
  S.view.x=vs.w/2-wx*S.view.k;S.view.y=vs.h/2-wy*S.view.k;applyView();saveViewSoon();
}
mmC.addEventListener('pointerdown',e=>{e.preventDefault();mmC.setPointerCapture(e.pointerId);mmNavigate(e);
  const mv=ev=>mmNavigate(ev),up=()=>{mmC.removeEventListener('pointermove',mv);mmC.removeEventListener('pointerup',up)};
  mmC.addEventListener('pointermove',mv);mmC.addEventListener('pointerup',up)});
