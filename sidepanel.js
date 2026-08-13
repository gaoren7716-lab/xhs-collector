// sidepanel.js

// --- UI State Management ---
document.addEventListener('DOMContentLoaded', async () => {
  // Show Version
  const manifest = chrome.runtime.getManifest();
  const validityEl = document.getElementById('validity-text');
  if (validityEl) {
      const verSpan = document.createElement('span');
      verSpan.style.marginLeft = '8px';
      verSpan.style.opacity = '0.8';
      verSpan.textContent = `v${manifest.version}`;
      validityEl.parentNode.insertBefore(verSpan, validityEl.nextSibling);
  }

  initTabs();
  initSettings();
  initButtons();
  initProgressListener();
  initConnectionStatus();
});

function initConnectionStatus() {
  const statusEl = document.getElementById('panel-status');
  if (!statusEl) return;
  
  // Create dot element
  const dot = document.createElement('span');
  dot.style.display = 'inline-block';
  dot.style.width = '8px';
  dot.style.height = '8px';
  dot.style.borderRadius = '50%';
  dot.style.marginRight = '6px';
  dot.style.transition = 'background-color 0.3s';
  
  const text = document.createElement('span');
  
  statusEl.innerHTML = '';
  statusEl.style.display = 'flex';
  statusEl.style.alignItems = 'center';
  statusEl.appendChild(dot);
  statusEl.appendChild(text);

  const checkStatus = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url && tab.url.includes('xiaohongshu.com')) {
        // Active
        dot.style.backgroundColor = '#4caf50'; // Green
        text.textContent = '已连接';
        text.style.color = '#4caf50';
      } else {
        // Inactive
        dot.style.backgroundColor = '#f44336'; // Red
        text.textContent = '未连接';
        text.style.color = '#f44336';
      }
    } catch (e) {
      dot.style.backgroundColor = '#9e9e9e'; // Gray
      text.textContent = '未知';
    }
  };

  // Check immediately
  checkStatus();
  
  // Check on tab activation
  chrome.tabs.onActivated.addListener(checkStatus);
  // Check on tab update
  chrome.tabs.onUpdated.addListener(checkStatus);
}

function initTheme() {
  // Theme Removed
}

function initTabs() {
  const tabs = document.querySelectorAll('.scraper-tab-item');
  const contents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.getAttribute('data-tab');
      
      // Update Tabs
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Update Content
      contents.forEach(c => {
        c.classList.remove('active');
        if (c.id === targetId) c.classList.add('active');
      });
    });
  });
}

function initSettings() {
  const btnSave = document.getElementById('btn-save-config');
  if (!btnSave) return;

  const inputs = {
    bearer: document.getElementById('input-bearer-token'),
    link: document.getElementById('input-bitable-link'),
    tableProfile: document.getElementById('input-table-profile'),
    tableNotes: document.getElementById('input-table-notes'),
    tableLikedCollected: document.getElementById('input-table-liked-collected'),
    tableDaily: document.getElementById('input-table-daily'),
    // Feature Toggles
    toggleTabProfile: document.getElementById('toggle-tab-profile'),
    toggleTabNotes: document.getElementById('toggle-tab-notes'),
    toggleTabSearchNotes: document.getElementById('toggle-tab-search-notes'),
    toggleTabNoteDetail: document.getElementById('toggle-tab-note-detail'),
    // Interval Config
    selectInterval: document.getElementById('select-interval')
  };

  // Real-time validation for Link
  if (inputs.link) {
      inputs.link.addEventListener('input', () => {
          const val = inputs.link.value.trim();
          if (val.includes('wiki')) {
              showToast('注意：检测到 Wiki 链接，请使用多维表格 Base 链接！详见帮助文档', 'error', 3000);
              inputs.link.style.borderColor = '#d93025';
          } else {
              inputs.link.style.borderColor = '';
          }
      });
  }

  // Sub-tabs logic
  const subTabs = document.querySelectorAll('.settings-sub-tab');
  const subSections = document.querySelectorAll('.settings-section');
  
  if (subTabs.length > 0) {
      subTabs.forEach(tab => {
          tab.addEventListener('click', () => {
              // Deactivate all
              subTabs.forEach(t => t.classList.remove('active'));
              subSections.forEach(s => s.classList.remove('active'));
              
              // Activate current
              tab.classList.add('active');
              const targetId = tab.dataset.subtab;
              const targetSection = document.getElementById(targetId);
              if (targetSection) targetSection.classList.add('active');
          });
      });
  }

  const btnExportLogs = document.getElementById('btn-export-logs');
  if (btnExportLogs) {
      btnExportLogs.addEventListener('click', () => {
          // Collect logs (mock implementation as we can't access real console logs easily without a custom logger)
          // Ideally we should hook console.log, but for now we export a simple status report + any stored logs if we had them.
          // Since we don't have a persistent log store, we'll export current environment info and recent status.
          
          const logData = [
              `[Time] ${new Date().toLocaleString()}`,
              `[Version] ${chrome.runtime.getManifest().version}`,
              `[User Agent] ${navigator.userAgent}`,
              `[URL] ${window.location.href}`,
              `[Status] ${document.getElementById('panel-status')?.innerText || 'Unknown'}`,
              `[Last Toast] ${document.getElementById('status-toast')?.innerText || 'None'}`,
              `-------------------`,
              `[Console Logs (Simulated - Real logs require background storage)]`,
              // In a real app, we would read from chrome.storage.local.get(['app_logs'])
              `Please check Chrome DevTools (Right click -> Inspect) for full runtime logs.`
          ].join('\n');

          const blob = new Blob([logData], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `xhs_scraper_logs_${Date.now()}.txt`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          showToast('日志已导出', 'success');
      });
  }

  // Load settings
  chrome.storage.local.get(['feishu_config', 'feature_config', 'interval_config'], (res) => {
    // Feishu Config
    if (res.feishu_config) {
      if (inputs.bearer) inputs.bearer.value = res.feishu_config.bearer || '';
      if (inputs.link) inputs.link.value = res.feishu_config.link || '';
      if (inputs.tableProfile) inputs.tableProfile.value = res.feishu_config.tableProfileId || '';
      if (inputs.tableNotes) inputs.tableNotes.value = res.feishu_config.tableNotesId || '';
      if (inputs.tableLikedCollected) inputs.tableLikedCollected.value = res.feishu_config.tableLikedCollectedId || '';
      if (inputs.tableDaily) inputs.tableDaily.value = res.feishu_config.tableDailyId || '';
    }

    // Feature Config
    const featureConfig = res.feature_config || {
        showTabProfile: true,
        showTabNotes: true,
        showTabSearchNotes: true,
        showTabNoteDetail: true
    };
    
    if (inputs.toggleTabProfile) inputs.toggleTabProfile.checked = featureConfig.showTabProfile !== false;
    if (inputs.toggleTabNotes) inputs.toggleTabNotes.checked = featureConfig.showTabNotes !== false;
    if (inputs.toggleTabSearchNotes) inputs.toggleTabSearchNotes.checked = featureConfig.showTabSearchNotes !== false;
    if (inputs.toggleTabNoteDetail) inputs.toggleTabNoteDetail.checked = featureConfig.showTabNoteDetail !== false;
    
    // Interval Config
    const intervalConfig = res.interval_config || { min: 5, max: 10 };
    if (inputs.selectInterval) {
        const val = `${intervalConfig.min}-${intervalConfig.max}`;
        // Check if value exists in options, if not select default or add it?
        // For simplicity, just set value if valid, else default to 5-10
        if (['2-5', '5-10', '10-20', '20-30'].includes(val)) {
            inputs.selectInterval.value = val;
        } else {
            inputs.selectInterval.value = '5-10';
        }
    }
    // Apply Visibility
    applyTabVisibility(featureConfig);
  });
  // Save settings
  btnSave.addEventListener('click', () => {
    // 0. Validate Link
    const linkVal = inputs.link.value.trim();
    if (linkVal.includes('wiki')) {
        showToast('配置错误：请使用多维表格 Base 链接 (以 /base/ 开头)，而非 Wiki 链接！\n请查看使用说明获取正确链接。', 'error', 6000);
        return;
    }

    // 1. Save Feishu Config
    const feishuConfig = {
      bearer: inputs.bearer.value.trim(),
      link: linkVal,
      tableProfileId: inputs.tableProfile.value.trim(),
      tableNotesId: inputs.tableNotes.value.trim(),
      tableLikedCollectedId: inputs.tableLikedCollected.value.trim(),
      tableDailyId: inputs.tableDaily.value.trim()
    };
    
    // 2. Save Feature Config
    const featureConfig = {
        showTabProfile: inputs.toggleTabProfile.checked,
        showTabNotes: inputs.toggleTabNotes.checked,
        showTabSearchNotes: inputs.toggleTabSearchNotes ? inputs.toggleTabSearchNotes.checked : true,
        showTabNoteDetail: inputs.toggleTabNoteDetail.checked
    };
    
    // 3. Save Interval Config
    let intervalConfig = { min: 5, max: 10 };
    if (inputs.selectInterval) {
        const parts = inputs.selectInterval.value.split('-');
        if (parts.length === 2) {
            intervalConfig = { min: parseInt(parts[0]), max: parseInt(parts[1]) };
        }
    }


    chrome.storage.local.set({ 
        feishu_config: feishuConfig,
        feature_config: featureConfig,
        interval_config: intervalConfig
    }, () => {
      showToast('配置已保存', 'success');
      applyTabVisibility(featureConfig);
    });
  });
}

function applyTabVisibility(config) {
    const setDisplay = (selector, show) => {
        const el = document.querySelector(selector);
        if (el) el.style.display = show ? '' : 'none';
    };
    
    setDisplay('.scraper-tab-item[data-tab="tab-profile"]', config.showTabProfile !== false);
    setDisplay('.scraper-tab-item[data-tab="tab-notes"]', config.showTabNotes !== false);
    setDisplay('.scraper-tab-item[data-tab="tab-search-notes"]', config.showTabSearchNotes !== false);
    setDisplay('.scraper-tab-item[data-tab="tab-note-detail"]', config.showTabNoteDetail !== false);
    
    // If current active tab is hidden, switch to the first visible one
    const activeTab = document.querySelector('.scraper-tab-item.active');
    if (activeTab && activeTab.style.display === 'none') {
        const firstVisible = document.querySelector('.scraper-tab-item:not([style*="display: none"])');
        if (firstVisible) firstVisible.click();
    }
}

function initButtons() {
  document.querySelectorAll('[data-open-xhs]').forEach(btn => {
    btn.addEventListener('click', () => chrome.tabs.create({ url: 'https://www.xiaohongshu.com' }));
  });

  initNotesModeHint();

  // Cookie Button
  const btnCopyCookie = document.getElementById('btn-copy-cookie');
  if (btnCopyCookie) {
    btnCopyCookie.addEventListener('click', () => {
      chrome.cookies.getAll({ url: 'https://www.xiaohongshu.com' }, (cookies) => {
        if (!cookies || cookies.length === 0) {
          showToast('未找到小红书 Cookie，请先登录', 'error');
          return;
        }
        const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        navigator.clipboard.writeText(cookieStr).then(() => {
          showToast('Cookie 已复制到剪贴板', 'success');
        }).catch(err => {
          console.error('Failed to copy text: ', err);
          showToast('复制失败', 'error');
        });
      });
    });
  }

  // Scrape Buttons
  bindScrapeButton('btn-scrape-profile', 'profile', 'result-profile', ['btn-sync-profile']);
  bindScrapeButton('btn-scrape-profile-notes', 'profile-notes', 'result-notes', ['btn-sync-notes', 'btn-export-notes']);
  bindScrapeButton('btn-scrape-search-notes', 'search-notes', 'result-search-notes', ['btn-sync-search-notes', 'btn-export-search-notes']);
  bindScrapeButton('btn-scrape-note-detail', 'note-detail', 'result-note-detail', ['btn-sync-note-detail', 'btn-download-note-detail']);
  
  // Sync Buttons
  bindSyncButton('btn-sync-profile', 'result-profile', 'status-profile');
  bindSyncButton('btn-sync-notes', 'result-notes', 'status-notes');
  bindSyncButton('btn-sync-search-notes', 'result-search-notes', 'status-search-notes');
  bindSyncButton('btn-sync-note-detail', 'result-note-detail', 'status-note-detail');

  // Initial Disable state
  disableActionButtons('btn-sync-profile');
  disableActionButtons('btn-sync-notes', 'btn-export-notes');
  disableActionButtons('btn-sync-search-notes', 'btn-export-search-notes');
  disableActionButtons('btn-sync-note-detail', 'btn-download-note-detail');

  // ... (Export/Download logic remains, but simplified since we handle enable/disable elsewhere)
  const btnExportNotes = document.getElementById('btn-export-notes');
  if (btnExportNotes) {
    btnExportNotes.addEventListener('click', () => {
        if (btnExportNotes.disabled) return;
        // ... (Export logic)
        const resultNotes = document.getElementById('result-notes');
        // ...
        try {
            const data = JSON.parse(resultNotes.dataset.rawData);
            // ...
             const flatData = data.notes.map(n => ({
                 标题: n.title,
                 链接: n.link,
                 点赞数: n.likes,
                 类型: n.type,
                 封面图: n.cover
             }));
             exportToExcel(flatData, `xhs_notes_${Date.now()}`);
             showToast('已开始导出', 'success');
            // ...
        } catch (e) {
            console.error(e);
            showToast('导出失败', 'error');
        }
    });
  }

  bindNotesExportButton('btn-export-search-notes', 'result-search-notes');

  const btnDownloadNoteDetail = document.getElementById('btn-download-note-detail');
  if (btnDownloadNoteDetail) {
    btnDownloadNoteDetail.addEventListener('click', async () => {
        if (btnDownloadNoteDetail.disabled) return;
        // ... (Download logic)
        const resultNoteDetail = document.getElementById('result-note-detail');
        // ...
        try {
            const data = JSON.parse(resultNoteDetail.dataset.rawData);
            if (data.type && data.type.includes('Single Note')) {
                 showToast('开始下载素材...', 'loading');
                 // ...
                 // Download Cover
                 if (data.cover) await downloadMedia(data.cover, `cover_${data.note_id}`);
                 
                 // Download Video
                 if (data.video) {
                     await downloadMedia(data.video, `video_${data.note_id}.mp4`);
                 }
                 
                 // Download Images
                 // 只有当图片列表长度大于1时才下载图片列表，避免单图时与封面重复
                 if (data.images && data.images.length > 1) {
                    for (let i = 0; i < data.images.length; i++) {
                        await downloadMedia(data.images[i], `image_${data.note_id}_${i}`);
                        await new Promise(r => setTimeout(r, 300));
                    }
                 }
                 
                 showToast('下载任务已添加', 'success');
            } else {
                showToast('数据格式不正确', 'error');
            }
        } catch (e) {
            console.error(e);
            showToast('下载失败', 'error');
        }
    });
  }
}

function initNotesModeHint() {
  const select = document.getElementById('select-notes-type');
  const hint = document.getElementById('notes-mode-hint');
  const scrapeBtn = document.getElementById('btn-scrape-profile-notes');
  if (!select || !hint || !scrapeBtn) return;

  const labels = {
    posted: {
      button: '采集博主',
      hint: '采集博主笔记后可导出或同步到飞书。'
    },
    collected: {
      button: '采集收藏',
      hint: '采集收藏笔记后，可勾选记录并批量取消收藏。取消操作会按配置的随机间隔执行。'
    },
    liked: {
      button: '采集点赞',
      hint: '采集点赞笔记后，可勾选记录并批量取消点赞。取消操作会按配置的随机间隔执行。'
    }
  };

  const update = () => {
    const item = labels[select.value] || labels.posted;
    hint.textContent = item.hint;
    const textNodes = Array.from(scrapeBtn.childNodes).filter(node => node.nodeType === Node.TEXT_NODE);
    const labelNode = textNodes.find(node => node.textContent.trim()) || textNodes[textNodes.length - 1];
    textNodes.forEach(node => {
      if (node !== labelNode) node.textContent = '';
    });
    if (labelNode) labelNode.textContent = ` ${item.button}`;
    else scrapeBtn.appendChild(document.createTextNode(` ${item.button}`));
    if (scrapeBtn.dataset.isScraping !== 'true') scrapeBtn.dataset.originalHtml = scrapeBtn.innerHTML;
  };

  select.addEventListener('change', update);
  update();
}

// Helper to disable buttons initially
function disableActionButtons(...ids) {
    ids.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
        }
    });
}

