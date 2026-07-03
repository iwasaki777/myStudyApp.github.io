(function () {
  'use strict';

  const STORAGE_KEY = 'pjma_history_v1';
  const CHAPTER_QUIZ_COUNT = 10;
  const MOCK_TIME_LIMIT_SEC = 2 * 60 * 60; // 2時間
  const MOCK_QUESTION_COUNT = 120;

  const app = document.getElementById('app');

  // ---------- utils ----------
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function fmtClock(sec) {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const pad = n => String(n).padStart(2, '0');
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  function fmtDate(iso) {
    const d = new Date(iso);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function chapterTitle(id) {
    const c = CHAPTERS.find(x => x.id === id);
    return c ? c.title : '';
  }

  function questionsByChapter(id) {
    return QUESTIONS.filter(q => q.chapter === id);
  }

  // ---------- history storage ----------
  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch (e) { return []; }
  }
  function saveHistory(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }
  function addSession(session) {
    const list = loadHistory();
    list.unshift(session);
    saveHistory(list);
  }

  function latestAttemptMap() {
    const list = loadHistory();
    const map = {};
    const chronological = list.slice().reverse(); // oldest -> newest
    chronological.forEach(session => {
      session.answers.forEach(a => {
        map[a.questionId] = { correct: a.correct };
      });
    });
    return map;
  }

  function weakQuestionPool() {
    const map = latestAttemptMap();
    const weakIds = Object.keys(map).filter(id => !map[id].correct);
    return QUESTIONS.filter(q => weakIds.includes(q.id));
  }

  // ---------- global state ----------
  let state = { screen: 'home' };
  let quizState = null;
  let timerHandle = null;

  function render() {
    switch (state.screen) {
      case 'home': return renderHome();
      case 'chapterSetup': return renderChapterSetup();
      case 'mockSetup': return renderMockSetup();
      case 'weakSetup': return renderWeakSetup();
      case 'quiz': return renderQuiz();
      case 'result': return renderResult();
      case 'history': return renderHistory();
      case 'historyDetail': return renderHistoryDetail();
    }
  }

  function topbar(title, backAction) {
    return `
      <div class="topbar">
        <button class="back-btn" onclick="${backAction}">‹ 戻る</button>
        <h1>${escapeHtml(title)}</h1>
        <div style="width:40px"></div>
      </div>
    `;
  }

  // ---------- HOME ----------
  function renderHome() {
    const hist = loadHistory();
    const weakCount = weakQuestionPool().length;
    const chapterCards = CHAPTERS.map(c => {
      const count = questionsByChapter(c.id).length;
      return `
      <button class="card" onclick="App.goChapterSetup(${c.id})">
        <div class="card-main">
          <div class="card-title">${escapeHtml(c.title)}</div>
          <div class="card-sub">問題バンク${count}問 ・ ランダム${CHAPTER_QUIZ_COUNT}問出題</div>
        </div>
        <div class="card-chevron">›</div>
      </button>`;
    }).join('');

    app.innerHTML = `
      <div class="home-hero">
        <h1>PJM-A 模擬試験</h1>
        <p>プロジェクトマネジメント・アソシエイト™認定講座 対策アプリ</p>
      </div>

      <div class="section-label">模擬試験・弱点対策</div>
      <div class="card-list">
        <button class="card accent" onclick="App.goMockSetup()">
          <div class="card-main">
            <div class="card-title">模擬試験モード</div>
            <div class="card-sub">本試験形式 最大${MOCK_QUESTION_COUNT}問 ・ 制限時間2時間</div>
          </div>
          <div class="card-chevron">›</div>
        </button>
        <button class="card" onclick="App.goWeakSetup()">
          <div class="card-main">
            <div class="card-title">弱点対策モード</div>
            <div class="card-sub">${weakCount > 0 ? `直近で間違えた問題 ${weakCount}問から出題` : '間違えた問題がまだありません'}</div>
          </div>
          <div class="card-chevron">›</div>
        </button>
      </div>

      <div class="section-label">章別学習</div>
      <div class="card-list">${chapterCards}</div>

      <div class="section-label">記録</div>
      <div class="card-list">
        <button class="card" onclick="App.goHistory()">
          <div class="card-main">
            <div class="card-title">解答履歴</div>
            <div class="card-sub">過去の受験結果 ${hist.length}件</div>
          </div>
          <div class="card-chevron">›</div>
        </button>
      </div>
      <div style="height:24px"></div>
    `;
  }

  // ---------- SETUP SCREENS ----------
  function renderChapterSetup() {
    const c = CHAPTERS.find(x => x.id === state.chapterId);
    const pool = questionsByChapter(c.id);
    const n = Math.min(CHAPTER_QUIZ_COUNT, pool.length);
    app.innerHTML = `
      ${topbar(c.title, 'App.goHome()')}
      <div class="setup-wrap">
        <div class="setup-title">${escapeHtml(c.title)}</div>
        <div class="setup-desc">この章の問題バンクからランダムに${n}問出題します。1問ごとに解答時間を計測します。</div>
        <div class="setup-stats">
          <div class="setup-stat"><div class="num">${n}</div><div class="lbl">出題数</div></div>
          <div class="setup-stat"><div class="num">4択</div><div class="lbl">形式</div></div>
          <div class="setup-stat"><div class="num">${pool.length}</div><div class="lbl">問題バンク</div></div>
        </div>
        <button class="primary-btn" onclick="App.startChapterQuiz(${c.id})">開始する</button>
      </div>
    `;
  }

  function renderMockSetup() {
    const n = Math.min(MOCK_QUESTION_COUNT, QUESTIONS.length);
    app.innerHTML = `
      ${topbar('模擬試験モード', 'App.goHome()')}
      <div class="setup-wrap">
        <div class="setup-title">模擬試験モード</div>
        <div class="setup-desc">本試験と同じ形式で実施します。全4章から出題され、制限時間内に解答してください。時間切れになると自動的に採点されます。</div>
        <div class="setup-stats">
          <div class="setup-stat"><div class="num">${n}</div><div class="lbl">出題数</div></div>
          <div class="setup-stat"><div class="num">2時間</div><div class="lbl">制限時間</div></div>
          <div class="setup-stat"><div class="num">4択</div><div class="lbl">形式</div></div>
        </div>
        <button class="primary-btn" onclick="App.startMockQuiz()">試験を開始する</button>
      </div>
    `;
  }

  function renderWeakSetup() {
    const pool = weakQuestionPool();
    const n = Math.min(CHAPTER_QUIZ_COUNT, pool.length);
    if (pool.length === 0) {
      app.innerHTML = `
        ${topbar('弱点対策モード', 'App.goHome()')}
        <div class="empty-state">まだ間違えた問題がありません。<br>章別学習や模擬試験を受けると、<br>間違えた問題がここに集まります。</div>
      `;
      return;
    }
    app.innerHTML = `
      ${topbar('弱点対策モード', 'App.goHome()')}
      <div class="setup-wrap">
        <div class="setup-title">弱点対策モード</div>
        <div class="setup-desc">直近の解答で間違えた問題の中からランダムに出題します。正解すると次回から弱点リストを外れます。</div>
        <div class="setup-stats">
          <div class="setup-stat"><div class="num">${n}</div><div class="lbl">出題数</div></div>
          <div class="setup-stat"><div class="num">${pool.length}</div><div class="lbl">対象問題数</div></div>
        </div>
        <button class="primary-btn" onclick="App.startWeakQuiz()">開始する</button>
      </div>
    `;
  }

  // ---------- QUIZ ENGINE ----------
  function buildQuizQuestions(pool, count) {
    const picked = shuffle(pool).slice(0, count);
    return picked.map(q => {
      const order = shuffle(q.choices.map((c, i) => i));
      return {
        id: q.id,
        chapter: q.chapter,
        text: q.q,
        choices: order.map(i => q.choices[i]),
        correctIndex: order.indexOf(q.correct),
        exp: q.exp
      };
    });
  }

  function startChapterQuiz(chapterId) {
    const pool = questionsByChapter(chapterId);
    const n = Math.min(CHAPTER_QUIZ_COUNT, pool.length);
    beginQuiz({
      mode: 'chapter',
      chapterId,
      title: chapterTitle(chapterId),
      questions: buildQuizQuestions(pool, n),
      timeLimitSec: null
    });
  }

  function startMockQuiz() {
    const n = Math.min(MOCK_QUESTION_COUNT, QUESTIONS.length);
    beginQuiz({
      mode: 'mock',
      chapterId: null,
      title: '模擬試験モード',
      questions: buildQuizQuestions(QUESTIONS, n),
      timeLimitSec: MOCK_TIME_LIMIT_SEC
    });
  }

  function startWeakQuiz() {
    const pool = weakQuestionPool();
    const n = Math.min(CHAPTER_QUIZ_COUNT, pool.length);
    beginQuiz({
      mode: 'weak',
      chapterId: null,
      title: '弱点対策モード',
      questions: buildQuizQuestions(pool, n),
      timeLimitSec: null
    });
  }

  function beginQuiz(cfg) {
    quizState = {
      mode: cfg.mode,
      chapterId: cfg.chapterId,
      title: cfg.title,
      questions: cfg.questions,
      timeLimitSec: cfg.timeLimitSec,
      current: 0,
      selected: null,
      answered: false,
      answers: [],
      startedAt: new Date().toISOString(),
      totalStart: Date.now(),
      qStart: Date.now()
    };
    state = { screen: 'quiz' };
    startTimer();
    render();
  }

  function startTimer() {
    stopTimer();
    timerHandle = setInterval(() => {
      updateTimerDisplay();
      if (quizState && quizState.timeLimitSec != null) {
        const elapsed = (Date.now() - quizState.totalStart) / 1000;
        if (elapsed >= quizState.timeLimitSec) {
          finishQuiz(true);
        }
      }
    }, 1000);
  }
  function stopTimer() {
    if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
  }

  function updateTimerDisplay() {
    if (!quizState || state.screen !== 'quiz') return;
    const qEl = document.getElementById('q-timer');
    const totalEl = document.getElementById('total-timer');
    if (qEl) {
      const qElapsed = (Date.now() - quizState.qStart) / 1000;
      qEl.textContent = fmtClock(qElapsed);
    }
    if (totalEl) {
      if (quizState.timeLimitSec != null) {
        const remain = quizState.timeLimitSec - (Date.now() - quizState.totalStart) / 1000;
        totalEl.textContent = fmtClock(remain);
        totalEl.classList.toggle('warn', remain < 300);
      } else {
        const elapsed = (Date.now() - quizState.totalStart) / 1000;
        totalEl.textContent = fmtClock(elapsed);
      }
    }
  }

  function renderQuiz() {
    const q = quizState.questions[quizState.current];
    const total = quizState.questions.length;
    const idx = quizState.current;
    const letters = ['A', 'B', 'C', 'D'];

    const choicesHtml = q.choices.map((choice, i) => {
      let cls = 'choice';
      if (quizState.answered) {
        cls += ' disabled';
        if (i === q.correctIndex) cls += ' correct';
        else if (i === quizState.selected) cls += ' incorrect';
      } else if (quizState.selected === i) {
        cls += ' selected';
      }
      return `
        <div class="${cls}" onclick="App.selectChoice(${i})">
          <div class="letter">${letters[i]}</div>
          <div>${escapeHtml(choice)}</div>
        </div>`;
    }).join('');

    let feedback = '';
    if (quizState.answered) {
      const isCorrect = quizState.selected === q.correctIndex;
      feedback = `
        <div class="feedback-banner ${isCorrect ? 'correct' : 'incorrect'}">
          <div class="fb-title">${isCorrect ? '正解です' : '不正解'}</div>
          <div>${escapeHtml(q.exp || '')}</div>
        </div>`;
    }

    const progressPct = Math.round((idx / total) * 100);

    app.innerHTML = `
      <div class="quiz-header">
        <div class="q-progress"><b>${idx + 1}</b> / ${total} 問目</div>
        <div class="timer-badge" id="total-timer">--:--</div>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${progressPct}%"></div></div>
      <div class="q-body">
        <div class="timer-badge" id="q-timer" style="display:inline-block;background:#eef1f6;color:#6b7280;font-weight:700;">00:00</div>
        <div class="q-text">${escapeHtml(q.text)}</div>
        <div class="choice-list">${choicesHtml}</div>
        ${feedback}
      </div>
      <div class="q-footer">
        ${quizState.answered
          ? `<button class="primary-btn" onclick="App.nextQuestion()">${idx + 1 === total ? '結果を見る' : '次の問題へ'}</button>`
          : `<button class="primary-btn ${quizState.selected == null ? 'disabled' : ''}" onclick="App.submitAnswer()">解答する</button>`}
      </div>
    `;
    updateTimerDisplay();
  }

  function selectChoice(i) {
    if (quizState.answered) return;
    quizState.selected = i;
    renderQuiz();
  }

  function submitAnswer() {
    if (quizState.selected == null || quizState.answered) return;
    const q = quizState.questions[quizState.current];
    const correct = quizState.selected === q.correctIndex;
    const timeSec = (Date.now() - quizState.qStart) / 1000;
    quizState.answered = true;
    quizState.answers.push({
      questionId: q.id,
      chosenIndex: quizState.selected,
      correct,
      timeSec
    });
    renderQuiz();
  }

  function nextQuestion() {
    if (quizState.current + 1 >= quizState.questions.length) {
      finishQuiz(false);
      return;
    }
    quizState.current += 1;
    quizState.selected = null;
    quizState.answered = false;
    quizState.qStart = Date.now();
    renderQuiz();
  }

  function finishQuiz(timeUp) {
    stopTimer();
    const durationSec = (Date.now() - quizState.totalStart) / 1000;
    const session = {
      id: 'S' + Date.now(),
      mode: quizState.mode,
      chapterId: quizState.chapterId,
      title: quizState.title,
      startedAt: quizState.startedAt,
      durationSec,
      timedOut: !!timeUp,
      total: quizState.questions.length,
      correctCount: quizState.answers.filter(a => a.correct).length,
      questions: quizState.questions.map(q => ({ id: q.id, text: q.text, choices: q.choices, correctIndex: q.correctIndex, exp: q.exp })),
      answers: quizState.answers
    };
    addSession(session);
    state = { screen: 'result', session };
    quizState = null;
    render();
  }

  // ---------- RESULT ----------
  function renderResult() {
    const s = state.session;
    app.innerHTML = `
      <div class="result-hero">
        <div class="result-score">${s.correctCount}<span> / ${s.total}</span></div>
        <div class="result-label">${escapeHtml(s.title)}${s.timedOut ? '(時間切れ)' : ''}</div>
        <div class="result-meta">
          <div><div class="num">${fmtClock(s.durationSec)}</div><div class="lbl">所要時間</div></div>
          <div><div class="num">${Math.round(s.correctCount / s.total * 100)}%</div><div class="lbl">正答率</div></div>
        </div>
      </div>
      <div class="section-label">解答結果</div>
      <div class="review-list">${renderReviewList(s)}</div>
      <div class="bottom-actions">
        <button class="primary-btn" onclick="App.goHome()">ホームに戻る</button>
      </div>
    `;
  }

  function renderReviewList(s) {
    return s.questions.map((q, i) => {
      const a = s.answers[i];
      const ok = a && a.correct;
      return `
        <div class="review-item" onclick="App.toggleReview(this)">
          <div class="review-item-top">
            <div class="review-icon ${ok ? 'ok' : 'ng'}">${ok ? '○' : '×'}</div>
            <div class="review-q">Q${i + 1}. ${escapeHtml(q.text)}</div>
            <div class="review-time">${a ? fmtClock(a.timeSec) : '--'}</div>
          </div>
          <div class="review-detail">
            <div class="row">あなたの解答: <span class="${ok ? 'ans-correct' : 'ans-wrong'}">${a ? escapeHtml(q.choices[a.chosenIndex]) : '未解答'}</span></div>
            ${ok ? '' : `<div class="row">正解: <span class="ans-correct">${escapeHtml(q.choices[q.correctIndex])}</span></div>`}
            <div class="row">${escapeHtml(q.exp || '')}</div>
          </div>
        </div>`;
    }).join('');
  }

  function toggleReview(el) {
    const detail = el.querySelector('.review-detail');
    detail.classList.toggle('open');
  }

  // ---------- HISTORY ----------
  function renderHistory() {
    const list = loadHistory();
    if (list.length === 0) {
      app.innerHTML = `
        ${topbar('解答履歴', 'App.goHome()')}
        <div class="empty-state">まだ受験履歴がありません。</div>
      `;
      return;
    }
    const modeLabel = { chapter: '章別学習', mock: '模擬試験', weak: '弱点対策' };
    const items = list.map(s => `
      <div class="hist-item" onclick="App.openHistoryDetail('${s.id}')">
        <div class="hist-main">
          <div class="hist-title">${escapeHtml(s.title)} <span class="badge">${modeLabel[s.mode] || s.mode}</span></div>
          <div class="hist-date">${fmtDate(s.startedAt)} ・ ${fmtClock(s.durationSec)}</div>
        </div>
        <div class="hist-score">${s.correctCount}/${s.total}</div>
      </div>
    `).join('');
    app.innerHTML = `
      ${topbar('解答履歴', 'App.goHome()')}
      <div class="card-list">${items}</div>
      <div style="height:24px"></div>
    `;
  }

  function openHistoryDetail(id) {
    const list = loadHistory();
    const session = list.find(s => s.id === id);
    if (!session) return;
    state = { screen: 'historyDetail', session };
    render();
  }

  function renderHistoryDetail() {
    const s = state.session;
    const modeLabel = { chapter: '章別学習', mock: '模擬試験', weak: '弱点対策' };
    app.innerHTML = `
      ${topbar('履歴詳細', 'App.goHistory()')}
      <div class="result-hero" style="padding-top:8px;">
        <div class="result-score">${s.correctCount}<span> / ${s.total}</span></div>
        <div class="result-label">${escapeHtml(s.title)} ・ ${modeLabel[s.mode] || s.mode}</div>
        <div class="result-meta">
          <div><div class="num">${fmtClock(s.durationSec)}</div><div class="lbl">所要時間</div></div>
          <div><div class="num">${fmtDate(s.startedAt)}</div><div class="lbl">日時</div></div>
        </div>
      </div>
      <div class="section-label">解答結果</div>
      <div class="review-list">${renderReviewList(s)}</div>
      <div style="height:24px"></div>
    `;
  }

  // ---------- NAV ----------
  function goHome() { stopTimer(); quizState = null; state = { screen: 'home' }; render(); }
  function goChapterSetup(id) { state = { screen: 'chapterSetup', chapterId: id }; render(); }
  function goMockSetup() { state = { screen: 'mockSetup' }; render(); }
  function goWeakSetup() { state = { screen: 'weakSetup' }; render(); }
  function goHistory() { state = { screen: 'history' }; render(); }

  window.App = {
    goHome, goChapterSetup, goMockSetup, goWeakSetup, goHistory,
    startChapterQuiz, startMockQuiz, startWeakQuiz,
    selectChoice, submitAnswer, nextQuestion,
    toggleReview, openHistoryDetail
  };

  render();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
