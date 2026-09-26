// ==UserScript==
// @name         PokeIdleLab Calculator
// @namespace    poke-idle-lab
// @version      1.0.32
// @description  Calculadora de IV para Poke Idle World, integrada con PokeGrid
// @match        https://poke.idleworld.online/*
// @updateURL    https://raw.githubusercontent.com/GigaBuda/PokeIdleLab/main/scripts/pokeidlelab-iv.user.js
// @downloadURL  https://raw.githubusercontent.com/GigaBuda/PokeIdleLab/main/scripts/pokeidlelab-iv.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==
(function(){"use strict";
const CFG={panelId:"pokeidlelab-iv-panel",storageKey:"pokeidlelab-iv-panel-state",maxIV:32,maxTotal:192,exponents:{hp:.95,atk:.8,def:.8,spa:.8,spd:.8,vel:.95},statLabels:{hp:"HP",atk:"ATK",def:"DEF",spa:"SpA",spd:"SpD",vel:"VEL"},colors:{hp:"#55e6d3",atk:"#ff8c42",def:"#ffd84f",spa:"#5ca9ff",spd:"#55e6d3",vel:"#ff70b8"}};
let creatures=[],current=null,lastText="",lastPokemonTooltip=null;
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])),norm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/shiny/g,"").replace(/[^a-z0-9]+/g," ").trim();
function num(v){const n=Number(v);return Number.isFinite(n)?n:null}
function findNumeric(o,keys){if(!o||typeof o!=="object")return null;const wanted=keys.map(x=>String(x).toLowerCase().replace(/[^a-z0-9]/g,""));for(const [key,val] of Object.entries(o)){const nk=String(key).toLowerCase().replace(/[^a-z0-9]/g,"");if(wanted.includes(nk)){const n=num(val);if(n!=null)return n}}return null}
function base(c,k){const a={hp:["hp","baseHp","baseHP","base_hp","health","hitpoints"],atk:["atk","attack","baseAtk","baseAttack","base_atk","physicalAttack"],def:["def","defense","baseDef","baseDefense","base_def","physicalDefense"],spa:["spa","spatk","spAtk","spAttack","baseSpAtk","baseSpA","specialAttack","baseSpecialAttack","special_attack"],spd:["spd","spdef","spDef","spDefense","baseSpDef","baseSpecialDefense","specialDefense","special_defense"],vel:["vel","spe","speed","baseVel","baseSpeed","base_vel"]};const keys=a[k]||[];for(const obj of [c,c?.baseStats,c?.base_stats,c?.base,c?.stats,c?.attributes,c?.attributes?.base,c?.stats?.base,c?.stats?.baseStats]){const n=findNumeric(obj,keys);if(n!=null)return n}return 0}
async function load(){try{const r=await fetch("/game/creatures.json",{cache:"no-store"});if(r.ok){const d=await r.json();creatures=Array.isArray(d)?d:(Array.isArray(d?.creatures)?d.creatures:Array.isArray(d?.pokemon)?d.pokemon:Array.isArray(d?.data)?d.data:Object.values(d||{}).filter(x=>x&&typeof x==="object"&&x.name))}}catch{}}
function parse(text,root){const raw=String(text||"");const structured=root?.querySelector?.(".inv-tip-poke,[class*=\"tip-poke\"]");const source=structured?.innerText||structured?.textContent||raw;const levelStructured=source.match(/(?:^|[^A-Za-z])(?:Lv|Lvl|Nv|Level|Nível|Nivel)\.?\s*[:\-]?\s*(\d+)/i);const lines=raw.split(/\n+/).map(x=>x.trim()).filter(Boolean);if(!lines.length)return null;
if(/\b(?:LOOT|ITEM|RECURSO|POK[EÉ]\s*BALL|POK[EÉ]BALL)\b/i.test(raw)||/(?:\$\s*\d[\d.,]*|\d[\d.,]*\s*dollars?)\b/i.test(raw))return null;
const lm=raw.match(/(?:Lv\.?|Nivel|Nível)\s*(\d+)/i),qm=raw.match(/(?:^|[^A-Za-z])(?:×|x)\s*(\d+(?:[.,]\d+)?)/),im=raw.match(/IV\s*(\d+)\s*\/\s*(\d+)/i),pm=raw.match(/(?:Poder|Power)\s*[:\-]?\s*(\d+)/i);
const hasPokemonData=!!(lm||im||pm||/(?:Qualidade|Raridade|HP|Vida|ATK|Ataque|DEF|Defesa|SpA|SpD|VEL|Velocidade)\b/i.test(raw));if(!hasPokemonData)return null;
const nl=lines.find(x=>!/(?:Lv\.?\s*\d+|IV\s*\d+|Qualidade|Raridade|Poder|Power|×|x\s*\d)/i.test(x))||lines[0];
const name=nl.replace(/^(?:LOOT|ITEM|POK[EÉ] BALL|POK[EÉ]BALL|RECURSO)\s*/i,"").replace(/\s+(?:LOOT|ITEM|POK[EÉ] BALL|POK[EÉ]BALL|RECURSO)\s*$/i,"").replace(/\s+x\s*\d+\s*$/i,"").replace(/\s+×\s*\d+\s*$/i,"").trim();
if(!name||/^(?:LOOT|ITEM|RECURSO|POK[EÉ]\s*BALL|POK[EÉ]BALL)$/i.test(name)||!creatures.some(c=>norm(c.name)===norm(name)))return null;
const actuals={};for(const k of Object.keys(CFG.statLabels)){const lab={hp:"(?:HP|Vida)",atk:"(?:ATK|Atk|Ataque)",def:"(?:DEF|Def|Defesa)",spa:"(?:SpA|SPA|Sp\\.\\s*A|Ataque\\s*especial)",spd:"(?:SpD|SPD|Sp\\.\\s*D|Defesa\\s*especial)",vel:"(?:VEL|Vel|Speed|Velocidade)"}[k],m=raw.match(new RegExp(lab+"\\s*[:=]?\\s*(\\d+)","i"));if(m)actuals[k]=+m[1]}
return{name,level:levelStructured?+levelStructured[1]:(lm?+lm[1]:1),quality:qm?+qm[1].replace(",","."):1,ivObserved:im?+im[1]:null,powerGame:pm?+pm[1]:0,actuals}}function calc(p){const c=creatures.find(x=>norm(x.name)===norm(p.name)),stats=p.actuals||{},ivs={},fallback=p.baseFallback||{};let sum=0;for(const k of Object.keys(CFG.statLabels)){const b=base(c,k)||Number(fallback[k])||0,f=(p.level/100)*Math.pow(p.quality,CFG.exponents[k]);ivs[k]=b&&stats[k]?Math.max(0,Math.min(32,((stats[k]/f)-b)/2)):0;sum+=ivs[k]}const total=p.ivObserved>0?p.ivObserved:Math.ceil(sum),pct=Math.min(100,total/192*100);return{...p,creature:c,bases:Object.fromEntries(Object.keys(CFG.statLabels).map(k=>[k,base(c,k)||Number(fallback[k])||0])),stats,ivs,total,pct,power:Object.values(stats).reduce((a,b)=>a+(+b||0),0)*p.quality}}
const TYPE_STYLE={NORMAL:{bg:"#9fa0a5",fg:"#111827",icon:"◉"},FIRE:{bg:"#f4511e",fg:"#fff",icon:"♨"},WATER:{bg:"#4f8fe8",fg:"#fff",icon:"💧"},ELECTRIC:{bg:"#f5c542",fg:"#111827",icon:"⚡"},GRASS:{bg:"#55a95b",fg:"#fff",icon:"✿"},ICE:{bg:"#6fd9e8",fg:"#10202a",icon:"❄"},FIGHTING:{bg:"#c52f3c",fg:"#fff",icon:"✚"},POISON:{bg:"#9b59b6",fg:"#fff",icon:"☠"},GROUND:{bg:"#c99a4b",fg:"#fff",icon:"⌁"},FLYING:{bg:"#7d8fe8",fg:"#fff",icon:"➤"},PSYCHIC:{bg:"#ed5c8a",fg:"#fff",icon:"◉"},BUG:{bg:"#8aaa3a",fg:"#fff",icon:"✣"},ROCK:{bg:"#9a8760",fg:"#fff",icon:"◆"},GHOST:{bg:"#65538d",fg:"#fff",icon:"☾"},DRAGON:{bg:"#6250c7",fg:"#fff",icon:"♢"},DARK:{bg:"#4a4550",fg:"#fff",icon:"◐"},STEEL:{bg:"#7e8b9b",fg:"#fff",icon:"⚙"},FAIRY:{bg:"#e48ab6",fg:"#fff",icon:"✦"}};
function typeBadge(type){const key=String(type||"NORMAL").toUpperCase().replace(/[^A-Z]/g,"");const t=TYPE_STYLE[key]||TYPE_STYLE.NORMAL;return '<span class="jp-move-type" style="--type-bg:'+t.bg+';--type-fg:'+t.fg+'"><span class="jp-type-icon">'+t.icon+"</span>"+esc(key)+"</span>"}
function findSpriteSrc(tip){if(!tip)return "";const img=tip.querySelector("img");if(img){const attrs=["currentSrc","src","data-src","data-original","data-lazy-src"];for(const a of attrs){const v=img[a]||img.getAttribute?.(a);if(v)return v}const ss=img.getAttribute("srcset");if(ss)return ss.split(",")[0].trim().split(/\s+/)[0]}for(const node of tip.querySelectorAll("*")){const bg=getComputedStyle(node).backgroundImage||"";const m=bg.match(/url\(["']?([^"')]+)["']?\)/i);if(m)return m[1]}return ""}
function panel(){
if(document.getElementById(CFG.panelId))return;
const s=document.createElement("style");
s.textContent=`
#${CFG.panelId}{position:fixed;z-index:2147483647;top:50%;left:50%;transform:translate(-50%,-50%);width:min(760px,calc(100vw - 20px));height:min(820px,calc(100vh - 20px));min-width:560px;min-height:520px;max-width:calc(100vw - 12px);max-height:calc(100vh - 12px);overflow:hidden;resize:both;background:linear-gradient(180deg,#10262b 0%,#0c1c20 52%,#111d1c 100%);color:#dce9e4;border:1px solid #b29a38;border-radius:7px;box-shadow:0 18px 50px rgba(0,0,0,.75),inset 0 1px 0 rgba(255,255,255,.05),inset 0 0 0 1px rgba(0,0,0,.45);font:13px Arial,sans-serif;display:none}
#${CFG.panelId} *{box-sizing:border-box}
#${CFG.panelId} .pa-topbar{height:34px;margin:-9px -12px 8px;position:relative;display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,#10252a,#0a181c);border-bottom:1px solid #8f7a32;box-shadow:0 2px 8px rgba(0,0,0,.45);color:#e4c84b;font-size:13px;font-weight:900;letter-spacing:.15px}#${CFG.panelId} .pa-title{display:flex;align-items:center;gap:5px}#${CFG.panelId} .pa-title-icon{font-size:12px;color:#e4c84b}#${CFG.panelId} .pa-close{position:absolute;right:6px;top:5px;width:24px;height:24px;border:1px solid #405a58;border-radius:3px;background:linear-gradient(180deg,#163139,#10262b);color:#aebeba;font-size:17px;line-height:20px;cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center}#${CFG.panelId} .pa-close:hover{color:#fff;border-color:#8f7a32;background:#16353a}#${CFG.panelId} .pa-tabs{display:grid;grid-template-columns:1fr;gap:5px;margin:0 0 8px}#${CFG.panelId} .pa-tab{height:25px;border:1px solid #29474a;border-radius:4px;background:linear-gradient(180deg,#163139,#11272d);color:#9bb0ad;font-size:10px;font-weight:800;text-align:center;line-height:23px;box-shadow:inset 0 1px 0 rgba(255,255,255,.035)}#${CFG.panelId} .pa-tab:first-child{color:#aebeba}#${CFG.panelId} .jp-wrap{padding:9px 12px 10px;height:100%;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;scrollbar-color:#3d5a57 #0b1718}
#${CFG.panelId} .jp-head{display:grid;grid-template-columns:205px 1fr;gap:10px;align-items:stretch;padding-bottom:8px;border-bottom:1px solid #526b68}
#${CFG.panelId} .jp-visual{height:160px;border-radius:5px;position:relative;display:grid;place-items:center;overflow:hidden;background:radial-gradient(circle at 50% 48%,rgba(55,118,108,.18),transparent 48%),linear-gradient(145deg,#142b30,#0b181c)}
#${CFG.panelId} .jp-visual:before{content:"";position:absolute;width:165px;height:31px;bottom:12px;border:2px solid #b8a03b;border-radius:50%;box-shadow:0 0 10px rgba(205,178,57,.42),inset 0 0 8px rgba(205,178,57,.18)}
#${CFG.panelId} .jp-visual:after{content:"";position:absolute;inset:0;background:radial-gradient(circle at 18% 20%,rgba(255,255,255,.12) 0 2px,transparent 3px),radial-gradient(circle at 80% 25%,rgba(255,70,80,.7) 0 2px,transparent 3px);pointer-events:none}
#${CFG.panelId} .jp-sprite{width:145px;height:145px;object-fit:contain;position:relative;z-index:1;filter:drop-shadow(0 12px 18px rgba(0,0,0,.6))}
#${CFG.panelId} .jp-info{min-width:0}
#${CFG.panelId} .jp-title-row{display:flex;align-items:baseline;gap:12px;margin-bottom:7px}
#${CFG.panelId} .jp-name{font-size:24px;font-weight:900;letter-spacing:-1px}
#${CFG.panelId} .jp-id{font-size:15px;color:#78918e}
#${CFG.panelId} .jp-type{display:inline-flex;padding:4px 12px;border:1px solid #785f39;border-radius:3px;background:#693b30;color:#ffd9b2;font-weight:800;font-size:9px;margin-bottom:8px}
#${CFG.panelId} .jp-meta{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}
#${CFG.panelId} .jp-meta-box{background:linear-gradient(180deg,#142b30,#102124);border:1px solid #334d4c;border-radius:4px;padding:7px 8px}
#${CFG.panelId} .jp-label{display:block;font-size:9px;text-transform:uppercase;color:#78918e;margin-bottom:3px}
#${CFG.panelId} .jp-value{font-size:18px;font-weight:900}
#${CFG.panelId} .jp-muted{color:#8797aa;font-size:.7em}
#${CFG.panelId} .jp-rating{display:flex;align-items:center;gap:22px;background:linear-gradient(90deg,#15292a,#132522);border:1px solid #405b57;border-radius:4px;padding:9px 11px;margin:8px 0}
#${CFG.panelId} .jp-gauge{width:58px;height:58px;flex:0 0 58px;border-radius:50%;background:conic-gradient(#f1c644 calc(var(--score)*3.6deg),#1d2a3a 0);display:grid;place-items:center;position:relative}
#${CFG.panelId} .jp-gauge:before{content:"";width:46px;height:46px;border-radius:50%;background:#0a121c;position:absolute}
#${CFG.panelId} .jp-gauge span{position:relative;z-index:1;font-size:15px;font-weight:900;color:#f1c644}
#${CFG.panelId} .jp-rating-title{font-size:19px;font-weight:900;color:#f1c644}
#${CFG.panelId} .jp-rating-sub{font-size:11px;color:#7f9894;margin-top:2px}
#${CFG.panelId} .jp-section{font-size:11px;font-weight:900;color:#bfcfca;text-transform:uppercase;letter-spacing:.45px;margin:8px 0 5px;padding-bottom:4px;border-bottom:1px solid #354b49}
#${CFG.panelId} .jp-accent{color:#f1c644}
#${CFG.panelId} .jp-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}
#${CFG.panelId} .jp-stat{background:linear-gradient(180deg,#12272b,#101f21);border:1px solid #334e4c;border-radius:4px;padding:8px 9px}
#${CFG.panelId} .jp-stat-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:7px}
#${CFG.panelId} .jp-stat-name{font-size:13px;font-weight:900;color:var(--c)}
#${CFG.panelId} .jp-iv{font-size:13px;font-weight:900;color:#62d8ca}
#${CFG.panelId} .jp-track{height:6px;background:#203432;border-radius:2px;overflow:hidden;margin-bottom:6px}
#${CFG.panelId} .jp-fill{height:100%;background:var(--c);border-radius:99px}
#${CFG.panelId} .jp-field{display:grid;grid-template-columns:45px 1fr;gap:6px;align-items:center;margin-top:5px;color:#9caabd;font-size:12px}
#${CFG.panelId} .jp-input{width:100%;padding:5px 7px;background:#0b181a;border:1px solid #334c4a;border-radius:3px;color:#e3eeea;font-size:12px;height:25px}
#${CFG.panelId} .jp-base{color:#b7c8c3;font-size:11px}
#${CFG.panelId} .jp-moves{display:flex;flex-direction:column;gap:5px}
#${CFG.panelId} .jp-move{display:grid;grid-template-columns:108px 1fr 45px;align-items:center;gap:10px;background:#0c141e;border:1px solid #243449;border-radius:9px;padding:7px 10px}
#${CFG.panelId} .jp-move-type{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:4px 7px;border-radius:3px;background:var(--type-bg);color:var(--type-fg);font-weight:900;font-size:11px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.14);text-transform:uppercase;letter-spacing:.15px}
#${CFG.panelId} .jp-type-icon{display:inline-grid;place-items:center;width:15px;height:15px;font-size:12px;line-height:1}
#${CFG.panelId} .jp-move-name{font-size:12px;font-weight:800}
#${CFG.panelId} .jp-move-level{font-size:10px;color:#718985;margin-left:8px}
#${CFG.panelId} .jp-move-power{font-size:12px;font-weight:900;color:#d7ba45;text-align:right}
#${CFG.panelId} .jp-footer{display:flex;justify-content:space-between;color:#637b77;font-size:9px;margin-top:7px;padding-top:5px;border-top:1px solid #304643}
@media(max-width:760px){#${CFG.panelId}{width:calc(100vw - 10px);max-height:calc(100vh - 10px)}#${CFG.panelId} .jp-head{grid-template-columns:1fr}#${CFG.panelId} .jp-visual{height:170px}#${CFG.panelId} .jp-grid{grid-template-columns:repeat(2,1fr)}#${CFG.panelId} .jp-meta{grid-template-columns:repeat(2,1fr)}}
@media(max-width:470px){#${CFG.panelId} .jp-grid{grid-template-columns:1fr}#${CFG.panelId} .jp-name{font-size:27px}#${CFG.panelId} .jp-move{grid-template-columns:95px 1fr 40px}}
`;
document.head.appendChild(s);
const p=document.createElement("div");p.id=CFG.panelId;
p.innerHTML='<div class="jp-wrap"><div class="pa-topbar"><div class="pa-title"><span class="pa-title-icon">▥</span><span>Pokemon Analyzer</span></div><button class="pa-close" type="button" data-panel-close>×</button></div><div class="pa-tabs"><div class="pa-tab">📊 Análisis de IV</div></div><div id="pil-content"></div></div>';
document.body.appendChild(p);
p.querySelector("[data-panel-close]").addEventListener("click",()=>{p.style.display="none"});
}
function moveList(c){
const src=c?.moves||c?.attacks||c?.skills||c?.learnset||[];
const arr=Array.isArray(src)?src:Object.values(src||{});
return arr.map((m,i)=>typeof m==="string"?{name:m,level:null,type:"NORMAL",power:null}:{name:m?.name||m?.move||m?.attack||m?.id||"Move "+(i+1),level:m?.level??m?.learnLevel??m?.unlockLevel??null,type:m?.type||m?.element||"NORMAL",power:m?.power??m?.damage??null}).filter(m=>m.name).sort((a,b)=>(a.level??999)-(b.level??999));
}
const speciesCache=new Map(),officialDexNumbers=new Map();let officialDexLoaded=false;
async function loadOfficialDexNumbers(){if(officialDexLoaded)return;try{const r=await fetch("/pokepedia/pokemon",{cache:"force-cache"});if(r.ok){const html=await r.text(),doc=new DOMParser().parseFromString(html,"text/html");for(const a of doc.querySelectorAll('a[href*="/pokepedia/pokemon/"]')){const t=(a.innerText||a.textContent||"").replace(/\s+/g," ").trim(),m=t.match(/#(\d{1,4})/),href=(a.getAttribute("href")||"").match(/\/pokemon\/([^/?#]+)/i);if(m&&href)officialDexNumbers.set(norm(href[1].replace(/-/g," ")),String(+m[1]).padStart(3,"0"));}}}catch{}officialDexLoaded=true}
function slugifyName(n){const raw=String(n||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/shiny/g,"").trim();const map={"nidoran male":"nidoran-m","nidoran female":"nidoran-f","mr mime":"mr-mime","mr rime":"mr-rime","mime jr":"mime-jr","type null":"type-null","ho oh":"ho-oh","porygon z":"porygon-z","jangmo o":"jangmo-o","hakamo o":"hakamo-o","kommo o":"kommo-o","tapu koko":"tapu-koko","tapu lele":"tapu-lele","tapu bulu":"tapu-bulu","tapu fini":"tapu-fini"};const cleaned=raw.replace(/[^a-z0-9\s-]/g,"").replace(/\s+/g," ").trim();return map[cleaned]||cleaned.replace(/\s+/g,"-")}
async function hydratePokemon(p){
const key=norm(p.name);
if(speciesCache.has(key)){Object.assign(p,speciesCache.get(key));return p}
const extra={baseFallback:{},spriteSrc:""};
try{
const page=await fetch("/pokepedia/pokemon/"+slugifyName(p.name),{cache:"force-cache"});
if(page.ok){
const pageHtml=await page.text();const pageNum=(pageHtml.match(/#(\d{1,4})/)||[])[1];if(!extra.dexNumber&&pageNum)extra.dexNumber=String(+pageNum).padStart(3,"0");const doc=new DOMParser().parseFromString(pageHtml,"text/html"),wanted=norm(p.name);
const hit=[...doc.querySelectorAll("img")].find(im=>{const alt=norm(im.getAttribute("alt")||""),src=im.getAttribute("src")||im.getAttribute("data-src")||"";return src&&alt&&(alt.includes(wanted)||wanted.includes(alt))});
if(hit){const src=hit.getAttribute("src")||hit.getAttribute("data-src")||"";if(src)extra.spriteSrc=new URL(src,location.origin).href}
}
}catch{}
try{
const apiName=slugifyName(p.name);
let r=await fetch("https://pokeapi.co/api/v2/pokemon/"+encodeURIComponent(apiName),{cache:"force-cache"});
if(!r.ok&&apiName.includes("-"))r=await fetch("https://pokeapi.co/api/v2/pokemon/"+encodeURIComponent(apiName.split("-")[0]),{cache:"force-cache"});
if(r.ok){
const data=await r.json();extra.pokeApiId=data.id;extra.types=(data.types||[]).map(x=>x?.type?.name||x?.name||x).filter(Boolean);extra.dexNumber=String(data.id).padStart(3,"0");
for(const item of data.stats||[]){const n=item.stat?.name,v=Number(item.base_stat);if(!Number.isFinite(v))continue;if(n==="hp")extra.baseFallback.hp=v;else if(n==="attack")extra.baseFallback.atk=v;else if(n==="defense")extra.baseFallback.def=v;else if(n==="special-attack")extra.baseFallback.spa=v;else if(n==="special-defense")extra.baseFallback.spd=v;else if(n==="speed")extra.baseFallback.vel=v}
if(!extra.spriteSrc)extra.spriteSrc="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/"+data.id+".gif";
}
}catch{}
// PokeAPI manda en el número de Pokédex; la lista de /pokepedia solo se pide si falló.
if(!extra.dexNumber){try{await loadOfficialDexNumbers();extra.dexNumber=officialDexNumbers.get(key)||""}catch{}}
if(!extra.dexNumber&&p.creature?.id)extra.dexNumber=String(p.creature.id).padStart(3,"0");
if(!extra.spriteSrc&&p.creature?.id)extra.spriteSrc="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/"+p.creature.id+".gif";
speciesCache.set(key,extra);Object.assign(p,extra);return p
}
const TYPE_NAMES={NORMAL:"NORMAL",FIRE:"FUEGO",WATER:"AGUA",ELECTRIC:"ELÉCTRICO",GRASS:"PLANTA",ICE:"HIELO",FIGHTING:"LUCHA",POISON:"VENENO",GROUND:"TIERRA",FLYING:"VOLADOR",PSYCHIC:"PSÍQUICO",BUG:"BICHO",ROCK:"ROCA",GHOST:"FANTASMA",DRAGON:"DRAGÓN",DARK:"SINIESTRO",STEEL:"ACERO",FAIRY:"HADA"};
function pokemonTypes(c){const out=[];const add=v=>{if(v==null)return;if(Array.isArray(v)){v.forEach(add);return}if(typeof v==="object"){add(v.name??v.type??v.element);return}String(v).split(/[\/,&|+]+/).map(x=>x.trim()).filter(Boolean).forEach(x=>{const key=x.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g,"");const label=TYPE_NAMES[key]||String(x).toUpperCase();if(!out.includes(label))out.push(label)})};[c?.types,c?.type,c?.element,c?.primaryType,c?.secondaryType,c?.type1,c?.type2].forEach(add);return out.slice(0,2)}
function render(p){
const d=calc(p),el=document.getElementById("pil-content"),box=document.getElementById(CFG.panelId);if(!el||!box)return;
const c=d.creature||{},types=pokemonTypes(c),type=types.length?types.join(" / "):"—";
const qualityLabel=d.quality>=1.5?"Épica":d.quality>=1.3?"Rara":d.quality>=1.15?"Incomum":"Común";
const rating=d.pct<25?"Muy bajo":d.pct<50?"Mediano":d.pct<75?"Bueno":d.pct<90?"Excelente":"Perfecto";
const stats=Object.keys(CFG.statLabels).map(k=>`<div class="jp-stat" style="--c:${CFG.colors[k]}"><div class="jp-stat-head"><span class="jp-stat-name">${CFG.statLabels[k]}</span><span class="jp-iv">${d.ivs[k].toFixed(1)}/32</span></div><div class="jp-track"><div class="jp-fill" style="width:${Math.max(0,Math.min(100,d.ivs[k]/32*100))}%"></div></div><div class="jp-field"><span>actual</span><input class="jp-input" data-stat="${k}" type="number" value="${d.stats[k]??""}"></div><div class="jp-field"><span>base</span><div class="jp-base">${d.bases[k]||"?"}</div></div></div>`).join("");
const moves=moveList(c);
const movesHtml=moves.length?moves.map(m=>`<div class="jp-move">${typeBadge(m.type)}<div><span class="jp-move-name">${esc(m.name)}</span><span class="jp-move-level">${m.level!=null?"Nv "+m.level:""}</span></div><span class="jp-move-power">${m.power??"—"}</span></div>`).join(""):`<div class="jp-move"><span class="jp-move-type">INFO</span><div class="jp-move-name">No se encontraron golpes en creatures.json</div><span></span></div>`;
const bars=Object.keys(CFG.statLabels).map(k=>`<div class="jp-field" style="grid-template-columns:34px 1fr 43px"><span style="color:var(--c);font-weight:800">${CFG.statLabels[k]}</span><div class="jp-track" style="margin:0"><div class="jp-fill" style="width:${Math.max(0,Math.min(100,d.ivs[k]/32*100))}%"></div></div><span style="text-align:right">${d.ivs[k].toFixed(1)}</span></div>`).join("");
const sprite=d.spriteSrc||"";
el.innerHTML=`<div class="jp-head"><div class="jp-visual"><img class="jp-sprite" src="${esc(sprite)}" alt="${esc(d.name)}"></div><div class="jp-info"><div class="jp-title-row"><div class="jp-name">${esc(d.name)}</div><div class="jp-id">#${esc(String(d.dexNumber||c.id||"0").padStart(3,"0"))}</div></div><span class="jp-type">${esc(type)}</span><div class="jp-meta"><div class="jp-meta-box"><span class="jp-label">Nivel</span><span class="jp-value">${d.level}</span></div><div class="jp-meta-box"><span class="jp-label">Calidad</span><span class="jp-value">${d.quality.toFixed(2).replace(".",",")}</span></div><div class="jp-meta-box"><span class="jp-label">IV Total</span><span class="jp-value" style="color:#55e6d3">${d.total}<span class="jp-muted">/192</span></span></div><div class="jp-meta-box"><span class="jp-label">Poder estimado</span><span class="jp-value" style="color:#f1c644">${Math.round(d.power)}</span></div></div></div></div><div class="jp-rating"><div class="jp-gauge" style="--score:${d.pct}"><span>${Math.round(d.pct)}%</span></div><div><div class="jp-rating-title">${rating}</div><div class="jp-rating-sub">Posee atributos equilibrados para uso general.</div></div></div><div class="jp-section">ESTADÍSTICAS / IV <span class="jp-muted">(${d.pct.toFixed(1)}% · <span class="jp-accent">${qualityLabel} ×${d.quality.toFixed(2)}</span>)</span></div><div class="jp-grid">${stats}</div><div class="jp-section">HABILIDADES</div><div class="jp-moves">${movesHtml}</div><div class="jp-footer"><span>Arrastra la esquina inferior derecha para cambiar el tamaño · Poder en el juego: <b>${d.powerGame||Math.round(d.power)}</b></span><span>PokeIdleLab IV Calculator · v1.0.32</span></div>`;
el.querySelectorAll("[data-stat]").forEach(i=>i.addEventListener("input",()=>{if(current){current.actuals[i.dataset.stat]=Number(i.value)||0;render(current)}}));
box.style.display="block";box.scrollTop=0;box.querySelector(".jp-wrap")?.scrollTo(0,0);
const saved=localStorage.getItem(CFG.storageKey);if(saved){try{const z=JSON.parse(saved);if(z.w&&z.h){box.style.width=Math.max(560,Math.min(innerWidth-12,z.w))+"px";box.style.height=Math.max(520,Math.min(innerHeight-12,z.h))+"px"}if(Number.isFinite(z.x)&&Number.isFinite(z.y)){box.style.transform="none";box.style.left=Math.max(0,Math.min(innerWidth-box.offsetWidth,z.x))+"px";box.style.top=Math.max(0,Math.min(innerHeight-box.offsetHeight,z.y))+"px"}}catch{}}
if(!box.dataset.resizeBound){box.dataset.resizeBound="1";new ResizeObserver(()=>{clearTimeout(box._resizeTimer);box._resizeTimer=setTimeout(()=>{const z=JSON.parse(localStorage.getItem(CFG.storageKey)||"{}");localStorage.setItem(CFG.storageKey,JSON.stringify({w:box.offsetWidth,h:box.offsetHeight,x:z.x,y:z.y}))},120)}).observe(box)}if(!box.dataset.dragBound){box.dataset.dragBound="1";const bar=box.querySelector(".pa-topbar");let drag=null;bar?.addEventListener("mousedown",e=>{if(e.button!==0||e.target.closest("button"))return;const r=box.getBoundingClientRect();drag={dx:e.clientX-r.left,dy:e.clientY-r.top};box.style.transform="none";box.style.left=r.left+"px";box.style.top=r.top+"px";e.preventDefault()});document.addEventListener("mousemove",e=>{if(!drag)return;const x=Math.max(0,Math.min(innerWidth-box.offsetWidth,e.clientX-drag.dx));const y=Math.max(0,Math.min(innerHeight-box.offsetHeight,e.clientY-drag.dy));box.style.left=x+"px";box.style.top=y+"px"});document.addEventListener("mouseup",()=>{if(!drag)return;drag=null;const z=JSON.parse(localStorage.getItem(CFG.storageKey)||"{}");localStorage.setItem(CFG.storageKey,JSON.stringify({w:box.offsetWidth,h:box.offsetHeight,x:parseFloat(box.style.left),y:parseFloat(box.style.top)}))})}
}
function scan(){const tips=[...document.querySelectorAll(".inv-tip")].filter(t=>{const s=getComputedStyle(t),r=t.getBoundingClientRect();return s.display!=="none"&&s.visibility!=="hidden"&&+s.opacity>0&&r.width>0&&r.height>0});const tip=tips.find(t=>{const tx=t.innerText||"";return !/\b(?:LOOT|ITEM|RECURSO|POK[EÉ]\s*BALL|POK[EÉ]BALL)\b/i.test(tx)&&!/(?:\$\s*\d[\d.,]*|\d[\d.,]*\s*dollars?)\b/i.test(tx)})||tips[0];if(!tip){return}const text=tip.innerText||"";if(/\b(?:LOOT|ITEM|RECURSO|POK[EÉ]\s*BALL|POK[EÉ]BALL)\b/i.test(text)||/(?:\$\s*\d[\d.,]*|\d[\d.,]*\s*dollars?)\b/i.test(text)){document.getElementById(CFG.panelId)?.style.setProperty("display","none");lastPokemonTooltip=null;lastText="";current=null;return}const p=parse(text,tip);if(!p){document.getElementById(CFG.panelId)?.style.setProperty("display","none");lastPokemonTooltip=null;lastText="";current=null;return}p.spriteSrc=findSpriteSrc(tip)||"";if(tip!==lastPokemonTooltip||text!==lastText){lastPokemonTooltip=tip;lastText=text;current=p;render(p);hydratePokemon(p).then(()=>{if(current===p){p.spriteSrc=p.spriteSrc||findSpriteSrc(tip);render(p)}})}}
// Como mucho un escaneo por frame, e ignorando los cambios del propio panel:
// el juego toca el DOM sin parar y cada escaneo llama a getComputedStyle.
const inPanel=n=>{const e=n?.nodeType===1?n:n?.parentElement;return !!e?.closest?.("#"+CFG.panelId)};
function throttled(fn){let queued=false;return()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;fn()})}}
const queueScan=throttled(scan);
new MutationObserver(ms=>{if(ms.some(m=>!inPanel(m.target)))queueScan()}).observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true});document.addEventListener("mouseover",e=>{if(e.target.closest?.(".inv-tip"))queueScan()},true);setInterval(scan,250);panel();load();
const POKEIDLELAB_UI_SCALE={small:.9,medium:1,large:1.1};let pokeidlelabUiMode=null,pokeidlelabUiScale=1;
function pokeidlelabUiModeOf(v){const s=String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim();if(/^(pequeno|pequena|small)$/.test(s))return"small";if(/^(medio|media|medium)$/.test(s))return"medium";if(/^(grande|large)$/.test(s))return"large";return null}
function pokeidlelabUiApply(mode){const box=document.getElementById(CFG.panelId),scale=POKEIDLELAB_UI_SCALE[mode];if(!box||!scale||mode===pokeidlelabUiMode)return;const r=box.getBoundingClientRect(),factor=scale/pokeidlelabUiScale,maxW=Math.max(560,innerWidth-12),maxH=Math.max(520,innerHeight-12);box.style.width=Math.round(Math.max(560,Math.min(maxW,r.width*factor)))+"px";box.style.height=Math.round(Math.max(520,Math.min(maxH,r.height*factor)))+"px";pokeidlelabUiMode=mode;pokeidlelabUiScale=scale}
function pokeidlelabUiSelectedMode(){for(const sel of document.querySelectorAll("select")){const m=pokeidlelabUiModeOf(sel.value);if(m)return m}for(const el of document.querySelectorAll("button,[role=button],[role=tab],label")){const m=pokeidlelabUiModeOf((el.textContent||"").replace(/\s+/g," "));if(!m)continue;const c=String(el.className||"");if(el.getAttribute("aria-pressed")==="true"||el.getAttribute("aria-selected")==="true"||/\b(active|selected|current|checked|seleccionad[oa])\b/i.test(c))return m}return null}
function pokeidlelabUiScan(){const m=pokeidlelabUiSelectedMode();if(m)pokeidlelabUiApply(m)}
document.addEventListener("click",e=>{const el=e.target?.closest?.("button,[role=button],[role=tab],label,option"),m=pokeidlelabUiModeOf(el?.textContent);if(m){pokeidlelabUiApply(m);setTimeout(pokeidlelabUiScan,80);setTimeout(pokeidlelabUiScan,300)}},true);
document.addEventListener("change",e=>{const el=e.target,m=pokeidlelabUiModeOf(el?.value)||pokeidlelabUiModeOf(el?.selectedOptions?.[0]?.textContent);if(m){pokeidlelabUiApply(m);setTimeout(pokeidlelabUiScan,80)}},true);
const queueUiScan=throttled(pokeidlelabUiScan);
new MutationObserver(ms=>{if(ms.some(m=>!inPanel(m.target)))queueUiScan()}).observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:["class","aria-pressed","aria-selected","value"]});setInterval(pokeidlelabUiScan,700);setTimeout(pokeidlelabUiScan,500);setTimeout(pokeidlelabUiScan,1500);
window.addEventListener("resize",()=>{const box=document.getElementById(CFG.panelId);if(!box)return;const maxW=Math.max(560,innerWidth-12),maxH=Math.max(520,innerHeight-12);if(box.offsetWidth>maxW)box.style.width=maxW+"px";if(box.offsetHeight>maxH)box.style.height=maxH+"px"});
})();