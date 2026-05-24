const API_BASE = "/api";
const REQUEST_SPACING_MS = 540;
const DEFAULT_START = new Date("2022-01-01T00:00:00Z").getTime();

const state = {
  realm: null,
  resources: [],
  selectedResourceId: null,
  suggestionIndex: -1,
  results: [],
  watchlists: {
    buy: [],
    sell: [],
  },
  stats: {
    selected: 0,
    analyzed: 0,
    skipped: 0,
    failed: 0,
  },
  activeTab: "buy",
  oldestDate: null,
};

const els = {
  apiStatus: document.querySelector("#apiStatus"),
  statusText: document.querySelector("#statusText"),
  scanProgress: document.querySelector("#scanProgress"),
  realmSelect: document.querySelector("#realmSelect"),
  qualitySelect: document.querySelector("#qualitySelect"),
  edgePct: document.querySelector("#edgePct"),
  yearPct: document.querySelector("#yearPct"),
  resourceSearch: document.querySelector("#resourceSearch"),
  suggestions: document.querySelector("#suggestions"),
  addModeSelect: document.querySelector("#addModeSelect"),
  sortSelect: document.querySelector("#sortSelect"),
  scanButton: document.querySelector("#scanButton"),
  exportButton: document.querySelector("#exportButton"),
  importButton: document.querySelector("#importButton"),
  importInput: document.querySelector("#importInput"),
  buyWatchlist: document.querySelector("#buyWatchlist"),
  sellWatchlist: document.querySelector("#sellWatchlist"),
  buyListCount: document.querySelector("#buyListCount"),
  sellListCount: document.querySelector("#sellListCount"),
  buyGrid: document.querySelector("#buyGrid"),
  sellGrid: document.querySelector("#sellGrid"),
  buyCount: document.querySelector("#buyCount"),
  sellCount: document.querySelector("#sellCount"),
  scannedCount: document.querySelector("#scannedCount"),
  dataDepth: document.querySelector("#dataDepth"),
  template: document.querySelector("#signalCardTemplate"),
};

