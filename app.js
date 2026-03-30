var PER_PAGE = 50;

var CATEGORY_NORMALIZE = {
  licensing: "Licensing", Licensing: "Licensing",
  social_equity: "Social Equity", "Social Equity": "Social Equity",
  "Racial Disparity": "Social Equity",
  compliance_enforcement: "Compliance", enforcement: "Compliance",
  regulation: "Regulation", regulatory_structure: "Regulation", Legal: "Regulation",
  public_health_safety: "Public Health", public_health: "Public Health",
  employment_economics: "Employment", employment: "Employment",
  demand_consumption: "Consumption", consumption: "Consumption",
  demographics: "Demographics", Demographics: "Demographics",
  policy: "Policy", Policy: "Policy", "Policy Recommendations": "Policy",
  market_size_revenue: "Market & Revenue", Sales: "Market & Revenue",
  Economy: "Market & Revenue", "Economic Development": "Market & Revenue",
  "Market Structure": "Market & Revenue",
  pricing: "Pricing", supply_chain: "Supply Chain",
  taxation: "Taxation", production: "Production",
  "Criminal Justice": "Criminal Justice",
  Barriers: "Other", Geography: "Other", Methodology: "Other", other: "Other"
};

var STATE_NAMES = {
  AK:"Alaska",AL:"Alabama",AZ:"Arizona",AR:"Arkansas",CA:"California",
  CO:"Colorado",CT:"Connecticut",DC:"District of Columbia",DE:"Delaware",
  FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",
  IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",
  ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",
  MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",
  NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",
  NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",
  OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",
  SD:"South Dakota",TN:"Tennessee",TX:"Texas",US:"National (US)",
  UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",
  WI:"Wisconsin",WY:"Wyoming"
};

var PROVINCES = {
  Alberta:"Alberta","British Columbia":"British Columbia",Manitoba:"Manitoba",
  "New Brunswick":"New Brunswick","Newfoundland & Labrador":"Newfoundland & Labrador",
  "Northwest Territories":"Northwest Territories","Nova Scotia":"Nova Scotia",
  Nunavut:"Nunavut",Ontario:"Ontario","Prince Edward Island":"Prince Edward Island",
  Quebec:"Quebec",Saskatchewan:"Saskatchewan",Yukon:"Yukon",Canada:"National (Canada)"
};

var TYPE_LABELS = {
  statistic:"Statistic",finding:"Finding",table:"Table",table_data:"Table",
  quantitative:"Quantitative",qualitative:"Qualitative",survey:"Survey",
  survey_result:"Survey",policy:"Policy",recommendation:"Policy",
  legal_provision:"Legal",estimate:"Estimate",projection:"Projection",
  derived:"Derived",milestone:"Milestone",methodology:"Other",date:"Date"
};

var ERROR_FORM = "https://docs.google.com/forms/d/e/1FAIpQLSfAr0l1d53il4pEHlu4jAwLkUxKMjcnUEIP-QMptX56DLG4LQ/viewform?usp=pp_url&entry.70049677=";
var ANALYSIS_URL = "https://cannabiswiseguys.com/contact/";

var allRecords = [], filteredRecords = [], sourceUrls = {}, fuse = null, page = 1;
var filters = { countries:[], states:[], categories:[], types:[] };

async function init() {
  try {
    var r = await Promise.all([fetch("data/cannabis_database.json"), fetch("data/source_urls.json")]);
    allRecords = await r[0].json();
    sourceUrls = await r[1].json();
  } catch(e) {
    document.getElementById("results").innerHTML = '<div class="state-msg">Failed to load. Refresh the page.</div>';
    return;
  }

  fuse = new Fuse(allRecords, {
    keys:[{name:"claim",weight:3},{name:"context",weight:1},{name:"notes",weight:1},{name:"subcategory",weight:.5}],
    threshold:.35, includeScore:true, minMatchCharLength:2
  });

  buildFilters();
  stats();
  readHash();
  run();

  document.getElementById("search").addEventListener("input", debounce(function(){ page=1; run(); }, 250));
  document.getElementById("year-start").addEventListener("change", function(){ page=1; run(); });
  document.getElementById("year-end").addEventListener("change", function(){ page=1; run(); });
  window.addEventListener("hashchange", function(){ readHash(); run(); });
}

