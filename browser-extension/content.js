// 页面内浮窗：四六级单词 + 切换页面名言弹窗
(function () {
  const STORAGE_KEY = "wwState";
  const REVIEW_INTERVALS = WW.REVIEW_INTERVALS;
  let state = { learned: {}, daily: {}, mistakes: {}, level: "all", quoteOn: true, quoteMinGap: 5 };
  let currentWord = null;
  let panelEl = null;
  let fabEl = null;
  let quoteEl = null;
  let dragging = false;
  let autoTimer = null;

  const LEVELS = { all: "全部", CET4: "CET4", CET6: "CET6", 考研: "考研", 托福: "托福", SAT: "SAT" };

  function allWords() {
    const out = [];
    for (const [level, list] of Object.entries(WINDOW_WORDS)) {
      for (const item of list) {
        out.push({ level, word: item[0], phonetic: item[1], pos: item[2], meaning: item[3], example: item[4], exampleZh: item[5] });
      }
    }
    return out;
  }

  const WORDS = allWords();

  function loadState(cb) {
    chrome.storage.local.get(STORAGE_KEY, (data) => {
      state = WW.normalizeState(data[STORAGE_KEY]);
      cb && cb();
    });
  }

  function saveState() {
    try {
      chrome.storage.local.set({ [STORAGE_KEY]: state }, () => {});
    } catch (e) {
      /* 扩展上下文不可用时静默降级 */
    }
  }

  function pool() {
    const custom = WW.allWords(state.customBanks).filter((w) => w.custom);
    const words = WORDS.concat(custom);
    return WW.selectedWords(words, state);
  }

  function now() { return WW.studyNow(state); }

  function keyOf(word) {
    return WW.wordKey(word);
  }

  function pickWord() {
    const currentTime = now();
    const items = pool();
    if (!items.length) return null;
    const due = items.filter((w) => WW.due(w, state.learned, state.mistakes, currentTime));
    const target = due.length ? due[Math.floor(Math.random() * due.length)] : items[Math.floor(Math.random() * items.length)];
    const day = WW.todayKey(new Date(currentTime));
    state.daily[day] = (state.daily[day] || 0) + 1;
    saveState();
    return target;
  }

  function mark(word, known) {
    const key = keyOf(word);
    const prev = state.learned[key] || { level: 0, due: 0, seen: 0 };
    let level;
    if (known) {
      level = Math.min(Math.max(0, Math.floor(WW.asNumber(prev.level, 0))) + 1, REVIEW_INTERVALS.length - 1);
      const due = now() + REVIEW_INTERVALS[level] * 1000;
      state.learned[key] = { level, due, seen: WW.asNumber(prev.seen, 0) + 1 };
      if (state.mistakes[key]) state.mistakes[key].nextReviewAt = due;
    } else {
      level = 0;
      state.learned[key] = { level, due: now() + REVIEW_INTERVALS[0] * 1000, seen: WW.asNumber(prev.seen, 0) + 1 };
      recordMistake(word);
    }
    saveState();
  }

  function recordMistake(word) {
    const key = keyOf(word);
    const prev = state.mistakes[key] || { count: 0, lastAt: 0 };
    state.mistakes[key] = {
      level: word.level,
      bankId: word.bankId || word.level,
      bankName: word.bankName || word.level,
      word: word.word,
      phonetic: word.phonetic,
      pos: word.pos,
      meaning: word.meaning,
      example: word.example || "",
      exampleZh: word.exampleZh || "",
      count: Math.max(1, Math.floor(WW.asNumber(prev.count, 0)) + 1),
      lastAt: now(),
      nextReviewAt: now() + REVIEW_INTERVALS[0] * 1000,
    };
  }

  function mistakeCount() {
    return Object.keys(state.mistakes || {}).length;
  }

  function todayCount() {
    const day = WW.todayKey(new Date(now()));
    return state.daily[day] || 0;
  }

  function showWord() {
    currentWord = pickWord();
    if (!currentWord || !panelEl) return;
    const w = currentWord;
    panelEl.querySelector(".ww-word").textContent = w.word;
    panelEl.querySelector(".ww-phonetic").textContent = w.phonetic;
    WW.renderMeaning(panelEl.querySelector(".ww-meaning"), w);
    panelEl.querySelector(".ww-badge").textContent = w.bankName || LEVELS[w.level] || w.level;
    panelEl.querySelector(".ww-example-en").textContent = w.example;
    panelEl.querySelector(".ww-example-zh").textContent = w.exampleZh;
    panelEl.querySelector(".ww-foot-count").textContent = `今日 ${todayCount()} 词 · 错词本 ${mistakeCount()}`;
    panelEl.classList.add("ww-pop");
    setTimeout(() => panelEl.classList.remove("ww-pop"), 220);
  }

  function scheduleAuto() {
    if (autoTimer) clearTimeout(autoTimer);
    autoTimer = setTimeout(() => {
      if (panelEl && panelEl.style.display !== "none") showWord();
      scheduleAuto();
    }, (state.autoGap || 60) * 1000);
  }

  function buildPanel() {
    if (panelEl) return;
    const div = document.createElement("div");
    div.className = "ww-panel";
    div.innerHTML = `
      <div class="ww-head">
        <span class="ww-title">四六级单词随行</span>
        <span class="ww-badge">CET4</span>
        <button class="ww-icon-btn" data-act="close" title="隐藏">×</button>
      </div>
      <div class="ww-body">
        <div class="ww-word-row">
          <span class="ww-word">loading…</span>
          <span class="ww-phonetic"></span>
        </div>
        <div class="ww-meaning"></div>
        <div class="ww-example">
          <div class="ww-example-en"></div>
          <div class="ww-example-zh"></div>
        </div>
        <div class="ww-actions">
          <button class="ww-btn ww-btn-known" data-act="known">认识</button>
          <button class="ww-btn ww-btn-again" data-act="again">再学</button>
        </div>
      </div>
      <div class="ww-foot"><span class="ww-foot-count"></span> · Alt+Shift+W 可开关</div>`;
    document.documentElement.appendChild(div);

    div.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".ww-icon-btn") || e.target.closest(".ww-btn")) return;
      if (e.target.closest(".ww-head")) {
        dragging = true;
        div.setAttribute("data-dragging", "true");
        const rect = div.getBoundingClientRect();
        const dx = e.clientX - rect.left;
        const dy = e.clientY - rect.top;
        const move = (ev) => {
          div.style.right = "auto";
          div.style.left = Math.min(Math.max(0, ev.clientX - dx), window.innerWidth - rect.width) + "px";
          div.style.top = Math.min(Math.max(0, ev.clientY - dy), window.innerHeight - rect.height) + "px";
          div.style.bottom = "auto";
        };
        const up = () => {
          dragging = false;
          div.setAttribute("data-dragging", "false");
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      }
    });
    div.addEventListener("click", (e) => {
      const act = e.target.dataset && e.target.dataset.act;
      if (act === "close") hidePanel();
      else if (act === "known" && currentWord) {
        mark(currentWord, true);
        showWord();
      } else if (act === "again" && currentWord) {
        mark(currentWord, false);
        showWord();
      }
    });
    panelEl = div;
  }

  function buildFab() {
    if (fabEl) return;
    const btn = document.createElement("button");
    btn.className = "ww-fab";
    btn.textContent = "W";
    btn.title = "打开单词随行";
    btn.addEventListener("click", () => {
      showPanel();
    });
    document.documentElement.appendChild(btn);
    fabEl = btn;
  }

  function showPanel() {
    buildPanel();
    panelEl.style.display = "block";
    if (fabEl) fabEl.style.display = "none";
    showWord();
  }

  function hidePanel() {
    if (panelEl) panelEl.style.display = "none";
    if (fabEl) fabEl.style.display = "flex";
  }

  function showQuote() {
    if (!state.quoteOn) return;
    const done = (quote) => {
      if (!quote || !Array.isArray(quote)) return;
      if (!quoteEl) {
        const el = document.createElement("div");
        el.className = "ww-quote";
        el.innerHTML = '<div class="ww-quote-en"></div><div class="ww-quote-zh"></div>';
        document.documentElement.appendChild(el);
        quoteEl = el;
      }
      quoteEl.querySelector(".ww-quote-en").textContent = quote[0];
      quoteEl.querySelector(".ww-quote-zh").textContent = quote[1];
      quoteEl.setAttribute("data-visible", "true");
      setTimeout(() => quoteEl.setAttribute("data-visible", "false"), 6500);
    };
    try {
      chrome.runtime.sendMessage({ type: "getQuote" }, (quote) => {
        if (chrome.runtime.lastError) return;
        done(quote);
      });
    } catch (e) {
      /* 忽略 */
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === "togglePanel") {
      if (panelEl && panelEl.style.display !== "none") hidePanel();
      else showPanel();
      sendResponse({ ok: true });
    }
    return false;
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[STORAGE_KEY]) return;
    state = WW.normalizeState(changes[STORAGE_KEY].newValue);
    scheduleAuto();
  });

  try {
  loadState(() => {
      buildPanel();
      buildFab();
      showPanel();
      scheduleAuto();
      const lastQuote = state.lastQuoteAt || 0;
      const gapMin = (state.quoteMinGap || 5) * 60000;
      if (Date.now() - lastQuote >= gapMin) {
        state.lastQuoteAt = Date.now();
        saveState();
        showQuote();
      }
    });
    // 调试钩子：便于自动化测试读取词库统计
    try {
      window.__WW_DEBUG__ = {
        levels: Object.keys(WINDOW_WORDS),
        total: Object.values(WINDOW_WORDS).reduce((a, b) => a + b.length, 0),
      };
    } catch (e) {
      /* 忽略 */
    }
  } catch (e) {
    console.warn("[单词随行] 初始化失败", e);
  }
})();