function setStatus(text, mode = "idle") {
  els.statusText.textContent = text;
  els.apiStatus.className = `status-dot ${mode}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiGet(path) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`API ${response.status}: ${path}`);
  }

  return response.json();
}

async function rateLimitedGet(path) {
  await sleep(REQUEST_SPACING_MS);
  return apiGet(path);
}

function storageKey(realm) {
  return `simco-market-watchlists:${realm}`;
}

function loadStoredWatchlists(realm) {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey(realm)) || "{}");
    state.watchlists = {
      buy: Array.isArray(stored.buy) ? stored.buy.map(Number).filter(Number.isFinite) : [],
      sell: Array.isArray(stored.sell) ? stored.sell.map(Number).filter(Number.isFinite) : [],
    };
  } catch {
    state.watchlists = { buy: [], sell: [] };
  }
}

function saveWatchlists() {
  localStorage.setItem(storageKey(els.realmSelect.value), JSON.stringify(state.watchlists));
}

async function loadResources(realm) {
  const cacheKey = `simco-resources-cache-${realm}`;
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey));
    if (cached && cached.timestamp && Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
      return cached.resources;
    }
  } catch (e) {}

  const first = await apiGet(`/v1/realms/${realm}/resources?page_size=50&page=1`);
  const pages = first.metadata?.lastPage || 1;
  const resources = [...(first.resources || [])];

  for (let page = 2; page <= pages; page += 1) {
    await sleep(REQUEST_SPACING_MS);
    const data = await apiGet(`/v1/realms/${realm}/resources?page_size=50&page=${page}`);
    resources.push(...(data.resources || []));
  }

  const finalResources = resources
    .filter((resource) => Number.isFinite(Number(resource.id)) && resource.name)
    .map((resource) => ({ ...resource, id: Number(resource.id) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  localStorage.setItem(cacheKey, JSON.stringify({
    timestamp: Date.now(),
    resources: finalResources
  }));

  return finalResources;
}

async function ensureResourcesLoaded(force = false) {
  const realm = els.realmSelect.value;
  if (!force && state.resources.length && state.realm === realm) return;

  setStatus("Loading resource catalog", "loading");
  state.resources = await loadResources(realm);
  state.realm = realm;
  loadStoredWatchlists(realm);
  renderWatchlists();
  renderSuggestions();
  setStatus(`Loaded ${state.resources.length} resources`, "ok");
}

function resourceById(id) {
  return state.resources.find((resource) => resource.id === Number(id));
}

function findResourceFromInput() {
  const text = els.resourceSearch.value.trim().toLowerCase();
  if (state.selectedResourceId) {
    const selected = resourceById(state.selectedResourceId);
    if (selected && selected.name.toLowerCase() === text) return selected;
  }

  return state.resources.find((resource) => resource.name.toLowerCase() === text) || null;
}

function getSuggestions() {
  const query = els.resourceSearch.value.trim().toLowerCase();
  if (!query) return [];

  return state.resources
    .filter((resource) => resource.name.toLowerCase().includes(query))
    .slice(0, 12);
}

function renderSuggestions() {
  const suggestions = getSuggestions();
  els.suggestions.innerHTML = "";

  if (!suggestions.length) {
    els.suggestions.classList.remove("open");
    state.suggestionIndex = -1;
    return;
  }

  suggestions.forEach((resource, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion";
    if (index === state.suggestionIndex) button.classList.add("active");
    button.innerHTML = `${resource.name}<br><small>Resource ${resource.id}</small>`;
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      selectResource(resource);
    });
    els.suggestions.append(button);
  });

  els.suggestions.classList.add("open");
}

function selectResource(resource) {
  state.selectedResourceId = resource.id;
  els.resourceSearch.value = resource.name;
  els.suggestions.classList.remove("open");
}

function addSelectedResource(mode) {
  const resource = findResourceFromInput();
  if (!resource) {
    setStatus("Choose a resource from autocomplete first", "error");
    renderSuggestions();
    return;
  }

  if (!state.watchlists[mode].includes(resource.id)) {
    state.watchlists[mode].push(resource.id);
    state.watchlists[mode].sort((a, b) => resourceById(a).name.localeCompare(resourceById(b).name));
    saveWatchlists();
    renderWatchlists();
  }

  els.resourceSearch.value = "";
  state.selectedResourceId = null;
  els.suggestions.classList.remove("open");
  setStatus(`${resource.name} added to ${mode === "buy" ? "buy" : "sell"} list`, "ok");
}

function removeWatchResource(mode, resourceId) {
  state.watchlists[mode] = state.watchlists[mode].filter((id) => id !== Number(resourceId));
  saveWatchlists();
  state.results = state.results.filter((signal) => !(signal.mode === mode && signal.resourceId === Number(resourceId)));
  renderWatchlists();
  renderResults();
}

function renderWatchlists() {
  renderWatchlist("buy", els.buyWatchlist);
  renderWatchlist("sell", els.sellWatchlist);
  els.buyListCount.textContent = `${state.watchlists.buy.length} saved`;
  els.sellListCount.textContent = `${state.watchlists.sell.length} saved`;
}

function renderWatchlist(mode, container) {
  container.innerHTML = "";
  const ids = state.watchlists[mode];

  if (!ids.length) {
    const empty = document.createElement("span");
    empty.className = "chip-empty";
    empty.textContent = mode === "buy" ? "No buy resources saved" : "No sell resources saved";
    container.append(empty);
    return;
  }

  ids.forEach((id) => {
    const resource = resourceById(id);
    if (!resource) return;

    const chip = document.createElement("span");
    chip.className = "chip";
    chip.innerHTML = `${resource.name} <button type="button" aria-label="Remove ${resource.name}">x</button>`;
    chip.querySelector("button").addEventListener("click", () => removeWatchResource(mode, id));
    container.append(chip);
  });
}

async function loadCandles(realm, resourceId, quality) {
  const now = Date.now();
  const path = `/v1/realms/${realm}/market/resources/${resourceId}/${quality}/candlesticks?granularity=1d&start=${DEFAULT_START}&end=${now}`;
  const data = await rateLimitedGet(path);
  return (data.candlesticks || []).filter((candle) => Number.isFinite(candle.close));
}

function nearestCandle(candles, targetMs) {
  if (!candles.length) return null;
  return candles.reduce((best, candle) => {
    const distance = Math.abs(new Date(candle.date).getTime() - targetMs);
    return distance < best.distance ? { candle, distance } : best;
  }, { candle: null, distance: Infinity }).candle;
}

function pctDiff(current, reference) {
  if (!reference) return null;
  return ((current - reference) / reference) * 100;
}

function closenessScore(distancePct, thresholdPct) {
  if (distancePct == null) return 0;
  const distance = Math.abs(distancePct);
  return Math.max(0, 1 - distance / thresholdPct);
}

function analyzeResource(resource, candles, quality, thresholds, mode) {
  if (candles.length < 14) return null;

  const current = candles[candles.length - 1].close;
  const lows = candles.map((candle) => candle.low);
  const highs = candles.map((candle) => candle.high);
  const allLow = Math.min(...lows);
  const allHigh = Math.max(...highs);
  const range = Math.max(allHigh - allLow, 0.000001);
  const position = (current - allLow) / range;
  const now = new Date(candles[candles.length - 1].date).getTime();
  const oneYear = nearestCandle(candles, now - 365 * 24 * 60 * 60 * 1000);
  const twoYears = nearestCandle(candles, now - 730 * 24 * 60 * 60 * 1000);
  const oneYearDiff = oneYear ? pctDiff(current, oneYear.close) : null;
  const twoYearDiff = twoYears ? pctDiff(current, twoYears.close) : null;
  const nearLowPct = ((current - allLow) / current) * 100;
  const nearHighPct = ((allHigh - current) / current) * 100;
  const yearAnchorScore = Math.max(
    closenessScore(oneYearDiff, thresholds.yearPct),
    closenessScore(twoYearDiff, thresholds.yearPct),
  );
  const buyLowScore = Math.max(0, 1 - nearLowPct / thresholds.edgePct);
  const sellHighScore = Math.max(0, 1 - nearHighPct / thresholds.edgePct);
  const buyScore = Math.round((buyLowScore * 70 + yearAnchorScore * 30) * 100) / 100;
  const sellScore = Math.round((sellHighScore * 70 + Math.max(0, pctDiff(current, oneYear?.close || current) / thresholds.edgePct) * 15) * 100) / 100;

  return {
    mode,
    resourceId: resource.id,
    name: resource.name,
    quality,
    current,
    allLow,
    allHigh,
    position,
    oneYearClose: oneYear?.close ?? null,
    twoYearClose: twoYears?.close ?? null,
    oneYearDiff,
    twoYearDiff,
    nearLowPct,
    nearHighPct,
    buyScore: Math.min(100, Math.round(buyScore)),
    sellScore: Math.min(100, Math.round(sellScore)),
    dataPoints: candles.length,
    oldestDate: candles[0].date,
    newestDate: candles[candles.length - 1].date,
    candles,
  };
}

function money(value) {
  if (!Number.isFinite(value)) return "-";
  return value.toLocaleString(undefined, { maximumFractionDigits: value < 10 ? 3 : 2 });
}

function percent(value) {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function shortDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function sparkline(candles, mode) {
  const values = candles.slice(-90).map((candle) => candle.close);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 0.000001);
  const points = values.map((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * 300;
    const y = 72 - ((value - min) / span) * 62;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const color = mode === "buy" ? "var(--buy)" : "var(--sell)";
  return `<svg viewBox="0 0 300 84" role="img" aria-label="90 day price sparkline">
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>
  </svg>`;
}

function metric(label, value) {
  return `<div class="metric-line"><dt>${label}</dt><dd>${value}</dd></div>`;
}

function renderCard(signal, mode) {
  const card = els.template.content.firstElementChild.cloneNode(true);
  const score = mode === "buy" ? signal.buyScore : signal.sellScore;
  const action = mode === "buy" ? "Buy watch" : "Sell watch";

  card.querySelector("h3").textContent = signal.name;
  card.querySelector(".meta").textContent = `Resource ${signal.resourceId} · Q${signal.quality} · ${signal.dataPoints} daily candles`;
  card.querySelector(".score").textContent = score;
  card.querySelector(".price").textContent = money(signal.current);
  card.querySelector(".action-pill").textContent = action;
  card.querySelector(".action-pill").classList.add(mode);
  card.querySelector(".sparkline").innerHTML = sparkline(signal.candles, mode);
  card.querySelector(".range-meter span:first-child").textContent = money(signal.allLow);
  card.querySelector(".range-meter span:last-child").textContent = money(signal.allHigh);
  card.querySelector(".range-meter i").style.left = `calc(${Math.min(Math.max(signal.position * 100, 0), 100)}% - 2px)`;

  const metrics = mode === "buy"
    ? [
        metric("Distance from all-time low", `${signal.nearLowPct.toFixed(1)}%`),
        metric("1 year anchor", `${money(signal.oneYearClose)} (${percent(signal.oneYearDiff)})`),
        metric("2 year anchor", `${money(signal.twoYearClose)} (${percent(signal.twoYearDiff)})`),
        metric("Latest candle", shortDate(signal.newestDate)),
      ]
    : [
        metric("Distance from all-time high", `${signal.nearHighPct.toFixed(1)}%`),
        metric("1 year anchor", `${money(signal.oneYearClose)} (${percent(signal.oneYearDiff)})`),
        metric("2 year anchor", `${money(signal.twoYearClose)} (${percent(signal.twoYearDiff)})`),
        metric("Latest candle", shortDate(signal.newestDate)),
      ];

  card.querySelector(".metrics").innerHTML = metrics.join("");
  return card;
}

function renderResults() {
  const sortBy = els.sortSelect.value;
  
  const sortFn = (a, b) => {
    if (sortBy === "allTime") {
      const aDist = a.mode === "buy" ? a.nearLowPct : a.nearHighPct;
      const bDist = b.mode === "buy" ? b.nearLowPct : b.nearHighPct;
      return aDist - bDist; // lower distance is better
    }
    if (sortBy === "1year") {
      const aDist = Math.abs(a.oneYearDiff != null ? a.oneYearDiff : Infinity);
      const bDist = Math.abs(b.oneYearDiff != null ? b.oneYearDiff : Infinity);
      return aDist - bDist; // lower distance is better
    }
    return a.mode === "buy" ? b.buyScore - a.buyScore : b.sellScore - a.sellScore;
  };

  const buySignals = state.results
    .filter((signal) => signal.mode === "buy")
    .sort(sortFn);
  const sellSignals = state.results
    .filter((signal) => signal.mode === "sell")
    .sort(sortFn);

  els.buyGrid.innerHTML = "";
  els.sellGrid.innerHTML = "";

  if (!state.watchlists.buy.length) {
    els.buyGrid.innerHTML = '<div class="empty-state">Add resources to the buy list to track them here.</div>';
  } else if (!buySignals.length) {
    els.buyGrid.innerHTML = '<div class="empty-state">No buy data loaded yet. Refresh the saved lists.</div>';
  } else {
    buySignals.forEach((signal) => els.buyGrid.append(renderCard(signal, "buy")));
  }

  if (!state.watchlists.sell.length) {
    els.sellGrid.innerHTML = '<div class="empty-state">Add resources to the sell list to track them here.</div>';
  } else if (!sellSignals.length) {
    els.sellGrid.innerHTML = '<div class="empty-state">No sell data loaded yet. Refresh the saved lists.</div>';
  } else {
    sellSignals.forEach((signal) => els.sellGrid.append(renderCard(signal, "sell")));
  }

  els.buyCount.textContent = buySignals.length;
  els.sellCount.textContent = sellSignals.length;
  els.scannedCount.textContent = `${state.stats.analyzed}/${state.stats.selected}`;
  els.dataDepth.textContent = state.oldestDate ? shortDate(state.oldestDate) : "-";
}

async function scanMarket() {
  const realm = els.realmSelect.value;
  const quality = Number(els.qualitySelect.value);
  const thresholds = {
    edgePct: Number(els.edgePct.value) || 7,
    yearPct: Number(els.yearPct.value) || 5,
  };

  els.scanButton.disabled = true;
  els.scanProgress.style.display = "block";
  els.scanProgress.value = 0;
  state.results = [];
  state.stats = {
    selected: state.watchlists.buy.length + state.watchlists.sell.length,
    analyzed: 0,
    skipped: 0,
    failed: 0,
  };
  state.oldestDate = null;
  renderResults();

  try {
    await ensureResourcesLoaded();

    const scanItems = [
      ...state.watchlists.buy.map((id) => ({ mode: "buy", id })),
      ...state.watchlists.sell.map((id) => ({ mode: "sell", id })),
    ];
    state.stats.selected = scanItems.length;
    els.scanProgress.max = scanItems.length;
    renderResults();

    if (!scanItems.length) {
      setStatus("Add at least one resource to buy or sell list", "error");
      return;
    }

    for (let index = 0; index < scanItems.length; index += 1) {
      els.scanProgress.value = index + 1;
      const item = scanItems[index];
      const resource = resourceById(item.id);
      if (!resource) {
        state.stats.skipped += 1;
        continue;
      }

      setStatus(`Refreshing ${index + 1}/${scanItems.length}: ${resource.name} (${item.mode})`, "loading");

      try {
        const candles = await loadCandles(realm, resource.id, quality);
        const signal = analyzeResource(resource, candles, quality, thresholds, item.mode);
        if (signal) {
          state.results.push(signal);
          state.stats.analyzed += 1;
          if (!state.oldestDate || new Date(signal.oldestDate) < new Date(state.oldestDate)) {
            state.oldestDate = signal.oldestDate;
          }
        } else {
          state.stats.skipped += 1;
        }
      } catch (error) {
        state.stats.failed += 1;
        console.warn(error);
      }

      renderResults();
    }

    setStatus(`Refresh complete: ${state.stats.analyzed} analyzed, ${state.stats.skipped} skipped, ${state.stats.failed} failed`, "ok");
  } catch (error) {
    console.error(error);
    setStatus(error.message, "error");
  } finally {
    els.scanButton.disabled = false;
    els.scanProgress.style.display = "none";
  }
}

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    state.activeTab = button.dataset.tab;
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab === button));
    document.querySelector("#buyPanel").classList.toggle("active", state.activeTab === "buy");
    document.querySelector("#sellPanel").classList.toggle("active", state.activeTab === "sell");
  });
});

els.scanButton.addEventListener("click", scanMarket);
els.sortSelect.addEventListener("change", renderResults);

els.exportButton.addEventListener("click", () => {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.watchlists, null, 2));
  const downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.setAttribute("href", dataStr);
  downloadAnchorNode.setAttribute("download", `simco-watchlists-${els.realmSelect.value}.json`);
  document.body.appendChild(downloadAnchorNode);
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
});

els.importButton.addEventListener("click", () => els.importInput.click());

els.importInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (Array.isArray(imported.buy) && Array.isArray(imported.sell)) {
        state.watchlists.buy = [...new Set([...state.watchlists.buy, ...imported.buy])].map(Number).filter(Number.isFinite);
        state.watchlists.sell = [...new Set([...state.watchlists.sell, ...imported.sell])].map(Number).filter(Number.isFinite);
        saveWatchlists();
        renderWatchlists();
        setStatus("Watchlists imported successfully", "ok");
      } else {
        setStatus("Invalid watchlist format", "error");
      }
    } catch (err) {
      setStatus("Error reading file", "error");
    }
    els.importInput.value = "";
  };
  reader.readAsText(file);
});

els.realmSelect.addEventListener("change", async () => {
  state.results = [];
  state.selectedResourceId = null;
  els.resourceSearch.value = "";
  await ensureResourcesLoaded(true);
  renderResults();
  if (state.watchlists.buy.length || state.watchlists.sell.length) {
    scanMarket();
  }
});
els.resourceSearch.addEventListener("input", () => {
  state.selectedResourceId = null;
  state.suggestionIndex = -1;
  renderSuggestions();
});
els.resourceSearch.addEventListener("focus", renderSuggestions);
els.resourceSearch.addEventListener("blur", () => {
  setTimeout(() => els.suggestions.classList.remove("open"), 120);
});
els.resourceSearch.addEventListener("keydown", (event) => {
  const suggestions = getSuggestions();
  if (event.key === "ArrowDown") {
    event.preventDefault();
    if (state.suggestionIndex < suggestions.length - 1) {
      state.suggestionIndex++;
      renderSuggestions();
    }
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    if (state.suggestionIndex > 0) {
      state.suggestionIndex--;
      renderSuggestions();
    }
  } else if (event.key === "Enter") {
    event.preventDefault();
    const idx = state.suggestionIndex >= 0 ? state.suggestionIndex : 0;
    const selected = suggestions[idx];
    if (selected) {
      selectResource(selected);
      addSelectedResource(els.addModeSelect.value);
    }
  }
});

renderWatchlists();
renderResults();
ensureResourcesLoaded()
  .then(() => {
    if (state.watchlists.buy.length || state.watchlists.sell.length) {
      scanMarket();
    }
  })
  .catch((error) => {
    console.error(error);
    setStatus(error.message, "error");
  });
