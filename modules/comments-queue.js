// modules/comments-queue.js —— 评论批量链接采集 + 任务队列（IndexedDB）
window.CommentsQueue = (function () {
  const DB = 'xhs-comments';
  const STORE = 'tasks';
  let running = false;
  let paused = false;
  let listeners = [];

  function onUpdate(fn) { listeners.push(fn); }
  function emit(tasks) { listeners.forEach(fn => fn(tasks)); }

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'url' }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function tx(mode) { return openDB().then(db => db.transaction(STORE, mode).objectStore(STORE)); }

  async function put(task) {
    const st = await tx('readwrite');
    return new Promise((res, rej) => { const r = st.put(task); r.onsuccess = () => res(); r.onerror = () => rej(r.error); });
  }
  async function all() {
    const st = await tx('readonly');
    return new Promise((res, rej) => { const r = st.getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error); });
  }

  function extractNoteId(url) {
    const m = url.match(/explore\/([a-zA-Z0-9]+)/) || url.match(/discovery\/item\/([a-zA-Z0-9]+)/) || url.match(/search_result.*?[?&]note_id=([a-zA-Z0-9]+)/);
    return m ? m[1] : '';
  }

  async function addLinks(urls, { hotFirst = false, withReply = false } = {}) {
    for (const url of urls) {
      const noteId = extractNoteId(url);
      if (!noteId) continue;
      await put({ url, noteId, status: 'waiting', comments: [], hotFirst, withReply, ts: Date.now() });
    }
    emit(await all());
  }

  async function fetchComments(noteId, cursor = '', hotFirst, withReply) {
    const params = new URLSearchParams({ note_id: noteId, cursor, image_formats: 'jpg,webp,avif', has_rewrite: '1' });
    if (hotFirst) params.set('scene', 'hot');
    const url = `https://edith.xiaohongshu.com/api/sns/web/v1/comment/page?${params}`;
    const resp = await chrome.runtime.sendMessage({ type: 'XHS_FETCH', payload: { url, options: { method: 'GET' } } });
    if (!resp || !resp.ok) throw new Error('评论接口失败 ' + (resp && resp.status));
    const d = resp.json.data || {};
    const comments = (d.comments || []).map(c => ({
      id: c.id,
      user: (c.user_info || {}).nickname || '',
      avatar: (c.user_info || {}).image || '',
      content: c.content || '',
      time: c.create_time || '',
      ip: c.ip_location || '',
      replyCount: c.sub_comment_count || 0,
      subComments: (withReply && c.sub_comments) ? c.sub_comments.map(s => ({ user: (s.user_info||{}).nickname||'', content: s.content||'' })) : []
    }));
    return { comments, cursor: d.cursor || '', hasMore: d.has_more };
  }

  async function run() {
    if (running) return;
    running = true; paused = false;
    while (running && !paused) {
      const tasks = await all();
      const task = tasks.find(t => t.status === 'waiting');
      if (!task) break;
      task.status = 'running';
      await put(task); emit(await all());
      try {
        let cursor = '';
        let hasMore = true;
        const collected = [];
        while (hasMore && running && !paused) {
          const r = await fetchComments(task.noteId, cursor, task.hotFirst, task.withReply);
          collected.push(...r.comments);
          hasMore = r.hasMore;
          cursor = r.cursor;
          await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));
        }
        task.comments = collected;
        task.status = 'done';
      } catch (e) {
        task.status = 'fail';
        task.error = e.message;
      }
      await put(task); emit(await all());
    }
    running = false;
    emit(await all());
  }

  function pause() { paused = true; }
  function isRunning() { return running; }

  return { addLinks, run, pause, isRunning, all, onUpdate, extractNoteId };
})();
