// scraper-dom.js - DOM Scraping Logic

function extractNoteIdFromUrl(url) {
  try {
    const { pathname } = new URL(url, location.href);
    const match = pathname.match(/\/(?:explore|search_result|discovery\/item|item|note)\/([A-Za-z0-9]+)/);
    return match ? match[1] : '';
  } catch {
    const match = String(url || '').match(/\/(?:explore|search_result|discovery\/item|item|note)\/([A-Za-z0-9]+)/);
    return match ? match[1] : '';
  }
}

function getNoteLink(item) {
  const linkEl = item.querySelector('a[href*="/explore/"], a[href*="/search_result/"], a[href*="/discovery/item/"], a[href*="/item/"], a[href*="/note/"]');
  return linkEl ? linkEl.href : '';
}

/**
 * Scrape Profile Notes from DOM (Fallback/Basic)
 * @param {number} limit 
 * @returns {Array}
 */
function scrapeProfileNotesDom(limit = 30, options = {}) {
  const items = Array.from(document.querySelectorAll('.note-item, .feed-item, section.note-item'));
  
  const notes = items.map(item => {
      const link = getNoteLink(item);
      const noteId = extractNoteIdFromUrl(link);
      
      let cover = '';
      const imgEl = item.querySelector('img');
      if (imgEl) {
          cover = imgEl.src || imgEl.dataset.src || imgEl.getAttribute('data-src') || '';
      } else {
          const bgEl = item.querySelector('.cover');
          if (bgEl) {
              const style = window.getComputedStyle(bgEl);
              cover = style.backgroundImage.slice(5, -2);
          }
      }

      const authorName = item.querySelector('.author .name, .author-name, .user-name, .nickname, .name')?.textContent?.trim();
      return {
          note_id: noteId,
          title: item.querySelector('.title, .footer .title')?.textContent?.trim() || '无标题',
          link: link,
          cover: cover,
          likes: item.querySelector('.like-wrapper .count')?.textContent?.trim() || '0',
          author_name: authorName || document.querySelector('.user-name')?.textContent?.trim() || options.authorFallback || 'Current Page',
          user: { nickname: authorName || '' }
      };
  }).filter(i => i.note_id);

  const seen = new Set();
  const uniqueNotes = notes.filter(note => {
    if (seen.has(note.note_id)) return false;
    seen.add(note.note_id);
    return true;
  });

  // Enforce limit slicing
  const target = Math.max(30, Math.min(parseInt(limit) || 30, 5000));
  return uniqueNotes.slice(0, target);
}

/**
 * Scroll page to load more notes in DOM
 * @param {number} limit 
 * @param {Array} existing 
 * @returns {Array}
 */
async function scrapeProfileNotesDomScroll(limit = 30, existing = [], options = {}) {
  const target = Math.max(30, Math.min(parseInt(limit) || 30, 5000));
  const existingIds = new Set((existing || []).map(n => n.note_id));
  
  let stagnantTries = 0;
  let lastCount = 0;
  const maxTries = 20;
  
  while (scrapeProfileNotesDom(target, options).length < target && stagnantTries < maxTries) {
      if (window.__stopScraping) {
          window.__stopScraping = false;
          break;
      }
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      // 增加延迟：2000-3000ms
      await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
      
      const currCount = scrapeProfileNotesDom(target, options).length;
      if (currCount <= lastCount) {
          stagnantTries++;
      } else {
          stagnantTries = 0;
          lastCount = currCount;
          try {
            chrome.runtime.sendMessage({
              type: 'SCRAPE_PROGRESS',
              payload: { context: 'profile-notes', count: currCount, total: target }
            });
          } catch {}
      }
  }
  
  const domNotes = scrapeProfileNotesDom(target, options);
  return domNotes.filter(n => n.note_id && !existingIds.has(n.note_id));
}

async function scrapeSearchNotesDomScroll(limit = 30) {
  const notes = await scrapeProfileNotesDomScroll(limit, [], { authorFallback: 'Search Result' });
  return {
    type: 'Search Notes (DOM)',
    keyword: new URLSearchParams(location.search).get('keyword') || '',
    count: notes.length,
    notes
  };
}

function decodeSearchKeyword(value) {
  let keyword = value || '';
  for (let i = 0; i < 2 && keyword.includes('%'); i++) {
    try { keyword = decodeURIComponent(keyword); } catch { break; }
  }
  return keyword;
}

function getCurrentSearchParams() {
  const params = new URLSearchParams(location.search);
  const keyword = decodeSearchKeyword(params.get('keyword') || '');
  let searchId = params.get('search_id') || '';

  if (!searchId) {
    const entries = performance.getEntriesByType('resource')
      .map(entry => entry.name)
      .filter(url => url.includes('/api/sns/web/v1/search/filter'));
    const lastUrl = entries[entries.length - 1] || '';
    try { searchId = new URL(lastUrl).searchParams.get('search_id') || ''; } catch {}
  }

  if (!searchId) {
    const text = Array.from(document.querySelectorAll('script'))
      .map(script => script.textContent || '')
      .find(source => source.includes('search_id') || source.includes('searchId')) || '';
    const match = text.match(/"search(?:_id|Id)"\s*:\s*"([^"]+)"/);
    if (match) searchId = match[1];
  }

  return { keyword, searchId };
}

function normalizeSearchNote(raw) {
  const note = raw.note_card || raw.note || raw;
  const noteId = note.note_id || note.id || raw.note_id || raw.id || '';
  if (!noteId) return null;
  const user = note.user || raw.user || {};
  const cover = note.cover || raw.cover || {};
  const firstImage = (note.image_list || raw.image_list || [])[0] || {};
  const xsecToken = note.xsec_token || raw.xsec_token || '';
  return {
    note_id: noteId,
    title: note.display_title || note.title || raw.display_title || raw.title || '无标题',
    type: note.type || raw.type || '',
    cover: cover.url_default || cover.url || firstImage.url_default || firstImage.url_pre || firstImage.url || '',
    likes: (note.interact_info || raw.interact_info || {}).liked_count || 0,
    xsec_token: xsecToken,
    user: {
      id: user.user_id || user.id || '',
      nickname: user.nickname || user.nick_name || '',
      avatar: user.avatar || ''
    },
    link: `https://www.xiaohongshu.com/explore/${noteId}?xsec_token=${xsecToken || ''}&xsec_source=pc_search`
  };
}

function collectSearchNotesFromJson(value, out = []) {
  if (!value) return out;
  if (Array.isArray(value)) {
    value.forEach(item => collectSearchNotesFromJson(item, out));
    return out;
  }
  if (typeof value !== 'object') return out;
  if (value.note_card || value.note_id || (value.note && value.note.note_id)) {
    const note = normalizeSearchNote(value);
    if (note) out.push(note);
    return out;
  }
  Object.values(value).forEach(item => collectSearchNotesFromJson(item, out));
  return out;
}

