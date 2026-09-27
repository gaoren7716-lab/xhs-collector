// modules/feishu.js —— 飞书多维表格同步（五张表）
window.Feishu = (function () {
  // 五张表的字段约定（与模板一致）
  const TABLE_KEYS = ['profile', 'note', 'comment', 'suggest', 'daily'];

  function getConfig() {
    return new Promise(res => chrome.storage.local.get(['feishu_config'], r => res(r.feishu_config || {})));
  }

  function parseAppToken(link) {
    if (!link) return '';
    if (link.includes('/base/')) {
      const m = link.match(/\/base\/([a-zA-Z0-9]+)/);
      return m ? m[1] : '';
    }
    return link.trim();
  }

  // 单条字段写入指定表（自动按 tableKey 取对应 tableId）
  async function syncRecord(tableKey, fields) {
    const cfg = await getConfig();
    if (!cfg.bearer || !cfg.link) throw new Error('飞书未配置');
    const tableId = cfg['table' + cap(tableKey) + 'Id'];
    if (!tableId) throw new Error('缺少表 ID：' + tableKey);
    const appToken = parseAppToken(cfg.link);
    const resp = await chrome.runtime.sendMessage({
      type: 'FEISHU_CREATE_RECORDS',
      payload: { appToken, tableId, bearer: cfg.bearer, records: [{ fields }] }
    });
    if (!resp || !resp.success) throw new Error((resp && resp.data && resp.data.msg) || '同步失败');
    return resp.data;
  }

  // 批量写入
  async function syncBatch(tableKey, fieldsList) {
    const cfg = await getConfig();
    if (!cfg.bearer || !cfg.link) throw new Error('飞书未配置');
    const tableId = cfg['table' + cap(tableKey) + 'Id'];
    if (!tableId) throw new Error('缺少表 ID：' + tableKey);
    const appToken = parseAppToken(cfg.link);
    // 每批最多 100 条（飞书限制），分批
    let ok = 0, fail = 0;
    for (let i = 0; i < fieldsList.length; i += 100) {
      const batch = fieldsList.slice(i, i + 100);
      const resp = await chrome.runtime.sendMessage({
        type: 'FEISHU_CREATE_RECORDS',
        payload: { appToken, tableId, bearer: cfg.bearer, records: batch.map(f => ({ fields: f })) }
      });
      if (resp && resp.success) ok += batch.length; else fail += batch.length;
    }
    return { ok, fail };
  }

  // 上传图片拿到 file_token（用于飞书图片字段）
  async function uploadMedia(coverUrl) {
    const cfg = await getConfig();
    if (!cfg.bearer || !cfg.link) throw new Error('飞书未配置');
    const appToken = parseAppToken(cfg.link);
    const resp = await chrome.runtime.sendMessage({
      type: 'FEISHU_UPLOAD_MEDIA',
      payload: { coverUrl, appToken, bearer: cfg.bearer }
    });
    if (!resp || !resp.success) throw new Error('图片上传失败');
    return resp.data.data.file_token;
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function isConnected() {
    return getConfig().then(c => !!(c && c.bearer && c.link));
  }

  return { TABLE_KEYS, syncRecord, syncBatch, uploadMedia, isConnected, getConfig, parseAppToken };
})();
