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
var filters = { countries:[], states:[], categories:[], types:[], valuetypes:[] };

function classifyUnit(r) {
  var u = r.unit || "";
  var v = r.value;
  if (v === null || v === undefined) return null;
  if (u === "USD" || u === "USD_millions" || u === "million USD" || u === "billion USD" ||
      u === "dollars" || u === "million dollars" || u === "CAD" || u === "million_CAD" ||
      u.indexOf("USD_per_") === 0 || u.indexOf("CAD per") === 0 ||
      u === "USD_monthly" || u === "USD_monthly_per_consumer" ||
      u === "dollars_per_entity" || u === "dollars_per_grant" || u === "dollars_per_week" ||
      u === "dollars (range)" || u.indexOf("dollars") === 0) return "Dollar Values";
  if (u.indexOf("percent") !== -1 || u === "percentage_points") return "Percentages";
  if (!isNaN(Number(v)) && Number(v) !== 0) return "Counts & Other";
  return null;
}

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

  // check if hash points to a state view
  var initHash=new URLSearchParams(window.location.hash.slice(1));
  if(initHash.get("view")==="states"){
    switchView("states");
  } else if(initHash.get("view")==="state" && initHash.get("s")){
    switchView("state",initHash.get("s"));
  } else if(initHash.get("view")==="sources"){
    switchView("sources");
  } else {
    readHash();
    run();
  }

  document.getElementById("search").addEventListener("input", debounce(function(){ page=1; run(); }, 250));
  document.getElementById("year-start").addEventListener("change", function(){ page=1; run(); });
  document.getElementById("year-end").addEventListener("change", function(){ page=1; run(); });
  window.addEventListener("hashchange", function(){
    var hp=new URLSearchParams(window.location.hash.slice(1));
    if(hp.get("view")==="states") switchView("states");
    else if(hp.get("view")==="state"&&hp.get("s")) switchView("state",hp.get("s"));
    else if(hp.get("view")==="sources") switchView("sources");
    else { readHash(); run(); }
  });
}

function buildFilters() {
  var cc={}, sc={}, cat={}, tc={}, vc={};
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
    var vt=classifyUnit(r);
    if(vt) vc[vt]=(vc[vt]||0)+1;
  });

  renderChecks("filter-countries", cc, "country");

  var ss=Object.entries(sc).sort(function(a,b){return a[1].n.localeCompare(b[1].n);});
  var so={}; ss.forEach(function(e){so[e[0]]=e[1].c;});
  renderChecksNamed("filter-states", so, sc, "state");

  var cs=Object.entries(cat).sort(function(a,b){return b[1]-a[1];});
  var co={}; cs.forEach(function(e){co[e[0]]=e[1];});
  renderChecks("filter-categories", co, "category");

  var vs={"Dollar Values":vc["Dollar Values"]||0,"Percentages":vc["Percentages"]||0,"Counts & Other":vc["Counts & Other"]||0};
  renderChecks("filter-valuetypes", vs, "valuetype");

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
  filters.valuetypes=checked("valuetype");
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
    if(filters.valuetypes.length){
      var vt=classifyUnit(r);
      if(!vt || filters.valuetypes.indexOf(vt)===-1) return false;
    }
    return true;
  });

  try { render(); } catch(e) { console.error("render error:", e); }
  try { paginate(); } catch(e) { console.error("paginate error:", e); }
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
  var txt=tot===0?"No results":(s+1)+"\u2013"+e+" of "+tot.toLocaleString();
  ct.textContent=txt;
  var ctm=document.getElementById("result-count-m"); if(ctm) ctm.textContent=txt;
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
  if(!el) return;
  el.style.display="flex";
  var tot=filteredRecords.length, tp=Math.ceil(tot/PER_PAGE)||1;
  if(tp<=1){ el.innerHTML=""; el.style.display="none"; return; }

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