async function fetchSearchNotesApi(keyword, searchId) {
  if (!keyword || !searchId) return [];
  const uri = "/api/sns/web/v1/search/filter";
  const signPayload = { keyword, search_id: searchId };
  const signResponse = await chrome.runtime.sendMessage({
    type: 'SIGN_REQUEST',
    payload: {
      cookie: document.cookie,
      uri,
      method: "GET",
      data: signPayload
    }
  });
  if (!signResponse.success || !signResponse.data) throw new Error('搜索接口签名失败');

  const signedHeaders = signResponse.data.headers;
  const qs = new URLSearchParams(signPayload).toString();
  const response = await fetch(`https://edith.xiaohongshu.com${uri}?${qs}`, {
    method: 'GET',
    headers: {
      'accept': 'application/json, text/plain, */*',
      'accept-language': 'zh-CN,zh;q=0.9',
      'origin': 'https://www.xiaohongshu.com',
      'referer': 'https://www.xiaohongshu.com/',
      'x-s': signedHeaders['x-s'],
      'x-s-common': signedHeaders['x-s-common'] || '',
      'x-t': signedHeaders['x-t'] || '',
      'x-b3-traceid': signedHeaders['x-b3-traceid'] || '',
      'x-xray-traceid': signedHeaders['x-xray-traceid'] || '',
      'user-agent': navigator.userAgent,
      'Cookie': signedHeaders['Cookie'] || ''
    },
    credentials: 'include'
  });
  if (!response.ok) throw new Error(`搜索接口请求失败: ${response.status}`);
  const json = await response.json();
  if (json && json.success === false) throw new Error(json.msg || '搜索接口返回失败');
  return collectSearchNotesFromJson(json);
}

async function scrapeSearchNotesApi(limit = 30, delayMaxSec = 10, minDelay = 5) {
  const targetLimit = Math.max(30, Math.min(parseInt(limit) || 30, 5000));
  const { keyword } = getCurrentSearchParams();
  const allNotes = [];
  const seen = new Set();
  let stagnantTries = 0;

  const addNotes = notes => {
    const before = allNotes.length;
    notes.forEach(note => {
      if (note.note_id && !seen.has(note.note_id) && allNotes.length < targetLimit) {
        seen.add(note.note_id);
        allNotes.push(note);
      }
    });
    if (allNotes.length !== before) {
      try {
        chrome.runtime.sendMessage({
          type: 'SCRAPE_PROGRESS',
          payload: { context: 'profile-notes', count: allNotes.length, total: targetLimit }
        });
      } catch {}
    }
    return allNotes.length > before;
  };

  while (allNotes.length < targetLimit && stagnantTries < 20) {
    if (window.__stopScraping) {
      window.__stopScraping = false;
      break;
    }

    const { searchId } = getCurrentSearchParams();
    let grew = false;
    try { grew = addNotes(await fetchSearchNotesApi(keyword, searchId)) || grew; } catch (e) { console.warn('[Search API] fallback to DOM', e); }
    grew = addNotes(scrapeProfileNotesDom(targetLimit, { authorFallback: 'Search Result' })) || grew;
    if (allNotes.length >= targetLimit) break;

    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    const max = (delayMaxSec || 10) * 1000;
    const min = (minDelay || 5) * 1000;
    await new Promise(r => setTimeout(r, min + Math.floor(Math.random() * Math.max(1, max - min))));
    stagnantTries = grew ? 0 : stagnantTries + 1;
  }

  return {
    type: 'Search Notes',
    keyword,
    count: allNotes.length,
    notes: allNotes.slice(0, targetLimit)
  };
}


/**
 * Scrape Single Note from DOM (Fallback)
 * @returns {Object}
 */
function scrapeNoteDom() {
  // 1. 获取 Note ID
  let noteId = '';
  const match = window.location.pathname.match(/\/explore\/(\w+)/);
  if (match) {
    noteId = match[1];
  } else {
    const modalLink = document.querySelector('div[role="dialog"] a[href*="/explore/"]');
    if (modalLink) {
      noteId = modalLink.href.split('/explore/')[1];
    }
  }
  
  if (!noteId) {
     const firstItem = document.querySelector('a[href*="/explore/"]');
     if (firstItem) noteId = firstItem.href.split('/explore/')[1];
  }
  
  if (!noteId) throw new Error('未找到笔记 ID，请确保在笔记详情页');

  const container = document.querySelector('.note-detail-mask') || document.querySelector('#noteContainer') || document.body;
  
  const title = container.querySelector('.title, .note-title')?.textContent?.trim() || '未知标题';
  const desc = container.querySelector('.desc, .note-desc, .content')?.textContent?.trim() || '';
  const date = container.querySelector('.date, .publish-date')?.textContent?.trim() || new Date().toLocaleString();
  
  const images = Array.from(container.querySelectorAll('.swiper-slide img, .note-slider img, .media-container img')).map(img => img.src);
  let cover = images.length > 0 ? images[0] : '';
  
  // Try video poster if no images
  if (!cover) {
      const video = container.querySelector('video');
      if (video && video.poster) {
          cover = video.poster;
      }
  }

  // Try video src if available (limited support for blob)
  let videoUrl = '';
  const videoEl = container.querySelector('video');
  if (videoEl) {
      videoUrl = videoEl.src; // Might be blob:
  }
  
  const likes = container.querySelector('.interact-container .like-wrapper .count')?.textContent?.trim() || '0';
  const collects = container.querySelector('.interact-container .collect-wrapper .count')?.textContent?.trim() || '0';
  const comments = container.querySelector('.interact-container .chat-wrapper .count')?.textContent?.trim() || '0';

  const authorName = container.querySelector('.author-container .name')?.textContent?.trim() || '未知作者';
  const authorLink = container.querySelector('.author-container a')?.href || '';

  return {
    type: 'Single Note (DOM)',
    note_id: noteId,
    // Use current URL if it matches the note, to preserve tracking params like xsec_token
    link: (window.location.href.includes(noteId)) ? window.location.href : `https://www.xiaohongshu.com/explore/${noteId}`,
    title: title,
    desc: desc,
    cover: cover,
    images: images,
    video: videoUrl,
    author: {
      name: authorName,
      link: authorLink
    },
    stats: {
      likes: likes,
      collects: collects,
      comments: comments
    },
    publish_time: date,
    source: 'DOM'
  };
}

// scraper-api.js - API Scraping Logic

/**
 * Scrape Profile Info via API
 */
async function scrapeProfileApi() {
    let userId = window.location.pathname.split('/').pop();
    if (!userId || userId.length < 10) {
        // Try finding in initial state
        const stateScript = Array.from(document.querySelectorAll('script')).find(s => s.textContent.includes('__INITIAL_STATE__'));
        if (stateScript) {
           const match = stateScript.textContent.match(/"user":\{.*?"id":"(\w+)"/);
           if (match) userId = match[1];
        }
    }
    
    if (!userId) throw new Error('未找到 user_id，请确保在博主主页');

    // 1. 准备 API 参数
    const uri = "/api/sns/web/v1/user/otherinfo";
    const signPayload = {
        "target_user_id": userId
    };

    // 2. 获取签名 Headers
    const signResponse = await chrome.runtime.sendMessage({ 
        type: 'SIGN_REQUEST', 
        payload: { 
            cookie: document.cookie,
            uri: uri,
            method: "GET",
            data: signPayload
        } 
    });

    if (!signResponse.success || !signResponse.data) {
        console.warn('获取签名失败，降级为 DOM 采集', signResponse.error);
        return scrapeProfileDom(userId);
    }

    const signedHeaders = signResponse.data.headers;

    // 3. 调用 API
    const apiUrl = `https://edith.xiaohongshu.com${uri}?target_user_id=${userId}`;
    
    try {
        console.log(`[API Request] URL: ${apiUrl}`);
        
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'accept-language': 'zh-CN,zh;q=0.9',
                'origin': 'https://www.xiaohongshu.com',
                'referer': 'https://www.xiaohongshu.com/',
                'x-s': signedHeaders['x-s'],
                'x-s-common': signedHeaders['x-s-common'] || '',
                'x-t': signedHeaders['x-t'] || '',
                'x-b3-traceid': signedHeaders['x-b3-traceid'] || '',
                'user-agent': navigator.userAgent,
                'Cookie': signedHeaders['Cookie']
            },
            credentials: 'include'
        });

        if (!response.ok) {
           if (response.status === 461) {
               showToast('状态码461，请降低批量操作频次', 'error');
               throw new Error('需要进行安全验证 (461)。请刷新页面或在小红书页面手动完成滑块验证后重试。');
           }
           throw new Error(`API 请求失败: ${response.status}`);
        }
        
        const json = await response.json();
        if (!json.success && !json.data) throw new Error('API 返回数据异常: ' + JSON.stringify(json));

        // 4. 解析数据
        const data = json.data;
        const basic = data.basic_info || {};
        const interactions = data.interactions || [];
        
        // Helper to find count by type or name
        const findCount = (name, type) => {
            const item = interactions.find(i => i.type === type || i.name === name);
            return item ? item.count : '0';
        };

        return {
            type: 'Profile Info',
            user_id: basic.red_id || userId,
            name: basic.nickname || '',
            desc: basic.desc || '',
            avatar: basic.images || basic.imageb || '',
            link: `https://www.xiaohongshu.com/user/profile/${userId}`,
            location: basic.ip_location || '',
            stats: {
                follows: findCount('关注', 'follows'),
                fans: findCount('粉丝', 'fans'),
                likes_collects: findCount('获赞与收藏', 'interaction')
            },
            tags: (data.tags || []).map(t => t.name)
        };
    } catch (e) {
        console.warn('API 采集失败，降级为 DOM 采集', e);
        return scrapeProfileDom(userId);
    }
}