function buildFilters() {
  var cc={}, sc={}, cat={}, tc={};
  allRecords.forEach(function(r){
    if(r.country) cc[r.country]=(cc[r.country]||0)+1;
    if(r.state){
      var n=STATE_NAMES[r.state]||PROVINCES[r.state]||r.state;
      if(!sc[r.state]) sc[r.state]={n:n,c:0};
      sc[r.state].c++;
    }
    if(r.category){
      var norm=CATEGORY_NORMALIZE[r.category]||r.category;
      cat[norm]=(cat[norm]||0)+1;
    }
    if(r.data_type){
      var tl=TYPE_LABELS[r.data_type]||r.data_type;
      tc[tl]=(tc[tl]||0)+1;
    }
  });

  renderChecks("filter-countries", cc, "country");

  var ss=Object.entries(sc).sort(function(a,b){return a[1].n.localeCompare(b[1].n);});
  var so={}; ss.forEach(function(e){so[e[0]]=e[1].c;});
  renderChecksNamed("filter-states", so, sc, "state");

  var cs=Object.entries(cat).sort(function(a,b){return b[1]-a[1];});
  var co={}; cs.forEach(function(e){co[e[0]]=e[1];});
  renderChecks("filter-categories", co, "category");

  var ts=Object.entries(tc).sort(function(a,b){return b[1]-a[1];});
  var to={}; ts.forEach(function(e){to[e[0]]=e[1];});
  renderChecks("filter-types", to, "type");
}

function renderChecks(id, counts, group) {
  document.getElementById(id).innerHTML = Object.entries(counts).map(function(e){
    return '<label class="filter-check"><input type="checkbox" value="'+h(e[0])+'" data-group="'+group+'" onchange="onCheck()">'+
      '<span class="filter-check-name">'+h(e[0])+'</span><span class="filter-check-ct">'+e[1]+'</span></label>';
  }).join("");
}

function renderChecksNamed(id, counts, meta, group) {
  document.getElementById(id).innerHTML = Object.entries(counts).map(function(e){
    var dn=meta[e[0]]?meta[e[0]].n:e[0];
    return '<label class="filter-check"><input type="checkbox" value="'+h(e[0])+'" data-group="'+group+'" onchange="onCheck()">'+
      '<span class="filter-check-name">'+h(dn)+'</span><span class="filter-check-ct">'+e[1]+'</span></label>';
  }).join("");
}

function onCheck() {
  filters.countries=checked("country");
  filters.states=checked("state");
  filters.categories=checked("category");
  filters.types=checked("type");
  page=1;
  run();
}

function checked(g) {
  return Array.from(document.querySelectorAll('input[data-group="'+g+'"]:checked')).map(function(c){return c.value;});
}

function run() {
  var q=document.getElementById("search").value.trim();
  var ys=parseInt(document.getElementById("year-start").value)||0;
  var ye=parseInt(document.getElementById("year-end").value)||9999;

  var list;
  if(q.length>=2) list=fuse.search(q).map(function(r){return r.item;});
  else list=allRecords.slice().sort(function(a,b){return latestYear(b)-latestYear(a);});

  filteredRecords=list.filter(function(r){
    if(filters.countries.length && filters.countries.indexOf(r.country)===-1) return false;
    if(filters.states.length && filters.states.indexOf(r.state)===-1) return false;
    if(filters.categories.length){
      var norm=CATEGORY_NORMALIZE[r.category]||r.category;
      if(filters.categories.indexOf(norm)===-1) return false;
    }
    if(filters.types.length){
      var tl=TYPE_LABELS[r.data_type]||r.data_type;
      if(filters.types.indexOf(tl)===-1) return false;
    }
    if(r.year_end && r.year_end<ys) return false;
    if(r.year_start && r.year_start>ye) return false;
    return true;
  });

  render();
  paginate();
  writeHash();
  showClear();
}

function render() {
  var el=document.getElementById("results");
  var ct=document.getElementById("result-count");
  var tot=filteredRecords.length;
  var tp=Math.ceil(tot/PER_PAGE)||1;
  if(page>tp) page=tp;
  var s=(page-1)*PER_PAGE, e=Math.min(s+PER_PAGE,tot);
  ct.textContent=tot===0?"No results":(s+1)+"\u2013"+e+" of "+tot.toLocaleString();
  if(!tot){ el.innerHTML='<div class="state-msg">No matching records.</div>'; return; }
  el.innerHTML=filteredRecords.slice(s,e).map(renderRow).join("");
}