function switchView(v,stateCode) {
  var res=document.getElementById("results"), sv=document.getElementById("sources-view");
  var stv=document.getElementById("states-view");
  var th=document.getElementById("table-head"), pg=document.getElementById("pagination");

  var tabs={
    search:[document.getElementById("view-search"),document.getElementById("m-view-search")],
    sources:[document.getElementById("view-sources"),document.getElementById("m-view-sources")],
    states:[document.getElementById("view-states"),document.getElementById("m-view-states")]
  };

  // hide all
  res.style.display="none"; th.style.display="none"; pg.style.display="none";
  sv.style.display="none"; stv.style.display="none";
  Object.values(tabs).forEach(function(arr){arr.forEach(function(e){if(e)e.classList.remove("active");});});

  if(v==="sources"){
    sv.style.display="block";
    tabs.sources.forEach(function(e){if(e)e.classList.add("active");});
    renderSources();
  } else if(v==="states"){
    stv.style.display="block";
    tabs.states.forEach(function(e){if(e)e.classList.add("active");});
    renderStatesIndex();
  } else if(v==="state" && stateCode){
    stv.style.display="block";
    tabs.states.forEach(function(e){if(e)e.classList.add("active");});
    renderStatePage(stateCode);
  } else {
    res.style.display=""; th.style.display="";
    tabs.search.forEach(function(e){if(e)e.classList.add("active");});
    run();
  }
  document.getElementById("content").scrollTo({top:0});
}

function openState(code) {
  switchView("state",code);
  writeHash();
}

function renderStatesIndex() {
  var el=document.getElementById("states-content");
  var byState={};
  allRecords.forEach(function(r){
    if(!r.state) return;
    if(!byState[r.state]) byState[r.state]={code:r.state,name:STATE_NAMES[r.state]||PROVINCES[r.state]||r.state,country:r.country||"",count:0,cats:{}};
    byState[r.state].count++;
    var cat=CATEGORY_NORMALIZE[r.category]||r.category||"Other";
    byState[r.state].cats[cat]=(byState[r.state].cats[cat]||0)+1;
  });

  var sorted=Object.values(byState).sort(function(a,b){ return a.name.localeCompare(b.name); });

  el.innerHTML='<div class="states-grid">'+sorted.map(function(s){
    var topCats=Object.entries(s.cats).sort(function(a,b){return b[1]-a[1];}).slice(0,3);
    var tags=topCats.map(function(c){return '<span class="state-card-tag">'+h(c[0])+'</span>';}).join("");
    return '<div class="state-card" onclick="openState(\''+ha(s.code)+'\')">'
      +'<div class="state-card-name">'+h(s.name)+'</div>'
      +'<div class="state-card-ct">'+s.count+' facts</div>'
      +'<div class="state-card-tags">'+tags+'</div></div>';
  }).join("")+'</div>';

  // update hash
  history.replaceState(null,"","#view=states");
}