/**
 * Fallback: Scrape Profile Info via DOM
 */
function scrapeProfileDom(userId) {
    // 直接从 DOM 获取基本信息
    const name = document.querySelector('.user-name')?.textContent?.trim() || '';
    const desc = document.querySelector('.user-desc')?.textContent?.trim() || '';
    const avatar = document.querySelector('.user-image img')?.src || '';
    
    // Stats
    const stats = Array.from(document.querySelectorAll('.user-interactions div')).map(d => d.textContent);
    
    return {
        type: 'Profile Info (DOM)',
        user_id: userId,
        name: name,
        desc: desc,
        avatar: avatar,
        link: window.location.href,
        location: document.querySelector('.ip-location')?.textContent?.trim() || '',
        stats: {
            follows: stats[0] || '0',
            fans: stats[1] || '0',
            likes_collects: stats[2] || '0'
        }
    };
}

/**
 * Scrape Profile Notes via API with Pagination
 * @param {number} limit 
 */
async function scrapeProfileNotesApi(limit = 30, delayMaxSec = 3, minDelay = 2) {
  // 1. 获取 user_id
  let userId = window.location.pathname.split('/').pop();
  if (!userId || userId.length < 10) {
      const stateScript = Array.from(document.querySelectorAll('script')).find(s => s.textContent.includes('__INITIAL_STATE__'));
      if (stateScript) {
         const match = stateScript.textContent.match(/"user":\{.*?"id":"(\w+)"/);
         if (match) userId = match[1];
      }
  }
  
  if (!userId) throw new Error('未找到 user_id，请确保在博主主页');

  // 参数清洗：确保 limit 是 30-5000 之间的整数
  let targetLimit = parseInt(limit);
  if (isNaN(targetLimit)) targetLimit = 30;
  targetLimit = Math.max(30, Math.min(targetLimit, 5000));

  console.log(`[Scraper] 开始采集博主笔记，目标数量: ${targetLimit}`);

  let allNotes = [];
  let cursor = "";
  let hasMore = true;
  
  const uri = "/api/sns/web/v1/user_posted";

  // 获取 URL 参数中的 xsec_token 和 xsec_source
  const params = new URLSearchParams(window.location.search);
  const xsec_token = params.get('xsec_token') || '';
  const xsec_source = params.get('xsec_source') || '';

  while (allNotes.length < targetLimit && hasMore) {
      // 检查终止信号
      if (window.__stopScraping) {
          console.log('[Scraper] 用户手动终止采集 (Posted Notes)');
          window.__stopScraping = false;
          break;
      }

      // 单次查询必须为 30
      const numToFetch = 30;

      // 2. 获取签名 Headers
      const signPayload = {
          "num": 30,
          "cursor": cursor || "",
          "user_id": userId,
          "image_formats": "jpg,webp,avif"
      };
      
      if (xsec_token) signPayload.xsec_token = xsec_token;
      if (xsec_source) signPayload.xsec_source = xsec_source;
      const signResponse = await chrome.runtime.sendMessage({ 
        type: 'SIGN_REQUEST', 
        payload: { 
          cookie: document.cookie,
          uri: uri,
          method: "GET",
          data: signPayload
        } 
      });

      if (!signResponse.success || !signResponse.data) {
        console.warn('获取签名失败，停止采集', signResponse.error);
        if (allNotes.length === 0) return scrapeProfileNotesDom(targetLimit); 
        break; 
      }

    const signedHeaders = signResponse.data.headers;

      // 3. 调用 API
      let apiUrl = `https://edith.xiaohongshu.com${uri}?num=${numToFetch}&cursor=${cursor || ""}&user_id=${userId}&image_formats=jpg,webp,avif`;
      
      // if (xsec_token) apiUrl += `&xsec_token=${encodeURIComponent(xsec_token)}`;
      if (xsec_token) apiUrl += `&xsec_token=${encodeURIComponent(xsec_token)}`;

      if (xsec_source) apiUrl += `&xsec_source=${xsec_source}`;
      
      try {
        console.log(`[API Request] URL: ${apiUrl}`);
        
        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
            'cache-control': 'no-cache',
            'pragma': 'no-cache',
            'priority': 'u=1, i',
            'origin': 'https://www.xiaohongshu.com',
            'referer': 'https://www.xiaohongshu.com/',
            'x-s': signedHeaders['x-s'],
            'x-s-common': signedHeaders['x-s-common'] || '',
            'x-t': signedHeaders['x-t'] || '',
            'x-b3-traceid': signedHeaders['x-b3-traceid'] || '',
            'x-xray-traceid': signedHeaders['x-xray-traceid'] || '',
            'user-agent': navigator.userAgent,
            'Cookie': signedHeaders['Cookie'] || ''
          },
          credentials: 'include'
        });

        if (!response.ok) {
           if (response.status === 461) {
               showToast('状态码461，请降低批量操作频次', 'error');
               throw new Error('需要进行安全验证 (461)。请刷新页面或在小红书页面手动完成滑块验证后重试。');
           }
           const errorText = await response.text();
           console.error(`[API Error] Status: ${response.status}, Response: ${errorText}`);
           throw new Error(`API 请求失败: ${response.status} - ${errorText}`);
        }
        
        const json = await response.json();
        
        if (!json.success || !json.data) {
           console.error(`[API Error] Response:`, json);
           throw new Error('API 返回数据异常: ' + JSON.stringify(json));
        }

        // 4. 解析数据
        const notes = (json.data.notes || []).map(note => ({
          note_id: note.note_id,
          title: note.display_title,
          type: note.type,
          cover: note.cover?.url_default || note.cover?.url,
          likes: note.interact_info?.liked_count,
          xsec_token: note.xsec_token,
          user: {
            id: note.user?.user_id,
            nickname: note.user?.nickname || note.user?.nick_name,
            avatar: note.user?.avatar
          },
          link: `https://www.xiaohongshu.com/explore/${note.note_id}?xsec_token=${note.xsec_token}&xsec_source=pc_user`
        })).filter(n => n.note_id);
        
        if (notes.length === 0) {
            hasMore = false;
        } else {
            // 简单的去重
            const newNotes = notes.filter(n => !allNotes.some(an => an.note_id === n.note_id));
            
            if (newNotes.length === 0) {
                 console.log('[Scraper] 获取到的数据均为重复，停止翻页');
                 hasMore = false;
            } else {
                 allNotes = allNotes.concat(newNotes);
                 cursor = (json.data.cursor || "").toString();
                 hasMore = json.data.has_more && cursor !== "";
                 try {
                   chrome.runtime.sendMessage({
                     type: 'SCRAPE_PROGRESS',
                     payload: { context: 'profile-notes', count: allNotes.length, total: targetLimit }
                   });
                 } catch {}
            }
        }
        
        // Delay to avoid rate limiting
        if (allNotes.length < targetLimit && hasMore) {
            // 策略调整：基础延迟 minDelay + 随机延迟
            const max = (delayMaxSec || 5) * 1000;
            const min = (minDelay || 2) * 1000;
            const randomPart = Math.floor(Math.random() * (max - min));
            const ms = min + randomPart;
            console.log(`[Scraper] 等待 ${ms}ms 后继续...`);
            await new Promise(r => setTimeout(r, ms)); 
        }

      } catch (e) {
        console.warn('API 采集循环中断', e);
        if (allNotes.length === 0) return scrapeProfileNotesDom(targetLimit);
        break;
      }
  }

  // Trim to exact limit
  allNotes = allNotes.slice(0, targetLimit);

  // 以 API 结果为准，不进行 DOM 兜底补齐

  return {
    type: 'Profile Notes',
    user_id: userId,
    count: allNotes.length,
    notes: allNotes
  };
}

