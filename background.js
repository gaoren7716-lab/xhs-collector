// background.js —— 小红书采集工作台 后台服务

// ---------- 1. SidePanel 行为 ----------
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// ---------- 2. 捕获 XHS 请求头（登录态实时头） ----------
const TARGET_HEADERS = ['x-s', 'x-s-common', 'x-t', 'xy-direction', 'x-xray-traceid', 'x-rap-param', 'x-b3-traceid', 'cookie'];
let capturedHeaders = {};

chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    let hasUpdate = false;
    details.requestHeaders.forEach(header => {
      if (TARGET_HEADERS.includes(header.name.toLowerCase())) {
        capturedHeaders[header.name.toLowerCase()] = header.value;
        hasUpdate = true;
      }
    });
    if (hasUpdate) chrome.storage.local.set({ xhs_headers: capturedHeaders });
  },
  { urls: ["https://*.xiaohongshu.com/*", "https://edith.xiaohongshu.com/*"] },
  ["requestHeaders", "extraHeaders"]
);

// ---------- 3. 工具：聚合 xiaohongshu cookie ----------
async function getXhsCookieString() {
  const domains = ["https://www.xiaohongshu.com", "https://edith.xiaohongshu.com"];
  const lists = await Promise.all(domains.map(url => chrome.cookies.getAll({ url })));
  const map = new Map();
  lists.flat().forEach(c => map.set(c.name, c.value));
  return Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

// ---------- 4. 通用 XHS API 请求（核心） ----------
// 默认复用实时捕获头；若配置了 sign_server 则走远程签名（逃生口）。
async function xhsFetch(url, { method = 'GET', body = null, useSign = true, extraHeaders = {} } = {}) {
  let headers = {};
  const cfg = await chrome.storage.local.get(['xhs_headers', 'sign_server']);
  const captured = cfg.xhs_headers || capturedHeaders;
  const signServer = (cfg.sign_server || '').trim();

  const cookieStr = await getXhsCookieString();

  if (useSign && signServer) {
    const res = await fetch(signServer, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie: cookieStr, method, uri: new URL(url).pathname + new URL(url).search, payload: body || {} })
    });
    const data = await res.json();
    headers = data.headers || {};
  } else {
    headers = {
      'x-s': captured['x-s'] || '',
      'x-s-common': captured['x-s-common'] || '',
      'x-t': captured['x-t'] || '',
      'x-b3-traceid': captured['x-b3-traceid'] || '',
      'x-xray-traceid': captured['x-xray-traceid'] || ''
    };
  }

  const finalHeaders = {
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'zh-CN,zh;q=0.9',
    'origin': 'https://www.xiaohongshu.com',
    'referer': 'https://www.xiaohongshu.com/',
    'user-agent': navigator.userAgent,
    'Cookie': cookieStr,
    ...headers,
    ...extraHeaders
  };

  const fetchOpts = { method, headers, credentials: 'include' };
  if (body && method !== 'GET') fetchOpts.body = typeof body === 'string' ? body : JSON.stringify(body);

  const resp = await fetch(url, fetchOpts);
  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { ok: resp.ok, status: resp.status, json };
}

