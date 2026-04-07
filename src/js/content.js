/* ================== Content Script - 在每个页面上运行 ================== */
/* 注意：需要在 manifest.json 中加载 utils.js 和这个 content.js */

let USER_ENGINES = [];
let ENGINE_ORDER = [];
let DELETED_BUILTIN = [];
let cachedKeywords = "";  // 缓存当前页面识别的关键词
let currentPageURL = location.href;  // 记录当前页面 URL，用于判断是否跳转
let openDialogMask = null;  // 记录当前打开的对话框 mask，防止多个叠加
let currentShadowHost = null;  // 记录当前的 shadow host，防止重复创建
let fullscreenListenerBound = false;  // 避免重复绑定全屏监听

// i18n
function t(key, substitutions) {
  try {
    // 更稳健的检测：确保 chrome.i18n.getMessage 存在且可调用，并捕获可能的异常（比如扩展上下文失效）
    if (typeof chrome !== "undefined" && chrome && chrome.i18n && typeof chrome.i18n.getMessage === "function") {
      return chrome.i18n.getMessage(key, substitutions) || key;
    }
  } catch (e) {
    // 遇到扩展上下文失效或其他问题时降级为 key
    console.warn('i18n.getMessage failed:', e);
  }
  return key;
}

// 初始化：从 background 获取数据
chrome.runtime.sendMessage({ action: "getEngines" }, (response) => {
  if (chrome.runtime.lastError) {
    console.error("获取引擎数据失败:", chrome.runtime.lastError);
  }
  if (response) {
    USER_ENGINES = response.userEngines || [];
    DELETED_BUILTIN = response.deletedBuiltin || [];
    applyBuiltinOrder(response.builtinEngineOrder || []);
    ENGINE_ORDER = Array.isArray(response.engineOrder) ? response.engineOrder : [];
  }
  whenDomReady(render);
});

// 监听来自 popup 或 background 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "reloadEngines") {
    USER_ENGINES = request.userEngines || USER_ENGINES;
    DELETED_BUILTIN = request.deletedBuiltin || DELETED_BUILTIN;
    applyBuiltinOrder(request.builtinEngineOrder || []);
    ENGINE_ORDER = Array.isArray(request.engineOrder) ? request.engineOrder : ENGINE_ORDER;
    // 重新渲染浮窗
    if (currentShadowHost) currentShadowHost.remove();
    whenDomReady(render);
    sendResponse({ success: true });
  }
});

// 监听 URL 变化（处理 hash 路由），清除缓存以防污染
window.addEventListener("hashchange", () => {
  if (location.href !== currentPageURL) {
    currentPageURL = location.href;
    cachedKeywords = "";  // 页面变化时清除缓存
  }
});

/* ================== 全屏时隐藏浮窗，退出后恢复 ================== */
function isPageInFullscreen() {
  return Boolean(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement
  );
}

function isBrowserWindowFullscreen() {
  const widthDelta = Math.abs(window.innerWidth - window.screen.width);
  const heightDelta = Math.abs(window.innerHeight - window.screen.height);
  return widthDelta <= 2 && heightDelta <= 2;
}

function syncFloatingVisibilityWithFullscreen() {
  if (!currentShadowHost) return;
  const inFullscreen = isPageInFullscreen() || isBrowserWindowFullscreen();
  currentShadowHost.style.display = inFullscreen ? "none" : "";
}

function bindFullscreenVisibilityListener() {
  if (fullscreenListenerBound) return;
  fullscreenListenerBound = true;

  const handleFullscreenChange = () => {
    syncFloatingVisibilityWithFullscreen();
  };

  document.addEventListener("fullscreenchange", handleFullscreenChange);
  document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
  document.addEventListener("mozfullscreenchange", handleFullscreenChange);
  document.addEventListener("MSFullscreenChange", handleFullscreenChange);
  window.addEventListener("resize", handleFullscreenChange);
}

/* ================== 获取所有引擎（内置+用户自定义，按order排序） ================== */
function getAllEngines() {
  const deletedSet = new Set(DELETED_BUILTIN);
  const builtinList = [...BUILTIN_ENGINES];
  const filteredBuiltin = builtinList.filter(e => !deletedSet.has(e.id));
  const sortedBuiltin = [...filteredBuiltin].sort((a, b) => (a.order || 0) - (b.order || 0));
  const allEngines = [...sortedBuiltin, ...USER_ENGINES];

  if (Array.isArray(ENGINE_ORDER) && ENGINE_ORDER.length > 0) {
    const engineMap = new Map(allEngines.map(e => [e.id, e]));
    const ordered = ENGINE_ORDER
      .map(id => engineMap.get(id))
      .filter(Boolean);
    const remaining = allEngines.filter(e => !ENGINE_ORDER.includes(e.id));
    return [...ordered, ...remaining];
  }

  return allEngines;
}

/* ================== 应用内置引擎顺序 ================== */
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