/**
 * Scrape Profile Collected Notes via API with Pagination
 * @param {number} limit 
 */
async function scrapeProfileCollectApi(limit = 30, delayMaxSec = 3, minDelay = 2) {
  // 1. 获取 user_id
  let userId = window.location.pathname.split('/').pop();
  if (!userId || userId.length < 10) {
      const stateScript = Array.from(document.querySelectorAll('script')).find(s => s.textContent.includes('__INITIAL_STATE__'));
      if (stateScript) {
         const match = stateScript.textContent.match(/"user":\{.*?"id":"(\w+)"/);
         if (match) userId = match[1];
      }
  }
  
  if (!userId) throw new Error('未找到 user_id，请确保在博主主页');

  let targetLimit = parseInt(limit);
  if (isNaN(targetLimit)) targetLimit = 30;
  // Collections can be large, allow up to 5000 or more if needed, but safe cap
  targetLimit = Math.max(30, Math.min(targetLimit, 5000));

  console.log(`[Scraper] 开始采集收藏笔记，目标数量: ${targetLimit}`);

  let allNotes = [];
  let cursor = "";
  let hasMore = true;
  
  const uri = "/api/sns/web/v2/note/collect/page";


  // 标记为正在运行
  window.__isScrapingCollect = true;

  while (allNotes.length < targetLimit && hasMore && window.__isScrapingCollect) {
      const numToFetch = 30;

      // 检查终止信号
      if (window.__stopScraping) {
          console.log('[Scraper] 用户手动终止采集');
          window.__stopScraping = false;
          window.__isScrapingCollect = false;
          break;
      }
      // 2. 获取签名 Headers
      const signPayload = {
          "num": 30,
          "cursor": cursor || "",
          "user_id": userId,
          "image_formats": "jpg,webp,avif",
          "xsec_token":"",
          "xsec_source":"",
      };
      
      const signResponse = await chrome.runtime.sendMessage({ 
        type: 'SIGN_REQUEST', 
        payload: { 
          cookie: document.cookie,
          uri: uri,
          method: "GET",
          data: signPayload
        } 
      });

      if (!signResponse.success || !signResponse.data) {
        console.warn('获取签名失败，停止采集', signResponse.error);
        break; 
      }

    const signedHeaders = signResponse.data.headers;

      // 3. 调用 API
      let apiUrl = `https://edith.xiaohongshu.com${uri}?num=${numToFetch}&cursor=${cursor || ""}&user_id=${userId}&image_formats=jpg,webp,avif&xsec_token=&xsec_source=`;
      
      try {
        console.log(`[API Request] URL: ${apiUrl}`);
        
        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'zh-CN,zh;q=0.9',
            'origin': 'https://www.xiaohongshu.com',
            'referer': 'https://www.xiaohongshu.com/',
            'x-s': signedHeaders['x-s'],
            'x-s-common': signedHeaders['x-s-common'] || '',
            'x-t': signedHeaders['x-t'] || '',
            'x-b3-traceid': signedHeaders['x-b3-traceid'] || '',
            'user-agent': navigator.userAgent,
            'Cookie': signedHeaders['Cookie'] || ''
          },
          credentials: 'include'
        });

        if (!response.ok) {
           if (response.status === 461) {
               showToast('状态码461，请降低批量操作频次', 'error');
               throw new Error('需要进行安全验证 (461)。请刷新页面或在小红书页面手动完成滑块验证后重试。');
           }
           throw new Error(`API 请求失败: ${response.status}`);
        }
        
        const json = await response.json();
        
        if (!json.success || !json.data) {
           throw new Error('API 返回数据异常: ' + JSON.stringify(json));
        }

        // 4. 解析数据
          // Collect API response structure might differ slightly, usually notes are in data.notes
          const notes = (json.data.notes || []).map(note => ({
            note_id: note.note_id,
            title: note.display_title,
            type: note.type,
            cover: note.cover?.url_default || note.cover?.url,
            likes: note.interact_info?.liked_count,
            xsec_token: note.xsec_token,
            user: {
              id: note.user?.user_id,
              nickname: note.user?.nickname || note.user?.nick_name,
              avatar: note.user?.avatar
            },
            // Collect items might not have xsec_token always, but usually do
            link: `https://www.xiaohongshu.com/explore/${note.note_id}?xsec_token=${note.xsec_token || ''}&xsec_source=pc_user`
          })).filter(n => n.note_id);
        
        if (notes.length === 0) {
            hasMore = false;
        } else {
            const newNotes = notes.filter(n => !allNotes.some(an => an.note_id === n.note_id));
            
            if (newNotes.length === 0) {
                 hasMore = false;
            } else {
                 allNotes = allNotes.concat(newNotes);
                 cursor = (json.data.cursor || "").toString();
                 hasMore = json.data.has_more && cursor !== "";
                 try {
                   chrome.runtime.sendMessage({
                     type: 'SCRAPE_PROGRESS',
                     payload: { context: 'profile-notes', count: allNotes.length, total: targetLimit }
                   });
                 } catch {}
            }
        }
        
        if (allNotes.length < targetLimit && hasMore) {
            // 策略调整：基础延迟 minDelay + 随机延迟
            const max = (delayMaxSec || 5) * 1000;
            const min = (minDelay || 2) * 1000;
            const randomPart = Math.floor(Math.random() * (max - min));
            const ms = min + randomPart;
            console.log(`[Scraper] 等待 ${ms}ms 后继续...`);
            await new Promise(r => setTimeout(r, ms)); 
        }

      } catch (e) {
        console.warn('API 采集循环中断', e);
        break;
      }
  }

  window.__isScrapingCollect = false;
  allNotes = allNotes.slice(0, targetLimit);

  return {
    type: 'Profile Notes (Collected)',
    user_id: userId,
    count: allNotes.length,
    notes: allNotes
  };
}

/**
 * Scrape Single Note via API
 * @param {string} inputUrl 
 */
