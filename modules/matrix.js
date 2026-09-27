// modules/matrix.js —— 矩阵号：多账号 cookie 存档与切换（轻量版，不做指纹伪装）
window.Matrix = (function () {
  const KEY = 'matrix_profiles';
  const DOMAINS = ['www.xiaohongshu.com', 'edith.xiaohongshu.com', 'xiaohongshu.com'];

  function load() { return new Promise(r => chrome.storage.local.get([KEY], x => r(x[KEY] || []))); }
  function save(list) { return chrome.storage.local.set({ [KEY]: list }); }

  async function saveCurrent(name) {
    const cookies = [];
    for (const d of DOMAINS) {
      const cs = await chrome.cookies.getAll({ url: 'https://' + d });
      cs.forEach(c => cookies.push({ name: c.name, value: c.value, domain: c.domain, path: c.path, secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite, expirationDate: c.expirationDate }));
    }
    const list = await load();
    const idx = list.findIndex(p => p.name === name);
    const entry = { name, cookies, ts: Date.now() };
    if (idx >= 0) list[idx] = entry; else list.push(entry);
    await save(list);
    return list;
  }

  async function remove(name) {
    const list = (await load()).filter(p => p.name !== name);
    await save(list);
    return list;
  }

  async function switchTo(name) {
    const list = await load();
    const profile = list.find(p => p.name === name);
    if (!profile) throw new Error('未找到账号：' + name);
    // 清掉当前账号 cookie
    for (const d of DOMAINS) {
      const cur = await chrome.cookies.getAll({ url: 'https://' + d });
      for (const c of cur) { try { await chrome.cookies.remove({ url: 'https://' + stripDot(c.domain) + c.path, name: c.name }); } catch (e) {} }
    }
    // 注入目标账号 cookie
    for (const c of profile.cookies) {
      const url = 'https://' + stripDot(c.domain) + (c.path || '/');
      const ck = { url, name: c.name, value: c.value, path: c.path || '/', secure: !!c.secure };
      if (c.expirationDate) ck.expirationDate = c.expirationDate;
      if (c.sameSite) ck.sameSite = c.sameSite;
      try { await chrome.cookies.set(ck); } catch (e) { console.warn('[Matrix] set cookie fail', c.name, e); }
    }
    return true;
  }

  function stripDot(domain) { return domain.startsWith('.') ? domain.slice(1) : domain; }

  return { load, saveCurrent, remove, switchTo };
})();