/* ================== XSS 防护辅助函数 ================== */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/* ================== 添加搜索引擎对话框 ================== */
function openAddEngine(defaultData = {}) {
  // 防止多个对话框叠加
  if (openDialogMask) {
    openDialogMask.remove();
  }
  
  const mask = document.createElement("div");
  mask.style.cssText = `
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.5);
    z-index: 2147483646;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: system-ui, sans-serif;
  `;
  
  const dialog = document.createElement("div");
  dialog.style.cssText = `
    background: white;
    padding: 24px;
    border-radius: 12px;
    width: 480px;
    max-width: 92%;
    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    font-family: system-ui, sans-serif;
  `;
  const sharedInputStyle = "width:100%; padding:10px 12px; margin-bottom:20px; box-sizing:border-box; border:1px solid #C9C9CB; border-radius:8px; font:13px system-ui, -apple-system, sans-serif; color:#333; background:#fff; transition:border-color .2s, box-shadow .2s;";
  
  dialog.innerHTML = `
    <h3 style="margin:0 0 20px;">${t("contentAddEngineTitle")}</h3>
    <label style="display:block; margin-bottom:8px; font-weight:600;">${t("contentEngineNameLabel")}</label>
<input id="eng-name" type="text" placeholder="${t("contentEngineNamePlaceholder")}" style="${sharedInputStyle}" value="${escapeHtml(defaultData.name || '')}">
    
    <label style="display:block; margin-bottom:8px; font-weight:600;">${t("contentEngineUrlLabel")}</label>
    <div style="margin-bottom:8px; color:#555; font-size:13px; line-height:1.5;">
      ${t("contentEngineUrlHintHtml")}
    </div>
    <input id="eng-url" type="text" placeholder="${t("contentEngineUrlPlaceholder")}" style="${sharedInputStyle}" value="${escapeHtml(defaultData.url || '')}">
    
    <div style="margin-top:24px; text-align:right;">
      <button id="btn-cancel" style="padding:8px 20px; margin-right:12px; background:#f0f0f0; border:none; border-radius:6px; cursor:pointer;">${t("contentCancel")}</button>
      <button id="btn-save" style="padding:8px 24px; background:#4da3ff; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:500;">${t("contentSave")}</button>
    </div>
  `;
  
  mask.appendChild(dialog);
  document.body.appendChild(mask);
  openDialogMask = mask;  // 记录打开的对话框
  
  const nameInput = dialog.querySelector("#eng-name");
  const urlInput = dialog.querySelector("#eng-url");
  const btnCancel = dialog.querySelector("#btn-cancel");
  const btnSave = dialog.querySelector("#btn-save");

  [nameInput, urlInput].forEach((input) => {
    input.addEventListener("focus", () => {
      input.style.borderColor = "#4da3ff";
      input.style.boxShadow = "0 0 0 2px rgba(77,163,255,0.2)";
      input.style.outline = "none";
    });
    input.addEventListener("blur", () => {
      input.style.borderColor = "#C9C9CB";
      input.style.boxShadow = "none";
    });
  });
  
  btnCancel.onclick = () => {
    mask.remove();
    openDialogMask = null;
  };
  
  // Escape 键关闭对话框
  const handleEscape = (e) => {
    if (e.key === "Escape") {
      mask.remove();
      openDialogMask = null;
      document.removeEventListener("keydown", handleEscape);
    }
  };
  document.addEventListener("keydown", handleEscape);
  
  btnSave.onclick = () => {
    const name = nameInput.value.trim();
    let template = urlInput.value.trim();
    
    if (!name) { alert(t("contentAlertNameRequired")); return; }
    if (!template) { alert(t("contentAlertUrlRequired")); return; }
    if (!template.includes("{query}")) { alert(t("contentAlertUrlNeedQuery")); return; }
    
    // 检查是否已存在相同的引擎（去重）
    const isDuplicate = USER_ENGINES.some(e => e.name === name || e.searchUrl === template.replace("{query}", ""));
    if (isDuplicate) {
      alert(t("contentAlertDuplicate"));
      return;
    }
    
    const searchUrl = template.replace("{query}", "");
    const domainMatch = searchUrl.match(/https?:\/\/([^/?#]+)/i);
    
    // 改进的正则：精确匹配域名和路径
    let regStr;
    if (domainMatch) {
      const domain = domainMatch[1].replace(/\./g, '\\.');
      const pathMatch = searchUrl.match(/https?:\/\/[^/]+([^?#]*)/i);
      const path = pathMatch && pathMatch[1] ? pathMatch[1].replace(/\//g, '\\/') : '';
      regStr = domain + path + '.*';
    } else {
      regStr = '.*';
    }
    
    const newEngine = {
      id: "user_" + Date.now(),
      name: name,
      searchUrl: searchUrl,
      key: "",
      test: regStr
    };
    
    USER_ENGINES.push(newEngine);
    
    // 告知 background 更新存储，添加错误处理和加载反馈
    btnSave.disabled = true;
    btnSave.textContent = t("contentSaving");
    
    chrome.runtime.sendMessage({ action: "saveUserEngines", userEngines: USER_ENGINES }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("保存引擎失败:", chrome.runtime.lastError);
        alert(t("contentAlertSaveFailed", [chrome.runtime.lastError.message || t("contentUnknownError")]));
        btnSave.disabled = false;
        btnSave.textContent = t("contentSave");
        return;
      }
      if (response && response.success) {
        mask.remove();
        openDialogMask = null;
        document.removeEventListener("keydown", handleEscape);
        // 重新渲染浮窗而不刷新页面
        if (currentShadowHost) currentShadowHost.remove();
        whenDomReady(render);
      } else {
        alert(t("contentAlertSaveFailedSimple"));
        btnSave.disabled = false;
        btnSave.textContent = t("contentSave");
      }
    });
  };
  
  nameInput.focus();
}

function openConfirmDialog(message) {
  return new Promise((resolve) => {
    const existingMask = document.querySelector("[data-confirm-dialog]");
    if (existingMask) {
      existingMask.remove();
    }

    const mask = document.createElement("div");
    mask.setAttribute("data-confirm-dialog", "true");
    mask.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.28);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: system-ui, -apple-system, sans-serif;
    `;

    const dialog = document.createElement("div");
    dialog.style.cssText = `
      width: 360px;
      max-width: calc(100vw - 32px);
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.24);
      border: 1px solid #C9C9CB;
      padding: 20px;
      color: #333;
    `;

    const messageEl = document.createElement("div");
    messageEl.textContent = message;
    messageEl.style.cssText = "font: 13px/1.6 system-ui, -apple-system, sans-serif; margin-bottom: 18px; white-space: pre-wrap;";

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex; justify-content:flex-end; gap:12px;";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = t("contentCancel");
    cancelBtn.style.cssText = "padding:8px 20px; background:#f0f0f0; color:#333; border:none; border-radius:6px; cursor:pointer; font:500 13px system-ui, -apple-system, sans-serif;";

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.textContent = t("contentConfirm");
    confirmBtn.style.cssText = "padding:8px 24px; background:#ff4d4f; color:#fff; border:none; border-radius:6px; cursor:pointer; font:600 13px system-ui, -apple-system, sans-serif;";

    const cleanup = (confirmed) => {
      mask.remove();
      document.removeEventListener("keydown", handleKeydown);
      resolve(confirmed);
    };

    const handleKeydown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cleanup(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        cleanup(true);
      }
    };

    cancelBtn.onclick = () => cleanup(false);
    confirmBtn.onclick = () => cleanup(true);
    mask.onclick = (e) => {
      if (e.target === mask) {
        cleanup(false);
      }
    };

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    dialog.appendChild(messageEl);
    dialog.appendChild(actions);
    mask.appendChild(dialog);
    document.body.appendChild(mask);
    document.addEventListener("keydown", handleKeydown);
    confirmBtn.focus();
  });
}

/* ================== 主UI渲染函数 ================== */
function render() {
  bindFullscreenVisibilityListener();

  // 防止重复创建 shadow host
  if (currentShadowHost) {
    currentShadowHost.remove();
  }
  
  const current = getCurrentEngine(USER_ENGINES, DELETED_BUILTIN);
  const keywords = getKeywords(current);
  
  // 更新缓存关键词，同时检查是否页面变化
  if (keywords) {
    cachedKeywords = keywords;
  }
  
  // 创建容器
  const host = document.createElement("div");
  host.id = "search-switcher-host";
  host.style.position = "fixed";
  host.style.top = "0";
  host.style.left = "0";
  host.style.zIndex = "2147483647";
  document.documentElement.appendChild(host);
  currentShadowHost = host;
  syncFloatingVisibilityWithFullscreen();
  const settingIconUrl = chrome.runtime.getURL("icons/setting.svg");
  const addIconUrl = chrome.runtime.getURL("icons/add.svg");
  
  // 使用 Shadow DOM 隔离样式
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host {
        --primary-color: #4da3ff;
        --text-color: #333;
        --bg-color: #fff;
        --border-color: #C9C9CB; /* changed per request */
        --box-width: 210px;
        --collapsed-ratio: 0.05;
        --collapsed-width: calc(var(--box-width) * var(--collapsed-ratio));
      }
      
      .box {
        position: fixed;
        top: 140px;
        left: 0;
        width: var(--box-width);
        max-height: 80vh;
        display: flex;
        flex-direction: column;
        background: rgba(255,255,255,0.8);
        -webkit-backdrop-filter: blur(10px);
        backdrop-filter: blur(10px);
        border: 1px solid var(--border-color);
        border-left: none;
        border-radius: 0 14px 14px 0;
        box-shadow: 0 8px 20px rgba(0,0,0,0.18);
        font: 13px system-ui;
        font-family: system-ui, -apple-system, sans-serif;
        transition: all 0.3s ease-out;
        overflow: hidden;
      }

      #engines-container {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
      }
      
      .box.collapsed {
        transform: translateX(calc(-1 * (var(--box-width) - var(--collapsed-width))));
        background: rgba(255,255,255,0.8);
        opacity: 1;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        border-right: 1px solid var(--border-color);
      }
      
      .title {
        padding: 0 12px;
        height: 28px;
        min-height: 28px;
        font-weight: 600;
        border-bottom: 1px solid var(--border-color);
        display: flex;
        justify-content: flex-start;
        align-items: center;
        gap: 8px;
      }

      #pagination {
        display: flex; /* keep space even when no pages */
        align-items: center;
        justify-content: center;
        flex: 1 1 auto;
        min-height: 28px;
        gap: 6px;
        font-size: 11px;
        font-weight: 500;
        color: #666;
      }
      
      .gear {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        cursor: pointer;
        margin-left: auto;
      }

      .icon {
        display: block;
        width: 16px;
        height: 16px;
        object-fit: contain;
      }
      
      .engine-link {
        display: block;
        padding: 5px 12px;
        box-sizing: border-box;
        color: var(--text-color);
        text-decoration: none;
        cursor: pointer;
        border: 1px solid transparent;
        border-radius: 8px;
        background: transparent;
        width: calc(100% - 8px);
        margin: 2px auto;
        text-align: left;
        font-size: 12.5px;
        font-family: system-ui, sans-serif;
        transition: background 0.2s, border-color 0.2s, box-shadow 0.2s;
      }
      
      .engine-link:hover {
        background: rgba(227,242,253,0.4);
        border-color: rgba(77,163,255,0.6);
        box-shadow: 0 0 0 2px rgba(77,163,255,0.2);
      }
      
      .engine-link.active {
        color: var(--primary-color);
        border-color: rgba(77,163,255,0.6);
        font-weight: 600;
        background: rgba(227,242,253,0.6);
      }
      
      .action {
        height: 28px;
        min-height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        cursor: pointer;
        color: #666;
        border-top: 1px solid var(--border-color);
        transition: background 0.2s;
        background: transparent;
        text-align: center;
        padding: 0 12px;
        font-size: 13px;
      }
      
      .action:hover {
        background: rgba(245,245,245,0.15);
      }

      .action-icon {
        width: 14px;
        height: 14px;
        flex: 0 0 auto;
      }

      .modal-mask {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.35);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 2147483647;
        font-family: system-ui, -apple-system, sans-serif;
      }

      .modal-mask.visible {
        display: flex;
      }

      .modal {
        background: rgba(255,255,255,0.9);
        -webkit-backdrop-filter: blur(10px);
        backdrop-filter: blur(10px);
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.25);
        padding: 16px;
        width: 320px;
        max-width: 88vw;
        border: 1px solid var(--border-color);
      }

      .modal-title {
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 10px;
        color: var(--text-color);
      }

      .modal-row {
        display: flex;
        gap: 8px;
        align-items: center;
      }

      .modal-input {
        flex: 1;
        padding: 8px 10px;
        border-radius: 8px;
        border: 1px solid var(--border-color);
        font-size: 13px;
        font-family: system-ui, -apple-system, sans-serif;
        background: rgba(255,255,255,0.95);
      }

      .modal-input:focus {
        outline: none;
        border-color: var(--primary-color);
        box-shadow: 0 0 0 2px rgba(77,163,255,0.2);
      }

      .modal-confirm {
        padding: 8px 12px;
        border-radius: 8px;
        border: none;
        background: var(--primary-color);
        color: white;
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
      }

      .modal-confirm:active {
        transform: scale(0.98);
      }
    </style>
    
    <div class="box" id="box">
      <div class="title">
        <div id="pagination"></div>
        <span class="gear" id="gear" title="${t("contentManagerTitle")}">
          <img class="icon" src="${settingIconUrl}" alt="">
        </span>
      </div>
      <div id="engines-container"></div>
      <div class="action" id="add-current">
        <img class="action-icon" src="${addIconUrl}" alt="">
        <span>${t("contentAddCurrent")}</span>
      </div>
    </div>

    <div class="modal-mask" id="search-input-mask">
      <div class="modal">
        <div class="modal-title" id="search-input-title">${t("contentSearchInputTitle")}</div>
        <div class="modal-row">
          <input class="modal-input" id="search-input" type="text" placeholder="${t("contentSearchInputPlaceholder")}">
          <button class="modal-confirm" id="search-confirm">${t("contentConfirm")}</button>
        </div>
      </div>
    </div>
  `;
  
  const box = shadow.getElementById("box");
  let collapseTimer;
  // 默认收起
  box.classList.add("collapsed");
  
  const collapse = () => {
    collapseTimer = setTimeout(() => box.classList.add("collapsed"), 1000);
  };
  
  const expand = () => {
    clearTimeout(collapseTimer);
    box.classList.remove("collapsed");
  };
  
  box.addEventListener("mouseenter", expand);
  box.addEventListener("mouseleave", collapse);
  collapse();
  
  // 齿轮图标点击 - 打开管理面板
  const gearBtn = shadow.getElementById("gear");
  gearBtn.onclick = openManager;
  
  // 分页功能
        const enginesContainer = shadow.getElementById("engines-container");
        const paginationDiv = shadow.getElementById("pagination");
        const allEngines = getAllEngines();
        const itemsPerPage = 18;
        const totalPages = Math.ceil(allEngines.length / itemsPerPage);
        let currentPage = 1;
        
        function renderPage(page) {
          const startIdx = (page - 1) * itemsPerPage;
          const endIdx = startIdx + itemsPerPage;
          const pageEngines = allEngines.slice(startIdx, endIdx);
          
          enginesContainer.innerHTML = pageEngines.map(e => `
            <a class="engine-link ${current.id === e.id ? "active" : ""}"
               data-engine-id="${e.id}"
               title="${escapeHtml(e.name)}">
              ${escapeHtml(e.name)}
            </a>
          `).join("");
          
          // render pagination controls (disabled when not applicable)
          const prevEnabled = page > 1;
          const nextEnabled = page < totalPages;
          const enabledOpacity = 1;
          const disabledOpacity = 0.45;
          paginationDiv.innerHTML = `
            <button id="prev-btn" style="width:24px; height:28px; border:none; background:transparent; cursor:${prevEnabled ? "pointer" : "default"}; opacity:${prevEnabled ? enabledOpacity : disabledOpacity}; font-size:16px; line-height:28px;" ${prevEnabled ? "" : "disabled"}>◀</button>
            <span style="margin:0 8px; display:inline-flex; align-items:center; height:28px;">${page}/${totalPages}</span>
            <button id="next-btn" style="width:24px; height:28px; border:none; background:transparent; cursor:${nextEnabled ? "pointer" : "default"}; opacity:${nextEnabled ? enabledOpacity : disabledOpacity}; font-size:16px; line-height:28px;" ${nextEnabled ? "" : "disabled"}>▶</button>
          `;

          const prevBtn = paginationDiv.querySelector("#prev-btn");
          const nextBtn = paginationDiv.querySelector("#next-btn");

          if (prevBtn) {
            if (prevEnabled) {
              prevBtn.onclick = (e) => {
                e.stopPropagation();
                currentPage--;
                renderPage(currentPage);
                expand();
              };
            } else {
              prevBtn.onclick = null;
            }
          }
          if (nextBtn) {
            if (nextEnabled) {
              nextBtn.onclick = (e) => {
                e.stopPropagation();
                currentPage++;
                renderPage(currentPage);
                expand();
              };
            } else {
              nextBtn.onclick = null;
            }
          }
        }
        
        renderPage(1);
  
  const searchMask = shadow.getElementById("search-input-mask");
  const searchInput = shadow.getElementById("search-input");
  const searchConfirm = shadow.getElementById("search-confirm");
  const searchTitle = shadow.getElementById("search-input-title");
  let pendingEngine = null;

  const openSearchInput = (engine) => {
    pendingEngine = engine;
    searchTitle.textContent = t("contentSearchInputTitleWithEngine", [engine.name]);
    searchInput.value = "";
    searchMask.classList.add("visible");
    setTimeout(() => searchInput.focus(), 0);
  };

  const closeSearchInput = () => {
    searchMask.classList.remove("visible");
    pendingEngine = null;
  };

  const triggerSearch = () => {
    const value = searchInput.value.trim();
    if (!pendingEngine || !pendingEngine.searchUrl) return closeSearchInput();
    if (!value) {
      searchInput.focus();
      return;
    }
    window.location.href = pendingEngine.searchUrl + encodeURIComponent(value);
    closeSearchInput();
  };

  searchConfirm.addEventListener("click", triggerSearch);
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") triggerSearch();
    if (e.key === "Escape") closeSearchInput();
  });
  searchMask.addEventListener("click", (e) => {
    if (e.target === searchMask) closeSearchInput();
  });

  // 搜索引擎链接点击 - 使用事件委托而不是逐个绑定（防止内存泄漏）
  box.addEventListener("click", (e) => {
    const link = e.target.closest(".engine-link");
    if (!link) return;
    
    e.preventDefault();
    const engineId = link.dataset.engineId;
    const engine = getAllEngines().find(eng => eng.id === engineId);
    
    if (!engine || !engine.searchUrl) return;
    
    // 尝试从当前 URL 获取关键词，失败则使用缓存
    let keywords = getKeywords(engine);
    if (!keywords && cachedKeywords) {
      keywords = cachedKeywords;
    }
    
    // 即使没有识别到关键词，也跳转到搜索引擎（用户可以在那里搜索）
    if (keywords) {
      window.location.href = engine.searchUrl + encodeURIComponent(keywords);
    } else {
      // 没有关键词则弹出输入框
      openSearchInput(engine);
    }
  });
  
  // 添加当前页面
  const addCurrentBtn = shadow.getElementById("add-current");
  addCurrentBtn.onclick = () => {
    const currentEngine = getCurrentEngine(USER_ENGINES, DELETED_BUILTIN);
    const params = new URLSearchParams(location.search);
    const searchKey = COMMON_KEYS.find(k => params.has(k));
    
    let urlTemplate = location.origin + location.pathname;
    
    if (searchKey) {
      urlTemplate += "?" + searchKey + "={query}";
    } else {
      urlTemplate += "?q={query}";
    }
    
    const defaultName = t("contentDefaultEngineName");
    let suggestedName = defaultName;
    
    if (currentEngine.id !== "__site__" && currentEngine.id !== "__unknown__") {
      suggestedName = currentEngine.name;
    } else if (document.title) {
      const titleParts = document.title.split(/[-|–—|·|｜]/);
      for (let i = titleParts.length - 1; i >= 0; i--) {
        const part = titleParts[i].trim();
        if (part && part.length > 2 && !/\d{4}/.test(part) && !/搜索|search/i.test(part)) {
          suggestedName = part;
          break;
        }
      }
    }
    
    if (suggestedName === defaultName) {
      const domain = location.hostname.replace(/^www\./, '');
      suggestedName = domain.charAt(0).toUpperCase() + domain.slice(1).split('.')[0];
    }
    
    openAddEngine({ name: suggestedName, url: urlTemplate });
  };
}

/* ================== 管理面板 ================== */
function openManager() {
  // 防止多个管理面板打开
  const existingMask = document.querySelector('[data-manager-panel]');
  if (existingMask) return;
  
  const mask = document.createElement("div");
  mask.setAttribute("data-manager-panel", "true");
  mask.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:2147483646;display:flex;align-items:center;justify-content:center;font-family:system-ui, sans-serif;`;
  
  const panel = document.createElement("div");
  panel.style.cssText = `background:#fff;width:680px;max-height:80vh;overflow-y:auto;border-radius:12px;padding:24px;font:13px system-ui;box-shadow:0 10px 40px rgba(0,0,0,0.3);font-family:system-ui, sans-serif;`;

  const closeManager = () => {
    mask.remove();
    document.removeEventListener("keydown", handleManagerEscape);
  };

  const handleManagerEscape = (e) => {
    if (document.querySelector("[data-confirm-dialog]")) return;
    if (e.key === "Escape") {
      closeManager();
    }
  };

  const renderManagerContent = () => {
    let html = `<h3 style="margin:0 0 20px; font-size:16px; font-weight:700;">${t("contentManagerTitle")}</h3>`;
    html += `<div style="margin-bottom:16px; color:#666; font-size:13px;">${t("contentManagerSortHint")}</div>`;

    const allEnginesForManager = getAllEngines();
    const builtinIdSet = new Set(BUILTIN_ENGINES.map(e => e.id));

    if (allEnginesForManager.length === 0) {
      html += `<div style="color:#aaa; font-style:italic; padding:20px; text-align:center;">${t("contentManagerEmptyVisible")}</div>`;
    } else {
      html += `<div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:12px; margin-bottom:12px;" class="engine-order-grid">`;
      allEnginesForManager.forEach((e) => {
        const isBuiltin = builtinIdSet.has(e.id);
        const cardClass = isBuiltin ? "builtin-card" : "custom-card";
        const cardBg = isBuiltin ? "#f8f8f8" : "#fafafa";
        const builtinButtons = `
          <div style="position:absolute; top:8px; right:8px; display:flex; gap:4px;">
            <button class="delete-builtin" data-id="${e.id}" title="${t("contentManagerDeleteBuiltinTitle")}" style="width:18px; height:18px; background:#ff4d4f; color:white; border:none; border-radius:4px; cursor:pointer; font-size:12px; font-weight:bold; padding:0; display:flex; align-items:center; justify-content:center; transition:all .2s;">×</button>
          </div>`;
        const actionBtn = isBuiltin
          ? builtinButtons
          : `<button class="delete-btn" data-id="${e.id}" title="${t("contentManagerDeleteTitle")}" style="position:absolute; top:50%; right:4px; transform:translateY(-50%); width:18px; height:18px; background:#ff4d4f; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:8px; font-weight:bold; padding:0; display:flex; align-items:center; justify-content:center; transition:all .2s;">−</button>`;

        html += `<div style="position:relative; padding:8px 19px 8px 8px; background:${cardBg}; border-radius:8px; border:1px solid #C9C9CB; cursor:grab; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; transition:all .2s; min-height:40px; display:flex; align-items:center; box-sizing:border-box; user-select:none;" class="${cardClass}" data-id="${e.id}" draggable="true" title="${escapeHtml(e.name)}">
          <span style="display:block; font-weight:500; color:#333; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; pointer-events:none;">${escapeHtml(e.name)}</span>
          ${actionBtn}
        </div>`;
      });
      html += `</div>`;
    }

    html += `<hr style="margin:20px 0; border:none; border-top:1px solid #C9C9CB;"><div style="text-align:right;"><button id="close-btn" style="padding:10px 20px; background:#4da3ff; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:500; transition:all .2s;">${t("contentClose")}</button></div>`;
    panel.innerHTML = html;
    setupManagerDragAndDrop(panel.querySelector(".engine-order-grid"), "all", panel, mask, handleManagerEscape);

    const closeBtn = panel.querySelector("#close-btn");
    if (closeBtn) {
      closeBtn.onclick = closeManager;
    }
  };

  renderManagerContent();
  mask.appendChild(panel);
  document.body.appendChild(mask);
  document.addEventListener("keydown", handleManagerEscape);
  
  // 使用事件委托处理按钮点击
  panel.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    if (btn.classList.contains("delete-btn")) {
      const engineId = btn.dataset.id;
      const index = USER_ENGINES.findIndex(engine => engine.id === engineId);
      if (index === -1) return;
      const engineName = USER_ENGINES[index].name;

      const confirmed = await openConfirmDialog(t("contentConfirmDelete", [engineName]));
      if (!confirmed) return;

      const prevUserEngines = [...USER_ENGINES];
      btn.disabled = true;
      btn.textContent = "...";
      btn.style.fontSize = "12px";

      USER_ENGINES.splice(index, 1);
      chrome.runtime.sendMessage({ action: "saveUserEngines", userEngines: USER_ENGINES }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("删除引擎失败:", chrome.runtime.lastError);
          USER_ENGINES = prevUserEngines;
          alert(t("contentAlertDeleteFailed", [chrome.runtime.lastError.message || t("contentUnknownError")]));
          btn.disabled = false;
          btn.textContent = "−";
          btn.style.fontSize = "8px";
          return;
        }
        if (response && response.success) {
          renderManagerContent();
          notifyAllTabsToRefresh();
        } else {
          USER_ENGINES = prevUserEngines;
          alert(t("contentAlertDeleteFailedSimple"));
          btn.disabled = false;
          btn.textContent = "−";
          btn.style.fontSize = "8px";
        }
      });
      return;
    }

    if (btn.classList.contains("delete-builtin")) {
      const engineId = btn.dataset.id;
      const engine = BUILTIN_ENGINES.find(item => item.id === engineId);
      if (!engine) return;

      const confirmed = await openConfirmDialog(t("contentConfirmDeleteBuiltin", [engine.name]));
      if (!confirmed) return;

      const prevDeleted = [...DELETED_BUILTIN];
      const prevOrder = [...ENGINE_ORDER];
      btn.disabled = true;
      btn.textContent = "...";
      btn.style.fontSize = "10px";

      DELETED_BUILTIN = Array.from(new Set([...DELETED_BUILTIN, engineId]));
      ENGINE_ORDER = ENGINE_ORDER.filter(id => id !== engineId);
      const builtinOrder = getBuiltinOrderIds();

      chrome.runtime.sendMessage({
        action: "saveDeletedBuiltin",
        deletedBuiltin: DELETED_BUILTIN,
        engineOrder: ENGINE_ORDER,
        builtinEngineOrder: builtinOrder
      }, (response) => {
        if (chrome.runtime.lastError || !(response && response.success)) {
          console.error("删除内置引擎失败:", chrome.runtime.lastError);
          alert(t("contentAlertDeleteFailed", [chrome.runtime.lastError?.message || t("contentUnknownError")]));
          DELETED_BUILTIN = prevDeleted;
          ENGINE_ORDER = prevOrder;
          btn.disabled = false;
          btn.textContent = "×";
          btn.style.fontSize = "12px";
          return;
        }
        renderManagerContent();
        notifyAllTabsToRefresh();
      });
      return;
    }
  });
  
  // 点击遮罩关闭
  mask.onclick = e => { 
    if (e.target === mask) {
      closeManager();
    }
  };
}

