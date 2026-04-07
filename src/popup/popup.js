/* ================== Popup Search UI ================== */

let userEngines = [];
let deletedBuiltin = [];
let engineOrder = [];
let selectedEngineId = null;
let currentPage = 1;
const itemsPerPage = 9;

// i18n
function t(key, substitutions) {
  if (chrome?.i18n?.getMessage) {
    return chrome.i18n.getMessage(key, substitutions) || key;
  }
  return key;
}

document.addEventListener("DOMContentLoaded", () => {
  applyI18n();
  setupEventListeners();
  setupStorageListeners();
  loadEngines();
});

function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (key) el.textContent = t(key);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (key && "placeholder" in el) {
      el.placeholder = t(key);
    }
  });
}

/* ================== 数据加载 ================== */
function loadEngines() {
  chrome.storage.sync.get(["userEngines", "builtinEngineOrder", "engineOrder", "deletedBuiltin"], (result) => {
    if (chrome.runtime.lastError) {
      console.error("加载数据失败:", chrome.runtime.lastError);
      return;
    }
    userEngines = result.userEngines || [];
    deletedBuiltin = result.deletedBuiltin || [];
    engineOrder = Array.isArray(result.engineOrder) ? result.engineOrder : [];
    applyBuiltinOrder(result.builtinEngineOrder || []);
    renderTabs();
  });
}

function setupStorageListeners() {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") return;
    if (changes.userEngines || changes.builtinEngineOrder || changes.engineOrder || changes.deletedBuiltin) {
      loadEngines();
    }
  });
}

/* ================== 数据处理 ================== */
function applyBuiltinOrder(orderList = []) {
  if (!Array.isArray(orderList) || orderList.length === 0) return;
  const orderMap = {};
  orderList.forEach((id, index) => {
    orderMap[id] = index;
  });
  BUILTIN_ENGINES.forEach(engine => {
    if (orderMap[engine.id] !== undefined) {
      engine.order = orderMap[engine.id];
    }
  });
}

function getAllEngines() {
  const availableBuiltins = BUILTIN_ENGINES.filter(e => !deletedBuiltin.includes(e.id));
  const sortedBuiltin = [...availableBuiltins].sort((a, b) => (a.order || 0) - (b.order || 0));
  const allEngines = [...sortedBuiltin, ...userEngines];

  if (Array.isArray(engineOrder) && engineOrder.length > 0) {
    const engineMap = new Map(allEngines.map(e => [e.id, e]));
    const ordered = engineOrder
      .map(id => engineMap.get(id))
      .filter(Boolean);
    const remaining = allEngines.filter(e => !engineOrder.includes(e.id));
    return [...ordered, ...remaining];
  }

  return allEngines;
}

function getPageForEngine(allEngines, engineId) {
  const index = allEngines.findIndex(e => e.id === engineId);
  if (index === -1) return 1;
  return Math.floor(index / itemsPerPage) + 1;
}

/* ================== 渲染 UI ================== */
function renderTabs() {
  const tabsContainer = document.getElementById("engine-tabs");
  const pager = document.getElementById("pager");
  const pageInfo = document.getElementById("page-info");
  const prevBtn = document.getElementById("prev-btn");
  const nextBtn = document.getElementById("next-btn");
  const searchInput = document.getElementById("search-input");
  const searchConfirm = document.getElementById("search-confirm");

  const allEngines = getAllEngines();
  const totalPages = Math.max(1, Math.ceil(allEngines.length / itemsPerPage));

  if (!selectedEngineId || !allEngines.some(e => e.id === selectedEngineId)) {
    selectedEngineId = allEngines[0]?.id || null;
  }

  currentPage = Math.min(Math.max(1, currentPage), totalPages);
  if (selectedEngineId) {
    currentPage = getPageForEngine(allEngines, selectedEngineId);
  }

  const startIdx = (currentPage - 1) * itemsPerPage;
  const pageEngines = allEngines.slice(startIdx, startIdx + itemsPerPage);

  tabsContainer.innerHTML = "";
  pageEngines.forEach(engine => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `engine-tab${engine.id === selectedEngineId ? " active" : ""}`;
    btn.dataset.engineId = engine.id;
    btn.title = engine.name;
    btn.textContent = engine.name;
    tabsContainer.appendChild(btn);
  });

  if (totalPages > 1) {
    pager.classList.remove("hidden");
    pageInfo.textContent = `${currentPage}/${totalPages}`;
  } else {
    pager.classList.add("hidden");
    pageInfo.textContent = "1/1";
  }

  prevBtn.disabled = currentPage <= 1;
  nextBtn.disabled = currentPage >= totalPages;

  const hasEngine = Boolean(selectedEngineId);
  searchInput.disabled = !hasEngine;
  searchConfirm.disabled = !hasEngine;

  if (hasEngine) {
    requestAnimationFrame(() => searchInput.focus());
  }
}

/* ================== 事件监听 ================== */
function setupEventListeners() {
  const tabsContainer = document.getElementById("engine-tabs");
  const prevBtn = document.getElementById("prev-btn");
  const nextBtn = document.getElementById("next-btn");
  const searchInput = document.getElementById("search-input");
  const searchConfirm = document.getElementById("search-confirm");

  tabsContainer.addEventListener("click", (e) => {
    const tab = e.target.closest(".engine-tab");
    if (!tab) return;
    selectedEngineId = tab.dataset.engineId;
    renderTabs();
    searchInput.focus();
  });

  prevBtn.addEventListener("click", () => {
    if (currentPage <= 1) return;
    currentPage -= 1;
    const allEngines = getAllEngines();
    const startIdx = (currentPage - 1) * itemsPerPage;
    const pageEngines = allEngines.slice(startIdx, startIdx + itemsPerPage);
    if (pageEngines.length && !pageEngines.some(e => e.id === selectedEngineId)) {
      selectedEngineId = pageEngines[0].id;
    }
    renderTabs();
  });

  nextBtn.addEventListener("click", () => {
    const allEngines = getAllEngines();
    const totalPages = Math.max(1, Math.ceil(allEngines.length / itemsPerPage));
    if (currentPage >= totalPages) return;
    currentPage += 1;
    const startIdx = (currentPage - 1) * itemsPerPage;
    const pageEngines = allEngines.slice(startIdx, startIdx + itemsPerPage);
    if (pageEngines.length && !pageEngines.some(e => e.id === selectedEngineId)) {
      selectedEngineId = pageEngines[0].id;
    }
    renderTabs();
  });

  searchConfirm.addEventListener("click", triggerSearch);
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      triggerSearch();
    }
  });
}

function triggerSearch() {
  const searchInput = document.getElementById("search-input");
  const value = searchInput.value.trim();
  if (!value) {
    searchInput.focus();
    return;
  }

  const allEngines = getAllEngines();
  const engine = allEngines.find(e => e.id === selectedEngineId);
  if (!engine || !engine.searchUrl) return;

  const url = engine.searchUrl + encodeURIComponent(value);

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError) {
      console.error("获取标签页失败:", chrome.runtime.lastError);
      return;
    }
    if (tabs && tabs[0]) {
      chrome.tabs.update(tabs[0].id, { url }, () => window.close());
    } else {
      chrome.tabs.create({ url }, () => window.close());
    }
  });
}
