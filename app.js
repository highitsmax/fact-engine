/* Cannabis Fact Engine - app.js */

const ITEMS_PER_PAGE = 50;
const CATEGORY_LABELS = {
  market_size_revenue: "Market Size & Revenue",
  licensing: "Licensing",
  social_equity: "Social Equity",
  compliance_enforcement: "Compliance & Enforcement",
  pricing: "Pricing",
  demand_consumption: "Demand & Consumption",
  regulatory_structure: "Regulatory Structure",
  public_health_safety: "Public Health & Safety",
  supply_chain: "Supply Chain",
  employment_economics: "Employment & Economics",
};

const STATE_NAMES = {
  AK: "Alaska", AL: "Alabama", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DC: "District of Columbia", DE: "Delaware",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", US: "United States",
  UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia",
  WI: "Wisconsin", WY: "Wyoming",
};

// Error report form URL (replace FORM_ID with actual Google Form ID)
const ERROR_FORM_URL = "https://docs.google.com/forms/d/e/YOUR_FORM_ID/viewform?usp=pp_url&entry.FIELD_ID=";
// Lead capture URL
const ANALYSIS_URL = "https://cannabiswiseguys.com/contact/";

let allRecords = [];
let filteredRecords = [];
let sourceUrls = {};
let fuse = null;
let currentPage = 1;

/* === INIT === */
async function init() {
  document.getElementById("results").innerHTML = '<div class="loading">Loading database...</div>';

  try {
    const [dbResp, urlResp] = await Promise.all([
      fetch("data/cannabis_database.json"),
      fetch("data/source_urls.json"),
    ]);
    allRecords = await dbResp.json();
    sourceUrls = await urlResp.json();
  } catch (e) {
    document.getElementById("results").innerHTML =
      '<div class="empty-state"><h2>Failed to load database</h2><p>Please try refreshing the page.</p></div>';
    return;
  }

  // Init Fuse.js
  fuse = new Fuse(allRecords, {
    keys: [
      { name: "claim", weight: 3 },
      { name: "context", weight: 1 },
      { name: "notes", weight: 1 },
      { name: "subcategory", weight: 0.5 },
    ],
    threshold: 0.35,
    includeScore: true,
    minMatchCharLength: 2,
  });

  populateFilters();
  updateStats();
  readHashState();
  applyFilters();

  // Event listeners
  document.getElementById("search").addEventListener("input", debounce(applyFilters, 300));
  document.getElementById("filter-state").addEventListener("change", applyFilters);
  document.getElementById("filter-category").addEventListener("change", applyFilters);
  document.getElementById("filter-type").addEventListener("change", applyFilters);
  document.getElementById("year-start").addEventListener("change", applyFilters);
  document.getElementById("year-end").addEventListener("change", applyFilters);

  window.addEventListener("hashchange", () => { readHashState(); applyFilters(); });
}

/* === FILTERS === */
function populateFilters() {
  const states = [...new Set(allRecords.map(r => r.state).filter(Boolean))].sort();
  const categories = [...new Set(allRecords.map(r => r.category).filter(Boolean))].sort();

  const stateSelect = document.getElementById("filter-state");
  states.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = STATE_NAMES[s] || s;
    stateSelect.appendChild(opt);
  });

  const catSelect = document.getElementById("filter-category");
  categories.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = CATEGORY_LABELS[c] || c;
    catSelect.appendChild(opt);
  });
}

function applyFilters() {
  const query = document.getElementById("search").value.trim();
  const stateFilter = document.getElementById("filter-state").value;
  const catFilter = document.getElementById("filter-category").value;
  const typeFilter = document.getElementById("filter-type").value;
  const yearStart = parseInt(document.getElementById("year-start").value) || 0;
  const yearEnd = parseInt(document.getElementById("year-end").value) || 9999;

  // Search or use all
  let results;
  if (query.length >= 2) {
    results = fuse.search(query).map(r => r.item);
  } else {
    results = [...allRecords];
  }

  // Apply filters
  filteredRecords = results.filter(r => {
    if (stateFilter && r.state !== stateFilter) return false;
    if (catFilter && r.category !== catFilter) return false;
    if (typeFilter && r.data_type !== typeFilter) return false;
    if (r.year_end && r.year_end < yearStart) return false;
    if (r.year_start && r.year_start > yearEnd) return false;
    return true;
  });

  currentPage = 1;
  renderResults();
  updateHashState();
}

/* === RENDER === */
function renderResults() {
  const container = document.getElementById("results");
  const count = document.getElementById("result-count");
  const showing = Math.min(currentPage * ITEMS_PER_PAGE, filteredRecords.length);

  count.textContent = `Showing ${showing} of ${filteredRecords.length} results`;

  if (filteredRecords.length === 0) {
    container.innerHTML = '<div class="empty-state"><h2>No results found</h2><p>Try adjusting your search or filters.</p></div>';
    document.getElementById("load-more-wrap").style.display = "none";
    return;
  }

  const slice = filteredRecords.slice(0, currentPage * ITEMS_PER_PAGE);
  container.innerHTML = slice.map(renderCard).join("");
  document.getElementById("load-more-wrap").style.display =
    showing < filteredRecords.length ? "block" : "none";
}

