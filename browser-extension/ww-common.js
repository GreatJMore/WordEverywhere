// 扩展各页面共享的数据结构与复习工具。
(function (global) {
  const REVIEW_INTERVALS = [300, 1800, 43200, 86400, 172800, 345600, 604800, 1296000];
  const REVIEW_LABELS = ["5 分钟", "30 分钟", "12 小时", "1 天", "2 天", "4 天", "7 天", "15 天"];
  const BUILTIN_LEVELS = { all: "全部", CET4: "CET4", CET6: "CET6", 考研: "考研", 托福: "托福", SAT: "SAT" };
  const BUILTIN_BANK_IDS = ["CET4", "CET6", "考研", "托福", "SAT"];

  function asNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function todayKey(date = new Date()) {
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function wordFromCustom(item, bank) {
    if (!item || typeof item !== "object") return null;
    const word = String(item.word || "").trim();
    const meaning = String(item.meaning || "").trim();
    if (!word || !meaning) return null;
    return {
      custom: true,
      bankId: bank ? `custom:${bank.id}` : String(item.bankId || "custom"),
      bankName: bank ? bank.name : String(item.bankName || item.level || "自定义"),
      level: bank ? bank.name : String(item.bankName || item.level || "自定义"),
      source: String(item.source || "自定义词库"),
      word,
      phonetic: String(item.phonetic || ""),
      pos: String(item.pos || ""),
      meaning,
      example: String(item.example || ""),
      exampleZh: String(item.exampleZh || item.example_zh || ""),
    };
  }

  function normalizeBank(bank, index) {
    if (!bank || typeof bank !== "object") return null;
    const id = String(bank.id || `bank-${index + 1}`).trim().replace(/[^a-zA-Z0-9_-]/g, "-");
    const name = String(bank.name || `自定义词库 ${index + 1}`).trim();
    const words = Array.isArray(bank.words) ? bank.words.map((word) => wordFromCustom(word)).filter(Boolean) : [];
    return id && name && words.length ? { id, name, words } : null;
  }

  function normalizeState(raw) {
    const base = raw && typeof raw === "object" ? raw : {};
    let customBanks = Array.isArray(base.customBanks) ? base.customBanks.map(normalizeBank).filter(Boolean) : [];
    if (!customBanks.length && Array.isArray(base.customWords) && base.customWords.length) {
      const words = base.customWords.map((word) => wordFromCustom(word)).filter(Boolean);
      if (words.length) customBanks = [{ id: "legacy", name: "旧版自定义词库", words }];
    }
    const allBankIds = BUILTIN_BANK_IDS.concat(customBanks.map((bank) => `custom:${bank.id}`));
    let selectedBanks = Array.isArray(base.selectedBanks) ? base.selectedBanks.map(String).filter((id) => allBankIds.includes(id)) : [];
    if (!selectedBanks.length) {
      selectedBanks = base.level && base.level !== "all" && allBankIds.includes(base.level) ? [base.level] : [...allBankIds];
    }
    const state = {
      learned: base.learned && typeof base.learned === "object" ? base.learned : {},
      daily: base.daily && typeof base.daily === "object" ? base.daily : {},
      mistakes: base.mistakes && typeof base.mistakes === "object" ? base.mistakes : {},
      customBanks,
      selectedBanks,
      level: typeof base.level === "string" ? base.level : "all",
      quoteOn: base.quoteOn !== false,
      quoteMinGap: asNumber(base.quoteMinGap, 5),
      autoGap: asNumber(base.autoGap, 60),
      lastQuoteAt: asNumber(base.lastQuoteAt, 0),
      debugDayOffset: Math.max(0, Math.floor(asNumber(base.debugDayOffset, 0))),
      debugSnapshot: base.debugSnapshot && typeof base.debugSnapshot === "object" ? base.debugSnapshot : null,
    };
    const daily = {};
    Object.entries(state.daily).forEach(([key, value]) => {
      daily[key] = Math.max(0, Math.floor(asNumber(value, 0)));
    });
    state.daily = daily;

    const learned = {};
    Object.entries(state.learned).forEach(([key, value]) => {
      if (!value || typeof value !== "object") return;
      const migratedKey = customBanks.some((bank) => bank.id === "legacy") && key.startsWith("custom::") ? key.replace("custom::", "custom:legacy::") : key;
      learned[migratedKey] = {
        level: Math.max(0, Math.floor(asNumber(value.level, 0))),
        due: Math.max(0, asNumber(value.due, 0)),
        seen: Math.max(0, Math.floor(asNumber(value.seen, 0))),
        lastReviewedAt: asNumber(value.lastReviewedAt, 0),
      };
    });
    state.learned = learned;

    const mistakes = {};
    Object.entries(state.mistakes).forEach(([key, value]) => {
      if (!value || typeof value !== "object" || !value.word) return;
      const isLegacyCustom = customBanks.some((bank) => bank.id === "legacy") && key.startsWith("custom::");
      const migratedKey = isLegacyCustom ? key.replace("custom::", "custom:legacy::") : key;
      mistakes[migratedKey] = {
        ...value,
        bankId: isLegacyCustom ? "custom:legacy" : (value.bankId || value.level),
        bankName: isLegacyCustom ? "旧版自定义词库" : (value.bankName || value.level),
        count: Math.max(1, Math.floor(asNumber(value.count, 1))),
        lastAt: asNumber(value.lastAt, Date.now()),
        nextReviewAt: asNumber(value.nextReviewAt, asNumber(value.lastAt, Date.now())),
      };
    });
    state.mistakes = mistakes;
    return state;
  }

  function wordKey(word) {
    const name = String(word && word.word || "").trim().toLowerCase();
    return `${word && (word.bankId || word.level) || "自定义"}::${name}`;
  }

  function allWords(customBanks) {
    const output = [];
    Object.entries(builtinWordMap()).forEach(([level, list]) => {
      list.forEach((item) => {
        output.push({ bankId: level, bankName: level, level, word: item[0], phonetic: item[1], pos: item[2], meaning: item[3], example: item[4], exampleZh: item[5] });
      });
    });
    (customBanks || []).forEach((bank) => {
      const seen = new Set();
      (bank.words || []).forEach((item) => {
        const word = wordFromCustom(item, bank);
        if (!word || seen.has(word.word.toLowerCase())) return;
        seen.add(word.word.toLowerCase());
        output.push(word);
      });
    });
    return output;
  }

  function selectedWords(words, state) {
    const selected = new Set(state.selectedBanks || []);
    return words.filter((word) => selected.has(word.bankId || word.level));
  }

  function builtinWordMap() {
    if (global.WINDOW_WORDS && typeof global.WINDOW_WORDS === "object") return global.WINDOW_WORDS;
    try {
      return typeof WINDOW_WORDS !== "undefined" ? WINDOW_WORDS : {};
    } catch (error) {
      return {};
    }
  }

  // Keep imported meanings as text and highlight every part-of-speech marker.
  function renderMeaning(container, word) {
    if (!container) return;
    container.textContent = "";
    const text = `${word && word.pos || ""} ${word && word.meaning || ""}`.trim();
    const pattern = /(^|[\s;；,，、/])((?:vt|vi|adj|adv|prep|conj|pron|num|art|int|aux|abbr|n|v)\.?)((?=$|[\s;；,，、/()\[\]【】]|[\u3400-\u9fff]))/gi;
    let cursor = 0;
    let match;
    while ((match = pattern.exec(text))) {
      container.appendChild(document.createTextNode(text.slice(cursor, match.index) + match[1]));
      const tag = document.createElement("b");
      tag.className = "pos-tag";
      tag.textContent = match[2];
      container.appendChild(tag);
      cursor = pattern.lastIndex;
    }
    container.appendChild(document.createTextNode(text.slice(cursor)));
  }

  function studyNow(state) {
    return Date.now() + Math.max(0, asNumber(state && state.debugDayOffset, 0)) * 86400000;
  }

  function due(word, learned, mistakes, now = Date.now()) {
    const progress = learned[wordKey(word)];
    const mistake = mistakes[wordKey(word)];
    return Boolean((progress && asNumber(progress.due, 0) <= now) || (mistake && asNumber(mistake.nextReviewAt, mistake.lastAt) <= now));
  }

  global.WW = {
    REVIEW_INTERVALS,
    REVIEW_LABELS,
    BUILTIN_LEVELS,
    BUILTIN_BANK_IDS,
    asNumber,
    todayKey,
    wordFromCustom,
    normalizeState,
    wordKey,
    allWords,
    selectedWords,
    builtinWordMap,
    renderMeaning,
    studyNow,
    due,
  };
})(globalThis);
