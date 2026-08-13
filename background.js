// background.js

// 1. 设置 SidePanel 行为：点击 Action 图标时打开 SidePanel
// 注意：这需要在 manifest 中配置 "sidePanel" 权限
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// 2. 捕获关键请求头 (API 采集需要)
const TARGET_HEADERS = ['x-s', 'x-s-common', 'x-t','xy-direction','x-xray-traceid','x-rap-param','x-xray-traceid','cookie'];
let capturedHeaders = {};

chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    let hasUpdate = false;
    let lastCookieHeader = '';
    details.requestHeaders.forEach(header => {
      if (TARGET_HEADERS.includes(header.name.toLowerCase())) {
        capturedHeaders[header.name.toLowerCase()] = header.value;
        hasUpdate = true;
      }
      if (header.name.toLowerCase() === 'cookie') {
        lastCookieHeader = header.value || '';
      }
    });
    
    // 如果有更新，保存到 storage
    if (hasUpdate) {
      chrome.storage.local.set({ xhs_headers: capturedHeaders });
    }
    // 不缓存 Cookie 头，避免使用过期或不匹配的值
  },
  { urls: ["https://*.xiaohongshu.com/*", "https://edith.xiaohongshu.com/*"] },
  ["requestHeaders", "extraHeaders"]
);

