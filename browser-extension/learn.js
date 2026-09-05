// 学习页：背单词、四选一、错词本、每日间隔复习与词库导入导出

const STORAGE_KEY = "wwState";
let state = WW.normalizeState({});
let WORDS = [];
let currentWord = null;
let quizWords = [];
let quizIdx = 0;
let quizRight = 0;
let quizWrong = 0;
let reviewWords = [];
let reviewIdx = 0;
let reviewMode = false;
let reviewStage = "idle";
let reviewQuizIdx = 0;
let reviewQuizRight = 0;
let reviewQuizWrong = 0;
let reviewCompletionIdx = 0;
let reviewCompletionRight = 0;
let reviewCompletionWrong = 0;
let activeView = "learn";

const LEVELS = { ...WW.BUILTIN_LEVELS, 自定义: "自定义" };

function loadState(cb) {
  chrome.storage.local.get(STORAGE_KEY, (data) => {
    if (chrome.runtime.lastError) {
      console.warn("[单词随行] 读取学习数据失败", chrome.runtime.lastError.message);
      state = WW.normalizeState({});
    } else {
      state = WW.normalizeState(data && data[STORAGE_KEY]);
    }
    WORDS = WW.allWords(state.customBanks);
    cb && cb();
  });
}

function saveState(callback) {
  state = WW.normalizeState(state);
  chrome.storage.local.set({ [STORAGE_KEY]: state }, () => {
    if (chrome.runtime.lastError) console.warn("[单词随行] 保存学习数据失败", chrome.runtime.lastError.message);
    if (callback) callback();
  });
}

function keyOf(word) { return WW.wordKey(word); }
function now() { return WW.studyNow(state); }
function pool() { return WW.selectedWords(WORDS, state); }
function reviewPool() { return pool().filter((word) => state.mistakes[keyOf(word)] && WW.due(word, state.learned, state.mistakes, now())); }

function incrementToday() {
  const day = WW.todayKey(new Date(now()));
  state.daily[day] = WW.asNumber(state.daily[day], 0) + 1;
}

function pickWord() {
  const items = pool();
  if (!items.length) return null;
  const due = items.filter((word) => WW.due(word, state.learned, state.mistakes, now()));
  const candidates = due.length ? due : items;
  const target = candidates[Math.floor(Math.random() * candidates.length)];
  incrementToday();
  saveState();
  return target;
}

function recordMistake(word, at = now()) {
  const key = keyOf(word);
  const prev = state.mistakes[key] || { count: 0 };
  state.mistakes[key] = {
    bankId: word.bankId || word.level, bankName: word.bankName || word.level,
    level: word.level || "自定义", word: word.word, phonetic: word.phonetic || "", pos: word.pos || "",
    meaning: word.meaning || "", example: word.example || "", exampleZh: word.exampleZh || "",
    count: Math.max(1, Math.floor(WW.asNumber(prev.count, 0)) + 1),
    lastAt: at, nextReviewAt: at + WW.REVIEW_INTERVALS[0] * 1000,
  };
}

function mark(word, known) {
  const key = keyOf(word);
  const prev = state.learned[key] || { level: 0, due: 0, seen: 0 };
  const previousLevel = Math.max(0, Math.floor(WW.asNumber(prev.level, 0)));
  const level = known ? Math.min(previousLevel + 1, WW.REVIEW_INTERVALS.length - 1) : 0;
  const due = now() + WW.REVIEW_INTERVALS[level] * 1000;
  state.learned[key] = { level, due, seen: Math.floor(WW.asNumber(prev.seen, 0)) + 1, lastReviewedAt: now() };
  if (known) {
    if (state.mistakes[key]) state.mistakes[key].nextReviewAt = due;
  } else recordMistake(word);
  saveState();
}

function mistakeCount() { return Object.keys(state.mistakes || {}).length; }
function formatCount(value) { return Math.max(0, Math.floor(WW.asNumber(value, 0))).toLocaleString("zh-CN"); }