/* ================== 管理面板拖放排序 ================== */
function setupManagerDragAndDrop(container, type, panel, mask, handleManagerEscape) {
  if (!container) return;
  
  let draggedElement = null;
  let sourceContainer = null;
  
  container.addEventListener("dragstart", (e) => {
    const card = e.target.closest(".builtin-card, .custom-card");
    if (!card) return;
    draggedElement = card;
    sourceContainer = container;
    draggedElement.style.opacity = "0.5";
    draggedElement.style.borderColor = "#4da3ff";
    e.dataTransfer.effectAllowed = "move";
  });
  
  container.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    
    const card = e.target.closest(".builtin-card, .custom-card");
    if (card && card !== draggedElement) {
      card.style.borderColor = "#4da3ff";
      card.style.background = "rgba(77, 163, 255, 0.1)";
    }
  });
  
  container.addEventListener("dragleave", (e) => {
    const card = e.target.closest(".builtin-card, .custom-card");
    if (card && card !== draggedElement) {
      card.style.borderColor = "#C9C9CB";
      card.style.background = type === 'builtin' ? "#f8f8f8" : "#fafafa";
    }
  });
  
  container.addEventListener("drop", (e) => {
    e.preventDefault();
    if (!draggedElement || !sourceContainer) {
      return;
    }
    const targetCard = e.target.closest(".builtin-card, .custom-card");
    
    if (targetCard && targetCard !== draggedElement) {
      // 支持同容器和跨容器拖放
      const sourceCards = Array.from(sourceContainer.querySelectorAll(".builtin-card, .custom-card"));
      const targetCards = Array.from(container.querySelectorAll(".builtin-card, .custom-card"));
      
      const draggedIndex = sourceCards.indexOf(draggedElement);
      const targetIndex = targetCards.indexOf(targetCard);
      
      // 如果是同容器内拖放
      if (sourceContainer === container) {
        if (draggedIndex > targetIndex) {
          targetCard.parentNode.insertBefore(draggedElement, targetCard);
        } else {
          targetCard.parentNode.insertBefore(draggedElement, targetCard.nextSibling);
        }
      } else {
        // 跨容器拖放：移动到新容器
        draggedElement.parentNode.removeChild(draggedElement);
        if (targetIndex === -1) {
          container.appendChild(draggedElement);
        } else {
          if (draggedIndex > targetIndex) {
            targetCard.parentNode.insertBefore(draggedElement, targetCard);
          } else {
            targetCard.parentNode.insertBefore(draggedElement, targetCard.nextSibling);
          }
        }
        sourceContainer = container;
      }
      
      // 保存新的顺序
      saveManagerOrder(type, container);
    }
    
    // 清理样式
    document.querySelectorAll(".builtin-card, .custom-card").forEach(card => {
      card.style.opacity = "1";
      card.style.borderColor = "#C9C9CB";
      card.style.background = card.classList.contains("builtin-card") ? "#f8f8f8" : "#fafafa";
    });
    draggedElement = null;
    sourceContainer = null;
  });
  
  container.addEventListener("dragend", (e) => {
    document.querySelectorAll(".builtin-card, .custom-card").forEach(card => {
      card.style.opacity = "1";
      card.style.borderColor = "#C9C9CB";
      card.style.background = card.classList.contains("builtin-card") ? "#f8f8f8" : "#fafafa";
    });
    draggedElement = null;
    sourceContainer = null;
  });
}