async function scrapeNoteApi(inputUrl) {
  // 1. 解析 URL
  let targetUrl = inputUrl || window.location.href;
  let noteId = '';
  let xsecToken = '';

  try {
    // 尝试补全 URL
    if (!targetUrl.startsWith('http')) {
        if (targetUrl.match(/^\w+$/)) {
            noteId = targetUrl;
        } else {
            targetUrl = 'https://www.xiaohongshu.com' + targetUrl;
        }
    }
    
    const urlObj = new URL(targetUrl);
    const match = urlObj.pathname.match(/\/explore\/(\w+)/);
    if (match) noteId = match[1];
    xsecToken = urlObj.searchParams.get('xsec_token');
  } catch (e) {
    console.warn('URL 解析错误', e);
  }

  // 兜底：如果是当前页，再次尝试获取
  if ((!noteId || !xsecToken) && !inputUrl) {
     const match = window.location.pathname.match(/\/explore\/(\w+)/);
     if (match) noteId = match[1];
     const params = new URLSearchParams(window.location.search);
     xsecToken = params.get('xsec_token');
  }

  // 尝试从 DOM 中的 state 补充 xsec_token
  if (!xsecToken && noteId) {
      try {
          const stateScript = Array.from(document.querySelectorAll('script')).find(s => s.textContent.includes('__INITIAL_STATE__'));
          if (stateScript) {
              const stateText = stateScript.textContent;
              // 尝试直接匹配 note 结构
              // "note":{"id":"...","xsecToken":"..."}
              const tokenMatch = stateText.match(new RegExp(`"${noteId}".*?"xsecToken":"([\\w-]+)"`));
              if (tokenMatch) xsecToken = tokenMatch[1];
              else {
                  // Fallback: search for any xsecToken near the noteId
                  const simpleMatch = stateText.match(/"xsecToken":"([\w-]+)"/);
                  if (simpleMatch) xsecToken = simpleMatch[1];
              }
          }
      } catch (e) { console.warn('DOM State extraction failed', e); }
  }

  if (!noteId) throw new Error('无法解析笔记 ID');

  // 如果没有 token，则直接报错，不进行 DOM 兜底
  if (!xsecToken) {
    // 尝试使用 DOM 采集
    console.warn('缺少 xsec_token，尝试使用 DOM 采集');
    return scrapeNoteDom();
  }

  // 2. 构造签名请求
  const uri = "/api/sns/web/v1/feed";
  const signPayload = {
    "source_note_id": noteId,
    "image_formats": ["jpg", "webp", "avif"],
    "extra": { "need_body_topic": "1" },
    "xsec_source": "pc_user",
    "xsec_token": xsecToken
  };

  const signResponse = await chrome.runtime.sendMessage({ 
    type: 'SIGN_REQUEST', 
    payload: { 
      cookie: document.cookie,
      uri: uri,
      method: "POST",
      data: signPayload
    } 
  });

  if (!signResponse.success || !signResponse.data) {
    console.warn('获取签名失败，降级为 DOM 采集', signResponse.error);
    return scrapeNoteDom();
  }

  const signedHeaders = signResponse.data.headers;

  // 3. 调用 API
  const apiUrl = `https://edith.xiaohongshu.com/api/sns/web/v1/feed`;

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json;charset=UTF-8',
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'zh-CN,zh;q=0.9',
        'origin': 'https://www.xiaohongshu.com',
        'referer': 'https://www.xiaohongshu.com/',
        'x-s': signedHeaders['x-s'],
        'x-s-common': signedHeaders['x-s-common'] || '',
        'x-t': signedHeaders['x-t'] || '',
        'x-b3-traceid': signedHeaders['x-b3-traceid'] || '',
        'x-xray-traceid': signedHeaders['x-xray-traceid'] || '',
        'user-agent': navigator.userAgent,
        'Cookie': signedHeaders['Cookie'] || ''
      },
      body: JSON.stringify(signPayload),
      credentials: 'include'
    });

    if (!response.ok) {
        if (response.status === 461) {
            showToast('状态码461，请降低批量操作频次', 'error');
            throw new Error('需要进行安全验证 (461)。请刷新页面或在小红书页面手动完成滑块验证后重试。');
        }
        throw new Error(`API 请求失败: ${response.status}`);
    }
    
    const json = await response.json();
    if (!json.success && !json.data) throw new Error('API 返回数据异常: ' + JSON.stringify(json));

    // 4. 解析数据
    const item = json.data.items[0];
    if (!item) throw new Error('未找到笔记数据');
    
    const noteCard = item.note_card;
    const user = noteCard.user || {};
    const interact = noteCard.interact_info || {};
    
    // Images
    const imageList = noteCard.image_list || [];
    const images = imageList.map(img =>  img.url_default || img.url_pre || img.url || '');
    const cover = images[0] || '';

    // Video
    let videoUrl = '';
    if (noteCard.type === 'video') {
        const stream = noteCard.video?.media?.stream;
        if (stream) {
            if (stream.EF5 && stream.EF5.length > 0) {
                videoUrl = stream.EF5[0].master_url;
            } else if (stream.EF4 && stream.EF4.length > 0) {
                videoUrl = stream.EF4[0].master_url;
            }
        }
        if (!videoUrl) videoUrl = '有视频但未解析地址';
    }

    return {
      type: 'Single Note (API)',
      note_id: noteCard.note_id,
      title: noteCard.title,
      desc: noteCard.desc,
      cover: cover,
      images: images,
      video: videoUrl,
      tags: (noteCard.tag_list || []).map(t => t.name),
      author: {
        name: user.nickname,
        id: user.user_id,
        avatar: user.avatar,
        link: `https://www.xiaohongshu.com/user/profile/${user.user_id}`
      },
      stats: {
        likes: interact.liked_count,
        collects: interact.collected_count,
        comments: interact.comment_count,
        shares: interact.share_count
      },
      publish_time: noteCard.time || Date.now(),
      link: window.location.href,
      source: 'API'
    };

  } catch (e) {
    throw e;
  }
}

// content.js - 小红书采集脚本



// 采集按钮
let __quickCollectBtn = null;
let __isManuallyClosed = false; // 用户是否手动关闭了按钮

