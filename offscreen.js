// offscreen.js —— 本地转写：在 Offscreen Document 内用 Tesseract.js 跑 OCR
let worker = null;
let loading = null;
let status = 'idle'; // idle | loading | ready | error

function getWorker(langs) {
  if (worker) return Promise.resolve(worker);
  if (loading) return loading;
  status = 'loading';
  loading = Tesseract.createWorker(langs, 1, {
    workerPath: chrome.runtime.getURL('vendor/tesseract.worker.min.js'),
    corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/',
    langPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/tessdata',
    logger: (m) => {
      if (m && m.status === 'recognizing text') {
        chrome.runtime.sendMessage({ type: 'OCR_PROGRESS', payload: { progress: m.progress } }).catch(() => {});
      }
    }
  }).then(w => { worker = w; status = 'ready'; return w; })
    .catch(e => { status = 'error'; throw e; });
  return loading;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'OFFSCREEN_OCR') {
    (async () => {
      try {
        const { image, langs } = msg.payload || {};
        if (!image) { sendResponse({ success: false, error: 'no image' }); return; }
        const w = await getWorker(langs || 'chi_sim+chi_tra+eng');
        const { data } = await w.recognize(image);
        sendResponse({ success: true, text: (data.text || '').trim() });
      } catch (e) {
        sendResponse({ success: false, error: e.toString() });
      }
    })();
    return true;
  }
  if (msg.type === 'OFFSCREEN_OCR_STATUS') {
    sendResponse({ status });
    return true;
  }
});