/* ================== 管理面板排序保存并刷新浮窗 ================== */
function saveManagerOrder(type, container) {
  // 从网格中收集所有卡片
  const isGrid = container?.classList?.contains('engine-order-grid');
  const grid = isGrid ? container : container?.querySelector?.('.engine-order-grid');
  const cards = grid ? Array.from(grid.querySelectorAll(".builtin-card, .custom-card")) : [];

  if (!cards.length) return;

  if (type === 'all') {
    const builtinIdSet = new Set(BUILTIN_ENGINES.map(e => e.id));
    const idOrder = cards.map(card => card.dataset.id).filter(Boolean);
    const allEnginesMap = new Map([
      ...BUILTIN_ENGINES.map(e => [e.id, e]),
      ...USER_ENGINES.map(e => [e.id, e])
    ]);

    const orderedEngines = idOrder.map(id => allEnginesMap.get(id)).filter(Boolean);
    const remainingEngines = [...BUILTIN_ENGINES, ...USER_ENGINES].filter(e => !idOrder.includes(e.id));
    const completeOrder = [...idOrder, ...remainingEngines.map(e => e.id)];

    const orderedCustom = orderedEngines.filter(e => !builtinIdSet.has(e.id));
    const remainingCustom = USER_ENGINES.filter(e => !idOrder.includes(e.id));
    USER_ENGINES = [...orderedCustom, ...remainingCustom];

    const builtinOrder = completeOrder.filter(id => builtinIdSet.has(id));
    builtinOrder.forEach((id, index) => {
      const engine = BUILTIN_ENGINES.find(e => e.id === id);
      if (engine) engine.order = index;
    });

    ENGINE_ORDER = completeOrder;

    chrome.storage.sync.set({ engineOrder: ENGINE_ORDER, userEngines: USER_ENGINES, builtinEngineOrder: builtinOrder }, () => {
      if (chrome.runtime.lastError) {
        console.error("保存排序失败:", chrome.runtime.lastError);
      } else {
        notifyAllTabsToRefresh();
      }
    });
    return;
  }
}

function getBuiltinOrderIds() {
  return [...BUILTIN_ENGINES]
    .filter(e => !DELETED_BUILTIN.includes(e.id))
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map(e => e.id);
}

/* ================== 通知所有标签页刷新浮窗 ================== */
function notifyAllTabsToRefresh() {
  // 当前页面立即刷新
  if (currentShadowHost) {
    currentShadowHost.remove();
  }
  whenDomReady(render);
  
  const builtinEngineOrder = getBuiltinOrderIds();

  chrome.runtime.sendMessage({
    action: "broadcastReloadEngines",
    deletedBuiltin: DELETED_BUILTIN,
    userEngines: USER_ENGINES,
    builtinEngineOrder,
    engineOrder: ENGINE_ORDER
  }, () => {
    void chrome.runtime.lastError;
  });
}