function renderCard(r) {
  const catLabel = CATEGORY_LABELS[r.category] || r.category || "";
  const catClass = r.category ? `cat-${r.category}` : "";
  const stateName = STATE_NAMES[r.state] || r.state || "";
  const valueDisplay = formatValue(r.value, r.unit, r.data_type);
  const sourceDisplay = cleanSourceName(r.source_report);
  const pageDisplay = r.page ? `Page ${r.page}` : "";
  const contextId = `ctx-${(r.id || "").replace(/[^a-zA-Z0-9]/g, "_")}`;

  // Table fallback for Phase 1
  let tableNotice = "";
  if (r.data_type === "table") {
    tableNotice = `<div class="card-table-notice">Data contained in complex table. View the source document for full details.</div>`;
  }

  return `<div class="card">
  <div class="card-header">
    <span class="card-id">${esc(r.id || "")}</span>
    <span class="card-category ${catClass}">${esc(catLabel)}</span>
  </div>
  <div class="card-claim">${esc(r.claim || "")}</div>
  ${valueDisplay ? `<div class="card-value">${valueDisplay}</div>` : ""}
  ${tableNotice}
  <div class="card-meta">
    <span class="state-name">${esc(stateName)}</span>
    ${r.date_range ? ` &middot; ${esc(r.date_range)}` : ""}
  </div>
  <div class="card-source">
    Source: ${esc(sourceDisplay)}${pageDisplay ? `, <span class="page-num">${pageDisplay}</span>` : ""}
    ${r.source_report ? ` <a href="#" onclick="viewSource(event, '${esc(r.source_report)}', ${r.page || 0})">[View Source]</a>` : ""}
  </div>
  ${r.context ? `
  <div class="card-context-toggle" onclick="toggleContext('${contextId}', this)">
    <span class="arrow">&#9654;</span> View original context
  </div>
  <div class="card-context" id="${contextId}">"${esc(r.context)}"</div>
  ` : ""}
  <div class="card-actions">
    <button class="btn btn-cite" onclick="copyCitation(this, '${esc(r.id || "")}')">&#128203; Copy Citation</button>
    <a class="btn btn-error" href="${ERROR_FORM_URL}${encodeURIComponent(r.id || "")}" target="_blank" rel="noopener">&#9888; Report Error</a>
    <a class="btn btn-analysis" href="${ANALYSIS_URL}" target="_blank" rel="noopener">&#128200; Request Analysis</a>
  </div>
</div>`;
}

/* === VALUE FORMATTING === */
function formatValue(value, unit, dataType) {
  if (value === null || value === undefined) return "";
  if (dataType === "finding") return "";

  const num = Number(value);
  if (isNaN(num)) return `${value} ${unit || ""}`.trim();

  if (unit === "USD" || unit === "USD_millions") {
    return "$" + formatNumber(num);
  }
  if (unit === "percent" || unit === "percent_monthly") {
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 }) + "%";
  }
  if (unit === "count") {
    return formatNumber(num);
  }
  if (unit && unit.startsWith("USD_per_")) {
    const per = unit.replace("USD_per_", "/");
    return "$" + num.toLocaleString(undefined, { maximumFractionDigits: 2 }) + per;
  }

  const formatted = formatNumber(num);
  return unit ? `${formatted} ${unit}` : formatted;
}

function formatNumber(n) {
  if (Math.abs(n) >= 1_000_000_000) return "$" !== "$" ? (n / 1e9).toFixed(1) + "B" : (n / 1e9).toFixed(1) + "B";
  if (Math.abs(n) >= 1_000_000) return (n / 1e6).toFixed(1) + "M";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/* === ACTIONS === */
function copyCitation(btn, recordId) {
  const r = allRecords.find(rec => rec.id === recordId);
  if (!r) return;

  const source = cleanSourceName(r.source_report);
  const page = r.page ? `, p.${r.page}` : "";
  const citation = `"${r.claim}"\n(${source}${page})\nvia Cannabis Wise Guys Fact Engine — cannabiswiseguys.com/data`;

  navigator.clipboard.writeText(citation).then(() => {
    btn.classList.add("btn-copied");
    btn.innerHTML = "&#10003; Copied!";
    setTimeout(() => {
      btn.classList.remove("btn-copied");
      btn.innerHTML = "&#128203; Copy Citation";
    }, 2000);
  });
}

function toggleContext(id, toggle) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.toggle("open");
    toggle.classList.toggle("open");
  }
}