function renderStatePage(code) {
  var el=document.getElementById("states-content");
  var name=STATE_NAMES[code]||PROVINCES[code]||code;
  var records=allRecords.filter(function(r){return r.state===code;});
  var country=records.length?records[0].country||"":"";

  if(!records.length){
    el.innerHTML='<div class="state-msg">No data for '+h(name)+'.</div>';
    return;
  }

  // sources
  var srcSet={};
  records.forEach(function(r){ if(r.source_report){ if(!srcSet[r.source_report]) srcSet[r.source_report]=0; srcSet[r.source_report]++; }});
  var srcCount=Object.keys(srcSet).length;

  // dollar / pct counts
  var dollars=0, pcts=0;
  records.forEach(function(r){
    var vt=classifyUnit(r);
    if(vt==="Dollar Values") dollars++;
    if(vt==="Percentages") pcts++;
  });

  // summary
  var summary=genSummary(code,name,records,srcCount,dollars,pcts);

  // latest report
  var latestReport=getLatestReport(records,srcSet);

  // categories
  var byCat={};
  records.forEach(function(r){
    var cat=CATEGORY_NORMALIZE[r.category]||r.category||"Other";
    if(!byCat[cat]) byCat[cat]=[];
    byCat[cat].push(r);
  });
  var catSorted=Object.entries(byCat).sort(function(a,b){return b[1].length-a[1].length;});

  // build html
  var out='';
  out+='<button class="sp-back" onclick="switchView(\'states\')">&larr; All States</button>';
  out+='<div class="sp-hero"><div class="sp-name">'+h(name);
  if(country) out+='<span class="sp-country">'+h(country)+'</span>';
  out+='</div>';
  out+='<div class="sp-summary">'+summary+'</div>';
  out+='<div class="sp-stats">';
  out+='<span><strong>'+records.length+'</strong> facts</span>';
  out+='<span><strong>'+srcCount+'</strong> reports</span>';
  if(dollars) out+='<span><strong>'+dollars+'</strong> dollar values</span>';
  if(pcts) out+='<span><strong>'+pcts+'</strong> percentages</span>';
  out+='</div></div>';

  if(latestReport){
    out+='<div class="sp-report">';
    out+='<div class="sp-report-label">Featured Report</div>';
    var rUrl=sourceUrls[latestReport.key];
    if(rUrl) out+='<div class="sp-report-name"><a href="'+h(rUrl)+'" target="_blank" rel="noopener">'+h(latestReport.name)+'</a></div>';
    else out+='<div class="sp-report-name">'+h(latestReport.name)+'</div>';
    out+='<div class="sp-report-meta"><strong>'+latestReport.count+'</strong> facts extracted</div>';
    out+='</div>';
  }

  // category sections
  catSorted.forEach(function(entry,i){
    var cat=entry[0], recs=entry[1];
    var secId="sp_sec_"+i;
    var isOpen=i<2?" open":"";
    out+='<div class="sp-section'+isOpen+'" id="'+secId+'">';
    out+='<div class="sp-section-head" onclick="toggleSpSection(\''+secId+'\')">';
    out+='<span class="sp-section-title">'+h(cat)+'</span>';
    out+='<span><span class="sp-section-ct">'+recs.length+'</span><span class="sp-arrow"> &#8250;</span></span>';
    out+='</div>';
    out+='<div class="sp-section-body">';
    var show=Math.min(5,recs.length);
    for(var j=0;j<show;j++) out+=renderCompactRow(recs[j]);
    if(recs.length>5) out+='<button class="sp-showmore" onclick="expandSpSection(\''+secId+'\',\''+ha(code)+'\',\''+ha(cat)+'\')">Show all '+recs.length+' records</button>';
    out+='</div></div>';
  });

  // sources for this state
  var srcSorted=Object.entries(srcSet).sort(function(a,b){return b[1]-a[1];});
  out+='<div class="sp-sources"><div class="sp-sources-title">Sources for '+h(name)+'</div>';
  srcSorted.forEach(function(e){
    var sName=srcName(e[0]), ct=e[1], url=sourceUrls[e[0]];
    if(url) out+='<div class="src-row" style="grid-template-columns:1fr 70px;padding-left:0;padding-right:0;"><a class="src-name" href="'+h(url)+'" target="_blank" rel="noopener">'+h(sName)+'</a><span class="src-ct">'+ct+'</span></div>';
    else out+='<div class="src-row" style="grid-template-columns:1fr 70px;padding-left:0;padding-right:0;"><span class="src-name">'+h(sName)+'</span><span class="src-ct">'+ct+'</span></div>';
  });
  out+='</div>';

  el.innerHTML=out;
  history.replaceState(null,"","#view=state&s="+encodeURIComponent(code));
}

function renderCompactRow(r) {
  var val=fmtVal(r.value,r.unit,r.data_type);
  return '<div class="row" style="border-bottom:1px solid var(--border);">'
    +'<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;gap:12px;cursor:pointer;" onclick="openRecord(\''+ha(r.id||"")+'\')">'
    +'<span class="c-desc" style="white-space:normal;flex:1;font-size:12px;">'+hlVal(h(r.claim||""))+'</span>'
    +(val?'<span class="c-val" style="flex-shrink:0;font-size:12px;">'+val+'</span>':'')
    +'</div></div>';
}

function toggleSpSection(id) {
  var el=document.getElementById(id);
  if(el) el.classList.toggle("open");
}

function expandSpSection(secId,stateCode,cat) {
  var el=document.getElementById(secId);
  if(!el) return;
  var body=el.querySelector(".sp-section-body");
  var records=allRecords.filter(function(r){
    return r.state===stateCode && (CATEGORY_NORMALIZE[r.category]||r.category||"Other")===cat;
  });
  body.innerHTML=records.map(renderCompactRow).join("");
}

function genSummary(code,name,records,srcCount,dollars,pcts) {
  var catCounts={};
  records.forEach(function(r){
    var cat=CATEGORY_NORMALIZE[r.category]||r.category||"Other";
    catCounts[cat]=(catCounts[cat]||0)+1;
  });
  var topCats=Object.entries(catCounts).sort(function(a,b){return b[1]-a[1];}).slice(0,3).map(function(e){return e[0].toLowerCase();});

  var s=h(name)+" has <strong>"+records.length+"</strong> facts across <strong>"+srcCount+"</strong> government report"+(srcCount===1?"":"s")+".";
  if(topCats.length) s+=" Key areas include "+topCats.join(", ")+".";

  // find biggest dollar value
  var maxDollar=0, maxClaim="";
  records.forEach(function(r){
    var u=r.unit||"";
    if((u==="USD"||u==="USD_millions"||u==="million USD"||u==="billion USD"||u==="dollars")&&r.value){
      var n=Number(r.value);
      if(n>maxDollar){maxDollar=n;maxClaim=r.claim||"";}
    }
  });
  if(maxDollar>=1e6) s+=" Largest tracked figure: <strong>$"+abbr(maxDollar)+"</strong>.";

  return s;
}