function injectQuickCollectButton() {
  try {
    // 如果用户手动关闭了，就不再注入（除非页面刷新或路由变化）
    if (__isManuallyClosed) return;

    // 检测是否为单篇笔记页面
    const isNotePage = document.querySelector('#noteContainer') !== null ||
                      document.querySelector('[data-type="normal"]') !== null ||
                      /\/explore\/|\/discovery\/item\/|\/item\/|\/note\//.test(location.pathname);
    
    if (!isNotePage) {
      if (__quickCollectBtn) {
        __quickCollectBtn.remove();
        __quickCollectBtn = null;
      }
      return;
    }

    // 避免重复注入
    if (__quickCollectBtn) return;

    // 查找互动栏的按钮容器
    // 逻辑调整：查找 .img-container 元素
    let targetContainer = null;
    // 查找图片容器
    // 通常笔记图片在 .note-content .img-container 或类似结构中
    // 由于类名可能混淆，尝试查找主要的图片区域
    const imgContainer = document.querySelector('.media-container') || 
                         document.querySelector('.img-container') || 
                         document.querySelector('.note-scroller'); // 视频或多图容器
    
    if (imgContainer) {
        targetContainer = imgContainer;
        targetContainer.dataset.xhsInsertMode = 'img-container-overlay';
    } else {
        // 如果找不到图片容器，回退到原来的逻辑 (content-edit)
        const contentEdit = document.querySelector('.engage-bar .input-box .content-edit');
        if (contentEdit) {
             targetContainer = contentEdit.parentNode;
             targetContainer.dataset.xhsInsertMode = 'after-content-edit';
        }
    }
    
    if (!targetContainer) {
      console.log('[XHS Quick Collect] Image container or Input box not found');
      return;
    }

    // 创建采集按钮
    const btn = document.createElement('span');
    btn.id = 'xhs-quick-collect-btn';
    btn.className = 'collect-wrapper';
    btn.innerHTML = `
      <span class="count" style="display: none; opacity: 0; transition: opacity 0.2s; white-space: nowrap; margin-right: 4px; pointer-events: none; order: -1;">采集</span>
      <img src="${chrome.runtime.getURL('logogif.gif')}" class="reds-icon collect-icon" style="width: 20px; height: 20px; display: block; border-radius: 50%; pointer-events: none;">
      <div class="close-btn" title="关闭" style="display: none; position: absolute; top: -6px; left: -6px; width: 16px; height: 16px; background: rgba(0,0,0,0.6); color: #fff; border-radius: 50%; font-size: 12px; line-height: 16px; text-align: center; cursor: pointer; z-index: 1000; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">×</div>
    `;
    // Initial style (base style)
    btn.style.cssText = `
      display: flex;
      align-items: center;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    `;

    // 添加悬停样式
    const style = document.createElement('style');
    style.textContent = `
      #xhs-quick-collect-btn:hover {
        color: #ff2442 !important;
      }
      #xhs-quick-collect-btn:active {
        transform: scale(0.95);
      }
      #xhs-quick-collect-btn img {
        transition: transform 0.2s;
      }
      #xhs-quick-collect-btn:hover img {
        transform: scale(1.1);
      }
      #xhs-quick-collect-btn:hover .close-btn {
        display: block !important;
      }
    `;
    document.head.appendChild(style);

    // 点击事件
    btn.addEventListener('click', (e) => {
      // 检查是否在拖动
      if (btn.dataset.isDragging === 'true') {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      // 检查是否点击了关闭按钮
      if (e.target.classList.contains('close-btn') || e.target.closest('.close-btn')) {
        e.preventDefault();
        e.stopPropagation();
        btn.remove();
        __quickCollectBtn = null;
        __isManuallyClosed = true; // 标记为手动关闭
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      
      // 发送消息到侧边栏
      chrome.runtime.sendMessage({
        type: 'QUICK_COLLECT_NOTE',
        payload: { url: window.location.href }
      });
      
      // 视觉反馈
      btn.style.transform = 'scale(0.9)';
      setTimeout(() => {
        btn.style.transform = '';
      }, 150);
    });

    // 拖动逻辑
    btn.onmousedown = function(e) {
        if (e.target.className.includes('close-btn')) return;
        if (e.button !== 0) return; // 只响应左键

        const startX = e.clientX;
        const startY = e.clientY;
        
        const computed = getComputedStyle(btn);
        const startRight = parseFloat(computed.right);
        const startBottom = parseFloat(computed.bottom);
        
        let hasMoved = false;
        
        // 暂时移除过渡效果，使拖动更跟手
        const originalTransition = btn.style.transition;
        btn.style.transition = 'none';

        function onMouseMove(e) {
            const dx = e.clientX - startX;
            const dy = e.clientY - startY; // 向上拖动是减小 clientY，对应增加 bottom
            
            // 设置移动阈值，避免微小抖动误判为拖动
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved = true;
            
            if (hasMoved) {
                // 如果向右拖动(dx > 0)，right应该减小
                btn.style.right = startRight - dx + 'px';
                // 注意：这里用的是 bottom，clientY 减小意味着向上，bottom 应该增加
                // dy = currentY - startY. 
                // 如果向上移，currentY < startY => dy < 0.
                // newBottom = startBottom - dy (减去负数等于加上正数)
                btn.style.bottom = startBottom - dy + 'px';
            }
        }

        function onMouseUp() {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            
            // 恢复过渡效果
            btn.style.transition = originalTransition;
            
            if (hasMoved) {
                // 标记为正在拖动结束，防止触发点击事件
                btn.dataset.isDragging = 'true';
                // 短时间后清除标记
                setTimeout(() => delete btn.dataset.isDragging, 50);
            }
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        
        // 防止选中文本
        return false;
    };

    // 插入到容器中
    if (targetContainer.dataset && targetContainer.dataset.xhsInsertMode === 'img-container-overlay') {
        // 悬浮模式：插入到图片容器中，左下角悬浮
        
        // 设置容器为相对定位（如果不是的话），以便按钮绝对定位
        const computedStyle = getComputedStyle(targetContainer);
        if (computedStyle.position === 'static') {
            targetContainer.style.position = 'relative';
        }
        
        targetContainer.appendChild(btn);
        
        // 样式调整：绝对定位，左下角，半透明背景
        btn.style.cssText = `
            position: absolute;
            right: 12px;
            bottom: 100px;
            z-index: 100;
            display: flex;
            align-items: center;
            cursor: pointer;
            background: rgba(255, 255, 255, 0.8);
            padding: 6px;
            border-radius: 50%;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            color: #333;
            font-size: 13px;
            font-weight: 500;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            width: 32px;
            height: 32px;
            justify-content: center;
            /* overflow: hidden; Removed to allow close-btn to overflow */
        `;
        
        // 动态添加一个针对悬浮按钮的样式规则
        if (!document.getElementById('xhs-float-btn-style')) {
            const s = document.createElement('style');
            s.id = 'xhs-float-btn-style';
            s.textContent = `
                #xhs-quick-collect-btn:hover {
                    background: rgba(255, 255, 255, 1) !important;
                    transform: scale(1.05);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
                    width: auto !important;
                    padding-left: 12px !important;
                    border-radius: 20px !important;
                }
                #xhs-quick-collect-btn:hover .count {
                    display: block !important;
                    opacity: 1 !important;
                }
            `;
            document.head.appendChild(s);
        }

    } else if (targetContainer.dataset && targetContainer.dataset.xhsInsertMode === 'after-content-edit') {
        // ... (Keep existing fallback logic)
        const contentEdit = targetContainer.querySelector('.engage-bar .input-box .content-edit');
        
        targetContainer.appendChild(btn);
        // 调整样式
        btn.style.marginLeft = '12px'; 
        btn.style.display = 'inline-flex'; 
        btn.style.padding = '8px 0'; 
        
    } else {
        // Fallback
        targetContainer.appendChild(btn);
    }
    
    __quickCollectBtn = btn;

    console.log('[XHS Quick Collect] Button injected into buttons container');
  } catch (e) {
    console.error('[XHS Quick Collect] Injection failed:', e);
  }
}

// ---------------------------------------------------------
// Toast Notification
// ---------------------------------------------------------
let __toastEl = null;
function showToast(message, type = 'info') {
  if (!__toastEl) {
    const div = document.createElement('div');
    div.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      padding: 10px 20px;
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.8);
      color: #fff;
      font-size: 14px;
      z-index: 999999;
      opacity: 0;
      transition: opacity 0.3s;
      pointer-events: none;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      display: flex;
      align-items: center;
      gap: 8px;
    `;
    document.body.appendChild(div);
    __toastEl = div;
  }

  let icon = '';
  if (type === 'loading') icon = '<span class="loading-spinner" style="width:14px;height:14px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;display:inline-block;animation:spin 1s linear infinite"></span>';
  else if (type === 'success') icon = '<span style="color:#4caf50">✔</span>';
  else if (type === 'error') icon = '<span style="color:#ff5252">✖</span>';

  // Add spin animation if needed
  if (!document.getElementById('xhs-toast-style')) {
    const s = document.createElement('style');
    s.id = 'xhs-toast-style';
    s.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
    document.head.appendChild(s);
  }

  __toastEl.innerHTML = `${icon} <span>${message}</span>`;
  __toastEl.style.opacity = '1';

  // Auto hide
  if (__toastEl.timer) clearTimeout(__toastEl.timer);
  if (type !== 'loading') {
    __toastEl.timer = setTimeout(() => {
      __toastEl.style.opacity = '0';
    }, 3000);
  }
}

// 监听DOM变化和页面导航
function initQuickCollectObserver() {
  // 初始注入
  setTimeout(injectQuickCollectButton, 1000);

  // 拦截 history API 监听 SPA 路由变化
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  function onStateChange() {
    __isManuallyClosed = false; // 路由变化时重置手动关闭状态
    setTimeout(injectQuickCollectButton, 500);
  }

  // 拦截 pushState
  history.pushState = function (...args) {
    originalPushState.apply(history, args);
    onStateChange();
  };

  // 拦截 replaceState
  history.replaceState = function (...args) {
    originalReplaceState.apply(history, args);
    onStateChange();
  };

  // 监听 popstate 事件（用户点击返回/前进按钮时触发）
  window.addEventListener('popstate', onStateChange);

  // DOM观察器（作为备用）
  const observer = new MutationObserver(() => {
    injectQuickCollectButton();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// 启动观察器
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initQuickCollectObserver);
} else {
  initQuickCollectObserver();
}

// 监听来自 SidePanel 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Stop Scrape Command
  if (request.type === 'stop-scrape') {
    window.__stopScraping = true;
    window.__stopUncollect = true; // Also stop uncollecting
    window.__stopUnlike = true; // Also stop unliking
    sendResponse({ success: true });
    return;
  }

  if (request.action === 'BATCH_UNCOLLECT') {
    handleBatchUncollect(request.noteIds, request.minDelay, request.delayMaxSec)
      .then(res => sendResponse({ success: true, ...res }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'BATCH_UNLIKE') {
    handleBatchUnlike(request.noteIds, request.minDelay, request.delayMaxSec)
      .then(res => sendResponse({ success: true, ...res }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'SCRAPE') {
    handleScrapeRequest(request)
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // 保持异步通道开启
  }
  if (request.action === 'FETCH_IMAGE_DATA') {
    (async () => {
      try {
        const url = request.url;
        if (!url) {
          sendResponse({ success: false, error: 'no_url' });
          return;
        }
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) {
          sendResponse({ success: false, error: 'fetch_failed_' + res.status });
          return;
        }
        const buf = await res.arrayBuffer();
        const bytes = Array.from(new Uint8Array(buf));
        sendResponse({ success: true, bytes });
      } catch (e) {
        sendResponse({ success: false, error: e.toString() });
      }
    })();
    return true;
  }
  
  // 监听来自 Background 的状态反馈
  if (request.action === 'COLLECT_STATUS') {
    showToast(request.message, request.status);
    return;
  }
});

async function handleScrapeRequest(request) {
  const type = request.type;
  switch (type) {
    case 'profile':
      return await scrapeProfileApi();
    case 'profile-notes':
      try {
        return await scrapeProfileNotesApi(request.limit, request.delayMaxSec, request.minDelay);
      } catch (err) {
        console.warn('API Failed, trying DOM fallback', err);
        const domNotes = await scrapeProfileNotesDomScroll(request.limit);
        return { type: 'Profile Notes (DOM)', count: domNotes.length, notes: domNotes };
      }
    case 'profile-collect':
      return await scrapeProfileCollectApi(request.limit, request.delayMaxSec, request.minDelay);
    case 'profile-liked':
      return await scrapeProfileLikedApi(request.limit, request.delayMaxSec, request.minDelay);
    case 'search-notes':
      try {
        return await scrapeSearchNotesApi(request.limit, request.delayMaxSec, request.minDelay);
      } catch (err) {
        console.warn('Search API Failed, trying DOM fallback', err);
        return await scrapeSearchNotesDomScroll(request.limit);
      }
    case 'note-detail':
      return await scrapeNoteApi(request.url);
    case 'note-detail-dom':
      return scrapeNoteDom();
    default:
      throw new Error('未知的采集类型: ' + type);
  }
}

/**
 * Batch Uncollect Logic
 */
async function handleBatchUncollect(noteIds, minDelay = 5, delayMaxSec = 10) {
    if (!Array.isArray(noteIds) || noteIds.length === 0) return { count: 0 };
    
    console.log(`[Uncollect] Starting batch uncollect for ${noteIds.length} notes`);
    
    let successCount = 0;
    let failCount = 0;
    window.__stopUncollect = false;

    for (let i = 0; i < noteIds.length; i++) {
        if (window.__stopUncollect) {
            console.log('[Uncollect] User stopped operation');
            break;
        }

        const noteId = noteIds[i];
        try {
            await uncollectNoteApi(noteId);
            successCount++;
        } catch (e) {
            console.warn(`[Uncollect] Failed for ${noteId}`, e);
            failCount++;
        }

        // Report progress
        try {
            chrome.runtime.sendMessage({
                type: 'UNCOLLECT_PROGRESS',
                payload: { 
                    current: i + 1, 
                    total: noteIds.length, 
                    success: successCount,
                    fail: failCount
                }
            });
        } catch {}

        if (i < noteIds.length - 1) {
            await sleepRandomInterval(minDelay, delayMaxSec);
        }
    }

    return { successCount, failCount, stopped: window.__stopUncollect };
}

async function sleepRandomInterval(minDelay = 5, delayMaxSec = 10) {
    const min = Math.max(1, Number(minDelay) || 5);
    const max = Math.max(min, Number(delayMaxSec) || 10);
    const ms = (min * 1000) + Math.floor(Math.random() * ((max - min) * 1000));
    await new Promise(r => setTimeout(r, ms));
}

async function uncollectNoteApi(noteId) {
    const uri = "/api/sns/web/v1/note/uncollect";
    const signPayload = { "note_ids": noteId }; // Based on user provided curl, treating as string

    // 1. Sign
    const signResponse = await chrome.runtime.sendMessage({ 
        type: 'SIGN_REQUEST', 
        payload: { 
            cookie: document.cookie,
            uri: uri,
            method: "POST",
            data: signPayload
        } 
    });

    if (!signResponse.success || !signResponse.data) {
        throw new Error('Signature failed: ' + (signResponse.error || 'Unknown'));
    }

    const signedHeaders = signResponse.data.headers;
    const apiUrl = `https://edith.xiaohongshu.com${uri}`;

    // 2. Fetch
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'content-type': 'application/json;charset=UTF-8',
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'zh-CN,zh;q=0.9',
            'origin': 'https://www.xiaohongshu.com',
            'referer': 'https://www.xiaohongshu.com/',
            'x-s': signedHeaders['x-s'],
            'x-s-common': signedHeaders['x-s-common'] || '',
            'x-t': signedHeaders['x-t'] || '',
            'x-b3-traceid': signedHeaders['x-b3-traceid'] || '',
            'user-agent': navigator.userAgent,
            'Cookie': signedHeaders['Cookie'] || ''
        },
        body: JSON.stringify(signPayload),
        credentials: 'include'
    });

    if (!response.ok) {
        if (response.status === 461) {
            showToast('状态码461，请降低批量操作频次', 'error');
            throw new Error('需要进行安全验证 (461)。请刷新页面或在小红书页面手动完成滑块验证后重试。');
        }
        throw new Error(`HTTP ${response.status}`);
    }
    const json = await response.json();
    if (!json.success) throw new Error(json.msg || 'API Error');
    return true;
}