function viewSource(event, sourceReport, page) {
  event.preventDefault();
  const url = sourceUrls[sourceReport] || null;
  if (url) {
    const pageStr = page ? `#page=${page}` : "";
    window.open(url + pageStr, "_blank", "noopener");
  } else {
    alert(`Source: ${sourceReport}\nPage: ${page || "N/A"}\n\nDirect link not yet available for this report.`);
  }
}

function loadMore() {
  currentPage++;
  renderResults();
}

/* === URL HASH STATE === */
function readHashState() {
  const hash = window.location.hash.slice(1);
  if (!hash) return;

  const params = new URLSearchParams(hash);
  if (params.has("q")) document.getElementById("search").value = params.get("q");
  if (params.has("state")) document.getElementById("filter-state").value = params.get("state");
  if (params.has("category")) document.getElementById("filter-category").value = params.get("category");
  if (params.has("type")) document.getElementById("filter-type").value = params.get("type");
  if (params.has("ys")) document.getElementById("year-start").value = params.get("ys");
  if (params.has("ye")) document.getElementById("year-end").value = params.get("ye");
}

function updateHashState() {
  const q = document.getElementById("search").value.trim();
  const state = document.getElementById("filter-state").value;
  const cat = document.getElementById("filter-category").value;
  const type = document.getElementById("filter-type").value;
  const ys = document.getElementById("year-start").value;
  const ye = document.getElementById("year-end").value;

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (state) params.set("state", state);
  if (cat) params.set("category", cat);
  if (type) params.set("type", type);
  if (ys) params.set("ys", ys);
  if (ye) params.set("ye", ye);

  const hash = params.toString();
  if (hash) {
    history.replaceState(null, "", "#" + hash);
  } else {
    history.replaceState(null, "", window.location.pathname);
  }
}

/* === STATS === */
function updateStats() {
  const states = new Set(allRecords.map(r => r.state).filter(Boolean));
  const sources = new Set(allRecords.map(r => r.source_report).filter(Boolean));
  document.getElementById("stat-facts").textContent = allRecords.length.toLocaleString();
  document.getElementById("stat-reports").textContent = sources.size;
  document.getElementById("stat-states").textContent = states.size;
}

/* === UTILS === */
function esc(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function cleanSourceName(path) {
  if (!path) return "Unknown source";
  return path.replace(/^.*\//, "").replace(/\.pdf$/i, "");
}

function debounce(fn, ms) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

/* === VIEW SWITCHING === */
function switchView(view) {
  const searchView = document.getElementById("search-view");
  const sourcesView = document.getElementById("sources-view");
  const resultsEl = document.getElementById("results");
  const loadMoreEl = document.getElementById("load-more-wrap");
  const btnSearch = document.getElementById("view-search");
  const btnSources = document.getElementById("view-sources");

  if (view === "sources") {
    searchView.style.display = "none";
    resultsEl.style.display = "none";
    loadMoreEl.style.display = "none";
    sourcesView.style.display = "block";
    btnSearch.classList.remove("active");
    btnSources.classList.add("active");
    renderSources();
  } else {
    searchView.style.display = "block";
    resultsEl.style.display = "block";
    sourcesView.style.display = "none";
    btnSearch.classList.add("active");
    btnSources.classList.remove("active");
    applyFilters();
  }
}

function renderSources() {
  const container = document.getElementById("sources-list");

  // Group records by source_report
  const bySource = {};
  allRecords.forEach(r => {
    const src = r.source_report || "Unknown";
    if (!bySource[src]) bySource[src] = [];
    bySource[src].push(r);
  });

  // Sort by record count descending
  const sorted = Object.entries(bySource).sort((a, b) => b[1].length - a[1].length);

  document.getElementById("source-count").textContent = sorted.length;

  container.innerHTML = sorted.map(([source, records]) => {
    const name = cleanSourceName(source);
    const count = records.length;
    const states = [...new Set(records.map(r => r.state).filter(Boolean))];
    const stateNames = states.map(s => STATE_NAMES[s] || s).join(", ");
    const categories = [...new Set(records.map(r => r.category).filter(Boolean))];
    const catChips = categories.map(c =>
      `<span class="source-cat-chip">${esc(CATEGORY_LABELS[c] || c)}</span>`
    ).join("");
    const url = sourceUrls[source];
    const linkHtml = url
      ? `<a class="source-link" href="${esc(url)}" target="_blank" rel="noopener">View Original Report &rarr;</a>`
      : "";

    return `<div class="source-card">
      <div class="source-card-header">
        <span class="source-name">${esc(name)}</span>
        <span class="source-count-badge">${count} facts</span>
      </div>
      <div class="source-meta">
        <span class="source-states">${esc(stateNames)}</span>
        ${linkHtml}
      </div>
      ${catChips ? `<div class="source-categories">${catChips}</div>` : ""}
    </div>`;
  }).join("");
}

/* === BOOT === */
document.addEventListener("DOMContentLoaded", init);