// ---------- 5. 消息路由 ----------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_HEADERS') {
    chrome.storage.local.get(['xhs_headers'], (r) => sendResponse(r.xhs_headers || {}));
    return true;
  }

  if (message.type === 'XHS_FETCH') {
    xhsFetch(message.payload.url, message.payload.options || {})
      .then(r => sendResponse(r))
      .catch(e => sendResponse({ ok: false, error: e.toString() }));
    return true;
  }

  // 远程签名（可配置端点，默认空 → 由 xhsFetch 走实时头）
  if (message.type === 'SIGN_REQUEST') {
    (async () => {
      const cfg = await chrome.storage.local.get(['sign_server']);
      const server = (cfg.sign_server || '').trim();
      if (!server) {
        const captured = (await chrome.storage.local.get(['xhs_headers'])).xhs_headers || capturedHeaders;
        const cookie = await getXhsCookieString();
        sendResponse({ success: true, data: { headers: { ...captured, 'Cookie': cookie } } });
        return;
      }
      try {
        const { uri, method, data } = message.payload;
        const cookie = (await getXhsCookieString()) || message.payload.cookie || '';
        const res = await fetch(server, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cookie, method: method || 'GET', uri, payload: data })
        });
        const result = await res.json();
        sendResponse({ success: true, data: result });
      } catch (error) {
        sendResponse({ success: false, error: error.toString() });
      }
    })();
    return true;
  }

  if (message.type === 'FEISHU_CREATE_RECORDS') {
    (async () => {
      try {
        const { appToken, tableId, records, bearer } = message.payload || {};
        const url = `https://base-api.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_create`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${bearer}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ records })
        });
        const data = await res.json();
        sendResponse(data && data.code === 0 ? { success: true, data } : { success: false, data });
      } catch (e) { sendResponse({ success: false, error: e.toString() }); }
    })();
    return true;
  }

  if (message.type === 'FEISHU_UPLOAD_MEDIA') {
    (async () => {
      try {
        const { coverUrl, appToken, bearer, bytes: rawBytes } = message.payload || {};
        if ((!coverUrl && !rawBytes) || !appToken || !bearer) { sendResponse({ success: false, error: 'invalid_payload' }); return; }
        let bytes;
        if (rawBytes && Array.isArray(rawBytes)) bytes = new Uint8Array(rawBytes);
        else {
          const cookie = message.payload.cookie || '';
          const imgRes = await fetch(coverUrl, { headers: cookie ? { 'Cookie': cookie } : {} });
          if (!imgRes.ok) { sendResponse({ success: false, error: `fetch_image_failed_${imgRes.status}` }); return; }
          bytes = new Uint8Array(await imgRes.arrayBuffer());
        }
        const size = bytes.length;
        const fileName = genFileName(coverUrl);
        const fd = new FormData();
        fd.append('file_name', fileName);
        fd.append('parent_type', 'bitable_image');
        fd.append('size', String(size));
        fd.append('parent_node', appToken);
        fd.append('file', new Blob([bytes]), fileName);
        const url = 'https://base-api.feishu.cn/open-apis/drive/v1/medias/upload_all';
        const res = await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${bearer}` }, body: fd });
        const data = await res.json();
        sendResponse(data && data.code === 0 ? { success: true, data } : { success: false, data });
      } catch (e) { sendResponse({ success: false, error: e.toString() }); }
    })();
    return true;
  }

  if (message.type === 'OCR_RECOGNIZE') {
    (async () => {
      try {
        await ensureOffscreen();
        const resp = await chrome.runtime.sendMessage({ type: 'OFFSCREEN_OCR', payload: message.payload });
        sendResponse(resp);
      } catch (e) { sendResponse({ success: false, error: e.toString() }); }
    })();
    return true;
  }

  if (message.type === 'OPEN_SIDE_PANEL_DEVTOOLS') {
    chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel.html') });
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'QUICK_COLLECT_NOTE') {
    handleQuickCollect(message, sender);
    sendResponse({ received: true });
    return true;
  }
});

// ---------- 6. Offscreen 文档管理（本地转写用） ----------
let creatingOffscreen = null;
async function ensureOffscreen() {
  if (chrome.offscreen && chrome.offscreen.hasDocument) {
    const existing = await chrome.offscreen.hasDocument().catch(() => false);
    if (existing) return;
  }
  if (creatingOffscreen) return creatingOffscreen;
  creatingOffscreen = chrome.offscreen.createDocument({
    url: chrome.runtime.getURL('offscreen.html'),
    reasons: ['OCR'],
    justification: '本地转写封面图文字'
  });
  await creatingOffscreen;
  creatingOffscreen = null;
}

// ---------- 7. 快速采集到日常库（保留） ----------
async function handleQuickCollect(message, sender) {
  const tabId = sender.tab ? sender.tab.id : null;
  if (!tabId) return;
  const notify = (msg, status = 'info') => chrome.tabs.sendMessage(tabId, { action: 'COLLECT_STATUS', message: msg, status }).catch(() => {});
  try {
    const url = (message.payload && message.payload.url) || '';
    if (!url) throw new Error('未获取到笔记URL');
    const { feishu_config } = await chrome.storage.local.get(['feishu_config']);
    if (!feishu_config || !feishu_config.bearer || !feishu_config.link || !feishu_config.tableDailyId) {
      notify('请先在侧边栏配置日常采集库 ID', 'error');
      return;
    }
    notify('已添加至日常采集', 'loading');
    await syncLinkToDailyTable(url, feishu_config);
    notify('采集成功', 'success');
  } catch (e) {
    console.error('[Background] Quick collect error:', e);
    notify('失败: ' + e.message, 'error');
  }
}

async function syncLinkToDailyTable(linkUrl, config) {
  const { bearer, link, tableDailyId } = config;
  let appToken = link.includes('/base/') ? (link.match(/\/base\/([a-zA-Z0-9]+)/) || [])[1] : link;
  const record = { fields: { "链接": linkUrl } };
  const createUrl = `https://base-api.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableDailyId}/records/batch_create`;
  const res = await fetch(createUrl, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${bearer}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ records: [record] })
  });
  const resData = await res.json();
  if (resData.code !== 0) throw new Error(resData.msg || '同步失败');
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
  } catch { return `xhs_${Date.now()}.jpeg`; }
}