function renderRow(r) {
  var yr=extractYr(r);
  var src=srcName(r.source_report);
  var cat=CATEGORY_NORMALIZE[r.category]||r.category||"";
  var claim=r.claim||"";
  var val=fmtVal(r.value,r.unit,r.data_type);
  var rid="r_"+(r.id||"").replace(/[^a-zA-Z0-9]/g,"_");
  var cid="cx_"+rid;
  var sn=STATE_NAMES[r.state]||PROVINCES[r.state]||r.state||"";
  var pg=r.page?"p."+r.page:"";

  var det='<div class="row-detail"><div class="d-id">'+h(r.id||"")+'</div><div class="d-meta">';
  if(sn) det+='<b>'+h(sn)+'</b>';
  if(r.country==="Canada") det+=' (Canada)';
  if(r.date_range) det+=' &middot; '+h(r.date_range);
  det+='<br>Source: '+h(src);
  if(pg) det+=', '+pg;
  if(r.source_report) det+=' <a href="#" onclick="openSrc(event,\''+ha(r.source_report)+'\','+(r.page||0)+')">[View]</a>';
  if(r.notes) det+='<br>Notes: '+h(r.notes);
  det+='</div>';

  if(r.context){
    det+='<div class="d-ctx-toggle" onclick="togCtx(\''+cid+'\',this)"><span class="arr">&#9654;</span> View original context</div>';
    det+='<div class="d-ctx" id="'+cid+'">&ldquo;'+h(r.context)+'&rdquo;</div>';
  }

  det+='<div class="d-actions">';
  det+='<button class="act" onclick="cite(this,\''+ha(r.id||"")+'\')">Copy Citation</button>';
  det+='<a class="act act--dim" href="'+ERROR_FORM+encodeURIComponent(r.id||"")+'" target="_blank" rel="noopener">Report Error</a>';
  det+='<a class="act" href="'+ANALYSIS_URL+'" target="_blank" rel="noopener">Request Analysis</a>';
  det+='</div></div>';

  var stAbbr = r.state || "";

  return '<div class="row" id="'+rid+'">'+
    '<div class="row-summary" onclick="togRow(\''+rid+'\')">'+
    '<span class="c c-yr">'+h(yr)+'</span>'+
    '<span class="c c-st">'+h(stAbbr)+'</span>'+
    '<span class="c c-src">'+h(src)+'</span>'+
    '<span class="c c-cat">'+h(cat)+'</span>'+
    '<span class="c c-desc">'+hlVal(h(claim))+'</span>'+
    '<span class="c c-val">'+val+'</span>'+
    '<span class="c c-exp">&#8250;</span>'+
    '</div>'+det+'</div>';
}

function togRow(id){ var e=document.getElementById(id); if(e) e.classList.toggle("expanded"); }
function togCtx(id,t){ var e=document.getElementById(id); if(e){ e.classList.toggle("open"); t.classList.toggle("open"); } }

function paginate() {
  var el=document.getElementById("pagination");
  var tot=filteredRecords.length, tp=Math.ceil(tot/PER_PAGE)||1;
  if(tp<=1){ el.innerHTML=""; return; }

  var out='<button class="pg" onclick="go('+(page-1)+')"'+(page<=1?' disabled':'')+'>&#8249;</button>';
  var range=pgRange(page,tp), prev=0;
  range.forEach(function(p){
    if(p-prev>1) out+='<span class="pg-dots">&hellip;</span>';
    out+='<button class="pg'+(p===page?' on':'')+'" onclick="go('+p+')">'+p+'</button>';
    prev=p;
  });
  out+='<button class="pg" onclick="go('+(page+1)+')"'+(page>=tp?' disabled':'')+'>&#8250;</button>';
  el.innerHTML=out;
}

function pgRange(cur,tot) {
  if(tot<=7){ var a=[]; for(var i=1;i<=tot;i++) a.push(i); return a; }
  var p=[1], lo=Math.max(2,cur-1), hi=Math.min(tot-1,cur+1);
  for(var j=lo;j<=hi;j++) if(p.indexOf(j)===-1) p.push(j);
  if(p.indexOf(tot)===-1) p.push(tot);
  return p.sort(function(a,b){return a-b;});
}

function go(n) {
  var tp=Math.ceil(filteredRecords.length/PER_PAGE)||1;
  if(n<1||n>tp) return;
  page=n; render(); paginate(); writeHash();
  document.getElementById("content").scrollTo({top:0,behavior:"smooth"});
}