/**
 * Scrape Profile Liked Notes via API
 */
async function scrapeProfileLikedApi(limit = 30, delayMaxSec = 3, minDelay = 2) {
  // 1. 获取 user_id
  let userId = window.location.pathname.split('/').pop();
  if (!userId || userId.length < 10) {
      const stateScript = Array.from(document.querySelectorAll('script')).find(s => s.textContent.includes('__INITIAL_STATE__'));
      if (stateScript) {
         const match = stateScript.textContent.match(/"user":\{.*?"id":"(\w+)"/);
         if (match) userId = match[1];
      }
  }
  
  if (!userId) throw new Error('未找到 user_id，请确保在博主主页');

  let targetLimit = parseInt(limit);
  if (isNaN(targetLimit)) targetLimit = 30;
  targetLimit = Math.max(30, Math.min(targetLimit, 5000));

  console.log(`[Scraper] 开始采集点赞笔记，目标数量: ${targetLimit}`);

  let allNotes = [];
  let cursor = "";
  let hasMore = true;
  
  const uri = "/api/sns/web/v1/note/like/page";

  window.__isScrapingLiked = true;

  while (allNotes.length < targetLimit && hasMore && window.__isScrapingLiked) {
      const numToFetch = 30;

      if (window.__stopScraping) {
          console.log('[Scraper] 用户手动终止采集');
          window.__stopScraping = false;
          window.__isScrapingLiked = false;
          break;
      }

      // 2. 获取签名 Headers
      const signPayload = {
          "num": 30,
          "cursor": cursor || "",
          "user_id": userId,
          "image_formats": "jpg,webp,avif",
          "xsec_token": "",
          "xsec_source": ""
      };
      
      const signResponse = await chrome.runtime.sendMessage({ 
        type: 'SIGN_REQUEST', 
        payload: { 
          cookie: document.cookie,
          uri: uri,
          method: "GET",
          data: signPayload
        } 
      });

      if (!signResponse.success || !signResponse.data) {
        console.warn('获取签名失败，停止采集', signResponse.error);
        break; 
      }

      const signedHeaders = signResponse.data.headers;

      // 3. 调用 API
      let apiUrl = `https://edith.xiaohongshu.com${uri}?num=${numToFetch}&cursor=${cursor || ""}&user_id=${userId}&image_formats=jpg,webp,avif&xsec_token=&xsec_source=`;
      
      try {
        console.log(`[API Request] URL: ${apiUrl}`);
        
        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'zh-CN,zh;q=0.9',
            'origin': 'https://www.xiaohongshu.com',
            'referer': 'https://www.xiaohongshu.com/',
            'x-s': signedHeaders['x-s'],
            'x-s-common': signedHeaders['x-s-common'] || '',
            'x-t': signedHeaders['x-t'] || '',
            'x-b3-traceid': signedHeaders['x-b3-traceid'] || '',
            'user-agent': navigator.userAgent,
            'Cookie': signedHeaders['Cookie'] || ''
          },
          credentials: 'include'
        });

        if (!response.ok) {
           if (response.status === 461) {
               showToast('状态码461，请降低批量操作频次', 'error');
               throw new Error('需要进行安全验证 (461)。请刷新页面或在小红书页面手动完成滑块验证后重试。');
           }
           throw new Error(`API 请求失败: ${response.status}`);
        }
        
        const json = await response.json();
        if (!json.success || !json.data) throw new Error('API 返回数据异常: ' + JSON.stringify(json));

        // 4. 解析数据
        const notes = (json.data.notes || []).map(note => ({
          note_id: note.note_id,
          title: note.display_title,
          type: note.type,
          cover: note.cover?.url_default || note.cover?.url,
          likes: note.interact_info?.liked_count,
          xsec_token: note.xsec_token,
          user: {
            id: note.user?.user_id,
            nickname: note.user?.nickname || note.user?.nick_name,
            avatar: note.user?.avatar
          },
          link: `https://www.xiaohongshu.com/explore/${note.note_id}?xsec_token=${note.xsec_token || ''}&xsec_source=pc_user`
        })).filter(n => n.note_id);
        
        if (notes.length === 0) {
            hasMore = false;
        } else {
            const newNotes = notes.filter(n => !allNotes.some(an => an.note_id === n.note_id));
            if (newNotes.length === 0) {
                 hasMore = false;
            } else {
                 allNotes = allNotes.concat(newNotes);
                 cursor = (json.data.cursor || "").toString();
                 hasMore = json.data.has_more && cursor !== "";
                 try {
                   chrome.runtime.sendMessage({
                     type: 'SCRAPE_PROGRESS',
                     payload: { context: 'profile-notes', count: allNotes.length, total: targetLimit }
                   });
                 } catch {}
            }
        }
        
        if (allNotes.length < targetLimit && hasMore) {
            // 策略调整：基础延迟 minDelay + 随机延迟
            const max = (delayMaxSec || 5) * 1000;
            const min = (minDelay || 2) * 1000;
            const randomPart = Math.floor(Math.random() * (max - min));
            const ms = min + randomPart;
            console.log(`[Scraper] 等待 ${ms}ms 后继续...`);
            await new Promise(r => setTimeout(r, ms)); 
        }

      } catch (e) {
        console.warn('API 采集循环中断', e);
        break;
      }
  }

  window.__isScrapingLiked = false;
  allNotes = allNotes.slice(0, targetLimit);

  return {
    type: 'Profile Notes (Liked)',
    user_id: userId,
    count: allNotes.length,
    notes: allNotes
  };
}

