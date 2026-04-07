/* ================== 搜索引擎定义 ================== */
const BUILTIN_ENGINES = [
  { id: "google", name: "Google", searchUrl: "https://www.google.com/search?q=", key: "q", test: /google\.[^/]+\/search/i, order: 0 },
  { id: "bing", name: "Bing", searchUrl: "https://www.bing.com/search?q=", key: "q", test: /bing\.com\/search/i, order: 1 },
  { id: "bilibili", name: "哔哩哔哩", searchUrl: "https://search.bilibili.com/all?keyword=", key: "keyword", test: /bilibili\.com/i, order: 2 },
  { id: "xiaohongshu", name: "小红书", searchUrl: "https://www.xiaohongshu.com/search_result?keyword=", key: "keyword", test: /xiaohongshu\.com/i, order: 3 },
  { id: "douyin", name: "抖音", searchUrl: "https://www.douyin.com/search/", key: "", test: /douyin\.com\/search/i, order: 4 },
  { id: "youtube", name: "YouTube", searchUrl: "https://www.youtube.com/results?search_query=", key: "search_query", test: /youtube\.com\/results/i, order: 5 },
  { id: "baidu", name: "百度", searchUrl: "https://www.baidu.com/s?wd=", key: "wd", test: /baidu\.com\/s/i, order: 6 },
  { id: "douban", name: "豆瓣", searchUrl: "https://www.douban.com/search?q=", key: "q", test: /douban\.com\/search/i, order: 7 },
  { id: "wechat", name: "微信", searchUrl: "https://weixin.sogou.com/weixin?type=2&s_from=input&query=", key: "query", test: /weixin\.sogou\.com\/weixin/i, order: 8 },
  { id: "zhihu", name: "知乎", searchUrl: "https://www.zhihu.com/search?q=", key: "q", test: /zhihu\.com\/search/i, order: 9 },
  { id: "duckduckgo", name: "DuckDuckGo", searchUrl: "https://duckduckgo.com/?q=", key: "q", test: /duckduckgo\.com/i, order: 10 },
  { id: "thepiratebay", name: "The Pirate Bay", searchUrl: "https://thepiratebay.org/search.php?q=", key: "q", test: /thepiratebay\.org\/search/i, order: 11 },
  { id: "rargb", name: "RARGB", searchUrl: "https://rargb.to/search/?search=", key: "search", test: /rargb\.to\/search/i, order: 12 },
  { id: "bingdict", name: "必应词典", searchUrl: "https://www.bing.com/dict/search?q=", key: "q", test: /bing\.com\/dict\/search/i, order: 13 }
];

const COMMON_KEYS = ["q", "keyword", "query", "s", "wd", "search"];

// i18n
function t(key, substitutions) {
  if (chrome?.i18n?.getMessage) {
    return chrome.i18n.getMessage(key, substitutions) || key;
  }
  return key;
}

/* ================== 获取关键词 ================== */
function getKeywords(engine) {
  // 特殊处理抖音
  if (engine?.id === "douyin") {
    const m = location.pathname.match(/\/search\/([^/?]+)/);
    return m ? decodeURIComponent(m[1]) : "";
  }
  
  // 首先尝试从 location.search 中获取
  let params = new URLSearchParams(location.search);
  
  // 使用引擎定义的 key
  if (engine?.key && params.get(engine.key)) {
    return params.get(engine.key);
  }
  
  // 尝试常见的搜索参数（来自 search）
  for (const k of COMMON_KEYS) {
    if (params.get(k)) return params.get(k);
  }
  
  // 如果 location.search 中没找到，尝试从 location.hash 中获取
  // 处理 hash 路由，如 #/results?search_query=xxx 或 #!/results?search_query=xxx
  const hash = location.hash;
  if (hash) {
    // 移除 # 或 #! 前缀，获取后面的部分
    let hashContent = hash.startsWith("#!") ? hash.substring(2) : hash.substring(1);
    
    // 如果 hash 中包含 ?，则可能有查询参数
    if (hashContent.includes("?")) {
      params = new URLSearchParams(hashContent.substring(hashContent.indexOf("?")));
      
      // 使用引擎定义的 key
      if (engine?.key && params.get(engine.key)) {
        return params.get(engine.key);
      }
      
      // 尝试常见的搜索参数（来自 hash）
      for (const k of COMMON_KEYS) {
        if (params.get(k)) return params.get(k);
      }
    }
  }
  
  return "";
}

/* ================== 识别当前搜索引擎 ================== */
function getCurrentEngine(userEngines = [], deletedBuiltin = []) {
  const deletedSet = new Set(deletedBuiltin);
  // 优先匹配内置引擎
  let engine = BUILTIN_ENGINES.find(e => !deletedSet.has(e.id) && e.test?.test(location.href));
  if (engine) return engine;
  
  // 检查用户自定义引擎
  for (const userEngine of userEngines) {
    if (userEngine.test) {
      try {
        const regex = new RegExp(userEngine.test, 'i');
        if (regex.test(location.href)) {
          return userEngine;
        }
      } catch (e) {
        console.warn('无效的正则表达式:', userEngine.test);
      }
    }
  }
  
  // 未匹配到任何引擎，检查是否有搜索参数
  const params = new URLSearchParams(location.search);
  const key = COMMON_KEYS.find(k => params.has(k));
  
  if (key) {
    return { id: "__site__", name: t("contentSiteSearch"), key, searchUrl: "" };
  }
  
  return { id: "__unknown__", name: t("contentUnknownEngine"), key: "", searchUrl: "" };
}

/* ================== DOM 就绪监听 ================== */
function whenDomReady(fn) {
  if (document.readyState === "complete" || document.readyState === "interactive") {
    requestAnimationFrame(fn);
  } else {
    document.addEventListener("DOMContentLoaded", () => requestAnimationFrame(fn), { once: true });
  }
}

/* ================== 导出用于popup的数据 ================== */
function getAllEnginesWithBuiltin(userEngines = [], deletedBuiltin = []) {
  const deletedSet = new Set(deletedBuiltin);
  return [
    ...BUILTIN_ENGINES.filter(e => !deletedSet.has(e.id)),
    ...userEngines
  ];
}

function getEngineById(id, userEngines = [], deletedBuiltin = []) {
  const allEngines = getAllEnginesWithBuiltin(userEngines, deletedBuiltin);
  return allEngines.find(e => e.id === id);
}