function extractYr(r) {
  if(r.year_end) return String(r.year_end);
  if(r.year_start) return String(r.year_start);
  if(r.date_range){ var m=r.date_range.match(/\b(19|20)\d{2}\b/g); if(m) return String(Math.max.apply(null,m.map(Number))); }
  return "";
}

function fmtVal(v,u,dt) {
  if(v==null) return "";
  if(dt==="finding"||dt==="qualitative") return "";
  var n=Number(v);
  if(isNaN(n)) return h(String(v));
  if(u==="USD"||u==="USD_millions"||u==="million USD"||u==="billion USD"||u==="dollars"||u==="million dollars") return "$"+abbr(n);
  if(u==="CAD"||u==="million_CAD") return "C$"+abbr(n);
  if(u&&u.indexOf("percent")!==-1) return n.toLocaleString(undefined,{maximumFractionDigits:1})+"%";
  return abbr(n);
}

function abbr(n) {
  var a=Math.abs(n);
  if(a>=1e9) return (n/1e9).toFixed(1)+"B";
  if(a>=1e6) return (n/1e6).toFixed(1)+"M";
  if(a>=1e3) return (n/1e3).toFixed(1)+"K";
  return n.toLocaleString(undefined,{maximumFractionDigits:1});
}

function hlVal(text) {
  return text.replace(/\$[\d,]+(?:\.\d+)?(?:\s*(?:billion|million|thousand))?/gi, function(m){ return '<span class="hl">'+m+'</span>'; });
}

function cite(btn,id) {
  var r=allRecords.find(function(x){return x.id===id;});
  if(!r) return;
  var s=srcName(r.source_report), pg=r.page?", p."+r.page:"";
  navigator.clipboard.writeText('"'+r.claim+'"\n('+s+pg+')\nvia Cannabis Factbook — cannabiswiseguys.com').then(function(){
    btn.classList.add("copied"); btn.textContent="Copied";
    setTimeout(function(){ btn.classList.remove("copied"); btn.textContent="Copy Citation"; },1800);
  });
}

function openSrc(e,src,pg) {
  e.preventDefault(); e.stopPropagation();
  var url=sourceUrls[src];
  if(url) window.open(url+(pg?"#page="+pg:""),"_blank","noopener");
}

function stats() {
  var srcs=new Set(allRecords.map(function(r){return r.source_report}).filter(Boolean));
  var st=new Set(allRecords.filter(function(r){return r.country==="US"&&r.state&&r.state!=="US"&&r.state.length===2}).map(function(r){return r.state}));
  document.getElementById("stat-facts").textContent=allRecords.length.toLocaleString();
  document.getElementById("stat-reports").textContent=srcs.size;
  document.getElementById("stat-us-states").textContent=st.size;
  document.getElementById("source-count").textContent=srcs.size;
}