function getLatestReport(records,srcSet) {
  // prefer reports with "annual" or "2025" or "2024" in name, then largest by count
  var candidates=Object.entries(srcSet).sort(function(a,b){return b[1]-a[1];});
  var annual=candidates.filter(function(e){
    var n=e[0].toLowerCase();
    return n.indexOf("annual")!==-1||n.indexOf("2025")!==-1||n.indexOf("2026")!==-1;
  });
  var pick=annual.length?annual[0]:candidates[0];
  if(!pick) return null;
  return {key:pick[0], name:srcName(pick[0]), count:pick[1]};
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
  filters={countries:[],states:[],categories:[],types:[],valuetypes:[]};
  page=1; run();
}

function showClear() {
  var q=document.getElementById("search").value.trim();
  var ys=document.getElementById("year-start").value;
  var ye=document.getElementById("year-end").value;
  var has=q||ys||ye||filters.countries.length||filters.states.length||filters.categories.length||filters.types.length||filters.valuetypes.length;
  document.getElementById("clear-filters").classList.toggle("visible",!!has);
}

function readHash() {
  var hs=window.location.hash.slice(1); if(!hs) return;
  var p=new URLSearchParams(hs);
  if(p.has("q")) document.getElementById("search").value=p.get("q");
  if(p.has("p")) page=parseInt(p.get("p"))||1;
  if(p.has("ys")) document.getElementById("year-start").value=p.get("ys");
  if(p.has("ye")) document.getElementById("year-end").value=p.get("ye");
  ["country","state","category","type","valuetype"].forEach(function(g){
    if(p.has(g)){
      var vals=p.get(g).split(","), key=g==="country"?"countries":(g==="valuetype"?"valuetypes":g+"s");
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
  if(filters.valuetypes.length) p.set("valuetype",filters.valuetypes.join(","));
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
function openRecord(id) {
  var r=allRecords.find(function(x){return x.id===id;});
  if(!r) return;
  var body=document.getElementById("modal-body");
  var actions=document.getElementById("modal-actions");
  var sn=STATE_NAMES[r.state]||PROVINCES[r.state]||r.state||"";
  var src=srcName(r.source_report);
  var val=fmtVal(r.value,r.unit,r.data_type);
  var pg=r.page?"p."+r.page:"";

  var out='<div class="modal-id">'+h(r.id||"")+'</div>';
  out+='<div class="modal-claim">'+hlVal(h(r.claim||""))+'</div>';
  if(val) out+='<div class="modal-val">'+val+'</div>';
  out+='<div class="modal-meta">';
  if(sn) out+='<b>'+h(sn)+'</b>';
  if(r.country==="Canada") out+=' (Canada)';
  if(r.date_range) out+=' &middot; '+h(r.date_range);
  out+='<br>Source: '+h(src);
  if(pg) out+=', '+pg;
  if(r.source_report) out+=' <a href="#" onclick="openSrc(event,\''+ha(r.source_report)+'\','+(r.page||0)+')">[View]</a>';
  if(r.notes) out+='<br>Notes: '+h(r.notes);
  out+='</div>';
  if(r.context) out+='<div class="modal-ctx">&ldquo;'+h(r.context)+'&rdquo;</div>';
  body.innerHTML=out;

  actions.innerHTML='<button class="act" onclick="cite(this,\''+ha(r.id||"")+'\')">Copy Citation</button>'
    +'<a class="act act--dim" href="'+ERROR_FORM+encodeURIComponent(r.id||"")+'" target="_blank" rel="noopener">Report Error</a>'
    +'<a class="act" href="'+ANALYSIS_URL+'" target="_blank" rel="noopener">Request Analysis</a>';

  document.getElementById("record-modal").classList.add("open");
  document.body.style.overflow="hidden";
}

function closeModal(e) {
  if(e && e.target && !e.target.classList.contains("modal-overlay")) return;
  document.getElementById("record-modal").classList.remove("open");
  document.body.style.overflow="";
}

function debounce(fn,ms){ var t; return function(){ var a=arguments,c=this; clearTimeout(t); t=setTimeout(function(){fn.apply(c,a);},ms); }; }

document.addEventListener("DOMContentLoaded", init);