/**
 * Batch Unlike Logic
 */
async function handleBatchUnlike(noteIds, minDelay = 5, delayMaxSec = 10) {
    if (!Array.isArray(noteIds) || noteIds.length === 0) return { count: 0 };
    
    console.log(`[Unlike] Starting batch unlike for ${noteIds.length} notes`);
    
    let successCount = 0;
    let failCount = 0;
    window.__stopUnlike = false;

    for (let i = 0; i < noteIds.length; i++) {
        if (window.__stopUnlike) {
            console.log('[Unlike] User stopped operation');
            break;
        }

        const noteId = noteIds[i];
        try {
            await unlikeNoteApi(noteId);
            successCount++;
        } catch (e) {
            console.warn(`[Unlike] Failed for ${noteId}`, e);
            failCount++;
        }

        // Report progress
        try {
            chrome.runtime.sendMessage({
                type: 'UNLIKE_PROGRESS',
                payload: { 
                    current: i + 1, 
                    total: noteIds.length, 
                    success: successCount,
                    fail: failCount
                }
            });
        } catch {}

        if (i < noteIds.length - 1) {
            await sleepRandomInterval(minDelay, delayMaxSec);
        }
    }

    return { successCount, failCount, stopped: window.__stopUnlike };
}

async function unlikeNoteApi(noteId) {
    const uri = "/api/sns/web/v1/note/dislike";
    const signPayload = { "note_oid": noteId };

    const signResponse = await chrome.runtime.sendMessage({ 
        type: 'SIGN_REQUEST', 
        payload: { 
            cookie: document.cookie,
            uri: uri,
            method: "POST",
            data: signPayload
        } 
    });

    if (!signResponse.success || !signResponse.data) {
        throw new Error('Signature failed: ' + (signResponse.error || 'Unknown'));
    }

    const signedHeaders = signResponse.data.headers;
    const apiUrl = `https://edith.xiaohongshu.com${uri}`;

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'content-type': 'application/json;charset=UTF-8',
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'zh-CN,zh;q=0.9',
            'origin': 'https://www.xiaohongshu.com',
            'referer': 'https://www.xiaohongshu.com/',
            'x-s': signedHeaders['x-s'],
            'x-s-common': signedHeaders['x-s-common'] || '',
            'x-t': signedHeaders['x-t'] || '',
            'x-b3-traceid': signedHeaders['x-b3-traceid'] || '',
            'user-agent': navigator.userAgent,
            'Cookie': signedHeaders['Cookie'] || ''
        },
        body: JSON.stringify(signPayload),
        credentials: 'include'
    });

    if (!response.ok) {
        if (response.status === 461) {
            showToast('状态码461，请降低批量操作频次', 'error');
            throw new Error('需要进行安全验证 (461)。请刷新页面或在小红书页面手动完成滑块验证后重试。');
        }
        throw new Error(`HTTP ${response.status}`);
    }
    const json = await response.json();
    if (!json.success) throw new Error(json.msg || 'API Error');
    return true;
}