function srcName(p) {
  if(!p) return "Unknown";
  var f=p.replace(/^.*\//,"");
  if(f==="HI Report Jan 20.pdf") return "HI Cannabis Market Report";
  return f.replace(/\.pdf$/i,"");
}

function latestYear(r) {
  if(r.year_end) return r.year_end;
  if(r.year_start) return r.year_start;
  if(r.date_range){ var m=r.date_range.match(/\b(19|20)\d{2}\b/g); if(m) return Math.max.apply(null,m.map(Number)); }
  return 0;
}

function switchView(v) {
  var res=document.getElementById("results"), sv=document.getElementById("sources-view");
  var th=document.getElementById("table-head"), pg=document.getElementById("pagination");

  var dataEls=[document.getElementById("view-search"),document.getElementById("m-view-search")];
  var srcEls=[document.getElementById("view-sources"),document.getElementById("m-view-sources")];

  if(v==="sources"){
    res.style.display="none"; th.style.display="none"; pg.style.display="none";
    sv.style.display="block";
    dataEls.forEach(function(e){if(e)e.classList.remove("active");});
    srcEls.forEach(function(e){if(e)e.classList.add("active");});
    renderSources();
  } else {
    res.style.display=""; th.style.display=""; pg.style.display="";
    sv.style.display="none";
    dataEls.forEach(function(e){if(e)e.classList.add("active");});
    srcEls.forEach(function(e){if(e)e.classList.remove("active");});
    run();
  }
}

function renderSources() {
  var el=document.getElementById("sources-list"), by={};
  allRecords.forEach(function(r){ var s=r.source_report||"Unknown"; if(!by[s]) by[s]=[]; by[s].push(r); });

  var sorted=Object.entries(by).sort(function(a,b){
    var stA=primaryState(a[1]), stB=primaryState(b[1]);
    var natA=isNational(stA)?0:1, natB=isNational(stB)?0:1;
    if(natA!==natB) return natA-natB;
    var nameA=STATE_NAMES[stA]||PROVINCES[stA]||stA||"";
    var nameB=STATE_NAMES[stB]||PROVINCES[stB]||stB||"";
    if(nameA!==nameB) return nameA.localeCompare(nameB);
    return srcName(a[0]).localeCompare(srcName(b[0]));
  });

  document.getElementById("source-count").textContent=sorted.length;
  el.innerHTML=sorted.map(function(e){
    var name=srcName(e[0]), ct=e[1].length, url=sourceUrls[e[0]];
    var st=primaryState(e[1]);
    var nameHtml=url?'<a class="src-name" href="'+h(url)+'" target="_blank" rel="noopener">'+h(name)+'</a>':'<span class="src-name">'+h(name)+'</span>';
    return '<div class="src-row"><span class="src-st">'+h(st)+'</span>'+nameHtml+'<span class="src-ct">'+ct+'</span></div>';
  }).join("");
}

function primaryState(records) {
  var counts={};
  records.forEach(function(r){ if(r.state) counts[r.state]=(counts[r.state]||0)+1; });
  var best="", max=0;
  Object.entries(counts).forEach(function(e){ if(e[1]>max){max=e[1];best=e[0];} });
  return best;
}

function isNational(st) {
  return st==="US"||st==="Canada";
}

function clearFilters() {
  document.getElementById("search").value="";
  document.getElementById("year-start").value="";
  document.getElementById("year-end").value="";
  document.querySelectorAll('.filter-check input').forEach(function(c){c.checked=false;});
  filters={countries:[],states:[],categories:[],types:[]};
  page=1; run();
}

function showClear() {
  var q=document.getElementById("search").value.trim();
  var ys=document.getElementById("year-start").value;
  var ye=document.getElementById("year-end").value;
  var has=q||ys||ye||filters.countries.length||filters.states.length||filters.categories.length||filters.types.length;
  document.getElementById("clear-filters").classList.toggle("visible",!!has);
}

function readHash() {
  var hs=window.location.hash.slice(1); if(!hs) return;
  var p=new URLSearchParams(hs);
  if(p.has("q")) document.getElementById("search").value=p.get("q");
  if(p.has("p")) page=parseInt(p.get("p"))||1;
  if(p.has("ys")) document.getElementById("year-start").value=p.get("ys");
  if(p.has("ye")) document.getElementById("year-end").value=p.get("ye");
  ["country","state","category","type"].forEach(function(g){
    if(p.has(g)){
      var vals=p.get(g).split(","), key=g==="country"?"countries":g+"s";
      filters[key]=vals;
      vals.forEach(function(v){ var cb=document.querySelector('input[data-group="'+g+'"][value="'+v+'"]'); if(cb) cb.checked=true; });
    }
  });
}

function writeHash() {
  var p=new URLSearchParams(), q=document.getElementById("search").value.trim();
  if(q) p.set("q",q);
  if(page>1) p.set("p",page);
  if(filters.countries.length) p.set("country",filters.countries.join(","));
  if(filters.states.length) p.set("state",filters.states.join(","));
  if(filters.categories.length) p.set("category",filters.categories.join(","));
  if(filters.types.length) p.set("type",filters.types.join(","));
  var ys=document.getElementById("year-start").value, ye=document.getElementById("year-end").value;
  if(ys) p.set("ys",ys); if(ye) p.set("ye",ye);
  var s=p.toString();
  if(s) history.replaceState(null,"","#"+s);
  else history.replaceState(null,"",window.location.pathname);
}

function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("sidebar-overlay").classList.toggle("open");
}

function h(s){ var d=document.createElement("div"); d.textContent=s; return d.innerHTML; }
function ha(s){ return s.replace(/'/g,"\\'").replace(/"/g,"&quot;"); }
function debounce(fn,ms){ var t; return function(){ var a=arguments,c=this; clearTimeout(t); t=setTimeout(function(){fn.apply(c,a);},ms); }; }

document.addEventListener("DOMContentLoaded", init);
