// sidepanel.js —— 小红书采集工作台 主控制器
(function () {
  'use strict';

  // ---------- 通用 ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  function xhsFetch(url, options) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'XHS_FETCH', payload: { url, options: options || {} } }, (r) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        resolve(r);
      });
    });
  }

  async function getActiveXhsTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !/xiaohongshu\.com/.test(tab.url || '')) return null;
    return tab;
  }

  function extractNoteId(url) {
    const m = (url || '').match(/explore\/([a-zA-Z0-9]+)/) || (url || '').match(/discovery\/item\/([a-zA-Z0-9]+)/);
    return m ? m[1] : '';
  }

  function normalizeNote(raw) {
    const n = raw.note_card || raw.note || raw;
    if (!n) return null;
    const user = n.user || {};
    const cover = (n.image_list && n.image_list[0]) || n.cover || {};
    return {
      note_id: n.note_id || raw.note_id || '',
      title: n.title || n.display_title || '无标题',
      desc: n.desc || '',
      type: n.type || '',
      cover: cover.url_default || cover.url_pre || cover.url || (n.image_list && n.image_list[0] && n.image_list[0].url) || '',
      likes: (n.interact_info || {}).liked_count || 0,
      collects: (n.interact_info || {}).collected_count || 0,
      comments: (n.interact_info || {}).comment_count || 0,
      shares: (n.interact_info || {}).share_count || 0,
      user: { id: user.user_id || '', nickname: user.nickname || '', avatar: user.avatar || '' },
      tags: (n.tag_list || []).map(t => t.name || t).filter(Boolean),
      link: `https://www.xiaohongshu.com/explore/${n.note_id || raw.note_id || ''}`
    };
  }

  async function imageToDataURL(url) {
    const cookie = await new Promise(r => chrome.runtime.sendMessage({ type: 'GET_HEADERS' }, h => r((h && h.cookie) || '')));
    const resp = await fetch(url, { headers: cookie ? { Cookie: cookie } : {} });
    if (!resp.ok) throw new Error('图片下载失败 ' + resp.status);
    const blob = await resp.blob();
    return await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    });
  }

  // ---------- Tab 切换 ----------
  $$('.scraper-tab-item').forEach(el => {
    el.addEventListener('click', () => {
      $$('.scraper-tab-item').forEach(x => x.classList.remove('active'));
      $$('.tab-content').forEach(x => x.classList.remove('active'));
      el.classList.add('active');
      $('#' + el.dataset.tab).classList.add('active');
    });
  });
  $$('.sub-tab').forEach(el => {
    el.addEventListener('click', () => {
      $$('.sub-tab').forEach(x => x.classList.remove('active'));
      $$('.sub-content').forEach(x => x.classList.remove('active'));
      el.classList.add('active');
      $('#comment-' + el.dataset.sub).classList.add('active');
    });
  });

  // ---------- 飞书状态指示灯 ----------
  async function refreshFeishuStatus() {
    const ok = await Feishu.isConnected();
    const el = $('#feishu-status');
    el.textContent = ok ? '飞书已连接' : '飞书未连接';
    el.className = 'feishu-dot ' + (ok ? 'on' : '');
  }

  // ================= 单篇 =================
  let singleNote = null;
  $('#btn-parse-single').addEventListener('click', async () => {
    const tab = await getActiveXhsTab();
    const id = tab && extractNoteId(tab.url);
    if (!id) { $('#status-single').textContent = '请先打开一篇小红书笔记'; return; }
    $('#status-single').textContent = '解析中…';
    try {
      const url = `https://edith.xiaohongshu.com/api/sns/web/v1/feed?note_id=${id}&carry_recmd=0&image_formats=jpg,webp,avif`;
      const resp = await xhsFetch(url);
      const items = (resp.json && resp.json.data && (resp.json.data.items || resp.json.data.notes)) || [];
      const note = normalizeNote(items[0] || {});
      if (!note || !note.note_id) throw new Error('解析失败');
      singleNote = note;
      Cache.putRaw('note_' + note.note_id, note);
      $('#single-detail').innerHTML = `
        <div class="note-card">
          <img src="${note.cover}" class="note-cover" onerror="this.style.display='none'">
          <div class="note-meta">
            <div class="note-title">${esc(note.title)}</div>
            <div class="note-sub">${esc(note.user.nickname)} · ❤️${note.likes} · 💬${note.comments} · ⭐${note.collects}</div>
            <div class="note-tags">${(note.tags || []).map(t => '#' + esc(t)).join(' ')}</div>
            <div class="note-desc">${esc(note.desc).slice(0, 120)}</div>
          </div>
        </div>`;
      $('#status-single').textContent = '解析完成，可采集到飞书';
    } catch (e) { $('#status-single').textContent = '错误：' + e.message; }
  });

  $('#btn-sync-single').addEventListener('click', async () => {
    if (!singleNote) { $('#status-single').textContent = '请先解析'; return; }
    try {
      // 尝试本地转写封面
      let ocr = '';
      try { const d = await imageToDataURL(singleNote.cover); const r = await chrome.runtime.sendMessage({ type: 'OCR_RECOGNIZE', payload: { image: d } }); if (r && r.success) ocr = r.text; } catch (e) {}
      if (ocr) Cache.putOcr('note_' + singleNote.note_id, { ocr });
      await Feishu.syncRecord('note', {
        '笔记ID': singleNote.note_id, '标题': singleNote.title, '链接': singleNote.link,
        '昵称': singleNote.user.nickname, '点赞': singleNote.likes, '评论': singleNote.comments,
        '收藏': singleNote.collects, '标签': (singleNote.tags || []).join(','), '识别稿': ocr
      });
      $('#status-single').textContent = '已同步到飞书';
    } catch (e) { $('#status-single').textContent = '同步失败：' + e.message; }
  });

  // ================= 关键词 =================
  let kwNotes = [];
  async function searchNotes(keyword, type, sort, page) {
    const params = new URLSearchParams({ keyword, page: String(page), page_size: '20', note_type: type, sort: sort || 'general', image_formats: 'jpg,webp,avif' });
    const url = `https://edith.xiaohongshu.com/api/sns/web/v1/search/notes?${params}`;
    const resp = await xhsFetch(url);
    if (!resp.ok) throw new Error('搜索失败 ' + resp.status);
    const d = resp.json.data || {};
    const items = d.items || d.notes || [];
    return items.map(normalizeNote).filter(Boolean);
  }

  $('#btn-kw-start').addEventListener('click', async () => {
    const kw = $('#kw-input').value.trim();
    if (!kw) { $('#kw-progress').textContent = '请输入关键词'; return; }
    const type = $('#kw-type').value;
    const sort = $('#kw-time').value;
    kwNotes = []; const seen = new Set();
    $('#kw-progress').textContent = '采集中…';
    try {
      for (let p = 0; p < 10 && kwNotes.length < 200; p++) {
        const batch = await searchNotes(kw, type, sort, p);
        if (!batch.length) break;
        batch.forEach(n => { if (!seen.has(n.note_id)) { seen.add(n.note_id); kwNotes.push(n); } });
        $('#kw-progress').textContent = `已采集 ${kwNotes.length} 篇`;
        await new Promise(r => setTimeout(r, 1200 + Math.random() * 1500));
      }
      renderKwList();
      $('#kw-progress').textContent = `已采集 ${kwNotes.length} 篇`;
    } catch (e) { $('#kw-progress').textContent = '错误：' + e.message; }
  });

  function renderKwList() {
    const box = $('#kw-list');
    if (!kwNotes.length) { box.innerHTML = '<div class="empty-state"><div class="empty-state-title">没有数据</div></div>'; return; }
    box.innerHTML = kwNotes.map(n => `
      <div class="note-row">
        <img src="${n.cover}" class="row-cover" onerror="this.style.display='none'">
        <div class="row-meta">
          <div class="row-title">${esc(n.title)}</div>
          <div class="row-sub">${esc(n.user.nickname)} · ❤️${n.likes} · 💬${n.comments}</div>
        </div>
      </div>`).join('');
  }

  $('#btn-kw-sync').addEventListener('click', async () => {
    if (!kwNotes.length) return;
    try {
      const r = await Feishu.syncBatch('note', kwNotes.map(n => ({
        '笔记ID': n.note_id, '标题': n.title, '链接': n.link, '昵称': n.user.nickname,
        '点赞': n.likes, '评论': n.comments, '收藏': n.collects
      })));
      $('#kw-progress').textContent = `已同步 ${r.ok} 篇（失败 ${r.fail}）`;
    } catch (e) { $('#kw-progress').textContent = '同步失败：' + e.message; }
  });

  $('#btn-kw-export').addEventListener('click', () => {
    Exporter.toExcel(kwNotes, '关键词采集.xlsx', [
      { key: 'note_id', label: '笔记ID' }, { key: 'title', label: '标题' }, { key: 'link', label: '链接' },
      { key: 'user.nickname', label: '昵称' }, { key: 'likes', label: '点赞' }, { key: 'comments', label: '评论' }, { key: 'collects', label: '收藏' }
    ]);
  });

  // ================= 联想词 =================
  let suggestRows = [];
  $('#btn-suggest').addEventListener('click', async () => {
    const kws = $('#suggest-input').value.split('\n').map(s => s.trim()).filter(Boolean);
    if (!kws.length) return;
    $('#suggest-list').innerHTML = '<div class="empty-state"><div class="empty-state-title">采集中…</div></div>';
    suggestRows = await Suggest.collect(kws);
    renderSuggest();
  });

  function renderSuggest() {
    const box = $('#suggest-list');
    if (!suggestRows.length) { box.innerHTML = '<div class="empty-state"><div class="empty-state-title">没有数据</div></div>'; return; }
    box.innerHTML = `<table class="data-table"><thead><tr><th>联想词</th><th>分类</th><th>来源</th></tr></thead><tbody>` +
      suggestRows.map(r => `<tr><td>${esc(r.word)}</td><td>${esc(r.category)}</td><td>${esc(r.source)}</td></tr>`).join('') + '</tbody></table>';
  }

  $('#btn-suggest-sync').addEventListener('click', async () => {
    if (!suggestRows.length) return;
    try {
      const r = await Feishu.syncBatch('suggest', suggestRows.map(s => ({ '联想词': s.word, '分类': s.category, '来源': s.source })));
      alert(`已同步 ${r.ok} 条（失败 ${r.fail}）`);
    } catch (e) { alert('同步失败：' + e.message); }
  });
  $('#btn-suggest-export').addEventListener('click', () => {
    Exporter.toExcel(suggestRows, '联想词.xlsx', [{ key: 'word', label: '联想词' }, { key: 'category', label: '分类' }, { key: 'source', label: '来源' }]);
  });

  // ================= 矩阵 =================
  async function renderMatrix() {
    const list = await Matrix.load();
    const box = $('#matrix-list');
    if (!list.length) { box.innerHTML = '<div class="empty-state"><div class="empty-state-title">还没有存档账号</div></div>'; return; }
    box.innerHTML = list.map((p, i) => `
      <div class="note-row">
        <div class="row-meta"><div class="row-title">${esc(p.name)}</div><div class="row-sub">${p.cookies.length} 个 cookie</div></div>
        <div class="row-actions">
          <button class="md-btn md-btn-outlined md-btn-small" data-switch="${i}">切换</button>
          <button class="md-btn md-btn-outlined md-btn-small" data-del="${i}">删除</button>
        </div>
      </div>`).join('');
    $$('[data-switch]', box).forEach(b => b.addEventListener('click', async () => {
      try { await Matrix.switchTo(list[+b.dataset.switch].name); alert('已切换，请刷新小红书标签页'); }
      catch (e) { alert('切换失败：' + e.message); }
    }));
    $$('[data-del]', box).forEach(b => b.addEventListener('click', async () => {
      await Matrix.remove(list[+b.dataset.del].name); renderMatrix();
    }));
  }
  $('#btn-matrix-save').addEventListener('click', async () => {
    const name = $('#matrix-name').value.trim();
    if (!name) { alert('请输入账号名'); return; }
    await Matrix.saveCurrent(name);
    $('#matrix-name').value = '';
    renderMatrix();
  });

  // ================= 评论 =================
  $('#btn-comment-cur').addEventListener('click', async () => {
    const tab = await getActiveXhsTab();
    const id = tab && extractNoteId(tab.url);
    if (!id) { $('#comment-cur-result').innerHTML = '<div class="status-line">请打开一篇笔记</div>'; return; }
    $('#comment-cur-result').innerHTML = '<div class="status-line">采集中…</div>';
    try {
      const q = $('#comment-hot').checked, rp = $('#comment-reply').checked;
      const all = []; let cursor = '', has = true;
      while (has) {
        const params = new URLSearchParams({ note_id: id, cursor, image_formats: 'jpg,webp,avif', has_rewrite: '1' });
        if (q) params.set('scene', 'hot');
        const resp = await xhsFetch(`https://edith.xiaohongshu.com/api/sns/web/v1/comment/page?${params}`);
        const d = resp.json.data || {};
        (d.comments || []).forEach(c => all.push({ user: (c.user_info||{}).nickname||'', content: c.content||'', time: c.create_time||'', ip: c.ip_location||'', reply: c.sub_comment_count||0 }));
        has = d.has_more; cursor = d.cursor || '';
        if (!has) break;
        await new Promise(r => setTimeout(r, 1000));
      }
      $('#comment-cur-result').innerHTML = `<div class="status-line">共 ${all.length} 条</div>` + all.slice(0, 50).map(c => `<div class="cmt"><b>${esc(c.user)}</b>：${esc(c.content)} <span class="cmt-ip">${esc(c.ip)}</span></div>`).join('');
      window.__curComments = all;
    } catch (e) { $('#comment-cur-result').innerHTML = '<div class="status-line">错误：' + e.message + '</div>'; }
  });

  $('#btn-comment-add').addEventListener('click', async () => {
    const urls = $('#comment-urls').value.split('\n').map(s => s.trim()).filter(Boolean);
    if (!urls.length) return;
    await CommentsQueue.addLinks(urls, { hotFirst: $('#comment-hot').checked, withReply: $('#comment-reply').checked });
  });
  $('#btn-comment-run').addEventListener('click', () => CommentsQueue.run());
  $('#btn-comment-pause').addEventListener('click', () => CommentsQueue.pause());
  CommentsQueue.onUpdate(async (tasks) => {
    const box = $('#comment-queue');
    if (!tasks.length) { box.innerHTML = '<div class="empty-state"><div class="empty-state-title">队列为空</div></div>'; return; }
    box.innerHTML = tasks.map(t => `
      <div class="note-row">
        <span class="status-dot ${t.status}"></span>
        <div class="row-meta"><div class="row-title">${esc(t.noteId)}</div><div class="row-sub">${statusText(t.status)} · ${t.comments.length} 条</div></div>
      </div>`).join('');
  });
  $('#btn-comment-sync').addEventListener('click', async () => {
    const tasks = await CommentsQueue.all();
    const done = tasks.filter(t => t.status === 'done');
    if (!done.length) { alert('没有已完成任务'); return; }
    const rows = [];
    done.forEach(t => t.comments.forEach(c => rows.push({ '笔记ID': t.noteId, '用户': c.user, '评论': c.content, 'IP': c.ip, '回复数': c.replyCount })));
    try { const r = await Feishu.syncBatch('comment', rows); alert(`已同步 ${r.ok} 条（失败 ${r.fail}）`); }
    catch (e) { alert('同步失败：' + e.message); }
  });
  function statusText(s) { return { waiting: '等待中', running: '采集中', done: '已完成', fail: '失败' }[s] || s; }

  // ================= 收藏 =================
  let collectNotes = [];
  $('#btn-collect-load').addEventListener('click', async () => {
    $('#collect-count').textContent = '读取中…';
    collectNotes = []; const seen = new Set();
    try {
      let cursor = '', has = true;
      while (has && collectNotes.length < 200) {
        const params = new URLSearchParams({ cursor, image_formats: 'jpg,webp,avif', need_recmd: '0' });
        const resp = await xhsFetch(`https://edith.xiaohongshu.com/api/sns/web/v2/note/collect/page?${params}`);
        const d = resp.json.data || {};
        (d.notes || []).forEach(n => { const note = normalizeNote(n); if (note && !seen.has(note.note_id)) { seen.add(note.note_id); collectNotes.push(note); } });
        has = d.has_more; cursor = d.cursor || '';
        if (!has) break;
        await new Promise(r => setTimeout(r, 1000));
      }
      renderCollect();
      $('#collect-count').textContent = `共 ${collectNotes.length} 篇，已选 ${collectNotes.filter(n => n._sel).length} 篇`;
    } catch (e) { $('#collect-count').textContent = '错误：' + e.message; }
  });
  function renderCollect() {
    const box = $('#collect-list');
    if (!collectNotes.length) { box.innerHTML = '<div class="empty-state"><div class="empty-state-title">没有数据</div></div>'; return; }
    box.innerHTML = collectNotes.map((n, i) => `
      <div class="note-row">
        <input type="checkbox" data-sel="${i}" ${n._sel ? 'checked' : ''}>
        <img src="${n.cover}" class="row-cover" onerror="this.style.display='none'">
        <div class="row-meta"><div class="row-title">${esc(n.title)}</div><div class="row-sub">${esc(n.user.nickname)} · ❤️${n.likes}</div></div>
      </div>`).join('');
    $$('[data-sel]', box).forEach(c => c.addEventListener('change', () => { collectNotes[+c.dataset.sel]._sel = c.checked; $('#collect-count').textContent = `已选 ${collectNotes.filter(n => n._sel).length} 篇`; }));
  }
  $('#btn-collect-sync').addEventListener('click', async () => {
    const sel = collectNotes.filter(n => n._sel);
    if (!sel.length) { alert('请勾选'); return; }
    try { const r = await Feishu.syncBatch('note', sel.map(n => ({ '笔记ID': n.note_id, '标题': n.title, '链接': n.link, '昵称': n.user.nickname, '点赞': n.likes }))); alert(`已同步 ${r.ok} 篇`); }
    catch (e) { alert('同步失败：' + e.message); }
  });
  $('#btn-collect-export').addEventListener('click', () => {
    Exporter.toExcel(collectNotes.filter(n => n._sel), '收藏采集.xlsx', [{ key: 'note_id', label: '笔记ID' }, { key: 'title', label: '标题' }, { key: 'link', label: '链接' }, { key: 'user.nickname', label: '昵称' }, { key: 'likes', label: '点赞' }]);
  });

  // ================= 配置 =================
  async function loadConfig() {
    const cfg = await new Promise(r => chrome.storage.local.get(['feishu_config', 'sign_server', 'collect_delay'], x => r(x)));
    if (cfg.feishu_config) {
      $('#cfg-bearer').value = cfg.feishu_config.bearer || '';
      $('#cfg-link').value = cfg.feishu_config.link || '';
      $('#cfg-profile').value = cfg.feishu_config.tableProfileId || '';
      $('#cfg-note').value = cfg.feishu_config.tableNoteId || '';
      $('#cfg-comment').value = cfg.feishu_config.tableCommentId || '';
      $('#cfg-suggest').value = cfg.feishu_config.tableSuggestId || '';
      $('#cfg-daily').value = cfg.feishu_config.tableDailyId || '';
    }
    $('#cfg-sign').value = cfg.sign_server || '';
    $('#cfg-delay').value = cfg.collect_delay || 6;
  }
  $('#btn-cfg-save').addEventListener('click', async () => {
    const feishu_config = {
      bearer: $('#cfg-bearer').value.trim(), link: $('#cfg-link').value.trim(),
      tableProfileId: $('#cfg-profile').value.trim(), tableNoteId: $('#cfg-note').value.trim(),
      tableCommentId: $('#cfg-comment').value.trim(), tableSuggestId: $('#cfg-suggest').value.trim(),
      tableDailyId: $('#cfg-daily').value.trim()
    };
    await chrome.storage.local.set({ feishu_config });
    refreshFeishuStatus();
    alert('已保存');
  });
  $('#btn-adv-save').addEventListener('click', async () => {
    await chrome.storage.local.set({ sign_server: $('#cfg-sign').value.trim(), collect_delay: +$('#cfg-delay').value || 6 });
    alert('已保存');
  });
  $('#btn-ocr-load').addEventListener('click', async () => {
    $('#ocr-status').textContent = '下载模型中…（首次约 10MB）';
    try {
      const d = await imageToDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC');
      const r = await chrome.runtime.sendMessage({ type: 'OCR_RECOGNIZE', payload: { image: d } });
      if (r && r.success) { $('#ocr-status').textContent = '已就绪（本地转写可用）'; }
      else { $('#ocr-status').textContent = '加载失败：' + (r && r.error); }
    } catch (e) { $('#ocr-status').textContent = '加载失败：' + e.message; }
  });
  $('#btn-cache-clear').addEventListener('click', async () => {
    await Cache.clearAll();
    $('#cache-status').textContent = '缓存已清理';
  });
  async function refreshCache() {
    const raw = await Cache.rawCount(); const ocr = await Cache.ocrCount();
    $('#cache-status').textContent = `原始素材 ${raw} 条 · 识别稿 ${ocr} 条`;
  }

  // ---------- 启动 ----------
  refreshFeishuStatus();
  loadConfig();
  renderMatrix();
  refreshCache();

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
})();
