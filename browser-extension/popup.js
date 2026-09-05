// Popup：学习卡片、四选一测验与设置

const STORAGE_KEY = "wwState";
const REVIEW_INTERVALS = WW.REVIEW_INTERVALS;
let state = { learned: {}, daily: {}, mistakes: {}, level: "all", quoteOn: true, quoteMinGap: 5, autoGap: 60 };
let currentWord = null;
let quizWords = [];
let quizIdx = 0;
let quizRight = 0;
let quizWrong = 0;

const LEVELS = { all: "全部", CET4: "CET4", CET6: "CET6", 考研: "考研", 托福: "托福", SAT: "SAT" };

let WORDS = [];

function loadState(cb) {
  chrome.storage.local.get(STORAGE_KEY, (data) => {
    state = WW.normalizeState(data[STORAGE_KEY]);
    WORDS = WW.allWords(state.customBanks);
    cb && cb();
  });
}

function saveState() {
  chrome.storage.local.set({ [STORAGE_KEY]: state });
}

function now() { return WW.studyNow(state); }
function pool() { return WW.selectedWords(WORDS, state); }

function keyOf(word) { return WW.wordKey(word); }

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
  const previousLevel = Math.max(0, Math.floor(WW.asNumber(prev.level, 0)));
  if (known) {
    const level = Math.min(previousLevel + 1, REVIEW_INTERVALS.length - 1);
    const due = now() + REVIEW_INTERVALS[level] * 1000;
    state.learned[key] = { level, due, seen: WW.asNumber(prev.seen, 0) + 1 };
    if (state.mistakes[key]) state.mistakes[key].nextReviewAt = due;
  } else {
    state.learned[key] = { level: 0, due: now() + REVIEW_INTERVALS[0] * 1000, seen: WW.asNumber(prev.seen, 0) + 1 };
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

function renderStats() {
  const day = WW.todayKey(new Date(now()));
  const learned = Object.values(state.learned).filter((s) => s.level >= 1).length;
  const mastered = Object.values(state.learned).filter((s) => s.level >= 5).length;
  document.getElementById("todayCount").textContent = state.daily[day] || 0;
  document.getElementById("learnedCount").textContent = learned;
  document.getElementById("masteredCount").textContent = mastered;
  document.getElementById("mistakeLink").textContent = `查看错词本 (${mistakeCount()})`;
}

function renderWord() {
  currentWord = pickWord();
  if (!currentWord) return;
  const w = currentWord;
  document.getElementById("badge").textContent = w.bankName || LEVELS[w.level] || w.level;
  document.getElementById("word").textContent = w.word;
  document.getElementById("phonetic").textContent = w.phonetic;
  WW.renderMeaning(document.getElementById("meaning"), w);
  document.getElementById("exampleEn").textContent = w.example;
  document.getElementById("exampleZh").textContent = w.exampleZh;
}

function startQuiz() {
  quizWords = [...pool()].sort(() => Math.random() - 0.5).slice(0, 8);
  quizIdx = 0;
  quizRight = 0;
  quizWrong = 0;
  nextQuiz();
}

function nextQuiz() {
  if (quizIdx >= quizWords.length) {
    document.getElementById("quizWord").textContent = "完成";
    document.getElementById("quizScore").textContent = `对 ${quizRight} / ${quizRight + quizWrong}`;
    const box = document.getElementById("quizOptions");
    box.innerHTML = '<button id="quizRestartBtn" class="quiz-option" style="text-align:center;font-weight:700;color:#24715d;">再来一轮</button>';
    document.getElementById("quizRestartBtn").addEventListener("click", startQuiz);
    document.getElementById("quizFeedback").textContent = "";
    return;
  }
  const q = quizWords[quizIdx];
  const distractorPool = pool().filter((w) => w.meaning !== q.meaning && w.word.toLowerCase() !== q.word.toLowerCase());
  const choices = [q.meaning];
  while (choices.length < 4 && distractorPool.length) {
    const pick = distractorPool.splice(Math.floor(Math.random() * distractorPool.length), 1)[0];
    if (!choices.includes(pick.meaning)) choices.push(pick.meaning);
  }
  while (choices.length < 4) choices.push("（无此选项）");
  choices.sort(() => Math.random() - 0.5);

  document.getElementById("quizWord").textContent = q.word;
  document.getElementById("quizScore").textContent = `第 ${quizIdx + 1}/${quizWords.length} 题 · 对 ${quizRight}`;
  const box = document.getElementById("quizOptions");
  box.innerHTML = "";
  choices.forEach((choice) => {
    const btn = document.createElement("button");
    btn.className = "quiz-option";
    btn.textContent = choice;
    btn.addEventListener("click", () => answerQuiz(btn, choice, q));
    box.appendChild(btn);
  });
  document.getElementById("quizFeedback").textContent = "";
}

function answerQuiz(btn, choice, q) {
  const correct = choice === q.meaning;
  const feedback = document.getElementById("quizFeedback");
  if (correct) {
    quizRight++;
    btn.classList.add("correct");
    feedback.textContent = "回答正确 ✓";
  } else {
    quizWrong++;
    btn.classList.add("wrong");
    feedback.textContent = `正确答案：${q.meaning}`;
  }
  mark(q, correct);
  document.querySelectorAll(".quiz-option").forEach((el) => {
    if (el.textContent === q.meaning) el.classList.add("correct");
  });
  setTimeout(() => {
    quizIdx++;
    nextQuiz();
  }, 900);
}

function renderSettings() {
  const box = document.getElementById("popupBankCheckboxes"); box.innerHTML = "";
  const banks = WW.BUILTIN_BANK_IDS.map((id) => ({ id, name: id })).concat(state.customBanks.map((bank) => ({ id: `custom:${bank.id}`, name: bank.name })));
  banks.forEach((bank) => {
    const label = document.createElement("label"); label.className = "bank-check";
    const input = document.createElement("input"); input.type = "checkbox"; input.value = bank.id; input.checked = state.selectedBanks.includes(bank.id);
    const name = document.createElement("span"); name.textContent = bank.name; label.append(input, name); box.appendChild(label);
  });
  document.getElementById("selectedBankCount").textContent = `已选 ${state.selectedBanks.length}`;
  document.getElementById("quoteToggle").checked = state.quoteOn !== false;
  document.getElementById("quoteGapSel").value = String(state.quoteMinGap || 5);
  document.getElementById("autoGapSel").value = String(state.autoGap || 60);
}

document.addEventListener("DOMContentLoaded", () => {
  loadState(() => {
    renderWord();
    renderStats();
    renderSettings();
    startQuiz();

    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
        document.querySelectorAll(".tab-page").forEach((p) => p.classList.remove("active"));
        tab.classList.add("active");
        document.getElementById("tab-" + tab.dataset.tab).classList.add("active");
      });
    });

    document.getElementById("knownBtn").addEventListener("click", () => {
      if (currentWord) {
        mark(currentWord, true);
        renderWord();
        renderStats();
      }
    });
    document.getElementById("againBtn").addEventListener("click", () => {
      if (currentWord) {
        mark(currentWord, false);
        renderWord();
        renderStats();
      }
    });

    document.getElementById("popupBankCheckboxes").addEventListener("change", () => {
      const checked = [...document.querySelectorAll('#popupBankCheckboxes input:checked')].map((input) => input.value);
      if (!checked.length) { renderSettings(); return; }
      state.selectedBanks = checked; saveState(); renderSettings(); renderWord(); startQuiz();
    });
    document.getElementById("quoteToggle").addEventListener("change", (e) => {
      state.quoteOn = e.target.checked;
      saveState();
    });
    document.getElementById("quoteGapSel").addEventListener("change", (e) => {
      state.quoteMinGap = Number(e.target.value);
      saveState();
    });
    document.getElementById("autoGapSel").addEventListener("change", (e) => {
      state.autoGap = Number(e.target.value);
      saveState();
    });

    document.getElementById("openTabBtn").addEventListener("click", () => {
      chrome.tabs.create({ url: chrome.runtime.getURL("learn.html") });
    });
    document.getElementById("mistakeLink").addEventListener("click", () => {
      chrome.tabs.create({ url: chrome.runtime.getURL("learn.html?view=mistakes") });
    });
  });
});