// Helper to enable buttons
function enableActionButtons(...ids) {
    ids.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.disabled = false;
            btn.style.opacity = '';
            btn.style.cursor = '';
        }
    });
}

async function getIntervalConfig() {
  const { interval_config } = await chrome.storage.local.get(['interval_config']);
  return interval_config || { min: 5, max: 10 };
}

function bindNotesExportButton(btnId, resultId) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    const result = document.getElementById(resultId);
    try {
      const data = JSON.parse(result.dataset.rawData);
      const flatData = (data.notes || []).map(n => ({
        标题: n.title,
        链接: n.link,
        点赞数: n.likes,
        类型: n.type,
        封面图: n.cover
      }));
      exportToExcel(flatData, `xhs_notes_${Date.now()}`);
      showToast('已开始导出', 'success');
    } catch (e) {
      console.error(e);
      showToast('导出失败', 'error');
    }
  });
}

function bindScrapeButton(btnId, type, resultAreaId, actionButtonIds = []) {
  const btn = document.getElementById(btnId);
  const resultArea = document.getElementById(resultAreaId);
  
  if (!btn) return;

  // Store original HTML (to preserve icons)
  if (!btn.dataset.originalHtml) {
      btn.dataset.originalHtml = btn.innerHTML;
  }

  btn.addEventListener('click', async () => {
    // 1. Handle Stop Action
    if (btn.dataset.isScraping === 'true') {
        // Prevent double clicking stop
        if (btn.textContent.includes('停止')) {
             btn.textContent = '正在停止...';
             btn.disabled = true; // Disable to prevent multiple stop signals
             try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tab) {
                    await chrome.tabs.sendMessage(tab.id, { type: 'stop-scrape' });
                }
             } catch (e) {
                 console.error('Stop signal failed', e);
             }
        }
        return;
    }

    // 2. Start Action
    
    // Reset state just in case
    btn.dataset.isScraping = 'true';
    // Use originalHtml for restoration
    const originalHtml = btn.dataset.originalHtml || btn.innerHTML;
    
    // Disable other action buttons
    disableActionButtons(...actionButtonIds);
    
    resultArea.textContent = '正在采集中...';
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        resultArea.textContent = '错误: 未找到活动标签页';
        throw new Error('No active tab');
      }

      // Pre-check for Profile/Search Scrapers
      if ((type === 'profile' || type === 'profile-notes' || type === 'search-notes') && tab.url) {
          const isSearchMode = type === 'search-notes';
          const validPage = isSearchMode
              ? tab.url.includes('xiaohongshu.com/search_result')
              : tab.url.includes('xiaohongshu.com/user/profile/');
          if (!validPage) {
               resultArea.innerHTML = '<div style="color:#d93025;padding:8px;border:1px solid #f44336;border-radius:4px;background:#ffebee;">' +
                                      '<strong>位置错误</strong><br>' + (isSearchMode ? '请先进入小红书搜索结果页，再点击采集。' : '请先进入小红书博主主页，再点击采集。') + '<br>' +
                                      '<span style="font-size:11px;color:#666;">(' + (isSearchMode ? '网址应包含 xiaohongshu.com/search_result' : '网址应包含 xiaohongshu.com/user/profile/') + ')</span>' +
                                      '</div>';
               // Reset button state
               btn.dataset.isScraping = 'false';
               btn.innerHTML = originalHtml;
               btn.disabled = false;
               enableActionButtons(...actionButtonIds);
               return;
          }
      }

      const payload = { action: 'SCRAPE', type: type };
      
      // ... (Custom input handling)
      if (type === 'note-detail') {
          const linkInput = document.getElementById('input-note-link');
          if (linkInput && linkInput.value.trim()) payload.url = linkInput.value.trim();
      }
      if (type === 'profile-notes' || type === 'search-notes') {
          window.__notesProgressStatusId = type === 'search-notes' ? 'status-search-notes' : 'status-notes';
          const limitInput = document.getElementById(type === 'search-notes' ? 'input-search-notes-limit' : 'input-notes-limit');
          const typeSelect = document.getElementById('select-notes-type');
          
          // Check Collection Mode
          if (type === 'profile-notes' && typeSelect && typeSelect.value === 'collected') {
              payload.type = 'profile-collect';
          }
          if (type === 'profile-notes' && typeSelect && typeSelect.value === 'liked') {
              payload.type = 'profile-liked';
          }

          if (limitInput) {
              const val = parseInt(limitInput.value);
              payload.limit = val || 30;
              // Read interval config from storage, but we are in async listener.
              // To avoid refactoring bindScrapeButton to async init, we can fetch it inside.
              // But bindScrapeButton listener IS async.
              // So we can fetch interval config here.
              const { interval_config } = await chrome.storage.local.get(['interval_config']);
              const minDelay = interval_config ? interval_config.min : 5;
              const maxDelay = interval_config ? interval_config.max : 10;
              
              // We pass delayMaxSec as maxDelay and minDelay as minDelay
              // Note: content.js scrapeProfileNotesApi uses delayMaxSec as max and minDelay as min
              payload.delayMaxSec = maxDelay;
              payload.minDelay = minDelay;
              
              const typeLabel = payload.type === 'profile-collect' ? '收藏笔记' : (payload.type === 'profile-liked' ? '点赞笔记' : (payload.type === 'search-notes' ? '搜索笔记' : '博主笔记'));
              resultArea.textContent = `正在采集${typeLabel}... (目标: ${payload.limit} 条, 间隔: ${minDelay}-${maxDelay} 秒随机)`;
          }
      }

      // Change button to Stop if it's a list scrape
      if (type === 'profile-notes' || type === 'search-notes') {
          btn.textContent = '停止采集';
          btn.classList.add('btn-stop');
      } else {
          // For simple scrapes, keep icon but indicate processing? 
          // Actually, original logic just kept it or let it be.
          // Let's keep "Processing..." text for consistency if it was there, 
          // or if it's fast, maybe just spinner.
          // The original code didn't change text for non-list scrapes explicitly here 
          // except via resultArea? No, wait.
          // Line 482 only changes text for 'profile-notes'.
          // For others, the button text remained "Start Scrape"? 
          // Ah, actually, if I look at line 410 (original code), it didn't change button text for 'profile' or 'note-detail' 
          // until it finished?
          // Let's check original logic: 
          // It sets dataset.isScraping = true.
          // It didn't change btn.textContent for non-list types.
          // So for non-list types, the icon persists!
          // BUT for 'profile-notes', it sets btn.textContent = '停止采集', which REMOVES the icon.
          // And then finally, it restored using originalText.
      }

      const response = await chrome.tabs.sendMessage(tab.id, payload);

      if (response && response.success) {
        // ... (Cookie refresh)
        chrome.cookies.getAll({ url: 'https://www.xiaohongshu.com' }, (cookies) => {
             const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
             if (cookieStr) chrome.storage.local.set({ cached_xhs_cookie: cookieStr });
        });
        
        renderResults(response.data, resultAreaId);
        
        // Enable action buttons on success
        enableActionButtons(...actionButtonIds);
        
      } else {
        resultArea.textContent = '采集失败: ' + (response ? response.error : '未知错误');
      }
    } catch (e) {
      console.error(e);
      if (e.message !== 'No active tab') {
        resultArea.innerHTML = '<div style="font-size:12px;">通信错误，可能未在小红书页面。请先前往小红书相关页面并刷新后重试。</div>' +
            '<div style="margin-top:8px;display:flex;gap:8px;">' +
            '<button id="btn-open-xhs" class="md-btn md-btn-text" style="width:auto;padding:6px 10px;">打开小红书</button>' +
            '</div>';
        const openBtn = document.getElementById('btn-open-xhs');
        if (openBtn) openBtn.addEventListener('click', () => chrome.tabs.create({ url: 'https://www.xiaohongshu.com' }));
      }
    } finally {
        // Reset Button
        btn.dataset.isScraping = 'false';
        btn.innerHTML = originalHtml;
        btn.disabled = false;
        btn.classList.remove('btn-stop');
    }
  });
}

