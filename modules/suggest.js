// modules/suggest.js —— 联想词采集 + 本地 5 类分类（不调用 LLM）
window.Suggest = (function () {
  const CATEGORIES = ['找服务', '问价格', '做决策', '做对比', '问内容'];

  // 分类词典：子串 → 类别。命中多个时按优先级（靠前的先命中）。
  const DICT = [
    { cat: '找服务', words: ['推荐', '哪家', '哪里', '怎么找', '预约', '联系', '平台', '机构', '公司', '师傅', '上门', '代办', '中介'] },
    { cat: '问价格', words: ['多少钱', '价格', '费用', '收费', '报价', '贵不贵', '便宜', '预算', '多少钱一', '单价', '成本'] },
    { cat: '做决策', words: ['要不要', '值得', '该不该', '可以吗', '靠谱吗', '行不行', '有必要', '能不能', '建议', '怎么选', '是否'] },
    { cat: '做对比', words: ['区别', '对比', '和', '还是', '哪个好', 'vs', '差别', '优劣', '比较', '还是'] },
    { cat: '问内容', words: ['怎么', '什么', '如何', '为什么', '有哪些', '有哪些', '教程', '攻略', '方法', '步骤', '意思'] }
  ];

  function classify(word) {
    for (const d of DICT) {
      if (d.words.some(w => word.includes(w))) return d.cat;
    }
    return '问内容';
  }

  // 编辑词典（存 storage）
  async function getDict() { return new Promise(r => chrome.storage.local.get(['suggest_dict'], x => r(x.suggest_dict || DICT))); }
  async function setDict(d) { await chrome.storage.local.set({ suggest_dict: d }); DICT.length = 0; d.forEach(x => DICT.push(x)); }

  async function fetchSuggest(keyword) {
    const url = `https://edith.xiaohongshu.com/api/sns/web/v1/search/recommend?keyword=${encodeURIComponent(keyword)}`;
    const resp = await chrome.runtime.sendMessage({ type: 'XHS_FETCH', payload: { url, options: { method: 'GET' } } });
    if (!resp || !resp.ok) throw new Error('联想词接口失败: ' + (resp && resp.status));
    const data = resp.json && resp.json.data;
    if (!data) return [];
    // 兼容多种返回结构
    let list = [];
    if (Array.isArray(data)) list = data;
    else if (Array.isArray(data.keywords)) list = data.keywords;
    else if (Array.isArray(data.word_list)) list = data.word_list;
    return list.map(w => (typeof w === 'string' ? w : (w.keyword || w.word || w.text || ''))).filter(Boolean);
  }

  async function collect(keywords) {
    const dict = await getDict();
    const results = [];
    const seen = new Set();
    for (const kw of keywords) {
      try {
        const words = await fetchSuggest(kw);
        words.forEach(w => {
          if (seen.has(w)) return;
          seen.add(w);
          results.push({ word: w, category: classifyWith(w, dict), source: kw });
        });
      } catch (e) { console.warn('[Suggest]', kw, e); }
    }
    return results;
  }

  function classifyWith(word, dict) {
    for (const d of dict) {
      if (d.words.some(w => word.includes(w))) return d.cat;
    }
    return '问内容';
  }

  return { CATEGORIES, classify, collect, getDict, setDict };
})();