function formatTime(ts) {
  const date = new Date(WW.asNumber(ts, Date.now()));
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function renderMistakes() {
  const list = document.getElementById("mistakeList");
  const empty = document.getElementById("mistakeEmpty");
  const entries = Object.values(state.mistakes || {}).filter((item) => item && item.word).sort((a, b) => WW.asNumber(b.lastAt, 0) - WW.asNumber(a.lastAt, 0));
  document.getElementById("mistakeTabCount").textContent = formatCount(entries.length);
  list.innerHTML = "";
  empty.style.display = entries.length ? "none" : "block";
  entries.forEach((mistake) => {
    const item = document.createElement("div");
    item.className = "mistake-item";
    const main = document.createElement("div");
    main.className = "mistake-main";
    const badge = document.createElement("span"); badge.className = "badge"; badge.textContent = mistake.bankName || LEVELS[mistake.level] || mistake.level || "自定义";
    const title = document.createElement("div");
    const word = document.createElement("b"); word.className = "mistake-word"; word.textContent = mistake.word;
    const phonetic = document.createElement("span"); phonetic.className = "mistake-phonetic"; phonetic.textContent = mistake.phonetic || "";
    title.append(word, phonetic);
    const meaning = document.createElement("p"); meaning.className = "mistake-meaning"; WW.renderMeaning(meaning, mistake);
    main.append(badge, title, meaning);
    const meta = document.createElement("div"); meta.className = "mistake-meta"; meta.innerHTML = `错 ${formatCount(mistake.count)} 次<br>最近 ${formatTime(mistake.lastAt)}<br>下次 ${formatTime(mistake.nextReviewAt)}`;
    const actions = document.createElement("div"); actions.className = "mistake-actions";
    [["掌握", "master", "green"], ["再练", "again", "orange"]].forEach(([label, act, color]) => {
      const button = document.createElement("button"); button.className = `btn ${color}`; button.dataset.act = act; button.dataset.key = `${mistake.bankId || mistake.level || "自定义"}::${String(mistake.word).toLowerCase()}`; button.textContent = label; actions.appendChild(button);
    });
    item.append(main, meta, actions); list.appendChild(item);
  });
}

function renderStats() {
  const day = WW.todayKey(new Date(now()));
  const learned = Object.values(state.learned).filter((item) => WW.asNumber(item.level, 0) >= 1).length;
  const mastered = Object.values(state.learned).filter((item) => WW.asNumber(item.level, 0) >= 6).length;
  document.getElementById("todayCount").textContent = formatCount(state.daily[day]);
  document.getElementById("learnedCount").textContent = formatCount(learned);
  document.getElementById("masteredCount").textContent = formatCount(mastered);
}

function setCardWord(word, label) {
  currentWord = word;
  if (!word) return;
  document.getElementById("badge").textContent = word.bankName || LEVELS[word.level] || word.level;
  document.getElementById("word").textContent = word.word;
  document.getElementById("phonetic").textContent = word.phonetic || "";
  WW.renderMeaning(document.getElementById("meaning"), word);
  document.getElementById("exampleEn").textContent = word.example || "（暂无例句）";
  document.getElementById("exampleZh").textContent = word.exampleZh || "";
  document.getElementById("reviewModeLabel").textContent = label || "普通学习";
}

function renderWord() { reviewMode = false; setCardWord(pickWord(), "普通学习"); syncWordCardVisibility(); }

function setReviewCardWord(word, label) {
  currentWord = word;
  if (!word) return;
  document.getElementById("reviewBadge").textContent = word.bankName || LEVELS[word.level] || word.level;
  document.getElementById("reviewWord").textContent = word.word;
  document.getElementById("reviewPhonetic").textContent = word.phonetic || "";
  WW.renderMeaning(document.getElementById("reviewMeaning"), word);
  document.getElementById("reviewExampleEn").textContent = word.example || "（暂无例句）";
  document.getElementById("reviewExampleZh").textContent = word.exampleZh || "";
  document.getElementById("reviewModeText").textContent = label || "每日复习";
}

function renderReviewSummary() {
  const dueCount = reviewStage === "done" ? 0 : (reviewStage !== "idle" ? reviewWords.length : reviewPool().length);
  document.getElementById("reviewDueCount").textContent = formatCount(dueCount);
  document.getElementById("reviewTabCount").textContent = formatCount(dueCount);
  const summaries = {
    idle: dueCount ? `今天有 ${formatCount(dueCount)} 个单词到期，进入页面后会按顺序完成三轮练习。` : "今天暂时没有到期单词，继续学习新词即可。",
    words: `第一步：复习 ${formatCount(reviewIdx + 1)}/${formatCount(reviewWords.length)} 个到期单词。`,
    quiz: `第二步：四选一 ${formatCount(reviewQuizIdx + 1)}/${formatCount(reviewWords.length)}。`,
    completion: `第三步：词语补全 ${formatCount(reviewCompletionIdx + 1)}/${formatCount(reviewWords.length)}。`,
    done: `今日复习完成，共巩固 ${formatCount(reviewWords.length)} 个单词。`,
  };
  document.getElementById("reviewSummary").textContent = summaries[reviewStage] || summaries.idle;
  ["Words", "Quiz", "Completion"].forEach((name, index) => {
    const step = document.getElementById(`reviewStep${name}`);
    const stages = ["words", "quiz", "completion"];
    step.classList.toggle("active", stages[index] === reviewStage);
    step.classList.toggle("done", stages.indexOf(reviewStage) > index || reviewStage === "done");
  });
}

function startDailyReview() {
  hideReviewResult();
  reviewWords = reviewPool().sort((a, b) => {
    const aDue = WW.asNumber(state.learned[keyOf(a)]?.due, state.mistakes[keyOf(a)]?.nextReviewAt || 0);
    const bDue = WW.asNumber(state.learned[keyOf(b)]?.due, state.mistakes[keyOf(b)]?.nextReviewAt || 0);
    return aDue - bDue;
  });
  if (!reviewWords.length) {
    reviewStage = "idle";
    reviewMode = false;
    currentWord = null;
    document.getElementById("reviewWordCard").hidden = true;
    hideReviewExercises();
    syncWordCardVisibility();
    renderReviewSummary();
    return;
  }
  reviewStage = "words";
  reviewMode = true;
  reviewIdx = 0;
  reviewQuizIdx = 0;
  reviewQuizRight = 0;
  reviewQuizWrong = 0;
  reviewCompletionIdx = 0;
  reviewCompletionRight = 0;
  reviewCompletionWrong = 0;
  showNextReviewWord();
  renderReviewSummary();
  syncWordCardVisibility();
}

function showNextReviewWord() {
  if (reviewIdx >= reviewWords.length) {
    reviewMode = false; currentWord = null;
    reviewStage = "quiz";
    syncWordCardVisibility();
    renderReviewQuizQuestion();
    renderReviewSummary();
    renderStats();
    return;
  }
  incrementToday(); saveState();
  hideReviewExercises();
  hideReviewResult();
  setReviewCardWord(reviewWords[reviewIdx], `每日复习 · ${reviewIdx + 1}/${reviewWords.length}`);
  document.getElementById("reviewWordCard").hidden = false;
  renderStats();
}

function finishCurrentReview(known) { mark(currentWord, known); reviewIdx += 1; showNextReviewWord(); }

function hideReviewExercises() {
  document.getElementById("reviewQuizPanel").hidden = true;
  document.getElementById("reviewCompletionPanel").hidden = true;
}

function hideReviewResult() {
  document.getElementById("reviewResultPanel").hidden = true;
}

function resetReviewSession() {
  reviewWords = [];
  reviewIdx = 0;
  reviewQuizIdx = 0;
  reviewQuizRight = 0;
  reviewQuizWrong = 0;
  reviewCompletionIdx = 0;
  reviewCompletionRight = 0;
  reviewCompletionWrong = 0;
  reviewStage = "idle";
  reviewMode = false;
  document.getElementById("reviewWordCard").hidden = true;
  hideReviewExercises();
  hideReviewResult();
  if (activeView === "review") currentWord = null;
}

function refreshDailyReview() {
  resetReviewSession();
  if (activeView === "review") startDailyReview();
  else renderReviewSummary();
  syncWordCardVisibility();
}

function reviewChoices(question) {
  const distractorPool = pool().filter((word) => word.meaning !== question.meaning && word.word.toLowerCase() !== question.word.toLowerCase());
  const choices = [question.meaning];
  while (choices.length < 4 && distractorPool.length) {
    const pick = distractorPool.splice(Math.floor(Math.random() * distractorPool.length), 1)[0];
    if (!choices.includes(pick.meaning)) choices.push(pick.meaning);
  }
  while (choices.length < 4) choices.push("（无此选项）");
  return choices.sort(() => Math.random() - 0.5);
}

function renderReviewQuizQuestion() {
  hideReviewExercises();
  hideReviewResult();
  const panel = document.getElementById("reviewQuizPanel");
  panel.hidden = false;
  const wordEl = document.getElementById("reviewQuizWord");
  const scoreEl = document.getElementById("reviewQuizScore");
  const box = document.getElementById("reviewQuizOptions");
  if (reviewQuizIdx >= reviewWords.length) {
    reviewStage = "completion";
    reviewCompletionIdx = 0;
    reviewCompletionRight = 0;
    reviewCompletionWrong = 0;
    renderReviewCompletionQuestion();
    return;
  }
  const question = reviewWords[reviewQuizIdx];
  wordEl.textContent = question.word;
  scoreEl.textContent = `对 ${formatCount(reviewQuizRight)} / ${formatCount(reviewQuizRight + reviewQuizWrong)}`;
  box.innerHTML = "";
  box.dataset.answered = "false";
  reviewChoices(question).forEach((choice) => {
    const button = document.createElement("button");
    button.className = "quiz-option";
    button.textContent = choice;
    button.addEventListener("click", () => answerReviewQuiz(button, choice, question));
    box.appendChild(button);
  });
  document.getElementById("reviewQuizFeedback").textContent = "";
}

function answerReviewQuiz(button, choice, question) {
  const box = button.parentElement;
  if (box.dataset.answered === "true") return;
  box.dataset.answered = "true";
  const correct = choice === question.meaning;
  if (correct) {
    reviewQuizRight += 1;
    button.classList.add("correct");
    document.getElementById("reviewQuizFeedback").textContent = "回答正确 ✓";
  } else {
    reviewQuizWrong += 1;
    button.classList.add("wrong");
    document.getElementById("reviewQuizFeedback").textContent = `正确答案：${question.meaning}`;
    mark(question, false);
  }
  document.querySelectorAll("#reviewQuizOptions .quiz-option").forEach((item) => {
    if (item.textContent === question.meaning) item.classList.add("correct");
  });
  setTimeout(() => { reviewQuizIdx += 1; renderReviewQuizQuestion(); renderReviewSummary(); renderStats(); }, 900);
}

function completionMask(word) {
  const letters = [...word.word];
  const candidates = letters.map((char, index) => ({ char, index })).filter(({ char, index }) => /[a-z]/i.test(char) && index > 0);
  const maskCount = Math.max(1, Math.floor(candidates.length * 0.4));
  const hidden = new Set(candidates.slice(0, maskCount).map(({ index }) => index));
  return { letters, hidden };
}

function completionPrompt(word) {
  const { letters, hidden } = completionMask(word);
  return letters.map((char, index) => hidden.has(index) ? "_" : char).join(" ");
}

function renderReviewCompletionQuestion() {
  hideReviewExercises();
  hideReviewResult();
  const panel = document.getElementById("reviewCompletionPanel");
  if (reviewCompletionIdx >= reviewWords.length) {
    reviewStage = "done";
    const resultPanel = document.getElementById("reviewResultPanel");
    resultPanel.hidden = false;
    document.getElementById("reviewResultSummary").textContent = `四选一答对 ${formatCount(reviewQuizRight)} 题，词语补全答对 ${formatCount(reviewCompletionRight)} 题。`;
    document.getElementById("reviewCompletionInput").value = "";
    document.getElementById("reviewCompletionInput").disabled = true;
    document.getElementById("reviewCompletionBtn").disabled = true;
    renderReviewSummary();
    return;
  }
  panel.hidden = false;
  const question = reviewWords[reviewCompletionIdx];
  document.getElementById("reviewCompletionMeaning").textContent = question.meaning;
  document.getElementById("reviewCompletionPrompt").textContent = completionPrompt(question);
  const input = document.getElementById("reviewCompletionInput");
  input.value = "";
  input.disabled = false;
  document.getElementById("reviewCompletionBtn").disabled = false;
  document.getElementById("reviewCompletionScore").textContent = `对 ${formatCount(reviewCompletionRight)} / ${formatCount(reviewCompletionRight + reviewCompletionWrong)}`;
  document.getElementById("reviewCompletionFeedback").textContent = "";
  input.focus();
}

function answerReviewCompletion() {
  const input = document.getElementById("reviewCompletionInput");
  if (input.disabled) return;
  const question = reviewWords[reviewCompletionIdx];
  const answer = input.value.trim().toLowerCase().replace(/\s+/g, "");
  if (!answer) return;
  const fullWord = question.word.trim().toLowerCase().replace(/\s+/g, "");
  const { letters, hidden } = completionMask(question);
  const missingLetters = letters.filter((_, index) => hidden.has(index)).join("").toLowerCase();
  const correct = answer === fullWord || answer === missingLetters;
  if (correct) {
    reviewCompletionRight += 1;
    document.getElementById("reviewCompletionFeedback").textContent = "回答正确 ✓";
  } else {
    reviewCompletionWrong += 1;
    document.getElementById("reviewCompletionFeedback").textContent = `正确答案：${question.word}`;
    mark(question, false);
  }
  document.getElementById("reviewCompletionScore").textContent = `对 ${formatCount(reviewCompletionRight)} / ${formatCount(reviewCompletionRight + reviewCompletionWrong)}`;
  input.disabled = true;
  document.getElementById("reviewCompletionBtn").disabled = true;
  setTimeout(() => { reviewCompletionIdx += 1; renderReviewCompletionQuestion(); renderReviewSummary(); renderStats(); }, 900);
}

function syncWordCardVisibility() {
  const wordCard = document.getElementById("wordCard");
  const reviewWordCard = document.getElementById("reviewWordCard");
  const learnView = document.getElementById("learnView");
  const reviewView = document.getElementById("reviewView");
  if (!wordCard || !reviewWordCard || !learnView || !reviewView) return;
  wordCard.hidden = learnView.hidden || reviewMode || !currentWord;
  reviewWordCard.hidden = reviewView.hidden || !reviewMode || reviewStage !== "words" || !currentWord;
}

function renderBankInfo() {
  const info = Object.entries(WW.builtinWordMap()).map(([key, value]) => `${LEVELS[key] || key} ${formatCount(value.length)}`);
  state.customBanks.forEach((bank) => info.push(`${bank.name} ${formatCount(bank.words.length)}`));
  document.getElementById("bankInfo").textContent = "词库：" + info.join(" · ");
}

function bankDefinitions() {
  const builtIn = WW.BUILTIN_BANK_IDS.map((id) => ({ id, name: id, count: WINDOW_WORDS[id]?.length || 0 }));
  return builtIn.concat(state.customBanks.map((bank) => ({ id: `custom:${bank.id}`, name: bank.name, count: bank.words.length })));
}

function renderBankPicker() {
  const box = document.getElementById("bankCheckboxes");
  box.innerHTML = "";
  bankDefinitions().forEach((bank) => {
    const label = document.createElement("label"); label.className = "bank-check";
    const input = document.createElement("input"); input.type = "checkbox"; input.value = bank.id; input.checked = state.selectedBanks.includes(bank.id);
    const name = document.createElement("span"); name.textContent = bank.name;
    const count = document.createElement("small"); count.textContent = formatCount(bank.count);
    label.append(input, name, count); box.appendChild(label);
  });
  const selected = state.selectedBanks.length;
  document.getElementById("bankPickerBtn").textContent = `选择词库 (${selected})`;
}

function applyBankSelection() {
  const checked = [...document.querySelectorAll('#bankCheckboxes input:checked')].map((input) => input.value);
  if (!checked.length) { renderBankPicker(); alert("请至少选择一个词库。"); return; }
  state.selectedBanks = checked; saveState(); renderBankPicker(); renderWord(); startQuiz(); renderReviewSummary();
}

function renderCustomBanks() {
  const list = document.getElementById("customBankList"); list.innerHTML = "";
  if (!state.customBanks.length) {
    const empty = document.createElement("p"); empty.textContent = "还没有导入自定义词库。"; list.appendChild(empty); return;
  }
  state.customBanks.forEach((bank) => {
    const row = document.createElement("div"); row.className = "custom-bank-item";
    const name = document.createElement("b"); name.textContent = bank.name;
    const count = document.createElement("span"); count.textContent = `${formatCount(bank.words.length)} 词`;
    const exportBtn = document.createElement("button"); exportBtn.className = "mini-btn"; exportBtn.dataset.act = "export-bank"; exportBtn.dataset.id = bank.id; exportBtn.textContent = "导出";
    const deleteBtn = document.createElement("button"); deleteBtn.className = "mini-btn danger"; deleteBtn.dataset.act = "delete-bank"; deleteBtn.dataset.id = bank.id; deleteBtn.textContent = "删除";
    row.append(name, count, exportBtn, deleteBtn); list.appendChild(row);
  });
}

function startQuiz() {
  quizWords = [...pool()].sort(() => Math.random() - 0.5).slice(0, 10); quizIdx = 0; quizRight = 0; quizWrong = 0; nextQuiz();
}

function nextQuiz() {
  const wordEl = document.getElementById("quizWord"); const scoreEl = document.getElementById("quizScore");
  if (quizIdx >= quizWords.length) {
    wordEl.textContent = quizWords.length ? "本轮完成" : "词库为空"; scoreEl.textContent = `对 ${formatCount(quizRight)} / ${formatCount(quizRight + quizWrong)}`;
    const box = document.getElementById("quizOptions"); box.innerHTML = '<button id="quizRestartBtn" class="quiz-option" style="text-align:center;font-weight:700;color:#24715d;">再来一轮</button>';
    document.getElementById("quizRestartBtn").addEventListener("click", startQuiz); document.getElementById("quizFeedback").textContent = ""; return;
  }
  const question = quizWords[quizIdx];
  const distractorPool = pool().filter((word) => word.meaning !== question.meaning && word.word.toLowerCase() !== question.word.toLowerCase());
  const choices = [question.meaning];
  while (choices.length < 4 && distractorPool.length) {
    const pick = distractorPool.splice(Math.floor(Math.random() * distractorPool.length), 1)[0]; if (!choices.includes(pick.meaning)) choices.push(pick.meaning);
  }
  while (choices.length < 4) choices.push("（无此选项）"); choices.sort(() => Math.random() - 0.5);
  wordEl.textContent = question.word; scoreEl.textContent = `第 ${quizIdx + 1}/${quizWords.length} 题 · 对 ${formatCount(quizRight)}`;
  const box = document.getElementById("quizOptions"); box.innerHTML = ""; box.dataset.answered = "false";
  choices.forEach((choice) => { const button = document.createElement("button"); button.className = "quiz-option"; button.textContent = choice; button.addEventListener("click", () => answerQuiz(button, choice, question)); box.appendChild(button); });
  document.getElementById("quizFeedback").textContent = "";
}

function answerQuiz(button, choice, question) {
  const box = button.parentElement; if (box.dataset.answered === "true") return; box.dataset.answered = "true";
  const correct = choice === question.meaning;
  if (correct) { quizRight += 1; button.classList.add("correct"); document.getElementById("quizFeedback").textContent = "回答正确 ✓"; }
  else { quizWrong += 1; button.classList.add("wrong"); document.getElementById("quizFeedback").textContent = `正确答案：${question.meaning}`; }
  mark(question, correct); document.querySelectorAll(".quiz-option").forEach((item) => { if (item.textContent === question.meaning) item.classList.add("correct"); });
  setTimeout(() => { quizIdx += 1; nextQuiz(); renderStats(); renderReviewSummary(); }, 900);
}

function switchView(view) {
  const views = { learn: "learnView", quiz: "quizView", review: "reviewView", mistakes: "mistakeView" };
  activeView = view;
  Object.entries(views).forEach(([name, id]) => { document.getElementById(id).hidden = name !== view; });
  ["Learn", "Quiz", "Review", "Mistakes"].forEach((name) => document.getElementById(`tab${name}`).classList.toggle("active", name.toLowerCase() === view));
  document.getElementById("nextBtn").hidden = view !== "learn";
  if (view === "review") {
    if (reviewStage === "idle") startDailyReview();
    else if (reviewStage === "words") {
      reviewMode = true;
      setReviewCardWord(reviewWords[reviewIdx], `每日复习 · ${reviewIdx + 1}/${reviewWords.length}`);
    } else if (reviewStage === "quiz") renderReviewQuizQuestion();
    else if (reviewStage === "completion" || reviewStage === "done") renderReviewCompletionQuestion();
  } else if (view === "learn") {
    reviewMode = false;
    currentWord = null;
    renderWord();
  }
  syncWordCardVisibility();
  if (view === "mistakes") renderMistakes();
}

function downloadFile(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement("a"); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvEscape(value) { const text = String(value ?? ""); return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }

function exportMistakes(format) {
  const entries = Object.values(state.mistakes || {});
  if (format === "csv") {
    const rows = [["level", "word", "phonetic", "pos", "meaning", "example", "example_zh", "count", "lastAt", "nextReviewAt"], ...entries.map((item) => [item.level, item.word, item.phonetic, item.pos, item.meaning, item.example, item.exampleZh, item.count, item.lastAt, item.nextReviewAt])];
    downloadFile("wordeverywhere-mistakes.csv", rows.map((row) => row.map(csvEscape).join(",")).join("\r\n"), "text/csv;charset=utf-8");
  } else downloadFile("wordeverywhere-mistakes.json", JSON.stringify({ version: 1, type: "mistakes", exportedAt: Date.now(), mistakes: entries }, null, 2), "application/json;charset=utf-8");
}

function exportCustomBank(bank) {
  downloadFile(`${bank.name.replace(/[\\/:*?"<>|]/g, "-")}.json`, JSON.stringify({ version: 2, type: "word-bank", name: bank.name, words: bank.words }, null, 2), "application/json;charset=utf-8");
}

function parseCsv(text) {
  text = text.replace(/^\uFEFF/, "");
  const rows = []; let row = []; let cell = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') { if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; } else quoted = !quoted; }
    else if (char === "," && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && text[index + 1] === "\n") index += 1; row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); return rows;
}

function wordsFromRows(rows) {
  if (!rows.length) return [];
  const first = rows[0].map((value) => value.replace(/^\uFEFF/, "").toLowerCase().replace(/\s+/g, "_")); const hasHeader = first.includes("word");
  const headers = hasHeader ? first : ["word", "phonetic", "pos", "meaning", "example", "example_zh"]; const start = hasHeader ? 1 : 0;
  return rows.slice(start).map((row) => {
    const get = (...names) => { const index = names.map((name) => headers.indexOf(name)).find((value) => value >= 0); return index == null ? "" : row[index] || ""; };
    return WW.wordFromCustom({ word: get("word", "单词"), phonetic: get("phonetic", "音标"), pos: get("pos", "词性"), meaning: get("meaning", "释义", "中文释义"), example: get("example", "例句"), exampleZh: get("example_zh", "例句中文", "例句翻译") });
  }).filter(Boolean);
}

function createCustomBank(name, words) {
  const unique = new Map(); words.forEach((word) => unique.set(word.word.toLowerCase(), word));
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const bank = { id, name, words: [...unique.values()] };
  state.customBanks.push(bank); state.selectedBanks.push(`custom:${id}`);
  WORDS = WW.allWords(state.customBanks); saveState(); renderBankPicker(); renderCustomBanks(); renderBankInfo(); renderStats(); renderReviewSummary(); renderWord(); startQuiz();
}

function mergeImportedMistakes(entries, sourceName) {
  const customEntries = entries.filter((item) => !WW.BUILTIN_BANK_IDS.includes(item.bankId || item.level));
  let importedBank = null;
  if (customEntries.length) {
    const id = `mistakes-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const words = new Map();
    customEntries.map(WW.wordFromCustom).filter(Boolean).forEach((word) => words.set(word.word.toLowerCase(), word));
    importedBank = { id, name: sourceName || "导入错题", words: [...words.values()] };
    state.customBanks.push(importedBank); state.selectedBanks.push(`custom:${id}`);
  }
  entries.forEach((item) => {
    const word = WW.wordFromCustom(item) || item; if (!word || !word.word || !word.meaning) return;
    const isBuiltin = WW.BUILTIN_BANK_IDS.includes(item.bankId || item.level);
    const bankId = isBuiltin ? (item.bankId || item.level) : `custom:${importedBank.id}`;
    const bankName = isBuiltin ? (item.bankName || item.level) : importedBank.name;
    const key = `${bankId}::${String(item.word).toLowerCase()}`; const old = state.mistakes[key];
    state.mistakes[key] = { ...item, bankId, bankName, level: isBuiltin ? item.level : bankName, count: Math.max(1, Math.floor(WW.asNumber(item.count, 1))) + (old ? Math.floor(WW.asNumber(old.count, 0)) : 0), lastAt: WW.asNumber(item.lastAt, now()), nextReviewAt: WW.asNumber(item.nextReviewAt, now()) };
  });
  WORDS = WW.allWords(state.customBanks); saveState(); renderMistakes(); renderReviewSummary(); renderStats(); renderBankPicker(); renderCustomBanks(); renderBankInfo();
}

function importFile(file, kind, bankName) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = String(reader.result || ""); const isCsv = file.name.toLowerCase().endsWith(".csv");
      const parsed = isCsv ? null : JSON.parse(text);
      if (kind === "mistakes") {
        const entries = isCsv ? rowsToMistakes(parseCsv(text)) : (Array.isArray(parsed) ? parsed : (parsed?.mistakes || []));
        const sourceName = `导入错题-${file.name.replace(/\.[^.]+$/, "")}`;
        if (entries.length) mergeImportedMistakes(entries, sourceName); else alert("没有读取到错词记录。");
      } else {
        const words = isCsv ? wordsFromRows(parseCsv(text)) : (Array.isArray(parsed) ? parsed : (parsed?.words || parsed?.customWords || parsed?.mistakes || []));
        const normalized = words.map(WW.wordFromCustom).filter(Boolean);
        if (!normalized.length) alert("没有读取到有效词条，请检查 word 和 meaning 字段。");
        else createCustomBank(bankName, normalized);
      }
    } catch (error) { alert(`导入失败：${error.message}`); }
  };
  reader.readAsText(file, "utf-8");
}

function renderDebugDate() {
  const date = new Date(now());
  document.getElementById("debugDateLabel").textContent = state.debugDayOffset ? `模拟日期：${formatTime(date.getTime()).slice(0, 10)}（+${state.debugDayOffset} 天）` : `当前日期：${formatTime(date.getTime()).slice(0, 10)}`;
}

function updateDebugDays(days) {
  if (!state.debugDayOffset && !state.debugSnapshot) {
    state.debugSnapshot = JSON.parse(JSON.stringify({ learned: state.learned, mistakes: state.mistakes, daily: state.daily }));
  }
  state.debugDayOffset = Math.max(0, state.debugDayOffset + days);
  saveState(() => {
    sessionStorage.setItem("wwReturnView", activeView);
    window.location.reload();
  });
}

function resetDebugDays() {
  if (state.debugSnapshot) {
    state.learned = state.debugSnapshot.learned || {};
    state.mistakes = state.debugSnapshot.mistakes || {};
    state.daily = state.debugSnapshot.daily || {};
  }
  state.debugDayOffset = 0; state.debugSnapshot = null;
  saveState(() => {
    sessionStorage.setItem("wwReturnView", activeView);
    window.location.reload();
  });
}

function rowsToMistakes(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map((value) => value.replace(/^\uFEFF/, "").toLowerCase().replace(/\s+/g, "_"));
  const start = headers.includes("word") ? 1 : 0;
  const get = (row, ...names) => {
    const index = names.map((name) => headers.indexOf(name)).find((value) => value >= 0);
    return index == null ? "" : row[index] || "";
  };
  return rows.slice(start).map((row) => ({
    level: get(row, "level"), word: get(row, "word"), phonetic: get(row, "phonetic"), pos: get(row, "pos"),
    meaning: get(row, "meaning"), example: get(row, "example"), exampleZh: get(row, "example_zh"),
    count: get(row, "count"), lastAt: get(row, "lastAt"), nextReviewAt: get(row, "nextReviewAt"),
  })).filter((item) => item.word && item.meaning);
}

document.addEventListener("DOMContentLoaded", () => {
  loadState(() => {
    document.getElementById("knownBtn").addEventListener("click", () => { if (!currentWord) return; if (reviewMode) finishCurrentReview(true); else { mark(currentWord, true); renderWord(); renderStats(); renderReviewSummary(); } });
    document.getElementById("againBtn").addEventListener("click", () => { if (!currentWord) return; if (reviewMode) finishCurrentReview(false); else { mark(currentWord, false); renderWord(); renderStats(); renderReviewSummary(); } });
    document.getElementById("reviewKnownBtn").addEventListener("click", () => { if (reviewMode && currentWord) finishCurrentReview(true); });
    document.getElementById("reviewAgainBtn").addEventListener("click", () => { if (reviewMode && currentWord) finishCurrentReview(false); });
    document.getElementById("nextBtn").addEventListener("click", renderWord);
    document.getElementById("bankPickerBtn").addEventListener("click", () => {
      const panel = document.getElementById("bankPickerPanel"); panel.hidden = !panel.hidden; document.getElementById("bankPickerBtn").setAttribute("aria-expanded", String(!panel.hidden));
    });
    document.getElementById("bankCheckboxes").addEventListener("change", applyBankSelection);
    document.getElementById("selectAllBanksBtn").addEventListener("click", () => {
      state.selectedBanks = bankDefinitions().map((bank) => bank.id); saveState(); renderBankPicker(); renderWord(); startQuiz(); renderReviewSummary();
    });
    document.getElementById("tabLearn").addEventListener("click", () => switchView("learn"));
    document.getElementById("tabQuiz").addEventListener("click", () => switchView("quiz"));
    document.getElementById("tabReview").addEventListener("click", () => switchView("review"));
    document.getElementById("tabMistakes").addEventListener("click", () => switchView("mistakes"));
    document.getElementById("reviewCompletionBtn").addEventListener("click", answerReviewCompletion);
    document.getElementById("reviewCompletionInput").addEventListener("keydown", (event) => {
      if (event.key === "Enter") answerReviewCompletion();
    });
    document.getElementById("mistakeList").addEventListener("click", (event) => {
      const button = event.target.closest("[data-act]"); if (!button) return; const key = button.dataset.key; const entry = state.mistakes[key]; if (!entry) return;
      if (button.dataset.act === "master") { delete state.mistakes[key]; const learned = state.learned[key]; if (learned) learned.due = now() + WW.REVIEW_INTERVALS[WW.REVIEW_INTERVALS.length - 1] * 1000; }
      else { recordMistake(entry); state.learned[key] = { level: 0, due: now() + WW.REVIEW_INTERVALS[0] * 1000, seen: WW.asNumber(state.learned[key]?.seen, 0) }; }
      saveState(); renderMistakes(); renderStats(); renderReviewSummary();
    });
    document.getElementById("clearMistakesBtn").addEventListener("click", () => { if (!mistakeCount() || confirm("确定清空全部错词吗？")) { state.mistakes = {}; saveState(); renderMistakes(); renderReviewSummary(); } });
    document.getElementById("exportMistakesBtn").addEventListener("click", () => exportMistakes("json")); document.getElementById("importMistakesBtn").addEventListener("click", () => document.getElementById("importMistakesFile").click());
    document.getElementById("importMistakesFile").addEventListener("change", (event) => { if (event.target.files[0]) importFile(event.target.files[0], "mistakes"); event.target.value = ""; });
    document.getElementById("importWordsBtn").addEventListener("click", () => {
      const name = document.getElementById("customBankName").value.trim();
      if (!name) { alert("请填写词库名称。"); document.getElementById("customBankName").focus(); return; }
      document.getElementById("importWordsFile").click();
    });
    document.getElementById("importWordsFile").addEventListener("change", (event) => {
      const nameInput = document.getElementById("customBankName");
      if (event.target.files[0]) { importFile(event.target.files[0], "words", nameInput.value.trim()); nameInput.value = ""; }
      event.target.value = "";
    });
    document.getElementById("customBankList").addEventListener("click", (event) => {
      const button = event.target.closest("[data-act]"); if (!button) return;
      const bank = state.customBanks.find((item) => item.id === button.dataset.id); if (!bank) return;
      if (button.dataset.act === "export-bank") exportCustomBank(bank);
      else if (confirm(`确定删除词库“${bank.name}”吗？`)) {
        state.customBanks = state.customBanks.filter((item) => item.id !== bank.id); state.selectedBanks = state.selectedBanks.filter((id) => id !== `custom:${bank.id}`);
        if (!state.selectedBanks.length) state.selectedBanks = [...WW.BUILTIN_BANK_IDS];
        WORDS = WW.allWords(state.customBanks); saveState(); renderCustomBanks(); renderBankPicker(); renderBankInfo(); renderWord(); startQuiz(); renderReviewSummary();
      }
    });
    document.getElementById("advanceDaysBtn").addEventListener("click", () => {
      const days = Math.max(0, Math.floor(Number(document.getElementById("debugDaysInput").value) || 0)); if (days) updateDebugDays(days);
    });
    document.getElementById("resetDaysBtn").addEventListener("click", resetDebugDays);
    document.addEventListener("keydown", (event) => { if (event.target.matches("input,textarea,select")) return; if (event.key === "1") document.getElementById("knownBtn").click(); else if (event.key === "2") document.getElementById("againBtn").click(); else if (event.key === " ") { event.preventDefault(); document.getElementById("nextBtn").click(); } });

    renderBankPicker(); renderCustomBanks(); renderDebugDate(); renderStats(); renderWord(); renderBankInfo(); renderReviewSummary(); startQuiz();
    const params = new URLSearchParams(location.search);
    const returnView = sessionStorage.getItem("wwReturnView");
    sessionStorage.removeItem("wwReturnView");
    const initialView = ["quiz", "review", "mistakes"].includes(returnView) ? returnView : params.get("view");
    if (["quiz", "review", "mistakes"].includes(initialView)) switchView(initialView);
  });
});