function initProgressListener() {
  if (!window.__notesProgress) window.__notesProgress = { collected: 0, total: 0, synced: 0 };
  const updateNotesProgress = () => {
    const p = window.__notesProgress;
    const txt = `已采集 ${p.collected}/${p.total} 条，已同步 ${p.synced} 条`;
    setStatus(window.__notesProgressStatusId || 'status-notes', txt, 'loading');
  };
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'SCRAPE_PROGRESS') {
      const p = msg.payload || {};
      if (p.context === 'profile-notes' && typeof p.count === 'number' && typeof p.total === 'number') {
        window.__notesProgress.collected = p.count;
        window.__notesProgress.total = p.total;
        updateNotesProgress();
      }
      if (p.context === 'profile-notes-detail' && typeof p.count === 'number' && typeof p.total === 'number') {
        const synced = (window.__notesProgress && window.__notesProgress.synced) || 0;
        setStatus(window.__notesProgressStatusId || 'status-notes', `已获取详情 ${p.count}/${p.total} 条，已同步 ${synced} 条`, 'loading');
      }
    }
  });
}

function initQuickCollectListener() {
  // Listener removed to favor Background processing for Quick Collect
  console.log('[SidePanel] Quick collect listener removed (Handled by Background)');
}


function renderResults(data, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = ''; // Clear previous content

    if (!data) return;

    // Helper to create copy icon
    const createCopyIcon = (text) => {
        const icon = document.createElement('span');
        icon.className = 'copy-icon';
        // SVG Icon for Copy
        icon.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`;
        icon.title = '复制';
        icon.onclick = (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(text).then(() => {
                const original = icon.innerHTML;
                // Checkmark SVG
                icon.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="#4caf50"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;
                setTimeout(() => icon.innerHTML = original, 1500);
            });
        };
        return icon;
    };

    // Helper to create a row
    const createRow = (key, value) => {
        const row = document.createElement('div');
        row.className = 'data-row';
        
        const keyEl = document.createElement('span');
        keyEl.className = 'data-key';
        keyEl.textContent = key;
        
        const valueEl = document.createElement('span');
        valueEl.className = 'data-value';
        valueEl.textContent = typeof value === 'object' ? JSON.stringify(value) : value;
        valueEl.title = valueEl.textContent; // Tooltip

        row.appendChild(keyEl);
        row.appendChild(valueEl);
        row.appendChild(createCopyIcon(valueEl.textContent));
        
        return row;
    };

    // Render logic based on data type
    if (data.type && data.type.includes('Profile Info')) {
        container.appendChild(createRow('昵称', data.name));
        container.appendChild(createRow('ID', data.user_id));
        container.appendChild(createRow('描述', data.desc));
        container.appendChild(createRow('位置', data.location));
        container.appendChild(createRow('粉丝', data.stats.fans));
        container.appendChild(createRow('关注', data.stats.follows));
        container.appendChild(createRow('获赞与收藏', data.stats.likes_collects));
        
        // Full JSON Copy
        const jsonBtn = document.createElement('button');
        jsonBtn.className = 'md-btn md-btn-outlined';
        jsonBtn.style.marginTop = '8px';
        jsonBtn.style.width = '100%';
        jsonBtn.textContent = '复制';
        jsonBtn.onclick = () => navigator.clipboard.writeText(JSON.stringify(data, null, 2));
        container.appendChild(jsonBtn);

        // Store raw data for Sync
        container.dataset.rawData = JSON.stringify(data);

    } else if (data.type && data.type.includes('Single Note')) {
        container.appendChild(createRow('标题', data.title));
        container.appendChild(createRow('作者', data.author.name));
        container.appendChild(createRow('笔记ID', data.note_id));
        container.appendChild(createRow('点赞', data.stats.likes));
        container.appendChild(createRow('收藏', data.stats.collects));
        container.appendChild(createRow('发布时间', data.publish_time));
        
        // Media Preview & Actions
        const mediaSection = document.createElement('div');
        mediaSection.style.marginTop = '12px';
        mediaSection.style.paddingTop = '12px';
        mediaSection.style.borderTop = '1px dashed #ddd';

        if (data.video) {
            // Video Preview
            const video = document.createElement('video');
            video.src = data.video;
            video.controls = true;
            video.style.width = '100%';
            video.style.borderRadius = '8px';
            video.style.marginBottom = '8px';
            video.style.maxHeight = '200px';
            mediaSection.appendChild(video);

            // Buttons
            const btnRow = document.createElement('div');
            btnRow.style.display = 'flex';
            btnRow.style.gap = '8px';

            const dlCover = document.createElement('button');
            dlCover.className = 'md-btn md-btn-outlined';
            dlCover.style.flex = '1';
            dlCover.textContent = '下载封面';
            dlCover.onclick = () => downloadMedia(data.cover, `cover_${data.note_id}`);

            const dlVideo = document.createElement('button');
            dlVideo.className = 'md-btn md-btn-filled';
            dlVideo.style.flex = '1';
            dlVideo.textContent = '下载视频';
            dlVideo.onclick = () => downloadMedia(data.video, `video_${data.note_id}.mp4`);

            btnRow.appendChild(dlCover);
            btnRow.appendChild(dlVideo);
            mediaSection.appendChild(btnRow);

        } else if (data.images && data.images.length > 0) {
            // Image Grid
            const grid = document.createElement('div');
            grid.style.display = 'grid';
            grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
            grid.style.gap = '4px';
            grid.style.marginBottom = '8px';
            
            data.images.slice(0, 9).forEach((imgUrl, i) => {
                const img = document.createElement('img');
                img.src = imgUrl;
                img.style.width = '100%';
                img.style.aspectRatio = '1';
                img.style.objectFit = 'cover';
                img.style.borderRadius = '4px';
                img.style.cursor = 'pointer';
                img.onclick = () => downloadMedia(imgUrl, `image_${data.note_id}_${i}`);
                img.title = '点击下载此图';
                grid.appendChild(img);
            });
            mediaSection.appendChild(grid);

            // Buttons
            const dlBtn = document.createElement('button');
            dlBtn.className = 'md-btn md-btn-filled';
            dlBtn.style.width = '100%';
            dlBtn.textContent = `下载全部图片 (${data.images.length})`;
            dlBtn.onclick = async () => {
                dlBtn.disabled = true;
                dlBtn.textContent = '下载中...';
                try {
                    // Download Cover
                if (data.cover) await downloadMedia(data.cover, `cover_${data.note_id}`);
                // Download Images
                // 只有当图片列表长度大于1时才下载图片列表，避免单图时与封面重复
                if (data.images && data.images.length > 1) {
                    for (let i = 0; i < data.images.length; i++) {
                        await downloadMedia(data.images[i], `image_${data.note_id}_${i}`);
                        await new Promise(r => setTimeout(r, 300)); // Delay
                    }
                }
                dlBtn.textContent = '下载完成';
                } catch(e) {
                    console.error(e);
                    dlBtn.textContent = '部分下载失败';
                } finally {
                    setTimeout(() => { dlBtn.disabled = false; dlBtn.textContent = `下载全部图片 (${data.images.length})`; }, 2000);
                }
            };
            mediaSection.appendChild(dlBtn);
        }

        container.appendChild(mediaSection);
        
        container.dataset.rawData = JSON.stringify(data);

    } else if (data.notes && Array.isArray(data.notes)) {
        // Profile Notes List
        const isCollected = data.type && data.type.includes('Collected');
        const isLiked = data.type && data.type.includes('Liked');
        const isSearch = data.type && data.type.includes('Search');
        const typeLabel = isCollected ? '收藏笔记' : (isLiked ? '点赞笔记' : (isSearch ? '搜索笔记' : '博主笔记'));
        
        const summary = document.createElement('div');
        summary.innerHTML = `<strong>采集到 ${data.notes.length} 条${typeLabel}</strong>`;
        summary.style.marginBottom = '8px';
        summary.style.display = 'flex';
        summary.style.justifyContent = 'space-between';
        summary.style.alignItems = 'center';
        
        container.appendChild(summary);

        // ... (Buttons: Uncollect, Unlike) - keeping original logic but wrapped for clarity if needed, 
        // but actually we need to append buttons to summary or container BEFORE the list.
        // The original code appends buttons to 'summary'.
        
        // Batch Uncollect Button
        if (isCollected && data.notes.length > 0) {
            const btnUncollect = document.createElement('button');
            btnUncollect.className = 'md-btn md-btn-outlined';
            btnUncollect.style.color = '#d93025';
            btnUncollect.style.borderColor = '#d93025';
            btnUncollect.style.fontSize = '12px';
            btnUncollect.style.padding = '4px 8px';
            btnUncollect.textContent = '批量取消收藏';
            
            btnUncollect.onclick = async () => {
                if (btnUncollect.dataset.processing === 'true') {
                    // Stop action
                    try {
                        btnUncollect.textContent = '正在停止...';
                        btnUncollect.disabled = true;
                        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                        if (tab) {
                            await chrome.tabs.sendMessage(tab.id, { type: 'stop-scrape' }); // Reusing stop-scrape signal which sets window.__stopUncollect
                        }
                    } catch (e) { console.error(e); }
                    return;
                }

                const noteIds = Array.from(selectedNoteIds);
                if (noteIds.length === 0) {
                    showToast('请至少选择一条收藏笔记', 'error');
                    return;
                }
                const interval = await getIntervalConfig();
                if (!confirm(`确定要取消这 ${noteIds.length} 条笔记的收藏吗？\n\n此操作不可恢复！\n建议先导出备份。`)) return;
                
                btnUncollect.dataset.processing = 'true';
                btnUncollect.textContent = '取消收藏中... (点击停止)';
                btnUncollect.classList.add('btn-stop');
                
                try {
                    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    if (!tab) throw new Error('No active tab');
                    
                    // Listen for progress
                    const onProgress = (msg) => {
                        if (msg.type === 'UNCOLLECT_PROGRESS') {
                            const p = msg.payload;
                            btnUncollect.textContent = `正在取消 ${p.current}/${p.total} (成功:${p.success} 失败:${p.fail})`;
                        }
                    };
                    chrome.runtime.onMessage.addListener(onProgress);

                    const res = await chrome.tabs.sendMessage(tab.id, { 
                        action: 'BATCH_UNCOLLECT', 
                        noteIds: noteIds,
                        minDelay: interval.min,
                        delayMaxSec: interval.max
                    });

                    chrome.runtime.onMessage.removeListener(onProgress);
                    
                    if (res && res.success) {
                        showToast(`批量取消完成: 成功 ${res.successCount}, 失败 ${res.failCount}`, 'success');
                        if (res.stopped) showToast('操作已手动停止', 'info');
                    } else {
                        showToast('批量操作失败: ' + (res.error || '未知错误'), 'error');
                    }
                } catch (e) {
                    console.error(e);
                    showToast('请求失败', 'error');
                } finally {
                    btnUncollect.dataset.processing = 'false';
                    btnUncollect.textContent = '批量取消收藏';
                    btnUncollect.classList.remove('btn-stop');
                    btnUncollect.disabled = false;
                }
            };
            summary.appendChild(btnUncollect);
        }

        // Batch Unlike Button
        if (isLiked && data.notes.length > 0) {
            const btnUnlike = document.createElement('button');
            btnUnlike.className = 'md-btn md-btn-outlined';
            btnUnlike.style.color = '#d93025';
            btnUnlike.style.borderColor = '#d93025';
            btnUnlike.style.fontSize = '12px';
            btnUnlike.style.padding = '4px 8px';
            btnUnlike.textContent = '批量取消点赞';
            
            btnUnlike.onclick = async () => {
                if (btnUnlike.dataset.processing === 'true') {
                    try {
                        btnUnlike.textContent = '正在停止...';
                        btnUnlike.disabled = true;
                        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                        if (tab) {
                            await chrome.tabs.sendMessage(tab.id, { type: 'stop-scrape' });
                        }
                    } catch (e) { console.error(e); }
                    return;
                }

                const noteIds = Array.from(selectedNoteIds);
                if (noteIds.length === 0) {
                    showToast('请至少选择一条点赞笔记', 'error');
                    return;
                }
                const interval = await getIntervalConfig();
                if (!confirm(`确定要取消这 ${noteIds.length} 条笔记的点赞吗？\n\n此操作不可恢复！`)) return;
                
                btnUnlike.dataset.processing = 'true';
                btnUnlike.textContent = '取消点赞中... (点击停止)';
                btnUnlike.classList.add('btn-stop');
                
                try {
                    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    if (!tab) throw new Error('No active tab');
                    
                    const onProgress = (msg) => {
                        if (msg.type === 'UNLIKE_PROGRESS') {
                            const p = msg.payload;
                            btnUnlike.textContent = `正在取消 ${p.current}/${p.total} (成功:${p.success} 失败:${p.fail})`;
                        }
                    };
                    chrome.runtime.onMessage.addListener(onProgress);

                    const res = await chrome.tabs.sendMessage(tab.id, { 
                        action: 'BATCH_UNLIKE', 
                        noteIds: noteIds,
                        minDelay: interval.min,
                        delayMaxSec: interval.max
                    });

                    chrome.runtime.onMessage.removeListener(onProgress);
                    
                    if (res && res.success) {
                        showToast(`批量取消完成: 成功 ${res.successCount}, 失败 ${res.failCount}`, 'success');
                        if (res.stopped) showToast('操作已手动停止', 'info');
                    } else {
                        showToast('批量操作失败: ' + (res.error || '未知错误'), 'error');
                    }
                } catch (e) {
                    console.error(e);
                    showToast('请求失败', 'error');
                } finally {
                    btnUnlike.dataset.processing = 'false';
                    btnUnlike.textContent = '批量取消点赞';
                    btnUnlike.classList.remove('btn-stop');
                    btnUnlike.disabled = false;
                }
            };
            summary.appendChild(btnUnlike);
        }

        // Create Scrollable List Container
        const listContainer = document.createElement('div');
        listContainer.className = 'scrollable-list';

        // Control logic elements
        let currentDataNotes = data.notes || [];
        let selectedNoteIds = new Set(currentDataNotes.map(n => n.note_id)); // Default select all

        const listUi = containerId === 'result-search-notes'
            ? {
                controls: 'search-list-controls',
                checkAll: 'check-all-search-notes',
                sort: 'sort-search-notes',
                count: 'selected-count-search-text'
              }
            : {
                controls: 'notes-list-controls',
                checkAll: 'check-all-notes',
                sort: 'sort-notes',
                count: 'selected-count-text'
              };
        const controls = document.getElementById(listUi.controls);
        const checkAll = document.getElementById(listUi.checkAll);
        const sortSelect = document.getElementById(listUi.sort);
        const countText = document.getElementById(listUi.count);
        
        // Setup container dataset for sync
        container.dataset.selectedIds = JSON.stringify(Array.from(selectedNoteIds));

        // Setup Controls Event Listeners
        if (controls) controls.style.display = 'flex';
        
        if (checkAll) {
            checkAll.checked = true;
            // Remove old listener to avoid duplicates if re-rendering
            const newCheckAll = checkAll.cloneNode(true);
            checkAll.parentNode.replaceChild(newCheckAll, checkAll);
            
            newCheckAll.onclick = (e) => {
                const checked = e.target.checked;
                const checkboxes = listContainer.querySelectorAll('.note-checkbox');
                checkboxes.forEach(cb => {
                    cb.checked = checked;
                    const noteId = cb.dataset.id;
                    if (checked) selectedNoteIds.add(noteId);
                    else selectedNoteIds.delete(noteId);
                    
                    const row = cb.closest('.note-list-item');
                    if (row) {
                        if (checked) row.classList.add('selected');
                        else row.classList.remove('selected');
                    }
                });
                updateSelectedCount();
            };
        }

        if (sortSelect) {
            sortSelect.value = 'default';
            const newSortSelect = sortSelect.cloneNode(true);
            sortSelect.parentNode.replaceChild(newSortSelect, sortSelect);

            newSortSelect.onchange = () => {
                const sortType = newSortSelect.value;
                let sortedNotes = [...currentDataNotes];
                if (sortType === 'likes-desc') {
                    sortedNotes.sort((a, b) => (parseInt(b.likes) || 0) - (parseInt(a.likes) || 0));
                } else if (sortType === 'likes-asc') {
                    sortedNotes.sort((a, b) => (parseInt(a.likes) || 0) - (parseInt(b.likes) || 0));
                }
                renderList(sortedNotes);
            };
        }

        function updateSelectedCount() {
            if (countText) countText.textContent = `已选 ${selectedNoteIds.size}/${currentDataNotes.length}`;
            container.dataset.selectedIds = JSON.stringify(Array.from(selectedNoteIds));
        }
        
        // Initial update
        updateSelectedCount();

        function renderList(notesToRender) {
            listContainer.innerHTML = '';
            
            notesToRender.forEach((note, idx) => {
            const item = document.createElement('div');
            item.className = 'note-list-item';
            // Flex layout style
            item.style.display = 'flex';
            item.style.gap = '8px';
            item.style.padding = '8px';
            item.style.marginBottom = '8px';
            item.style.border = '1px solid var(--md-sys-color-outline-variant)';
            item.style.borderRadius = '8px';
            item.style.alignItems = 'start';

                // Checkbox
                const checkboxOverlay = document.createElement('div');
                checkboxOverlay.className = 'checkbox-overlay';
                // Add click stop propagation to avoid triggering item click if any
                checkboxOverlay.onclick = (e) => e.stopPropagation();
                
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.className = 'note-checkbox';
                cb.dataset.id = note.note_id;
                cb.checked = selectedNoteIds.has(note.note_id);
                // Important: Ensure checkbox is visible and clickable
                cb.style.cursor = 'pointer';
                cb.style.width = '16px';
                cb.style.height = '16px';
                cb.style.margin = '0'; // Reset margin
                cb.style.display = 'block'; // Ensure block display
                
                cb.onchange = (e) => {
                    if (e.target.checked) {
                        selectedNoteIds.add(note.note_id);
                        item.classList.add('selected');
                    } else {
                        selectedNoteIds.delete(note.note_id);
                        item.classList.remove('selected');
                        const checkAllBtn = document.getElementById(listUi.checkAll);
                        if (checkAllBtn) checkAllBtn.checked = false;
                    }
                    updateSelectedCount();
                };
                checkboxOverlay.appendChild(cb);
                item.appendChild(checkboxOverlay);

                // Left: Image
                const imgContainer = document.createElement('div');
                imgContainer.style.width = '60px';
                imgContainer.style.height = '60px';
            imgContainer.style.flexShrink = '0';
            imgContainer.style.borderRadius = '4px';
            imgContainer.style.overflow = 'hidden';
            imgContainer.style.backgroundColor = '#f0f0f0';
            imgContainer.style.cursor = 'pointer'; // Add pointer cursor
            imgContainer.title = '点击跳转到笔记详情'; // Add tooltip
            
            // Add click event to open link
            imgContainer.onclick = () => {
                if (note.link) {
                    chrome.tabs.create({ url: note.link });
                }
            };
            
            const img = document.createElement('img');
            img.src = note.cover || '';
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';
            imgContainer.appendChild(img);

            // Right: Info
            const info = document.createElement('div');
            info.style.flex = '1';
            info.style.minWidth = '0'; // for text truncation
            
            const title = document.createElement('div');
            title.textContent = note.title || '无标题';
            title.style.fontWeight = '500';
            title.style.fontSize = '13px';
            title.style.marginBottom = '4px';
            title.style.whiteSpace = 'nowrap';
            title.style.overflow = 'hidden';
            title.style.textOverflow = 'ellipsis';

            const stats = document.createElement('div');
            stats.style.fontSize = '12px';
            stats.style.color = '#666';
            stats.innerHTML = `👍 ${note.likes || 0} &nbsp; ${note.type === 'video' ? '📺' : '🖼️'}`;

            // Actions row
            const actions = document.createElement('div');
            actions.style.marginTop = '4px';
            actions.style.display = 'flex';
            actions.style.gap = '8px';

            // Download Button (Trigger detail fetch & download)
            const dlBtn = document.createElement('button');
            dlBtn.className = 'md-btn md-btn-text';
            dlBtn.style.padding = '2px 6px';
            dlBtn.style.fontSize = '11px';
            dlBtn.style.height = 'auto';
            dlBtn.textContent = '下载素材';
            dlBtn.onclick = async () => {
                dlBtn.textContent = '获取中...';
                dlBtn.disabled = true;
                try {
                    // Fetch detail first
                    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    if (!tab) throw new Error('No active tab');
                    
                    const resp = await chrome.tabs.sendMessage(tab.id, { 
                        action: 'SCRAPE', 
                        type: 'note-detail', 
                        url: note.link 
                    });
                    
                    if (resp && resp.success && resp.data) {
                        const detail = resp.data;
                        // Download Logic
                        // Cover
                        if (detail.cover) downloadMedia(detail.cover, `cover_${detail.note_id}`);
                        // Video
                        if (detail.video) downloadMedia(detail.video, `video_${detail.note_id}`);
                        // Images
                        // 只有当图片列表长度大于1时才下载图片列表，避免单图时与封面重复
                        if (detail.images && detail.images.length > 1) {
                            detail.images.forEach((img, i) => downloadMedia(img, `image_${detail.note_id}_${i}`));
                        }
                        dlBtn.textContent = '下载完成';
                    } else {
                        throw new Error('详情获取失败');
                    }
                } catch (e) {
                    console.error(e);
                    dlBtn.textContent = '失败';
                } finally {
                    setTimeout(() => {
                        dlBtn.textContent = '下载素材';
                        dlBtn.disabled = false;
                    }, 2000);
                }
            };

            actions.appendChild(dlBtn);

            // Single Uncollect Button
            if (isCollected) {
                const uncollectBtn = document.createElement('button');
                uncollectBtn.className = 'md-btn md-btn-text';
                uncollectBtn.style.padding = '2px 6px';
                uncollectBtn.style.fontSize = '11px';
                uncollectBtn.style.height = 'auto';
                uncollectBtn.style.color = '#d93025'; // Red color
                uncollectBtn.textContent = '取消收藏';
                
                uncollectBtn.onclick = async () => {
                    uncollectBtn.disabled = true;
                    uncollectBtn.textContent = '取消中...';
                    
                    try {
                        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                        if (!tab) throw new Error('No active tab');

                        const res = await chrome.tabs.sendMessage(tab.id, { 
                            action: 'BATCH_UNCOLLECT', 
                            noteIds: [note.note_id] 
                        });

                        if (res && res.success && res.successCount > 0) {
                            showToast('已取消收藏', 'success');
                            // Remove item from UI
                            item.style.opacity = '0';
                            setTimeout(() => item.remove(), 300);
                        } else {
                            const errorMsg = (res && res.error) ? res.error : '操作失败(无响应)';
                            throw new Error(errorMsg);
                        }
                    } catch (e) {
                        console.error(e);
                        showToast('操作失败', 'error');
                        uncollectBtn.textContent = '失败';
                        uncollectBtn.disabled = false;
                    }
                };
                actions.appendChild(uncollectBtn);
            }

            // Single Unlike Button
            if (isLiked) {
                const unlikeBtn = document.createElement('button');
                unlikeBtn.className = 'md-btn md-btn-text';
                unlikeBtn.style.padding = '2px 6px';
                unlikeBtn.style.fontSize = '11px';
                unlikeBtn.style.height = 'auto';
                unlikeBtn.style.color = '#d93025'; // Red color
                unlikeBtn.textContent = '取消点赞';
                
                unlikeBtn.onclick = async () => {
                    unlikeBtn.disabled = true;
                    unlikeBtn.textContent = '取消中...';
                    
                    try {
                        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                        if (!tab) throw new Error('No active tab');

                        const res = await chrome.tabs.sendMessage(tab.id, { 
                            action: 'BATCH_UNLIKE', 
                            noteIds: [note.note_id] 
                        });

                        if (res && res.success && res.successCount > 0) {
                            showToast('已取消点赞', 'success');
                            // Remove item from UI
                            item.style.opacity = '0';
                            setTimeout(() => item.remove(), 300);
                        } else {
                            const errorMsg = (res && res.error) ? res.error : '操作失败(无响应)';
                            throw new Error(errorMsg);
                        }
                    } catch (e) {
                        console.error(e);
                        showToast('操作失败', 'error');
                        unlikeBtn.textContent = '失败';
                        unlikeBtn.disabled = false;
                    }
                };
                actions.appendChild(unlikeBtn);
            }

            info.appendChild(title);
            info.appendChild(stats);
            info.appendChild(actions);

            item.appendChild(imgContainer);
            item.appendChild(info);
            listContainer.appendChild(item);
            });
        }
        
        // Initial Render
        renderList(currentDataNotes);
        
        container.appendChild(listContainer);

        const excelBtn = document.createElement('button');
        excelBtn.className = 'md-btn md-btn-outlined';
        excelBtn.style.marginTop = '8px';
        excelBtn.style.width = '100%';
        excelBtn.textContent = '导出已选为 Excel';
        excelBtn.onclick = () => {
             // Filter selected
             const selectedNotes = currentDataNotes.filter(n => selectedNoteIds.has(n.note_id));
             if (selectedNotes.length === 0) {
                 showToast('请至少选择一条记录', 'error');
                 return;
             }
             const flatData = selectedNotes.map(n => ({
                 标题: n.title,
                 链接: n.link,
                 点赞数: n.likes,
                 类型: n.type,
                 封面图: n.cover
             }));
             exportToExcel(flatData, `xhs_notes_${Date.now()}`);
        };
        container.appendChild(excelBtn);
        
        container.dataset.rawData = JSON.stringify(data);
    } else {
        // Fallback
        container.textContent = JSON.stringify(data, null, 2);
        container.dataset.rawData = JSON.stringify(data);
    }
}

function bindSyncButton(btnId, resultAreaId, statusId) {
  const btn = document.getElementById(btnId);
  const resultArea = document.getElementById(resultAreaId);

  if (!btn) return;

  // Store original HTML
  if (!btn.dataset.originalHtml) {
      btn.dataset.originalHtml = btn.innerHTML;
  }

  btn.addEventListener('click', async () => {
    // 1. Handle Cancel
    if (btn.dataset.isSyncing === 'true') {
        window.__cancelSync = true;
        btn.textContent = '正在取消...';
        btn.disabled = true;
        return;
    }

    if (btn.disabled) return;
    
    // Read from dataset if available, otherwise textContent
    let content = resultArea.dataset.rawData || resultArea.textContent;
    
    if (!content || content.startsWith('点击') || content.startsWith('正在') || content.startsWith('采集失败') || content.startsWith('错误')) {
      setStatus(statusId, '请先采集有效数据', 'error');
      return;
    }

    try {
      // 2. Start Sync
      window.__cancelSync = false;
      btn.dataset.isSyncing = 'true';
      // Use originalHtml
      const originalHtml = btn.dataset.originalHtml || btn.innerHTML;
      
      btn.textContent = '取消同步';
      btn.classList.add('btn-stop');
      
      const data = JSON.parse(content);
      await syncToFeishu(data, statusId);
    } catch (e) {
      setStatus(statusId, '数据解析失败: ' + e.message, 'error');
    } finally {
      // 3. Reset
      btn.dataset.isSyncing = 'false';
      btn.innerHTML = btn.dataset.originalHtml || '同步飞书'; // Restore HTML
      btn.classList.remove('btn-stop');
      btn.disabled = false;
      btn.style.opacity = '';
      btn.style.cursor = '';
    }
  });
}

function bindClearButton(btnId, resultAreaId, statusId) {
  const btn = document.getElementById(btnId);
  const area = document.getElementById(resultAreaId);
  if (!btn || !area) return;
  btn.addEventListener('click', () => {
    area.innerHTML = '<div class="placeholder-text">等待采集...</div>';
    area.dataset.rawData = '';
    setStatus(statusId, '已清空', 'success');
  });
}

// --- Feishu Sync Logic ---

async function syncToFeishu(data, statusId) {
  // 1. Get Config
  const { feishu_config, interval_config } = await chrome.storage.local.get(['feishu_config', 'interval_config']);

  const promptConfig = (msg) => {
      if (confirm(`${msg}\n\n是否立即前往配置页进行设置？`)) {
           const settingsTab = document.querySelector('.scraper-tab-item[data-tab="tab-settings"]');
           if (settingsTab) settingsTab.click();
      }
  };

  if (!feishu_config) {
    setStatus(statusId, '请先配置飞书信息', 'error');
    promptConfig('检测到您尚未配置飞书信息，无法同步。');
    return;
  }

  const { bearer, link, tableProfileId, tableNotesId, tableLikedCollectedId } = feishu_config;
  
  // Backwards compatibility or mapping if needed
  // Note: initSettings uses {bearer, link, tableProfileId, tableNotesId}
  // But wait, look at initSettings save logic:
  // config = { bearer: ..., link: ..., tableProfileId: ..., tableNotesId: ... }
  // So keys are: bearer, link, tableProfileId, tableNotesId.
  // Previous code might have used 'bearerToken' or 'bitableLink'.
  // Let's normalize here.
  
  const bearerToken = bearer || feishu_config.bearerToken;
  const bitableLink = link || feishu_config.bitableLink;

  if (!bearerToken || !bitableLink) {
    setStatus(statusId, '请完善飞书配置', 'error');
    promptConfig('飞书授权码或表格链接未配置，无法同步。');
    return;
  }

  // Extract App Token (Base ID) from Link or Token directly
  // Pattern: /base/([^?]+)
  let appToken = '';
  if (bitableLink.includes('/base/')) {
      const match = bitableLink.match(/\/base\/([a-zA-Z0-9]+)/);
      if (match) appToken = match[1];
  } else {
      // Assume the input is the token itself
      appToken = bitableLink;
  }

  if (!appToken) {
      alert('多维表格链接格式不正确或未提供 Base Token');
      return;
  }

  // Determine Table ID based on data type
  let tableId = '';
  const isProfile = data.type && data.type.includes('Profile Info');
  const isSingleNote = data.type && data.type.includes('Single Note');
  // Check for Liked or Collected in type string
  const isLikedOrCollected = data.type && (data.type.includes('Liked') || data.type.includes('Collected') || data.type.includes('profile-liked') || data.type.includes('profile-collect'));
  
  if (isProfile) {
      tableId = tableProfileId;
  } else if (isLikedOrCollected) {
      tableId = tableLikedCollectedId;
  } else if (isSingleNote && feishu_config.tableDailyId) {
      // Single Note -> Daily Table (Priority)
      tableId = feishu_config.tableDailyId;
  } else {
      // Notes (List or Single) - Default to Profile Notes Table
      tableId = tableNotesId;
  }
  
  if (!tableId) {
      let msg = '';
      if (isProfile) msg = '请配置"博主库 Table ID"';
      else if (isLikedOrCollected) msg = '请配置"赞藏笔记库 Table ID"';
      else if (isSingleNote) msg = '请配置"日常采集库 Table ID"';
      else msg = '请配置"博主笔记库 Table ID"';
      
      setStatus(statusId, msg, 'error');
      promptConfig(msg + '，否则无法同步对应数据。');
      return;
  }

  // 2. Prepare Records
  // Normalize data to array of records
  let items = [];
  if (data.notes) {
      items = data.notes; // Profile Notes
      // Filter selected items if applicable (for profile notes list)
      const container = document.getElementById('result-notes');
      if (container && container.dataset.selectedIds) {
          try {
              const selectedIds = new Set(JSON.parse(container.dataset.selectedIds));
              if (selectedIds.size > 0) {
                  const originalCount = items.length;
                  items = items.filter(n => selectedIds.has(n.note_id));
                  console.log(`[Sync] Filtered notes: ${items.length}/${originalCount}`);
                  if (items.length === 0) {
                      setStatus(statusId, '未选择任何笔记', 'error');
                      return;
                  }
              }
          } catch (e) {
              console.warn('Failed to parse selectedIds', e);
          }
      }
  }
  else if (Array.isArray(data)) items = data; // Search Feed (DOM)
  else items = [data]; // Single item (Profile Info or Single Note)

  // Map fields dynamically based on type
  let records = [];
  const toInt = (v) => {
    if (!v) return 0;
    const s = String(v).trim().toLowerCase();
    let n = parseFloat(s);
    if (s.includes('w') || s.includes('万')) n *= 10000;
    if (s.includes('千')) n *= 1000;
    return Number.isFinite(n) ? Math.floor(n) : 0;
  };
  // isSingleNote defined above
  const getSyncImagesEnabled = () => {
    if (statusId === 'status-notes') {
      const el = document.getElementById('toggle-sync-images-notes');
      return !!(el && el.checked);
    }
    if (statusId === 'status-note-detail') {
      const el = document.getElementById('toggle-sync-images-single');
      return !!(el && el.checked);
    }
    if (statusId === 'status-search-notes') {
      const el = document.getElementById('toggle-sync-images-search-notes');
      return !!(el && el.checked);
    }
    // Profile Info Sync also supports images if a toggle exists, or default to true?
    // Currently, Profile tab does NOT have a toggle. Let's assume true or add a toggle.
    // Based on user request "博主信息采集增加头像采集", we should probably enable it.
    // Let's check if there is a toggle for profile.
    const elProfile = document.getElementById('toggle-sync-images-profile');
    if (elProfile) return !!elProfile.checked;
    
    // Default to true for Profile if no toggle exists, as per request intent implies feature addition
    if (statusId === 'status-profile') return true;

    return false;
  };
  const syncImages = getSyncImagesEnabled();
  const makeTagsArray = (val) => {
    if (Array.isArray(val)) {
      return val
        .filter(v => v != null)
        .map(s => String(s).trim())
        .filter(s => s.length > 0);
    }
    if (!val) return [];
    return String(val).split(',').map(s => s.trim()).filter(s => s.length > 0);
  };
  
  const buildRecordFields = (item, detail, videoUrl, images, coverUrl, coverToken, imageTokens) => {
      return {
          "作品ID": (detail && detail.note_id) || item.note_id || item.id || '',
          "标题": (detail && detail.title) || item.title || '无标题',
          "作者": (detail && detail.author && detail.author.name) || (item.author && item.author.name) || item.user?.nickname || '',
          "作品内容": (detail && detail.desc) || item.desc || '',
          "发布时间": (detail && detail.publish_time) || item.publish_time || '',
          "点赞数": toInt((detail && detail.stats && detail.stats.likes) ?? (item.stats && item.stats.likes) ?? item.likes),
          "收藏数": toInt((detail && detail.stats && detail.stats.collects) ?? (item.stats && item.stats.collects) ?? item.collects),
          "评论数": toInt((detail && detail.stats && detail.stats.comments) ?? (item.stats && item.stats.comments) ?? item.comments),
          "分享数": toInt((detail && detail.stats && detail.stats.shares) ?? (item.stats && item.stats.shares) ?? item.shares),
          "内容类型": videoUrl ? '视频' : '图文',
          "链接": item.link || '',
          "视频链接": videoUrl || '',
          "图片链接": (images && images.length) ? images.join('\n') : '',
          "封面链接": coverUrl || '',
          "封面附件": coverToken ? [{ file_token: coverToken }] : [],
          "图片附件": imageTokens,
          "标签": makeTagsArray((detail && detail.tags) || item.tags)
      };
  };
  
  if (isProfile) {
      // Mapping for Profile Info
      records = items.map(item => ({
          fields: {
              "账号名称": item.name || '',
              "主页介绍": item.desc || '',
              "头像": item.avatar || '',
              "主页链接": item.link || '',
              "粉丝数": toInt(item.stats?.fans),
              "赞藏数": toInt(item.stats?.likes_collects),
              "标签": makeTagsArray(item.tags)
          }
      }));

      if (records.length > 0) {
        setStatus(statusId, '正在同步...', 'loading');
        showToast('正在同步博主信息到飞书，请勿关闭窗口...', 'loading');
        try {
          const resp = await chrome.runtime.sendMessage({
            type: 'FEISHU_CREATE_RECORDS',
            payload: { appToken, tableId, records, bearer: bearerToken }
          });
          if (!resp || !resp.success) {
            const msg = resp && resp.data ? (resp.data.msg || JSON.stringify(resp.data)) : (resp && resp.error) || '未知错误';
            setStatus(statusId, '同步失败: ' + msg, 'error');
            showToast('同步失败: ' + msg, 'error');
            return;
          }
        } catch (e) {
          setStatus(statusId, '同步失败: ' + e.message, 'error');
          showToast('同步失败: ' + e.message, 'error');
          return;
        }
      }
  } else if (isSingleNote) {
      const item = items[0] || {};
      
      // Special Logic: If syncing to Daily Table, only sync Link
      if (tableId === feishu_config.tableDailyId) {
          let link = item.link || data.link || data.url || '';
          if (!link) {
              const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
              if (t && t.url) link = t.url;
          }
          
          setStatus(statusId, '正在同步链接...', 'loading');
          
          const singleRecord = {
              fields: { "链接": link }
          };
          
          try {
            const resp = await chrome.runtime.sendMessage({
              type: 'FEISHU_CREATE_RECORDS',
              payload: { appToken, tableId, records: [singleRecord], bearer: bearerToken }
            });
            
            if (!resp || !resp.success) {
                const msg = resp && resp.data ? (resp.data.msg || JSON.stringify(resp.data)) : (resp && resp.error) || '未知错误';
                setStatus(statusId, '同步失败: ' + msg, 'error');
                showToast('同步失败: ' + msg, 'error');
            } else {
                setStatus(statusId, `同步成功`, 'success');
                showToast('已同步链接到日常采集库', 'success');
            }
          } catch (e) {
              setStatus(statusId, '同步失败: ' + e.message, 'error');
              showToast('同步失败: ' + e.message, 'error');
          }
          return;
      }

      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      // Use configured interval
      const minDelay = (interval_config && interval_config.min) || 5;
      const maxDelay = (interval_config && interval_config.max) || 10;
      const randDelay = () => (minDelay * 1000) + Math.floor(Math.random() * ((maxDelay - minDelay) * 1000));
      
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      setStatus(statusId, '正在同步 0/1', 'loading');
      showToast('正在同步单篇笔记，请勿关闭...', 'loading');
      
      // 优先补齐详情字段
      let detail = null;
      // 如果数据来源已经是 DOM (note-detail-dom)，则无需再次请求
      if (data.source !== 'DOM') {
          try {
            if (tab) {
              const resp = await chrome.tabs.sendMessage(tab.id, { action: 'SCRAPE', type: 'note-detail-dom', url: item.link });
              if (resp && resp.success) detail = resp.data;
            }
          } catch {}
      } else {
          // 如果已经是 DOM 数据，直接使用，无需再次请求
          // 但 data 本身就是 detail 结构
          detail = data;
      }

      const title = (detail && detail.title) || item.title || '无标题';
      const desc = (detail && detail.desc) || item.desc || '';
      const authorName = (detail && detail.author && detail.author.name) || (item.author && item.author.name) || '';
      const coverUrl = (detail && detail.cover) || item.cover || '';
      const images = (detail && detail.images) || item.images || [];
      const videoUrl = (detail && detail.video) || item.video || item.video_url || '';
      let coverToken = '';
        if (coverUrl && syncImages) {
          await sleep(randDelay());
          try {
            let bytes = null;
            if (tab) {
              const f = await chrome.tabs.sendMessage(tab.id, { action: 'FETCH_IMAGE_DATA', url: coverUrl });
              if (f && f.success) bytes = f.bytes;
            }
            const { cached_xhs_cookie } = await chrome.storage.local.get(['cached_xhs_cookie']);
            const up = await chrome.runtime.sendMessage({
              type: 'FEISHU_UPLOAD_MEDIA',
              payload: bytes ? { bytes, appToken, bearer: bearerToken } : { coverUrl: coverUrl, appToken, bearer: bearerToken, cookie: cached_xhs_cookie }
            });
            if (up && up.success) coverToken = (up.data && up.data.data && up.data.data.file_token) || '';
          } catch {}
        }
        let imageTokens = [];
        if (images && images.length && syncImages) {
          for (const u of images) {
            if (window.__cancelSync) break;
            await sleep(randDelay());
            try {
              let bytes = null;
              if (tab) {
                const f = await chrome.tabs.sendMessage(tab.id, { action: 'FETCH_IMAGE_DATA', url: u });
                if (f && f.success) bytes = f.bytes;
              }
              const { cached_xhs_cookie } = await chrome.storage.local.get(['cached_xhs_cookie']);
              const r = await chrome.runtime.sendMessage({
                type: 'FEISHU_UPLOAD_MEDIA',
                payload: bytes ? { bytes, appToken, bearer: bearerToken } : { coverUrl: u, appToken, bearer: bearerToken, cookie: cached_xhs_cookie }
              });
              const tok = (r && r.success && r.data && r.data.data && r.data.data.file_token) ? r.data.data.file_token : '';
              if (tok) imageTokens.push({ file_token: tok });
            } catch {}
          }
        }
      const singleRecord = {
        fields: buildRecordFields(item, detail, videoUrl, images, coverUrl, coverToken, imageTokens)
      };
      try { console.log('[Feishu] Saving record fields', singleRecord.fields); } catch {}
      try {
        const resp = await chrome.runtime.sendMessage({
          type: 'FEISHU_CREATE_RECORDS',
          payload: { appToken, tableId, records: [singleRecord], bearer: bearerToken }
        });
        if (!resp || !resp.success) {
          const msg = resp && resp.data ? (resp.data.msg || JSON.stringify(resp.data)) : (resp && resp.error) || '未知错误';
          setStatus(statusId, '同步失败: ' + msg, 'error');
          showToast('同步失败: ' + msg, 'error');
        } else {
          records = [singleRecord];
          setStatus(statusId, `已同步 1/1`, 'loading');
          showToast('同步成功!', 'success');

          // Sync to Daily Collection Table (Links Only) if configured (Single Note)
          // Removed because we now have a dedicated logic above for Daily Table Sync
        }
      } catch (e) {
        setStatus(statusId, '同步失败: ' + e.message, 'error');
        showToast('同步失败: ' + e.message, 'error');
      }

  } else {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      // Use configured interval
      const minDelay = (interval_config && interval_config.min) || 5;
      const maxDelay = (interval_config && interval_config.max) || 10;
      const randDelay = () => (minDelay * 1000) + Math.floor(Math.random() * ((maxDelay - minDelay) * 1000));
      
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      let processed = 0;
      records = [];
      if (!window.__notesProgress) window.__notesProgress = { collected: 0, total: items.length, synced: 0 };
      window.__notesProgress.synced = 0;
      
      showToast(`准备同步 ${items.length} 条笔记，请勿关闭窗口...`, 'loading');

      for (const item of items) {
        if (window.__cancelSync) {
            setStatus(statusId, '同步已取消', 'info');
            showToast('同步已取消', 'info');
            return;
        }
        let detail = null;
        try {
          if (tab) {
            const resp = await chrome.tabs.sendMessage(tab.id, { action: 'SCRAPE', type: 'note-detail', url: item.link });
            if (resp && resp.success) detail = resp.data;
          }
        } catch {}
        const title = (detail && detail.title) || item.title || '无标题';
        const desc = (detail && detail.desc) || '';
        const authorName = (detail && detail.author && detail.author.name) || item.author?.name || item.user?.nickname || '';
        const coverUrl = (detail && detail.cover) || item.cover || '';
        const images = (detail && detail.images) || item.images || [];
        const videoUrl = (detail && detail.video) || item.video || item.video_url || '';
        let coverToken = '';
        if (coverUrl && syncImages) {
          await sleep(randDelay());
          try {
            let bytes = null;
            if (tab) {
              const f = await chrome.tabs.sendMessage(tab.id, { action: 'FETCH_IMAGE_DATA', url: coverUrl });
              if (f && f.success) bytes = f.bytes;
            }
            // 如果页面获取二进制失败（例如 Cookie 问题），尝试回退到 URL 模式，但让 Background 使用缓存的 Cookie
            const { cached_xhs_cookie } = await chrome.storage.local.get(['cached_xhs_cookie']);
            
            const up = await chrome.runtime.sendMessage({
              type: 'FEISHU_UPLOAD_MEDIA',
              payload: bytes ? { bytes, appToken, bearer: bearerToken } : { coverUrl: coverUrl, appToken, bearer: bearerToken, cookie: cached_xhs_cookie }
            });
            if (up && up.success) coverToken = (up.data && up.data.data && up.data.data.file_token) || '';
          } catch {}
        }
        let imageTokens = [];
        if (images && images.length && syncImages) {
          for (const u of images) {
            if (window.__cancelSync) break;
            await sleep(randDelay());
            try {
              let bytes = null;
              if (tab) {
                const f = await chrome.tabs.sendMessage(tab.id, { action: 'FETCH_IMAGE_DATA', url: u });
                if (f && f.success) bytes = f.bytes;
              }
              const { cached_xhs_cookie } = await chrome.storage.local.get(['cached_xhs_cookie']);
              const r = await chrome.runtime.sendMessage({
                type: 'FEISHU_UPLOAD_MEDIA',
                payload: bytes ? { bytes, appToken, bearer: bearerToken } : { coverUrl: u, appToken, bearer: bearerToken, cookie: cached_xhs_cookie }
              });
              const tok = (r && r.success && r.data && r.data.data && r.data.data.file_token) ? r.data.data.file_token : '';
              if (tok) imageTokens.push({ file_token: tok });
            } catch {}
          }
        }
        const singleRecord = {
          fields: buildRecordFields(item, detail, videoUrl, images, coverUrl, coverToken, imageTokens)
        };
        try { console.log('[Feishu] Saving record fields', singleRecord.fields); } catch {}
        
        if (window.__cancelSync) return;

        try {
          const resp = await chrome.runtime.sendMessage({
            type: 'FEISHU_CREATE_RECORDS',
            payload: { appToken, tableId, records: [singleRecord], bearer: bearerToken }
          });
          if (!resp || !resp.success) {
            const msg = resp && resp.data ? (resp.data.msg || JSON.stringify(resp.data)) : (resp && resp.error) || '未知错误';
            setStatus(statusId, '同步失败: ' + msg, 'error');
            // Don't toast error for every item failure to avoid spam, maybe just log or status
          } else {
            records.push(singleRecord);
            window.__notesProgress.synced = records.length;
            const p = window.__notesProgress;
            const txt = `已采集 ${p.collected || items.length}/${p.total || items.length} 条，已同步 ${p.synced} 条`;
            setStatus(statusId, txt, 'loading');
            showToast(`同步进度: ${records.length}/${items.length}，请勿关闭...`, 'loading');

            // Sync to Daily Collection Table (Links Only) if configured
            // Disable Daily Table sync for batch profile notes list as per user request
            /*
            const dailyTableId = (await new Promise(resolve => chrome.storage.local.get(['feishu_config'], r => resolve(r.feishu_config?.tableDailyId))) || '');
            if (dailyTableId && item.link) {
              try {
                 await chrome.runtime.sendMessage({
                  type: 'FEISHU_CREATE_RECORDS',
                  payload: { 
                    appToken, 
                    tableId: dailyTableId, 
                    records: [{ fields: { "链接": item.link } }], 
                    bearer: bearerToken 
                  }
                });
              } catch (e) {
                console.warn('Failed to sync to daily table', e);
              }
            }
            */
          }
        } catch (e) {
          setStatus(statusId, '同步失败: ' + e.message, 'error');
        }
        processed++;
        const syncedNow = (window.__notesProgress && window.__notesProgress.synced) || records.length;
        setStatus(statusId, `已获取详情 ${processed}/${items.length} 条，已同步 ${syncedNow} 条`, 'loading');
      }
  }

  setStatus(statusId, `已完成`, 'success');
  // Link removed
  showToast(`成功同步 ${records.length} 条数据到飞书!`, 'success');
}

function setStatus(targetId, message, type) {
  const el = document.getElementById(targetId);
  if (!el) return;
  let color = '#1976d2';
  if (type === 'success') color = '#4caf50';
  else if (type === 'error') color = '#e53935';
  else if (type === 'loading') color = '#ffa000';
  el.style.color = color;
  el.textContent = message;
}

// Links Logic Removed (LINK_ID_MAP, setTabLink)

function showToast(message, type, duration = 3000) {
  const el = document.getElementById('status-toast');
  if (!el) return;
  
  // 如果正在显示加载状态，则不自动隐藏，或者更新现有消息
  const isSticky = type === 'loading';
  
  el.textContent = message;
  el.style.display = 'block';
  el.style.background = type === 'success' ? 'rgba(76,175,80,0.9)' : (type === 'error' ? 'rgba(229,57,53,0.9)' : 'rgba(25,118,210,0.9)');
  
  // Adjust position for better visibility (Top center)
  el.style.top = '60px'; 
  el.style.bottom = 'auto';
  el.style.left = '50%';
  el.style.transform = 'translateX(-50%)';
  el.style.width = 'auto';
  el.style.maxWidth = '80%';
  el.style.textAlign = 'center';
  el.style.borderRadius = '20px';
  el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
  el.style.whiteSpace = 'normal'; // Allow wrapping for long messages
  el.style.zIndex = '1000';

  clearTimeout(window.__toastTimer);
  
  if (!isSticky) {
      window.__toastTimer = setTimeout(() => {
        el.style.display = 'none';
      }, duration);
  }
}

// Debug Mode
let titleClickCount = 0;
const titleEl = document.querySelector('.title-text h2');
if (titleEl) {
    titleEl.addEventListener('click', () => {
      titleClickCount++;
      if (titleClickCount >= 4) {
        titleClickCount = 0;
        chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL_DEVTOOLS' }).catch(() => {
            // Fallback: try to open window in new tab if devtools not supported
            window.open(chrome.runtime.getURL('sidepanel.html'), '_blank');
        });
        showToast('Debug Mode Triggered', 'success');
      }
    });
}

// Helper: Export to Excel (CSV)
function exportToExcel(data, filename) {
  if (!data || !Array.isArray(data) || data.length === 0) return;
  
  // Get all keys
  const keys = Object.keys(data[0]);
  
  // CSV Content
  let csvContent = "\uFEFF"; // BOM for Excel UTF-8
  csvContent += keys.join(",") + "\r\n";
  
  data.forEach(item => {
    const row = keys.map(k => {
      let val = item[k];
      if (val === null || val === undefined) val = '';
      val = String(val).replace(/"/g, '""'); // Escape quotes
      if (val.search(/("|,|\n)/g) >= 0) val = `"${val}"`; // Wrap in quotes
      return val;
    });
    csvContent += row.join(",") + "\r\n";
  });
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (filename || 'export') + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ... existing code ...
async function downloadMedia(url, filename) {
  if (!url) return;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Network response was not ok');
    let blob = await res.blob();
    
    // 如果是 WebP 图片，尝试转换为 JPEG
    if (blob.type === 'image/webp') {
        try {
            const bitmap = await createImageBitmap(blob);
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(bitmap, 0, 0);
            
            const jpgBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
            if (jpgBlob) {
                blob = jpgBlob;
                if (filename && !filename.toLowerCase().endsWith('.jpg') && !filename.toLowerCase().endsWith('.jpeg')) {
                    // Replace extension or append
                    filename = filename.replace(/\.\w+$/, '') + '.jpg';
                }
            }
        } catch (err) {
            console.warn('WebP to JPG conversion failed, using original', err);
        }
    }

    const blobUrl = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = blobUrl;
    // Ensure filename has an extension if possible
    if (filename && !filename.includes('.')) {
        const ext = blob.type.split('/')[1] || 'bin';
        filename = `${filename}.${ext}`;
    }
    
    a.download = filename || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  } catch (e) {
    console.error('Download failed', e);
    // Fallback: try opening in new tab
    window.open(url, '_blank');
  }
}