// 3. 监听消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Feishu OAuth2 (保留，以防需要 User Identity 模式)
  if (message.type === 'FEISHU_AUTH') {
    const { appId, redirectUri } = message.payload;
    const authUrl = `https://open.feishu.cn/open-apis/authen/v1/index?app_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=RANDOM_STATE`;
    
    chrome.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true
    }, (responseUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      // 解析 code
      const url = new URL(responseUrl);
      const code = url.searchParams.get('code');
      sendResponse({ success: true, code });
    });
    return true; // 异步响应
  }
  
  // 获取捕获的 Headers
  if (message.type === 'GET_HEADERS') {
    chrome.storage.local.get(['xhs_headers'], (result) => {
      sendResponse(result.xhs_headers || {});
    });
    return true;
  }

  if (message.type === 'FEISHU_CREATE_RECORDS') {
    (async () => {
      try {
        const { appToken, tableId, records, bearer } = message.payload || {};
        const url = `https://base-api.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_create`;
        console.log('[Feishu] Syncing records:', { url, count: records.length });
        
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${bearer}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ records })
        });
        
        const data = await res.json();
        console.log('[Feishu] Sync response:', data);
        
        if (data.code === 0) {
           sendResponse({ success: true, data });
        } else {
           sendResponse({ success: false, data });
        }
      } catch (e) {
        console.error('[Feishu] Sync error:', e);
        sendResponse({ success: false, error: e.toString() });
      }
    })();
    return true;
  }

  if (message.type === 'FEISHU_UPLOAD_MEDIA') {
    (async () => {
      try {
        const { coverUrl, appToken, bearer, bytes: rawBytes } = message.payload || {};
        if ((!coverUrl && !rawBytes) || !appToken || !bearer) {
          sendResponse({ success: false, error: 'invalid_payload' });
          return;
        }
        let bytes;
        if (rawBytes && Array.isArray(rawBytes)) {
          bytes = new Uint8Array(rawBytes);
        } else {
          const cookie = message.payload.cookie || '';
          const headers = cookie ? { 'Cookie': cookie } : {};
          const imgRes = await fetch(coverUrl, { headers });
          if (!imgRes.ok) {
            sendResponse({ success: false, error: `fetch_image_failed_${imgRes.status}` });
            return;
          }
          const buf = await imgRes.arrayBuffer();
          bytes = new Uint8Array(buf);
        }
        const size = bytes.length;
        const checksum = crc32(bytes) >>> 0;
        const fileName = genFileName(coverUrl);

        const cacheKey = coverUrl ? `url:${coverUrl}` : `bytes:${size}`;
        if (MEDIA_TOKEN_CACHE.has(cacheKey)) {
          const cachedToken = MEDIA_TOKEN_CACHE.get(cacheKey);
          sendResponse({ success: true, data: { code: 0, data: { file_token: cachedToken } } });
          return;
        }

        const fd = new FormData();
        fd.append('file_name', fileName);
        fd.append('parent_type', 'bitable_image');
        fd.append('size', String(size));
        fd.append('parent_node', appToken);
        fd.append('file', new Blob([bytes]), fileName);

        const url = 'https://base-api.feishu.cn/open-apis/drive/v1/medias/upload_all';
        const maxRetries = 5;
        let lastError = null;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${bearer}` },
            body: fd
          });
          if (res.status === 429 || res.status === 503 || res.status === 500) {
            const ra = parseInt(res.headers.get('Retry-After') || '0', 10);
            const base = 800 * Math.pow(2, attempt);
            const jitter = Math.floor(Math.random() * 300);
            const delay = ra > 0 ? ra * 1000 : base + jitter;
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          const data = await res.json();
          if (data && data.code === 0) {
            const token = data.data && data.data.file_token;
            if (token) MEDIA_TOKEN_CACHE.set(cacheKey, token);
            sendResponse({ success: true, data });
            return;
          } else {
            lastError = data;
            const delay = 600 + Math.floor(Math.random() * 300);
            await new Promise(r => setTimeout(r, delay));
          }
        }
        sendResponse({ success: false, data: lastError || { msg: 'upload_failed' } });
      } catch (e) {
        sendResponse({ success: false, error: e.toString() });
      }
})();
    return true;
  }

  if (message.type === 'SIGN_REQUEST') {
    (async () => {
      try {
        const domains = [
          "https://www.xiaohongshu.com",
          "https://edith.xiaohongshu.com"
        ];
        const cookiesLists = await Promise.all(domains.map(url => chrome.cookies.getAll({ url })));
        const cookieMap = new Map();
        const addCookies = (list) => {
          list.forEach(c => {
            cookieMap.set(c.name, c.value);
          });
        };
        cookiesLists.forEach(addCookies);
        const cookieStr = Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
        const finalCookie = cookieStr || message.payload.cookie || '';
        const { uri, method, data } = message.payload;

        const raw = JSON.stringify({
          cookie: finalCookie,
          method: method || 'GET',
          uri,
          payload: data
        });

        const response = await fetch("http://122.51.104.47:8080/xhs/headers", {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: raw,
          redirect: 'follow'
        });
        const result = await response.json();
        sendResponse({ success: true, data: result });
      } catch (error) {
        sendResponse({ success: false, error: error.toString() });
      }
    })();
    return true; // 异步响应
  }

  if (message.type === 'OPEN_SIDE_PANEL_DEVTOOLS') {
    // 尝试在新标签页中打开 sidepanel.html 以方便调试
    chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel.html') });
    sendResponse({ success: true });
    return true;
  }

  // Quick Collect Handler in Background
  if (message.type === 'QUICK_COLLECT_NOTE') {
    handleQuickCollect(message, sender);
    sendResponse({ received: true });
    return true;
  }
});

// --- Quick Collect Logic in Background ---
async function handleQuickCollect(message, sender) {
  const tabId = sender.tab ? sender.tab.id : null;
  if (!tabId) return;

  const notify = (msg, status = 'info') => {
    chrome.tabs.sendMessage(tabId, { action: 'COLLECT_STATUS', message: msg, status: status }).catch(() => {});
  };

  try {
    const url = (message.payload && message.payload.url) || '';
    if (!url) throw new Error('未获取到笔记URL');

    console.log('[Background] Quick collect start:', url);

    // 1. Get Config
    const { feishu_config } = await chrome.storage.local.get(['feishu_config']);
    // 我们只需要 tableDailyId (日常采集库)
    if (!feishu_config || !feishu_config.bearer || !feishu_config.link || !feishu_config.tableDailyId) {
      notify('请先在侧边栏配置日常采集库 ID', 'error');
      return;
    }

    notify('已添加至日常采集', 'loading');

    // 2. Sync Link Only to Daily Table
    await syncLinkToDailyTable(url, feishu_config);
    
    notify('采集成功', 'success');

  } catch (e) {
    console.error('[Background] Quick collect error:', e);
    notify('失败: ' + e.message, 'error');
  }
}

async function syncLinkToDailyTable(linkUrl, config) {
  const { bearer, link, tableDailyId } = config;
  
  // App Token Logic
  let appToken = '';
  if (link.includes('/base/')) {
      const match = link.match(/\/base\/([a-zA-Z0-9]+)/);
      if (match) appToken = match[1];
  } else {
      appToken = link;
  }

  const record = {
    fields: {
      "链接": linkUrl
    }
  };

  // Create Record
  const createUrl = `https://base-api.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableDailyId}/records/batch_create`;
  const res = await fetch(createUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${bearer}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ records: [record] })
  });
  
  const resData = await res.json();
  if (resData.code !== 0) {
    throw new Error(resData.msg || '同步失败');
  }
}

function genFileName(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    let ext = 'jpeg';
    if (path.endsWith('.jpg') || path.endsWith('.jpeg')) ext = 'jpeg';
    else if (path.endsWith('.png')) ext = 'png';
    else if (path.endsWith('.webp')) ext = 'webp';
    return `xhs_${Date.now()}.${ext}`;
  } catch {
    return `xhs_${Date.now()}.jpeg`;
  }
}

function crc32(bytes) {
  const table = CRC32_TABLE;
  let crc = 0 ^ -1;
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ bytes[i]) & 0xff];
  }
  return crc ^ -1;
}

const CRC32_TABLE = (() => {
  const table = new Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

const MEDIA_TOKEN_CACHE = new Map();

// 辅助函数：文件名与 CRC32 计算
