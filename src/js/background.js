/* ================== Background Service Worker ================== */

// 初始化存储
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(["userEngines", "builtinEngineOrder", "engineOrder", "deletedBuiltin"], (result) => {
    if (chrome.runtime.lastError) {
      console.error("初始化失败:", chrome.runtime.lastError);
      return;
    }
    if (!result.userEngines) {
      chrome.storage.sync.set({ userEngines: [] }, () => {
        if (chrome.runtime.lastError) {
          console.error("初始化 userEngines 失败:", chrome.runtime.lastError);
        }
      });
    }
    if (!result.builtinEngineOrder) {
      chrome.storage.sync.set({ builtinEngineOrder: [] }, () => {
        if (chrome.runtime.lastError) {
          console.error("初始化 builtinEngineOrder 失败:", chrome.runtime.lastError);
        }
      });
    }
    if (!result.engineOrder) {
      chrome.storage.sync.set({ engineOrder: [] }, () => {
        if (chrome.runtime.lastError) {
          console.error("初始化 engineOrder 失败:", chrome.runtime.lastError);
        }
      });
    }
    if (!result.deletedBuiltin) {
      chrome.storage.sync.set({ deletedBuiltin: [] }, () => {
        if (chrome.runtime.lastError) {
          console.error("初始化 deletedBuiltin 失败:", chrome.runtime.lastError);
        }
      });
    }
  });
});

// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getEngines") {
    chrome.storage.sync.get(["userEngines", "builtinEngineOrder", "engineOrder", "deletedBuiltin"], (result) => {
      if (chrome.runtime.lastError) {
        console.error("获取数据失败:", chrome.runtime.lastError);
        sendResponse({
          userEngines: [],
          builtinEngineOrder: [],
          engineOrder: [],
          deletedBuiltin: []
        });
        return;
      }
      sendResponse({
        userEngines: result.userEngines || [],
        builtinEngineOrder: result.builtinEngineOrder || [],
        engineOrder: result.engineOrder || [],
        deletedBuiltin: result.deletedBuiltin || []
      });
    });
    return true; // 异步发送响应
  }
  
  if (request.action === "saveUserEngines") {
    // 保存用户自定义引擎
    chrome.storage.sync.set({ userEngines: request.userEngines }, () => {
      if (chrome.runtime.lastError) {
        console.error("保存 userEngines 失败:", chrome.runtime.lastError);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (request.action === "saveDeletedBuiltin") {
    const update = {};
    if (Array.isArray(request.deletedBuiltin)) {
      update.deletedBuiltin = request.deletedBuiltin;
    }
    if (Array.isArray(request.engineOrder)) {
      update.engineOrder = request.engineOrder;
    }
    if (Array.isArray(request.builtinEngineOrder)) {
      update.builtinEngineOrder = request.builtinEngineOrder;
    }
    if (Object.keys(update).length === 0) {
      sendResponse({ success: true });
      return true;
    }
    chrome.storage.sync.set(update, () => {
      if (chrome.runtime.lastError) {
        console.error("保存 deletedBuiltin 失败:", chrome.runtime.lastError);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse({ success: true });
    });
    return true;
  }

  if (request.action === "broadcastReloadEngines") {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
        action: "reloadEngines",
        userEngines: request.userEngines || [],
        builtinEngineOrder: request.builtinEngineOrder || [],
        engineOrder: request.engineOrder || [],
        deletedBuiltin: request.deletedBuiltin || []
        }, () => {
          void chrome.runtime.lastError;
        });
      });
      sendResponse({ success: true });
    });
    return true;
  }
});
