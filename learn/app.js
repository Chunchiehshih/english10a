/* 雜誌英語闖關：離線單頁 App（不需安裝、不需網路伺服器）
 * 單元資料放在 units/*.js，每個檔案呼叫 registerUnit({...})。
 * 進度存在瀏覽器 localStorage，可在「我的」頁匯出 / 匯入備份。 */
(function () {
  'use strict';

  /* ---------------- 單元載入 ---------------- */
  const UNITS = [];
  window.registerUnit = function (u) {
    if (!u || !u.id) return;
    const i = UNITS.findIndex(x => x.id === u.id);
    if (i >= 0) UNITS[i] = u; else UNITS.push(u);
  };
  const failedFiles = [];
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(src);
      document.head.appendChild(s);
    });
  }

  /* ---------------- 進度儲存 ---------------- */
  const KEY = 'mpath.v1';
  function defaults() {
    return {
      xp: 0, streak: { count: 0, last: null, best: 0 }, days: {}, goal: 30,
      lessons: {}, srs: {}, mistakes: {},
      settings: { rate: 1, voice: '', unlockAll: false, showZh: false, unit: null, theme: '' }
    };
  }
  let S = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const d = JSON.parse(raw); S = Object.assign(defaults(), d); S.settings = Object.assign(defaults().settings, d.settings || {}); S.streak = Object.assign(defaults().streak, d.streak || {}); }
  } catch (e) { /* 無法讀取時用預設值 */ }
  let saveWarned = false;
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { if (!saveWarned) { saveWarned = true; toast('無法儲存進度（瀏覽器封鎖了本機儲存）'); } } }
  function applyTheme() { if (S.settings.theme) document.documentElement.setAttribute('data-theme', S.settings.theme); else document.documentElement.removeAttribute('data-theme'); }
  applyTheme();

  /* ---------------- 小工具 ---------------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = (a, n) => shuffle(a).slice(0, n);
  const today = (d) => { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return today(d); };
  function hash(str) { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function normText(s) {
    return String(s).toLowerCase().replace(/[’‘`]/g, "'").replace(/[—–-]/g, ' ').replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const normWords = s => normText(s).split(' ').filter(Boolean);
  function sentences(p) { return p.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+["”’]?/g) || [p]; }
  function toast(msg, ms) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => t.remove(), ms || 2200);
  }
  // 以最長共同子序列比對學生說的話與目標句
  function alignWords(target, heard) {
    const a = normWords(target), b = normWords(heard);
    const n = a.length, m = b.length, dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const hit = new Array(n).fill(false); let i = 0, j = 0;
    while (i < n && j < m) { if (a[i] === b[j]) { hit[i] = true; i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++; }
    return { words: target.split(/\s+/), hitNorm: hit, score: n ? dp[0][0] / n : 0 };
  }
  function diffHtml(target, heard) {
    const al = alignWords(target, heard);
    // 把原句 token 對應到正規化後的字
    let k = 0; const out = [];
    for (const tok of al.words) {
      const nw = normWords(tok);
      if (!nw.length) { out.push(esc(tok)); continue; }
      let ok = true; for (let x = 0; x < nw.length; x++) { if (!al.hitNorm[k + x]) ok = false; }
      k += nw.length;
      out.push(`<span class="${ok ? 'ok' : 'miss'}">${esc(tok)}</span>`);
    }
    return { html: out.join(' '), score: al.score };
  }
  function answerMatches(input, answers) {
    const a = normText(input);
    return answers.some(x => normText(x) === a);
  }

  /* ---------------- 語音：朗讀 TTS ---------------- */
  // 依聲音品質排序：Edge 自然語音 > Premium > Google > Enhanced > 一般；排除特效聲
  const NOVELTY = /Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Fred|Junior|Ralph|Kathy|Grandma|Grandpa|Eddy|Flo|Reed|Rocko|Sandy|Shelley|Deranged|Hysterical|Pipe Organ/i;
  function voiceScore(v) {
    const n = v.name; let s = 0;
    if (NOVELTY.test(n)) return -100;
    if (/Natural/i.test(n)) s += 100;           // Microsoft Edge 神經語音（最自然）
    if (/Premium/i.test(n)) s += 90;            // macOS 進階語音（需下載）
    if (/^Google (US|UK) English/i.test(n)) s += 70; // Chrome 線上語音
    if (/Enhanced/i.test(n)) s += 60;           // macOS 加強語音
    if (/Online/i.test(n)) s += 20;
    if (/Ava|Zoe|Evan|Nathan|Samantha|Allison|Susan|Jenny|Aria|Guy|Emma|Andrew|Brian|Michelle/i.test(n)) s += 10;
    if (/en[-_]US/i.test(v.lang)) s += 8; else if (/en[-_]GB/i.test(v.lang)) s += 5;
    if (v.localService === false) s += 2;
    return s;
  }
  function voiceTier(v) {
    const sc = voiceScore(v);
    return sc >= 100 ? '自然' : sc >= 85 ? '進階' : sc >= 60 ? '良好' : sc < 0 ? '特效' : '一般';
  }
  // 真人錄音：單元檔可提供 audio 對照表，有錄音時優先播放錄音
  const AUDIO = {};
  function registerAudio(unit) {
    const add = (text, spec) => { if (text && spec) AUDIO[normText(text)] = spec; };
    Object.entries(unit.audio || {}).forEach(([t, spec]) => add(t, spec));
    (unit.article || []).forEach(p => add(p.en, p.audio));
    vocabPool(unit).forEach(w => { add(w.word, w.audio); add(w.example, w.exampleAudio); });
    (unit.shadowing || []).forEach(x => add(x.en, x.audio));
  }
  let player = null;
  const TTS = {
    ok: 'speechSynthesis' in window,
    voices: [],
    init() {
      if (!this.ok) return;
      const f = () => { this.voices = speechSynthesis.getVoices().filter(v => /^en[-_]/i.test(v.lang)).sort((a, b) => voiceScore(b) - voiceScore(a)); };
      f(); speechSynthesis.onvoiceschanged = () => { f(); if (tab === 'me' && !L) render(); };
    },
    voice() {
      const want = S.settings.voice;
      return this.voices.find(v => v.name === want) || this.voices[0];
    },
    best() { return this.voices[0] ? voiceScore(this.voices[0]) : -1; },
    playRecording(spec, opts) {
      if (typeof spec === 'string') spec = { src: spec };
      player = new Audio(spec.src);
      player.playbackRate = (opts.slow ? 0.75 : 1) * (S.settings.rate || 1);
      if ('preservesPitch' in player) player.preservesPitch = true;
      const done = () => { const p = player; player = null; if (p) { p.ontimeupdate = null; p.onended = null; } opts.onend && opts.onend(); };
      if (spec.start != null) player.currentTime = spec.start;
      player.ontimeupdate = () => { if (spec.end != null && player && player.currentTime >= spec.end) { player.pause(); done(); } };
      player.onended = done;
      player.onerror = () => { player = null; this.speakSynth(opts._text, Object.assign({}, opts, { noRec: true })); };
      player.play().catch(() => { player = null; this.speakSynth(opts._text, opts); });
    },
    speak(text, opts) {
      opts = opts || {};
      this.stop();
      const rec = !S.settings.forceTTS && AUDIO[normText(text)];
      if (rec) { this.playRecording(rec, Object.assign({}, opts, { _text: text })); return; }
      this.speakSynth(text, opts);
    },
    speakSynth(text, opts) {
      if (!this.ok) { toast('這個瀏覽器不支援朗讀'); return; }
      speechSynthesis.cancel();
      // 逐句朗讀：避免 Chrome 長句中斷，也讓停頓更自然
      const parts = sentences(text).map(x => x.trim()).filter(Boolean);
      let from = 0; const v = this.voice();
      parts.forEach((part, k) => {
        const off = Math.max(0, text.indexOf(part, from)); from = off + part.length;
        const u = new SpeechSynthesisUtterance(part);
        u.lang = v ? v.lang : 'en-US'; if (v) u.voice = v;
        u.rate = (opts.slow ? 0.7 : 1) * (S.settings.rate || 1);
        if (opts.onboundary) u.onboundary = e => opts.onboundary({ name: e.name, charIndex: e.charIndex + off });
        if (k === parts.length - 1) { u.onend = () => opts.onend && opts.onend(); u.onerror = () => opts.onend && opts.onend(); }
        speechSynthesis.speak(u);
      });
    },
    // 對話：不同說話者用不同聲音
    speakLines(lines, opts) {
      opts = opts || {};
      this.stop();
      if (!this.ok) { toast('這個瀏覽器不支援朗讀'); return; }
      const pool = this.voices.filter(v => voiceScore(v) >= 0 && /en[-_](US|GB|AU|CA)/i.test(v.lang));
      const FEM = /Samantha|Ava|Zoe|Allison|Susan|Jenny|Aria|Emma|Michelle|Karen|Moira|Tessa|Serena|Victoria|Kate|Female|Libby|Sonia|Natasha|Google US English|Google UK English Female/i;
      const MAL = /Alex|Daniel|Tom|Evan|Nathan|Guy|Andrew|Brian|Christopher|Eric|Aaron|Arthur|Oliver|Ryan|Thomas|Male|Davis|Roger/i;
      const chosen = this.voice();
      const fem = pool.find(v => FEM.test(v.name) && !MAL.test(v.name)) || chosen;
      const mal = pool.find(v => MAL.test(v.name)) || pool.find(v => v !== fem) || chosen;
      const speakers = []; lines.forEach(l => { if (!speakers.includes(l.sp)) speakers.push(l.sp); });
      const voiceFor = l => { const g = l.g || (speakers.indexOf(l.sp) % 2 === 0 ? 'f' : 'm'); return g === 'm' ? mal : fem; };
      speechSynthesis.cancel();
      lines.forEach((l, k) => {
        sentences(l.en).map(x => x.trim()).filter(Boolean).forEach((part, j, arr) => {
          const u = new SpeechSynthesisUtterance(part); const v = voiceFor(l);
          if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
          u.rate = (opts.slow ? 0.7 : 1) * (S.settings.rate || 1);
          if (k === lines.length - 1 && j === arr.length - 1) { u.onend = () => opts.onend && opts.onend(); u.onerror = u.onend; }
          speechSynthesis.speak(u);
        });
      });
    },
    stop() { if (player) { player.pause(); player = null; } if (this.ok) speechSynthesis.cancel(); }
  };
  TTS.init();

  /* ---------------- 語音：辨識 ASR ---------------- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  function startListening({ continuous, onText, onEnd, onError }) {
    const r = new SR();
    r.lang = 'en-US'; r.interimResults = true; r.continuous = !!continuous; r.maxAlternatives = 1;
    let finalText = '';
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t + ' '; else interim += t;
      }
      onText && onText((finalText + interim).trim(), false);
    };
    r.onerror = (e) => onError && onError(e.error);
    r.onend = () => onEnd && onEnd(finalText.trim());
    try { r.start(); } catch (e) { onError && onError(e.message); }
    return r;
  }
  function micErrorText(err) {
    if (err === 'not-allowed' || err === 'service-not-allowed') return '麥克風被封鎖了。請允許瀏覽器使用麥克風（網址列左邊的鎖頭圖示），或改用 start 啟動檔開啟。';
    if (err === 'network') return '語音辨識需要網路連線（Chrome 會把聲音送到 Google 辨識）。';
    if (err === 'no-speech') return '沒有聽到聲音，再試一次。';
    if (err === 'audio-capture') return '找不到麥克風。';
    return '語音辨識發生問題：' + err;
  }

  /* ---------------- 課程產生 ---------------- */
  const shortZh = z => String(z).split(/[；;]/)[0].trim();
  function vocabPool(unit) { return (unit.vocab || []).concat(unit.extraVocab || []); }
  function findForm(w, text) {
    const forms = [w.word].concat(w.forms || []).sort((a, b) => b.length - a.length).map(f => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const m = text.match(new RegExp('\\b(' + forms.join('|') + ')\\b', 'i'));
    return m ? m[1] : null;
  }
  function distract(pool, w, field, n) {
    return pick(pool.filter(x => x.word !== w.word && x[field] && x[field] !== w[field]), n).map(x => field === 'zh' ? shortZh(x.zh) : x[field]);
  }
  function mcFrom(correct, wrongs, extra) {
    const opts = shuffle([correct].concat(wrongs));
    return Object.assign({ t: 'mc', options: opts, answer: opts.indexOf(correct) }, extra);
  }
  function vocabExercises(unit, w, kind) {
    const pool = vocabPool(unit);
    switch (kind) {
      case 'en2zh': return mcFrom(shortZh(w.zh), distract(pool, w, 'zh', 3), { label: '選出正確的意思', prompt: w.word, audio: w.word, word: w.word, explain: `${w.word} ${w.pos || ''} ${w.zh}` });
      case 'zh2en': return mcFrom(w.word, distract(pool, w, 'word', 3), { label: '哪一個英文字是這個意思？', prompt: w.zh, word: w.word, explain: `${w.zh} → ${w.word}`, optAudio: true });
      case 'listen': return mcFrom(w.word, distract(pool, w, 'word', 3), { label: '聽發音，選出你聽到的字', audio: w.word, hideText: true, word: w.word, explain: `${w.word} ${w.ipa || ''}` });
      case 'cloze': {
        if (!w.example) return null;
        const f = findForm(w, w.example); if (!f) return null;
        const q = w.example.replace(new RegExp('\\b' + f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b'), '____');
        return { t: 'type', label: '填入適當的字（注意字形變化）', prompt: q, zh: w.exampleZh || '', hint: `${f[0]}${'_'.repeat(Math.max(0, f.length - 1))}（${shortZh(w.zh)}）`, answers: [f], audioAfter: w.example, word: w.word, explain: w.example };
      }
      case 'spell': return { t: 'type', label: '聽發音，拼出這個字', audio: w.word, prompt: shortZh(w.zh), answers: [w.word], word: w.word, explain: `${w.word} ${w.ipa || ''}` };
      case 'speak': return w.example ? { t: 'speak', text: w.example, zh: w.exampleZh || '', word: w.word } : null;
    }
    return null;
  }
  function chunk(a, n) { const out = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; }
  function orderFrom(sentence, zh, extraWords) {
    const toks = sentence.replace(/\s+/g, ' ').trim().split(' ');
    const tiles = toks.length > 12 ? chunk(toks, 2).map(c => c.join(' ')) : toks;
    return { t: 'order', label: '把字卡排成正確的句子', prompt: zh || '', answer: sentence, tiles: shuffle(tiles.concat(extraWords || [])), audioAfter: sentence };
  }
  function drillToItem(d) {
    if (d.type === 'mc') return { t: 'mc', label: d.label || '選出正確答案', prompt: d.q, options: d.options, answer: d.answer, explain: d.explain || '', audioAfter: d.audio || null, shuffle: d.shuffle !== false };
    if (d.type === 'fill') return { t: 'type', label: d.label || '填空', prompt: d.q, answers: d.answers, hint: d.hint || '', zh: d.zh || '', explain: d.explain || '', audioAfter: d.full || null };
    if (d.type === 'order') return Object.assign(orderFrom(d.en, d.zh, d.extra), { explain: d.explain || '' });
    if (d.type === 'speak') return { t: 'speak', text: d.en, zh: d.zh || '' };
    if (d.type === 'translate') return { t: 'type', translate: true, label: d.label || '中翻英：把句子翻成英文', prompt: d.zh || d.q, answers: [d.en].concat(d.alts || []), hint: d.hint || '', explain: d.note || '', audioAfter: d.en };
    return null;
  }
  function wrongOnce(items) { return items.filter(Boolean); }
  function readingItem(r, unit) {
    if (r.type === 'fill') return { t: 'type', label: r.label || '依文意填空', prompt: r.q, passage: r.passage || '', answers: r.answers, hint: r.hint || '', explain: r.explain || '' };
    if (r.type === 'translate') return drillToItem(r);
    const tf = r.type === 'tf';
    const listen = !!(r.audio || r.audioLines);
    return {
      t: 'mc', label: r.label || (listen ? '聽力測驗：先聽再作答' : tf ? '是非題：依文章判斷對錯' : (unit.readingLabel || '閱讀理解')),
      prompt: r.q, passage: r.passage || '', options: tf ? ['True（正確）', 'False（錯誤）'] : r.options, answer: tf ? (r.answer ? 0 : 1) : r.answer,
      explain: r.explain || '', showArticle: !listen && !r.passage && (unit.article || []).length > 0, shuffle: false,
      listenLines: r.audioLines || (r.audio ? [{ sp: '', en: r.audio }] : null), script: listen
    };
  }

  function buildLessons(unit) {
    const L = [];
    const vocab = unit.vocab || [];
    // 1) 單字課：每 4 個字一課
    chunk(vocab, 4).forEach((group, gi) => {
      L.push({
        id: 'vocab-' + (gi + 1), icon: '📘', title: `單字 ${gi + 1}`, sub: group.map(w => w.word).join(' · '),
        build() {
          const a = [];
          group.forEach(w => { a.push({ t: 'flash', w }); a.push(vocabExercises(unit, w, 'en2zh')); });
          if (group.length >= 2) a.push({ t: 'match', label: '配對英文與中文', pairs: group.map(w => [w.word, shortZh(w.zh)]) });
          let b = [];
          group.forEach(w => { b.push(vocabExercises(unit, w, Math.random() < .5 ? 'listen' : 'zh2en')); b.push(vocabExercises(unit, w, 'cloze')); });
          pick(group, 2).forEach(w => b.push(vocabExercises(unit, w, 'spell')));
          b = shuffle(wrongOnce(b));
          const sp = vocabExercises(unit, pick(group, 1)[0], 'speak');
          return wrongOnce(a.concat(b, sp ? [sp] : []));
        }
      });
    });
    // 補充單字＋字首字尾
    if ((unit.extraVocab || []).length) {
      L.push({
        id: 'vocab-extra', icon: '🧩', title: '補充單字', sub: (unit.extraVocab || []).map(w => w.word).slice(0, 4).join(' · ') + '…',
        build() {
          const ex = unit.extraVocab;
          const a = [];
          ex.forEach(w => a.push({ t: 'flash', w }));
          chunk(shuffle(ex), 4).forEach(g => { if (g.length >= 2) a.push({ t: 'match', label: '配對英文與中文', pairs: g.map(w => [w.word, shortZh(w.zh)]) }); });
          pick(ex, Math.min(4, ex.length)).forEach(w => a.push(vocabExercises(unit, w, 'listen')));
          return wrongOnce(a);
        }
      });
    }
    // 2) 課文：分兩段聽讀
    const paras = unit.article || [];
    const parts = !paras.length ? [] : paras.length > 6 ? chunk(paras, 3) : paras.length > 3 ? [paras.slice(0, Math.ceil(paras.length / 2)), paras.slice(Math.ceil(paras.length / 2))] : [paras];
    let offset = 0;
    parts.forEach((ps, pi) => {
      const start = offset; offset += ps.length;
      L.push({
        id: 'story-' + (pi + 1), icon: '🎧', title: parts.length > 2 ? `課文聽讀 ${pi + 1}` : parts.length > 1 ? `課文聽讀 ${pi === 0 ? '上' : '下'}` : '課文聽讀', sub: ps.every(p => p.heading) ? ps.map(p => p.heading).join(' · ') : `第 ${start + 1}–${start + ps.length} 段`,
        build() {
          const a = [];
          ps.forEach((p, k) => {
            const idx = start + k;
            a.push({ t: 'read', para: p, idx });
            (unit.checks || []).filter(c => c.para === idx).forEach(c => a.push({ t: 'mc', label: '課文理解', prompt: c.q, options: c.options, answer: c.answer, explain: c.explain || '', shuffle: true }));
            const cands = sentences(p.en).map(s => s.trim()).filter(s => { const n = s.split(' ').length; return n >= 6 && n <= 16; });
            if (cands.length) {
              const s = pick(cands, 1)[0];
              const zhS = (p.zhSentences || {})[s] || '';
              a.push(Object.assign(orderFrom(s, zhS || '聽一聽，把這一句排出來', []), { audioFirst: true }));
            }
          });
          return a;
        }
      });
    });
    // 3) 文法：每個重點一課
    (unit.grammar || []).forEach((g, gi) => {
      L.push({
        id: 'grammar-' + (gi + 1), icon: '✏️', title: g.short || `文法 ${gi + 1}`, sub: g.title,
        build() {
          const a = [{ t: 'note', g }];
          (g.drills || []).forEach(d => a.push(drillToItem(d)));
          return wrongOnce(a);
        }
      });
    });
    // 4) 跟讀口說
    if ((unit.shadowing || []).length) {
      L.push({
        id: 'speak', icon: '🗣️', title: '跟讀口說', sub: '聽 → 模仿 → 說出來',
        build() {
          const a = [];
          unit.shadowing.forEach(s => {
            a.push({ t: 'speak', text: s.en, zh: s.zh || '' });
            if (s.en.split(' ').length <= 9) a.push({ t: 'type', label: '聽寫：聽句子，打出你聽到的內容', audio: s.en, prompt: '', answers: [s.en], explain: s.en, dictation: true });
          });
          return a;
        }
      });
    }
    // 5) 閱讀測驗
    if ((unit.reading || []).length) {
      // 可用 section 分組（例如 GEPT 的詞彙、段落填空、閱讀理解），否則每 8 題一課
      const groups = [];
      unit.reading.forEach(r => { const key = r.section || ''; let g = groups[groups.length - 1]; if (!g || g.key !== key || (!key && g.items.length >= 8)) { g = { key, items: [] }; groups.push(g); } g.items.push(r); });
      groups.forEach((g, gi) => {
        const isListen = g.items.every(r => r.audio || r.audioLines);
        L.push({
          id: 'reading' + (gi ? '-' + (gi + 1) : ''), icon: isListen ? '🎧' : '📖',
          title: g.key || (unit.readingTitle || '閱讀測驗') + (groups.length > 1 ? ' ' + (gi + 1) : ''), sub: `${g.items.length} 題`,
          build() { return g.items.map(r => readingItem(r, unit)); }
        });
      });
    }
    // 6) 開口說：自由回答
    if ((unit.discussion || []).length) {
      L.push({
        id: 'talk', icon: '💬', title: '開口聊一聊', sub: 'What do you think?',
        build() { return unit.discussion.map(d => ({ t: 'free', d })); }
      });
    }
    // 7) 單元挑戰
    L.push({
      id: 'challenge', icon: '🏆', title: '單元挑戰', sub: '綜合 15 題',
      build() {
        let all = [];
        L.forEach(l => { if (l.id !== 'challenge' && l.id !== 'talk') all = all.concat(l.build().filter(x => ['mc', 'type', 'order', 'match'].includes(x.t))); });
        return pick(all, 15);
      }
    });
    return L;
  }

  /* ---------------- 複習（錯題 + 到期單字） ---------------- */
  function dueWords() {
    const out = []; const t = today();
    UNITS.forEach(u => vocabPool(u).forEach(w => {
      const r = S.srs[u.id + '|' + w.word];
      if (r && r.due <= t) out.push({ u, w });
    }));
    return out;
  }
  function buildReview() {
    const items = [];
    const ms = Object.values(S.mistakes).sort((a, b) => b.wrong - a.wrong).slice(0, 10);
    ms.forEach(m => items.push(Object.assign({}, m.item, { _review: true })));
    pick(dueWords(), 8).forEach(({ u, w }) => {
      const kind = pick(['en2zh', 'listen', 'zh2en', 'cloze', 'spell'], 1)[0];
      const it = vocabExercises(u, w, kind) || vocabExercises(u, w, 'en2zh');
      it._unit = u.id; items.push(it);
    });
    return shuffle(items);
  }

  /* ---------------- 主畫面 ---------------- */
  let tab = 'path';
  function currentUnit() {
    return UNITS.find(u => u.id === S.settings.unit) || UNITS[0];
  }
  function lessonKey(u, l) { return u.id + ':' + l.id; }
  function topbar() {
    const dayXp = S.days[today()] || 0;
    const fireOn = S.streak.last === today();
    return `<div class="topbar"><div class="brand">雜誌英語闖關</div>
      <span class="stat fire" title="連續學習天數" style="${fireOn ? '' : 'filter:grayscale(1);opacity:.7'}">🔥 ${S.streak.count}</span>
      <span class="stat xp" title="總經驗值">⚡ ${S.xp}</span></div>`;
  }
  function navbar() {
    const b = (id, ico, label) => `<button class="${tab === id ? 'on' : ''}" data-tab="${id}"><span class="ico">${ico}</span>${label}</button>`;
    return `<nav class="nav"><div class="nav-inner">${b('path', '🗺️', '學習')}${b('read', '📰', '課文')}${b('words', '🔤', '單字')}${b('mist', '🩹', '錯題')}${b('me', '👤', '我的')}</div></nav>`;
  }
  function render() {
    TTS.stop();
    const app = $('#app');
    if (!UNITS.length) { app.innerHTML = topbar() + emptyHtml(); return; }
    let body = '';
    if (tab === 'path') body = pathHtml();
    else if (tab === 'read') body = readerHtml();
    else if (tab === 'words') body = wordsHtml();
    else if (tab === 'mist') body = mistakesHtml();
    else body = meHtml();
    app.innerHTML = topbar() + body + navbar();
    $$('.nav button').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); window.scrollTo(0, 0); });
    bindPage();
  }
  function emptyHtml() {
    return `<div class="card"><h3>還沒有任何單元</h3><p class="muted">請在 <code>units/manifest.js</code> 列出單元檔案（參考 <code>units/manifest.example.js</code> 與 <code>units/_template.js</code>），再重新整理頁面。</p>
      ${failedFiles.length ? `<p class="muted">讀取失敗：${failedFiles.map(esc).join('、')}</p>` : ''}</div>`;
  }
  function unitTabs() {
    if (UNITS.length < 2) return '';
    const u = currentUnit();
    if (UNITS.length > 4) {
      return `<div class="unit-pick"><label class="small muted" for="unit-select">選擇單元</label><select class="input" id="unit-select">${UNITS.map(x => { const pr = unitProgress(x); return `<option value="${esc(x.id)}" ${x.id === u.id ? 'selected' : ''}>${esc(x.short || x.title)}${pr.done ? `（${pr.done}/${pr.total}）` : ''}</option>`; }).join('')}</select></div>`;
    }
    return `<div class="tabs">${UNITS.map(x => `<button data-unit="${esc(x.id)}" class="${x.id === u.id ? 'on' : ''}">${esc(x.short || x.title)}</button>`).join('')}</div>`;
  }
  function unitProgress(u) {
    const ls = buildLessons(u); const done = ls.filter(l => S.lessons[lessonKey(u, l)]).length;
    return { done, total: ls.length };
  }
  function pathHtml() {
    const u = currentUnit();
    const lessons = buildLessons(u);
    const dayXp = S.days[today()] || 0;
    const pct = Math.min(100, Math.round(dayXp / S.goal * 100));
    const reviewN = Object.keys(S.mistakes).length + dueWords().length;
    let firstOpen = -1;
    const nodes = lessons.map((l, i) => {
      const rec = S.lessons[lessonKey(u, l)];
      const unlocked = S.settings.unlockAll || i === 0 || !!S.lessons[lessonKey(u, lessons[i - 1])] || !!rec;
      if (!rec && unlocked && firstOpen < 0) firstOpen = i;
      const cls = rec ? 'done' : (unlocked ? '' : 'locked');
      const offset = [0, 60, 90, 60, 0, -60, -90, -60][i % 8];
      return `<div class="node-wrap" style="transform:translateX(${offset}px)">
        <button class="node ${cls} ${firstOpen === i ? 'current' : ''}" data-lesson="${i}" ${unlocked ? '' : 'aria-disabled="true"'}>${unlocked ? l.icon : '🔒'}</button>
        <div class="node-label">${esc(l.title)}</div>
        <div class="node-sub en">${esc(l.sub || '')}</div>
        ${rec ? `<div class="stars">${'★'.repeat(rec.stars)}${'☆'.repeat(3 - rec.stars)}</div>` : ''}
      </div>`;
    }).join('');
    const pr = unitProgress(u);
    return `
      <div class="card goal">
        <div style="font-size:28px">🎯</div>
        <div style="flex:1"><b>今日目標</b> <span class="muted small">${dayXp} / ${S.goal} XP</span>
          <div class="goal-bar"><i style="width:${pct}%"></i></div></div>
      </div>
      ${reviewN ? `<div class="card row"><div style="flex:1"><b>複習時間</b><div class="muted small">${Object.keys(S.mistakes).length} 題錯題、${dueWords().length} 個單字到期</div></div><button class="btn small blue" id="go-review">開始複習</button></div>` : ''}
      ${unitTabs()}
      <div class="unit-banner">
        <div class="tag">${esc(u.series || '')}${u.series ? ' · ' : ''}完成 ${pr.done}/${pr.total} 課</div>
        <div class="title en">${esc(u.title)}</div>
        <div class="zh">${esc(u.titleZh || '')}</div>
        ${(u.article || []).length ? '<button id="go-read">📰 先看課文</button>' : ''}
      </div>
      <div class="path">${nodes}</div>`;
  }
  function tokenizeHtml(text, unit, idx) {
    const vocab = vocabPool(unit);
    const hl = (unit.highlights || []).slice().sort((a, b) => b.length - a.length);
    // 先標出文法片語的範圍
    const marks = new Array(text.length).fill(false);
    hl.forEach(h => { let p = text.indexOf(h); while (p >= 0) { for (let i = p; i < p + h.length; i++) marks[i] = true; p = text.indexOf(h, p + h.length); } });
    const out = []; const re = /[A-Za-z][A-Za-z'’-]*|[^A-Za-z]+/g; let m;
    while ((m = re.exec(text))) {
      const tok = m[0];
      if (!/[A-Za-z]/.test(tok[0])) { out.push(esc(tok)); continue; }
      const clean = tok.replace(/[’']s$/, '');
      const w = vocab.find(v => findForm(v, clean) && findForm(v, clean).toLowerCase() === clean.toLowerCase());
      const cls = ['w']; if (w && (unit.vocab || []).includes(w)) cls.push('v'); if (marks[m.index]) cls.push('g');
      out.push(`<span class="${cls.join(' ')}" data-i="${m.index}" data-p="${idx}" data-word="${esc(w ? w.word : clean)}">${esc(tok)}</span>`);
    }
    return out.join('');
  }
  function paraInner(unit, p, idx) {
    if (p.lines) return `<div class="para en" id="para-${idx}">${p.scene ? `<div class="small muted"><i>${esc(p.scene)}</i></div>` : ''}${p.lines.map(l => `<div class="dl"><b class="sp">${esc(l.sp)}:</b> ${tokenizeHtml(l.en, unit, idx)}</div>`).join('')}</div>`;
    return `<div class="para en" id="para-${idx}">${tokenizeHtml(p.en, unit, idx)}</div>`;
  }
  function paraLabel(p, idx) { return p.heading ? esc(p.heading) : `第 ${idx + 1} 段`; }
  function paraBlock(unit, p, idx, showZh) {
    return `<div class="card"><div class="row" style="margin-bottom:8px"><span class="muted small" style="flex:1">${paraLabel(p, idx)}</span>
      <button class="icon-btn" data-play="${idx}" title="朗讀">▶</button><button class="icon-btn slow" data-play-slow="${idx}" title="慢速朗讀">🐢</button></div>
      ${paraInner(unit, p, idx)}
      ${p.zh ? `<details class="zh-trans" ${showZh ? 'open' : ''}><summary>中文參考翻譯</summary>${esc(p.zh)}</details>` : ''}</div>`;
  }
  function readerHtml() {
    const u = currentUnit();
    return `${voiceHint(false)}${unitTabs()}<h2 class="en">${esc(u.title)}</h2><div class="muted">${esc(u.titleZh || '')} ${u.author ? '· ' + esc(u.author) : ''}</div>
      ${u.intro ? `<div class="note">${esc(u.intro)}</div>` : ''}
      ${(u.article || []).length ? '' : '<div class="card muted">這個單元沒有課文，請直接到「學習」頁做練習。</div>'}
      <div class="row small muted"><span><span class="para"><span class="v" style="font-size:15px">綠色</span></span>＝本課單字</span><span><span style="color:var(--blue)">藍色</span>＝文法重點</span><span>點任何字可聽發音</span></div>
      <div class="row" style="margin-top:10px"><button class="btn small" id="play-all">▶ 朗讀全文</button><button class="btn small ghost" id="stop-all">■ 停止</button></div>
      ${(u.article || []).map((p, i) => paraBlock(u, p, i, S.settings.showZh)).join('')}
      ${(u.infoBox || []).length ? `<div class="card"><details><summary>Info Box 補充說明</summary>${u.infoBox.map(x => `<p><b>${esc(x.ref)}</b>　${esc(x.zh)}</p>`).join('')}</details></div>` : ''}
      ${(u.grammar || []).length ? `<div class="card"><details><summary>Language Notes 文法重點</summary>${u.grammar.map(g => grammarNoteHtml(g)).join('<hr style="border:0;border-top:1px solid var(--line)">')}</details></div>` : ''}`;
  }
  function voiceHint(always) {
    if (!TTS.ok || (!always && (TTS.best() >= 85 || S.settings.hideVoiceHint))) return '';
    if (TTS.best() >= 85) return '';
    const isEdge = /Edg\//.test(navigator.userAgent);
    return `<div class="card" style="border-color:var(--gold);background:var(--gold-soft)"><b>想要更自然的朗讀聲音？</b>
      <ol class="small" style="margin:6px 0;padding-left:20px">
        ${isEdge ? '' : '<li><b>最推薦：</b>改用 <b>Microsoft Edge</b> 瀏覽器開啟這個 App，它內建免費的「Natural 自然語音」（例如 Ava、Andrew、Emma），聽起來接近真人。開啟後到「我的 → 朗讀聲音」選標示【自然】的聲音。</li>'}
        <li>Mac：系統設定 → 輔助使用 → 朗讀內容 → 系統聲音 → 管理聲音 → 英文（美國）→ 下載 <b>Ava（進階 / Premium）</b> 或 Zoe（進階），下載後重新開啟瀏覽器（Safari 最容易抓到這些聲音）。</li>
        <li>有雜誌附的官方音檔（MP3）的話，傳給我，我可以把真人錄音接進課文與單字。</li>
      </ol>${always ? '' : '<button class="btn small ghost" id="hide-vhint">知道了，不再顯示</button>'}</div>`;
  }
  function grammarNoteHtml(g) {
    return `<h3>${esc(g.title)}</h3>${g.formula ? `<div class="note en"><b>${esc(g.formula)}</b></div>` : ''}<div>${g.explain || ''}</div>
      ${(g.examples || []).map(e => `<div class="example"><button class="icon-btn" data-say="${esc(e.en)}">▶</button><div class="t"><div class="en">${esc(e.en)}</div><div class="z">${esc(e.zh || '')}</div></div></div>`).join('')}`;
  }
  function wordsHtml() {
    const u = currentUnit();
    const box = w => { const r = S.srs[u.id + '|' + w.word]; return r ? r.box : -1; };
    const chip = b => b < 0 ? '<span class="chip warn">未學</span>' : b >= 4 ? '<span class="chip">熟練</span>' : `<span class="chip warn">學習中 ${b}/4</span>`;
    const row = w => `<div class="list-item"><button class="icon-btn" data-say="${esc(w.word)}">▶</button>
      <div class="grow"><div><b class="en">${esc(w.word)}</b> <span class="muted small">${esc(w.ipa || '')}</span></div>
      <div class="small"><span class="pos">${esc(w.pos || '')}</span>${esc(w.zh)}</div>
      ${w.example ? `<div class="small muted en">${esc(w.example)}</div>` : ''}${w.note ? `<div class="small muted">${esc(w.note)}</div>` : ''}</div>${chip(box(w))}</div>`;
    return `${unitTabs()}<h2>單字本</h2><p class="muted small">做對會讓單字升級，錯了會回到第 0 級；到期的單字會出現在「複習」。</p>
      <div class="row"><button class="btn small" id="go-flash">🃏 單字卡瀏覽</button></div>
      <div class="card"><h3>本課單字</h3>${(u.vocab || []).map(row).join('')}</div>
      ${(u.extraVocab || []).length ? `<div class="card"><h3>補充單字</h3>${u.extraVocab.map(row).join('')}</div>` : ''}`;
  }
  function itemSummary(it) {
    if (it.t === 'match') return '配對：' + it.pairs.map(p => p[0]).join(', ');
    if (it.t === 'order') return '排句：' + it.answer;
    if (it.t === 'speak') return '口說：' + it.text;
    if (it.hideText || it.dictation) return '聽力：' + (it.audio || '');
    return (it.prompt || '') + (it.answers ? '　→ ' + it.answers[0] : it.options ? '　→ ' + it.options[it.answer] : '');
  }
  function mistakesHtml() {
    const ms = Object.entries(S.mistakes).sort((a, b) => b[1].wrong - a[1].wrong);
    return `<h2>錯題本</h2><p class="muted small">答錯的題目會自動收進來；在複習中連續答對 2 次就會移出。</p>
      ${ms.length ? `<button class="btn block" id="go-review">開始複習（${ms.length} 題）</button>` : ''}
      <div class="card">${ms.length ? ms.map(([k, m]) => `<div class="list-item"><div class="grow"><div class="small muted">${esc((UNITS.find(u => u.id === m.unit) || {}).short || m.unit)}</div><div>${esc(itemSummary(m.item))}</div></div><span class="chip bad">錯 ${m.wrong}</span></div>`).join('') : '<p class="muted">目前沒有錯題，太棒了！</p>'}</div>`;
  }
  function heatmap() {
    const cells = []; for (let i = 27; i >= 0; i--) { const d = addDays(-i); const x = S.days[d] || 0; cells.push(`<i title="${d}：${x} XP" class="${x >= S.goal ? 'l3' : x >= S.goal / 2 ? 'l2' : x > 0 ? 'l1' : ''}"></i>`); }
    return `<div class="heat">${cells.join('')}</div>`;
  }
  function meHtml() {
    const totalLessons = UNITS.reduce((s, u) => s + unitProgress(u).total, 0);
    const doneLessons = UNITS.reduce((s, u) => s + unitProgress(u).done, 0);
    const learned = Object.values(S.srs).filter(r => r.box >= 4).length;
    const voices = TTS.voices.filter(v => voiceScore(v) >= 0).map(v => `<option value="${esc(v.name)}" ${S.settings.voice === v.name ? 'selected' : ''}>【${voiceTier(v)}】${esc(v.name)} (${esc(v.lang)})</option>`).join('');
    const cur = TTS.voice();
    return `<h2>我的學習歷程</h2>${voiceHint(true)}
      <div class="end-stats"><div class="s"><b>🔥 ${S.streak.count}</b>連續天數</div><div class="s"><b>⚡ ${S.xp}</b>總 XP</div><div class="s"><b>${doneLessons}/${totalLessons}</b>完成課數</div></div>
      <div class="card"><h3>最近 4 週</h3>${heatmap()}<p class="small muted">最長連續：${S.streak.best || S.streak.count} 天 · 熟練單字：${learned} 個</p></div>
      <div class="card"><h3>設定</h3>
        <div class="list-item"><div class="grow">每日目標</div><select class="input" id="set-goal" style="width:auto">${[10, 20, 30, 50, 80].map(g => `<option ${S.goal === g ? 'selected' : ''} value="${g}">${g} XP</option>`).join('')}</select></div>
        <div class="list-item"><div class="grow">朗讀速度</div><select class="input" id="set-rate" style="width:auto">${[0.8, 0.9, 1, 1.1].map(r => `<option ${S.settings.rate === r ? 'selected' : ''} value="${r}">${r}×</option>`).join('')}</select></div>
        <div class="list-item"><div class="grow">朗讀聲音</div><select class="input" id="set-voice" style="max-width:60%"><option value="">自動</option>${voices}</select><button class="icon-btn" data-say="As the years passed, something strange became clear. Benjamin was not aging. He was growing younger.">▶</button></div>
        <div class="small muted" style="padding:4px 0 8px">目前使用：${cur ? esc(cur.name) + '（' + voiceTier(cur) + '）' : '無'}</div>
        ${Object.keys(AUDIO).length ? `<div class="list-item"><div class="grow">有真人錄音時優先播放錄音</div><input type="checkbox" id="set-rec" ${S.settings.forceTTS ? '' : 'checked'}></div>` : ''}
        <div class="list-item"><div class="grow">課文預設顯示中文翻譯</div><input type="checkbox" id="set-zh" ${S.settings.showZh ? 'checked' : ''}></div>
        <div class="list-item"><div class="grow">解鎖全部關卡（老師／預習用）</div><input type="checkbox" id="set-unlock" ${S.settings.unlockAll ? 'checked' : ''}></div>
        <div class="list-item"><div class="grow">外觀</div><select class="input" id="set-theme" style="width:auto"><option value="">跟隨系統</option><option value="light" ${S.settings.theme === 'light' ? 'selected' : ''}>淺色</option><option value="dark" ${S.settings.theme === 'dark' ? 'selected' : ''}>深色</option></select></div>
        <div class="list-item"><div class="grow">語音辨識</div><span class="chip ${SR ? '' : 'bad'}">${SR ? '可用' : '此瀏覽器不支援（請用 Chrome 或 Safari）'}</span></div>
      </div>
      <div class="card"><h3>備份進度</h3><p class="small muted">進度只存在這台電腦的這個瀏覽器。換電腦或清除瀏覽資料前，請先匯出。</p>
        <div class="row"><button class="btn small" id="export">匯出進度</button><label class="btn small ghost">匯入進度<input type="file" id="import" accept="application/json" hidden></label><button class="btn small bad" id="reset">全部重設</button></div></div>
      <p class="small muted">單元數：${UNITS.length}${failedFiles.length ? '　讀取失敗：' + failedFiles.map(esc).join('、') : ''}</p>`;
  }

  function bindPage() {
    $$('[data-unit]').forEach(b => b.onclick = () => { S.settings.unit = b.dataset.unit; save(); render(); });
    const us = $('#unit-select'); if (us) us.onchange = () => { S.settings.unit = us.value; save(); render(); };
    $$('[data-say]').forEach(b => b.onclick = () => TTS.speak(b.dataset.say));
    const u = currentUnit();
    $$('[data-lesson]').forEach(b => b.onclick = () => {
      if (b.getAttribute('aria-disabled')) { toast('先完成前一課才能解鎖'); return; }
      const l = buildLessons(u)[+b.dataset.lesson]; startLesson(u, l);
    });
    const gr = $('#go-review'); if (gr) gr.onclick = () => startReview();
    const rd = $('#go-read'); if (rd) rd.onclick = () => { tab = 'read'; render(); window.scrollTo(0, 0); };
    const gf = $('#go-flash'); if (gf) gf.onclick = () => startFlashBrowse(u);
    // 課文
    $$('[data-play]').forEach(b => b.onclick = () => playPara(u, +b.dataset.play, false));
    $$('[data-play-slow]').forEach(b => b.onclick = () => playPara(u, +b.dataset.playSlow, true));
    $$('.para .w').forEach(s => s.onclick = () => {
      const word = s.dataset.word; TTS.speak(word);
      const w = vocabPool(u).find(v => v.word === word);
      if (w) toast(`${w.word}  ${w.pos || ''} ${w.zh}`, 3000);
    });
    const pa = $('#play-all'); if (pa) pa.onclick = () => { let i = 0; const next = () => { if (i < (u.article || []).length) playPara(u, i++, false, next); }; next(); };
    const sa = $('#stop-all'); if (sa) sa.onclick = () => { TTS.stop(); $$('.speaking').forEach(x => x.classList.remove('speaking')); };
    // 設定
    const on = (id, ev, fn) => { const el = $('#' + id); if (el) el['on' + ev] = fn; };
    on('set-goal', 'change', e => { S.goal = +e.target.value; save(); });
    on('set-rate', 'change', e => { S.settings.rate = +e.target.value; save(); });
    on('set-voice', 'change', e => { S.settings.voice = e.target.value; save(); TTS.speak('This is my voice.'); });
    on('set-rec', 'change', e => { S.settings.forceTTS = !e.target.checked; save(); });
    on('hide-vhint', 'click', () => { S.settings.hideVoiceHint = true; save(); render(); });
    on('set-zh', 'change', e => { S.settings.showZh = e.target.checked; save(); });
    on('set-unlock', 'change', e => { S.settings.unlockAll = e.target.checked; save(); });
    on('set-theme', 'change', e => { S.settings.theme = e.target.value; save(); applyTheme(); });
    on('export', 'click', () => {
      const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `英語闖關進度_${today()}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
    on('import', 'change', e => {
      const f = e.target.files[0]; if (!f) return;
      f.text().then(t => { const d = JSON.parse(t); if (!d || typeof d.xp !== 'number') throw new Error(); S = Object.assign(defaults(), d); save(); toast('已匯入進度'); render(); })
        .catch(() => toast('這不是有效的進度檔'));
    });
    on('reset', 'click', () => { if (confirm('確定要清除所有進度嗎？這無法復原。')) { const keep = S.settings; S = defaults(); S.settings = keep; save(); render(); } });
  }
  function playPara(u, idx, slow, onDone) {
    const p = u.article[idx]; const el = $('#para-' + idx);
    if (p.lines && !AUDIO[normText(p.en)]) { TTS.speakLines(p.lines, { slow, onend: onDone }); return; }
    $$('.speaking').forEach(x => x.classList.remove('speaking'));
    const spans = el ? $$('.w', el) : [];
    TTS.speak(p.en, {
      slow,
      onboundary: e => {
        if (e.name && e.name !== 'word') return;
        spans.forEach(s => s.classList.remove('speaking'));
        let best = null; spans.forEach(s => { if (+s.dataset.i <= e.charIndex) best = s; });
        if (best) best.classList.add('speaking');
      },
      onend: () => { spans.forEach(s => s.classList.remove('speaking')); onDone && onDone(); }
    });
  }

  /* ---------------- 單字卡瀏覽 ---------------- */
  function startFlashBrowse(u) {
    const words = vocabPool(u); let i = 0;
    const draw = () => {
      const w = words[i];
      $('#app').innerHTML = `<div class="lesson"><div class="lesson-top"><button class="x" id="x">✕</button><div class="progress"><i style="width:${(i + 1) / words.length * 100}%"></i></div><div class="combo">${i + 1}/${words.length}</div></div>
        <div class="lesson-body">${flashHtml(w)}<div class="row" style="justify-content:space-between;margin-top:20px"><button class="btn ghost" id="prev" ${i ? '' : 'disabled'}>← 上一個</button><button class="btn" id="next">${i < words.length - 1 ? '下一個 →' : '完成'}</button></div></div></div>`;
      bindFlash(w);
      $('#x').onclick = render;
      $('#prev').onclick = () => { if (i > 0) { i--; draw(); } };
      $('#next').onclick = () => { if (i < words.length - 1) { i++; draw(); } else render(); };
      TTS.speak(w.word);
    };
    draw();
  }
  function flashHtml(w) {
    return `<div class="q-type">新單字（點卡片翻面）</div><div class="flash" id="flash"><div class="flash-inner">
      <div class="face front"><div class="word en">${esc(w.word)}</div><div class="ipa">${esc(w.ipa || '')}</div><div style="margin-top:14px" class="row"><button class="icon-btn" data-fsay="${esc(w.word)}">▶</button><button class="icon-btn slow" data-fsay-slow="${esc(w.word)}">🐢</button></div></div>
      <div class="face back"><div><span class="pos">${esc(w.pos || '')}</span><b style="font-size:20px">${esc(w.zh)}</b></div>${w.note ? `<div class="small muted" style="margin-top:6px">${esc(w.note)}</div>` : ''}
        ${w.example ? `<div class="en" style="margin-top:12px">${esc(w.example)}</div><div class="small muted">${esc(w.exampleZh || '')}</div><button class="icon-btn" style="margin-top:8px" data-fsay="${esc(w.example)}">▶</button>` : ''}</div>
    </div></div>`;
  }
  function bindFlash() {
    const f = $('#flash'); if (!f) return;
    f.onclick = (e) => { if (e.target.closest('[data-fsay],[data-fsay-slow]')) return; f.classList.toggle('flipped'); };
    $$('[data-fsay]').forEach(b => b.onclick = () => TTS.speak(b.dataset.fsay));
    $$('[data-fsay-slow]').forEach(b => b.onclick = () => TTS.speak(b.dataset.fsaySlow, { slow: true }));
  }

  /* ---------------- 課程引擎 ---------------- */
  let L = null; // 目前進行中的課
  function startLesson(unit, lesson) {
    const items = lesson.build().filter(Boolean);
    L = { unit, lesson, queue: items, pos: 0, total: items.length, graded: 0, firstRight: 0, combo: 0, maxCombo: 0, start: Date.now(), xpExtra: 0, requeued: new Set() };
    step();
  }
  function startReview() {
    const items = buildReview();
    if (!items.length) { toast('目前沒有需要複習的內容'); return; }
    startLesson(currentUnit(), { id: '_review', title: '複習', build: () => items });
  }
  function isGraded(it) { return ['mc', 'type', 'order', 'match', 'speak'].includes(it.t); }
  function itemKey(it) { const c = Object.assign({}, it); delete c._review; delete c._unit; delete c.options; delete c.tiles; delete c.answer_; return hash(JSON.stringify(c)); }
  function lessonShell(inner) {
    const pct = Math.round(L.pos / L.queue.length * 100);
    return `<div class="lesson"><div class="lesson-top"><button class="x" id="x" title="離開">✕</button><div class="progress"><i style="width:${pct}%"></i></div><div class="combo">${L.combo >= 3 ? '🔥' + L.combo : ''}</div></div>
      <div class="lesson-body">${inner}</div></div><div class="footer" id="footer"><div class="footer-inner" id="footer-inner"></div></div>`;
  }
  function setFooter(state, html, actions) {
    const f = $('#footer'); f.className = 'footer' + (state ? ' ' + state : '');
    $('#footer-inner').innerHTML = (html || '') + `<div class="footer-actions">${actions}</div>`;
  }
  function step() {
    TTS.stop();
    if (L.pos >= L.queue.length) return finish();
    const it = L.queue[L.pos];
    const R = RENDER[it.t];
    $('#app').innerHTML = lessonShell(R.html(it));
    window.scrollTo(0, 0);
    const ctl = R.bind(it) || {};
    $('#x').onclick = () => {
      setFooter('wrong', '<div class="fb-title">要離開嗎？</div><div class="fb-text">這一課的進度不會保存。</div>', '<button class="btn ghost" id="stay">繼續學習</button><button class="btn bad" id="leave">離開</button>');
      $('#stay').onclick = () => { L.pos = L.pos; step(); };
      $('#leave').onclick = () => { L = null; render(); };
    };
    if (!isGraded(it)) {
      setFooter('', '', `<button class="btn block" id="cont">繼續</button>`);
      $('#cont').onclick = () => { if (ctl.onContinue) ctl.onContinue(); L.pos++; step(); };
      if (ctl.footer) ctl.footer();
      return;
    }
    const skipBtn = it.t === 'speak' ? `<button class="btn ghost" id="skip">現在不方便說</button>` : '';
    setFooter('', '', `${skipBtn}<button class="btn" id="check" disabled>檢查</button>`);
    const chk = $('#check');
    ctl.onReady = (ready) => { chk.disabled = !ready; };
    chk.onclick = () => { if (!chk.disabled) grade(it, ctl.check()); };
    const sk = $('#skip'); if (sk) sk.onclick = () => { TTS.stop(); L.pos++; step(); };
    if (ctl.init) ctl.init();
  }
  document.addEventListener('keydown', (e) => {
    if (!L || e.isComposing) return;
    if (e.key === 'Enter') {
      const b = $('#cont') || $('#check');
      if (b && !b.disabled && !(document.activeElement && document.activeElement.tagName === 'TEXTAREA')) { e.preventDefault(); b.click(); }
    } else if (/^[1-6]$/.test(e.key) && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      const o = $$('.options .opt')[+e.key - 1]; if (o) o.click();
    }
  });
  function grade(it, res) {
    const first = !L.requeued.has(L.pos) && !it._again;
    if (first) L.graded++;
    const unitId = it._unit || L.unit.id;
    // 單字等級
    if (it.word) {
      const k = unitId + '|' + it.word; const r = S.srs[k] || { box: 0, due: today() };
      if (res.ok) { r.box = Math.min(5, r.box + 1); r.due = addDays([1, 2, 4, 7, 15, 30][r.box]); } else { r.box = 0; r.due = today(); }
      S.srs[k] = r;
    }
    // 錯題本
    const mk = unitId + '|' + itemKey(it);
    if (!res.ok) {
      const m = S.mistakes[mk] || { unit: unitId, item: Object.assign({}, it, { _review: undefined, _again: undefined }), wrong: 0, right: 0 };
      m.wrong++; m.right = 0; m.last = today(); S.mistakes[mk] = m;
    } else if (S.mistakes[mk] && it._review) {
      S.mistakes[mk].right++; if (S.mistakes[mk].right >= 2) delete S.mistakes[mk];
    }
    save();
    if (res.ok) { if (first) L.firstRight++; L.combo++; L.maxCombo = Math.max(L.maxCombo, L.combo); }
    else { L.combo = 0; if (!it._again) L.queue.push(Object.assign({}, it, { _again: true })); }
    const praise = pick(['太棒了！', '答對了！', 'Great job!', 'Nice!', '很好！'], 1)[0];
    const title = res.ok ? (res.title || praise) : (res.title || '正確答案：');
    const text = res.ok ? (res.extra || '') : `<div class="en">${esc(res.correct || '')}</div>${res.extra || ''}`;
    setFooter(res.ok ? 'right' : 'wrong', `<div class="fb-title">${res.ok ? '✓ ' : '✗ '}${esc(title)}</div><div class="fb-text">${text}${it.explain && !res.ok ? `<div class="muted">${esc(it.explain)}</div>` : ''}</div>`,
      `${it.audioAfter ? `<button class="icon-btn" id="fb-say">▶</button>` : ''}<button class="btn ${res.ok ? '' : 'bad'}" id="cont">繼續</button>`);
    if (it.audioAfter) { $('#fb-say').onclick = () => TTS.speak(it.audioAfter); if (res.ok) TTS.speak(it.audioAfter); }
    $$('.lesson-body button, .lesson-body input, .lesson-body textarea').forEach(b => { if (!b.classList.contains('icon-btn')) b.disabled = true; });
    $('.combo').textContent = L.combo >= 3 ? '🔥' + L.combo : '';
    $('#cont').onclick = () => { L.pos++; step(); };
  }
  function finish() {
    const acc = L.graded ? Math.round(L.firstRight / L.graded * 100) : 100;
    const isReview = L.lesson.id === '_review';
    let xp = 10 + L.firstRight + L.xpExtra + (acc === 100 && L.graded >= 5 ? 5 : 0);
    if (isReview) xp = 5 + L.firstRight;
    const stars = acc >= 90 ? 3 : acc >= 70 ? 2 : 1;
    const secs = Math.round((Date.now() - L.start) / 1000);
    S.xp += xp; S.days[today()] = (S.days[today()] || 0) + xp;
    const was = S.streak.last; let streakUp = false;
    if (was !== today()) { S.streak.count = (was === addDays(-1)) ? S.streak.count + 1 : 1; S.streak.last = today(); streakUp = true; }
    S.streak.best = Math.max(S.streak.best || 0, S.streak.count);
    if (!isReview) {
      const k = lessonKey(L.unit, L.lesson); const old = S.lessons[k];
      S.lessons[k] = { stars: Math.max(stars, old ? old.stars : 0), best: Math.max(acc, old ? old.best : 0), times: (old ? old.times : 0) + 1, last: today() };
    }
    save();
    const goalHit = (S.days[today()] - xp) < S.goal && S.days[today()] >= S.goal;
    $('#app').innerHTML = `<div class="lesson"><div class="end">
      <div class="big">${acc >= 90 ? '🏆' : acc >= 70 ? '🎉' : '💪'}</div>
      <h2>${isReview ? '複習完成！' : '這一課完成了！'}</h2>
      <div class="stars" style="font-size:32px">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
      <div class="end-stats"><div class="s"><b style="color:var(--gold)">+${xp}</b>XP</div><div class="s"><b style="color:var(--accent)">${acc}%</b>正確率</div><div class="s"><b>${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}</b>用時</div></div>
      ${streakUp ? `<div class="card">🔥 連續學習 <b>${S.streak.count}</b> 天！明天再來保持下去。</div>` : ''}
      ${goalHit ? `<div class="card">🎯 今天的目標 ${S.goal} XP 達成了！</div>` : ''}
      ${L.maxCombo >= 5 ? `<div class="muted">最高連對 ${L.maxCombo} 題</div>` : ''}
    </div></div><div class="footer"><div class="footer-inner"><button class="btn block" id="cont">繼續</button></div></div>`;
    L = null;
    $('#cont').onclick = () => { tab = 'path'; render(); };
  }

  /* ---------------- 各題型 ---------------- */
  function audioButtons(text) {
    return `<button class="icon-btn" data-a="${esc(text)}" title="播放">▶</button><button class="icon-btn slow" data-a-slow="${esc(text)}" title="慢速">🐢</button>`;
  }
  function bindAudio() {
    $$('[data-a]').forEach(b => b.onclick = () => TTS.speak(b.dataset.a));
    $$('[data-a-slow]').forEach(b => b.onclick = () => TTS.speak(b.dataset.aSlow, { slow: true }));
  }
  function articleModal() {
    const u = L.unit;
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;background:var(--bg);z-index:30;overflow:auto;padding:16px';
    d.innerHTML = `<div style="max-width:720px;margin:0 auto"><button class="btn small ghost" id="close-art">✕ 關閉課文</button><h2 class="en">${esc(u.title)}</h2>${(u.article || []).map((p, i) => p.lines ? `<div class="para en" style="font-size:17px">${p.heading ? `<b>${esc(p.heading)}</b>` : ''}${p.lines.map(l => `<div><b>${esc(l.sp)}:</b> ${esc(l.en)}</div>`).join('')}</div>` : `<p class="para en" style="font-size:17px"><span class="muted small">${p.heading ? esc(p.heading) + ' · ' : ''}${i + 1}　</span>${esc(p.en)}</p>`).join('')}</div>`;
    document.body.appendChild(d); $('#close-art').onclick = () => d.remove();
  }
  const RENDER = {
    flash: {
      html: it => flashHtml(it.w),
      bind: it => { bindFlash(); setTimeout(() => TTS.speak(it.w.word), 200); }
    },
    note: {
      html: it => `<div class="q-type">文法重點</div><div class="card">${grammarNoteHtml(it.g)}</div>`,
      bind: () => { $$('[data-say]').forEach(b => b.onclick = () => TTS.speak(b.dataset.say)); }
    },
    read: {
      html: it => `<div class="q-type">聽讀課文 · ${paraLabel(it.para, it.idx)}</div><div class="row" style="margin-bottom:10px">${audioButtons(it.para.en)}<span class="muted small">先聽一次，再自己讀一次。點單字可聽發音。</span></div>
        <div class="card">${paraInner(L.unit, it.para, it.idx)}
        ${it.para.zh ? `<details class="zh-trans"><summary>中文參考翻譯</summary>${esc(it.para.zh)}</details>` : ''}</div>`,
      bind: it => {
        const u = L.unit;
        $$('[data-a]').forEach(b => b.onclick = () => playParaObj(it, false));
        $$('[data-a-slow]').forEach(b => b.onclick = () => playParaObj(it, true));
        $$('.para .w').forEach(s => s.onclick = () => { TTS.speak(s.dataset.word); const w = vocabPool(u).find(v => v.word === s.dataset.word); if (w) toast(`${w.word}  ${w.zh}`, 2500); });
        setTimeout(() => playParaObj(it, false), 300);
      }
    },
    mc: {
      html: it => {
        if (it.shuffle && !it._shuffled) { const c = it.options[it.answer]; it.options = shuffle(it.options); it.answer = it.options.indexOf(c); it._shuffled = true; }
        return `<div class="q-type">${esc(it.label || '選擇題')}</div>
        ${it.listenLines ? `<div class="prompt-box" style="justify-content:center"><button class="icon-btn big" id="listen-play">🔊</button><button class="icon-btn slow" id="listen-slow">🐢</button></div>` : ''}
        ${it.passage ? `<div class="card en passage">${esc(it.passage).replace(/_{2,}\s*\((\d+)\)\s*_{2,}|\(\d+\)_{2,}|_{2,}\((\d+)\)_{2,}/g, (m) => `<span class="blank">${m.replace(/_/g, '')}</span>`)}</div>` : ''}
        ${it.hideText ? `<div class="prompt-box" style="justify-content:center"><button class="icon-btn big" data-a="${esc(it.audio)}">🔊</button><button class="icon-btn slow" data-a-slow="${esc(it.audio)}">🐢</button></div>`
          : `<div class="prompt-box">${it.audio ? `<button class="icon-btn" data-a="${esc(it.audio)}">▶</button>` : ''}<div class="bubble ${/[一-鿿]/.test(it.prompt) ? '' : 'en'}">${esc(it.prompt)}</div></div>`}
        ${it.showArticle ? `<p><button class="btn small ghost" id="show-art">📰 看課文</button></p>` : ''}
        <div class="options">${it.options.map((o, i) => `<button class="opt ${/[一-鿿]/.test(o) ? '' : 'en'}" data-o="${i}"><span class="k">${i + 1}</span>${esc(o)}</button>`).join('')}</div>`;
      },
      bind: it => {
        bindAudio(); let sel = -1; const ctl = {};
        const sa = $('#show-art'); if (sa) sa.onclick = articleModal;
        if (it.listenLines) {
          $('#listen-play').onclick = () => TTS.speakLines(it.listenLines);
          $('#listen-slow').onclick = () => TTS.speakLines(it.listenLines, { slow: true });
        }
        $$('.opt').forEach(b => b.onclick = () => {
          sel = +b.dataset.o; $$('.opt').forEach(x => x.classList.remove('sel')); b.classList.add('sel');
          if (it.optAudio) TTS.speak(it.options[sel]);
          ctl.onReady(true);
        });
        ctl.check = () => {
          const ok = sel === it.answer;
          $$('.opt')[it.answer].classList.add('right'); if (!ok) $$('.opt')[sel].classList.add('wrong');
          const script = it.listenLines ? `<details><summary>聽力原文</summary><div class="en small">${it.listenLines.map(l => (l.sp ? '<b>' + esc(l.sp) + ':</b> ' : '') + esc(l.en)).join('<br>')}</div></details>` : '';
          return { ok, correct: it.options[it.answer], extra: (ok && it.explain ? `<div class="muted">${esc(it.explain)}</div>` : '') + script };
        };
        ctl.init = () => { if (it.audio) setTimeout(() => TTS.speak(it.audio), 250); if (it.listenLines) setTimeout(() => TTS.speakLines(it.listenLines), 300); };
        return ctl;
      }
    },
    type: {
      html: it => {
        const prompt = it.prompt ? esc(it.prompt).replace(/_{3,}/g, '<span class="blank">?</span>') : '';
        return `<div class="q-type">${esc(it.label || '填空')}</div>
        <div class="prompt-box">${it.audio ? audioButtons(it.audio) : ''}${prompt ? `<div class="bubble ${/[一-鿿]/.test(it.prompt) && !/[a-z]{3}/i.test(it.prompt) ? '' : 'en'}">${prompt}${it.zh ? `<div class="small muted">${esc(it.zh)}</div>` : ''}</div>` : ''}</div>
        ${it.hint ? `<p class="muted small">提示：${esc(it.hint)}</p>` : ''}
        ${it.passage ? `<div class="card en passage">${esc(it.passage)}</div>` : ''}
        ${it.dictation || it.translate ? `<textarea class="input en" id="ans" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Type what you hear"></textarea>` : `<input class="input en" id="ans" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Type in English">`}`;
      },
      bind: it => {
        bindAudio(); const ctl = {}; const inp = $('#ans');
        inp.oninput = () => ctl.onReady(inp.value.trim().length > 0);
        inp.onkeydown = e => { if (e.key === 'Enter' && it.dictation) { e.preventDefault(); if (inp.value.trim()) $('#check').click(); } };
        ctl.check = () => {
          let ok = answerMatches(inp.value, it.answers);
          let extra = '';
          if (it.translate) {
            const best = it.answers.map(a => diffHtml(a, inp.value)).sort((a, b) => b.score - a.score)[0];
            ok = ok || best.score >= 0.6;
            return { ok, title: ok ? `翻得不錯！和參考答案相似度 ${Math.round(best.score * 100)}%` : `再比對一下參考答案（相似度 ${Math.round(best.score * 100)}%）`, correct: '參考答案：', extra: `<div class="en"><b>${esc(it.answers[0])}</b></div>${it.answers.length > 1 ? `<div class="small muted en">也可以：${it.answers.slice(1).map(esc).join(' / ')}</div>` : ''}${it.explain ? `<div class="small muted">${esc(it.explain)}</div>` : ''}` };
          }
          if (!ok && it.dictation) {
            const d = diffHtml(it.answers[0], inp.value);
            if (d.score >= 0.9) { ok = true; }
            extra = `<div class="diff en">${d.html}</div>`;
          }
          return { ok, correct: it.answers[0], extra: ok ? extra : (it.dictation ? '' : '') };
        };
        ctl.init = () => { inp.focus(); if (it.audio) setTimeout(() => TTS.speak(it.audio), 250); };
        return ctl;
      }
    },
    order: {
      html: it => `<div class="q-type">${esc(it.label)}</div>
        <div class="prompt-box">${audioButtons(it.answer)}<div class="bubble">${esc(it.prompt || '')}</div></div>
        <div class="answer-line en" id="line"></div>
        <div class="bank en" id="bank">${it.tiles.map((t, i) => `<button class="tile" data-t="${i}">${esc(t)}</button>`).join('')}</div>`,
      bind: it => {
        bindAudio(); const ctl = {}; const chosen = [];
        const draw = () => {
          $('#line').innerHTML = chosen.map((ti, k) => `<button class="tile" data-k="${k}">${esc(it.tiles[ti])}</button>`).join('');
          $$('#bank .tile').forEach(b => b.classList.toggle('used', chosen.includes(+b.dataset.t)));
          $$('#line .tile').forEach(b => b.onclick = () => { chosen.splice(+b.dataset.k, 1); draw(); });
          ctl.onReady && ctl.onReady(chosen.length > 0);
        };
        $$('#bank .tile').forEach(b => b.onclick = () => { const t = +b.dataset.t; if (!chosen.includes(t)) { chosen.push(t); draw(); } });
        ctl.check = () => {
          const said = chosen.map(i => it.tiles[i]).join(' ');
          return { ok: normText(said) === normText(it.answer), correct: it.answer };
        };
        ctl.init = () => { if (it.audioFirst) setTimeout(() => TTS.speak(it.answer), 250); };
        return ctl;
      }
    },
    match: {
      html: it => {
        const left = shuffle(it.pairs.map((p, i) => ({ i, s: p[0] }))), right = shuffle(it.pairs.map((p, i) => ({ i, s: p[1] })));
        return `<div class="q-type">${esc(it.label || '配對')}</div><p class="muted small">先點左邊的英文，再點右邊的中文。</p><div class="match">
          <div class="options">${left.map(x => `<button class="opt en" data-l="${x.i}">${esc(x.s)}</button>`).join('')}</div>
          <div class="options">${right.map(x => `<button class="opt" data-r="${x.i}">${esc(x.s)}</button>`).join('')}</div></div>`;
      },
      bind: it => {
        const ctl = {}; let L1 = null, miss = 0, done = 0;
        $$('[data-l]').forEach(b => b.onclick = () => { $$('[data-l]').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); L1 = b; TTS.speak(b.textContent); });
        $$('[data-r]').forEach(b => b.onclick = () => {
          if (!L1) { toast('先點左邊的英文'); return; }
          if (L1.dataset.l === b.dataset.r) {
            L1.classList.add('right', 'gone'); b.classList.add('right', 'gone'); L1 = null; done++;
            if (done === it.pairs.length) { ctl.onReady(true); $('#check').click(); }
          } else {
            miss++; b.classList.add('wrong'); setTimeout(() => b.classList.remove('wrong'), 500);
          }
        });
        ctl.check = () => ({ ok: miss === 0, title: miss === 0 ? '全部配對正確！' : `配對完成，錯了 ${miss} 次`, correct: it.pairs.map(p => p[0] + ' = ' + p[1]).join('　') });
        return ctl;
      }
    },
    speak: {
      html: it => `<div class="q-type">跟讀：聽一次，再對著麥克風說出來</div>
        <div class="prompt-box">${audioButtons(it.text)}<div class="bubble en" id="target">${esc(it.text)}${it.zh ? `<div class="small muted">${esc(it.zh)}</div>` : ''}</div></div>
        <div style="text-align:center">${SR ? `<button class="icon-btn big" id="mic" style="background:var(--accent);box-shadow:0 4px 0 var(--accent-dark)">🎤</button>` : `<p class="muted">這個瀏覽器不支援語音辨識（請用 Chrome 或 Safari）。請大聲跟讀後按「現在不方便說」繼續。</p>`}
        <div class="mic-state" id="mstate">${SR ? '按麥克風開始說' : ''}</div><div class="heard en" id="heard"></div></div>`,
      bind: it => {
        bindAudio(); const ctl = {}; let rec = null, heard = '';
        setTimeout(() => TTS.speak(it.text), 250);
        const mic = $('#mic'); if (!mic) return ctl;
        mic.onclick = () => {
          if (rec) { rec.stop(); return; }
          TTS.stop();
          mic.style.background = 'var(--bad)'; $('#mstate').textContent = '聆聽中…說完會自動停止（再按一次可停止）';
          rec = startListening({
            onText: t => { heard = t; $('#heard').textContent = t; },
            onError: err => { $('#mstate').textContent = micErrorText(err); },
            onEnd: t => {
              rec = null; mic.style.background = 'var(--accent)';
              if (t) heard = t;
              if (heard) {
                const d = diffHtml(it.text, heard);
                $('#target').innerHTML = `<span class="diff">${d.html}</span>${it.zh ? `<div class="small muted">${esc(it.zh)}</div>` : ''}`;
                $('#mstate').textContent = `相似度 ${Math.round(d.score * 100)}%。可以再試一次，或按「檢查」。`;
                ctl.onReady(true);
              } else if (!/麥克風|網路|問題/.test($('#mstate').textContent)) $('#mstate').textContent = '沒有聽清楚，再按一次麥克風。';
            }
          });
        };
        ctl.check = () => {
          const d = diffHtml(it.text, heard); const ok = d.score >= 0.7;
          return { ok, title: ok ? `說得很好！${Math.round(d.score * 100)}%` : `再練習一下（${Math.round(d.score * 100)}%）`, correct: '紅色波浪線是沒聽到或說錯的字：', extra: ok ? '' : `<div class="diff en">${d.html}</div>` };
        };
        return ctl;
      }
    },
    free: {
      html: it => {
        const d = it.d;
        return `<div class="q-type">開口說 · 用英文回答（說或打字都可以）</div>
        <div class="prompt-box"><button class="icon-btn" data-a="${esc(d.q)}">▶</button><div class="bubble en">${esc(d.q)}${d.qZh ? `<div class="small muted">${esc(d.qZh)}</div>` : ''}</div></div>
        ${(d.frames || []).length ? `<div class="small"><b>可以用這些句型：</b><ul class="frames en">${d.frames.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>` : ''}
        ${(d.words || []).length ? `<div class="small"><b>試著用到：</b><span class="en">${d.words.map(esc).join(' · ')}</span></div>` : ''}
        <div class="row" style="margin:12px 0">${SR ? `<button class="btn blue" id="mic">🎤 開始說</button>` : ''}<span class="muted small" id="mstate"></span></div>
        <textarea class="input en" id="ans" placeholder="I would ... because ..."></textarea>
        <p class="muted small" id="wc">0 個字（目標 ${d.minWords || 20} 字以上）</p>
        <div id="fb"></div>`;
      },
      bind: it => {
        bindAudio(); const d = it.d; const ta = $('#ans'); let rec = null; let base = '';
        const count = () => { const n = normWords(ta.value).length; $('#wc').textContent = `${n} 個字（目標 ${d.minWords || 20} 字以上）`; return n; };
        ta.oninput = count;
        const mic = $('#mic');
        if (mic) mic.onclick = () => {
          if (rec) { rec.stop(); return; }
          base = ta.value ? ta.value.trim() + ' ' : '';
          mic.textContent = '■ 停止'; $('#mstate').textContent = '聆聽中…';
          rec = startListening({ continuous: true, onText: t => { ta.value = base + t; count(); }, onError: e => { $('#mstate').textContent = micErrorText(e); }, onEnd: () => { rec = null; mic.textContent = '🎤 開始說'; if (!/麥克風|網路|問題/.test($('#mstate').textContent)) $('#mstate').textContent = '可以繼續說，或修改文字。'; } });
        };
        return {
          footer() {
            const btn = $('#cont'); btn.textContent = '送出回答'; let sent = false;
            btn.onclick = () => {
              if (sent) { L.pos++; step(); return; }
              if (rec) rec.stop();
              const n = count(); const txt = ta.value;
              const tw = new Set(normWords(txt)); const usedFrames = (d.frames || []).filter(f => { const fw = normWords(f.replace(/\([^)]*\)/g, ' ')); return fw.length && fw.filter(x => tw.has(x)).length / fw.length >= 0.7; });
              const usedWords = (d.words || []).filter(w => normWords(txt).some(x => x.startsWith(normText(w).slice(0, Math.max(4, normText(w).length - 2)))));
              const checks = [
                [n >= (d.minWords || 20), `字數 ${n} / ${d.minWords || 20}`],
                [usedFrames.length > 0, '有用到建議句型'],
                [/\bbecause\b|\bso\b|\bsince\b/i.test(txt), '有說明理由（because / so）'],
              ];
              if ((d.words || []).length) checks.push([usedWords.length > 0, `用到本課單字：${usedWords.join(', ') || '無'}`]);
              const pass = checks.filter(c => c[0]).length;
              L.xpExtra += pass * 2;
              $('#fb').innerHTML = `<div class="card"><b>自我檢核</b>${checks.map(c => `<div>${c[0] ? '✅' : '⬜'} ${esc(c[1])}</div>`).join('')}
                ${d.sample ? `<details style="margin-top:8px"><summary>參考回答</summary><div class="en">${esc(d.sample)}</div><button class="icon-btn" data-a="${esc(d.sample)}">▶</button></details>` : ''}
                <p class="small muted">建議：把自己的回答朗讀一次，或錄音存下來當作學習歷程。</p></div>`;
              bindAudio();
              const key = 'talk|' + L.unit.id + '|' + hash(d.q);
              S.talk = S.talk || {}; S.talk[key] = { q: d.q, a: txt, date: today() }; save();
              sent = true; btn.textContent = '繼續';
            };
          }
        };
      }
    }
  };
  function playParaObj(it, slow) {
    if (it.para.lines && !AUDIO[normText(it.para.en)]) { TTS.speakLines(it.para.lines, { slow }); return; }
    const el = $('#para-' + it.idx); const spans = el ? $$('.w', el) : [];
    TTS.speak(it.para.en, {
      slow,
      onboundary: e => { if (e.name && e.name !== 'word') return; spans.forEach(s => s.classList.remove('speaking')); let best = null; spans.forEach(s => { if (+s.dataset.i <= e.charIndex) best = s; }); if (best) best.classList.add('speaking'); },
      onend: () => spans.forEach(s => s.classList.remove('speaking'))
    });
  }

  /* ---------------- 啟動 ---------------- */
  async function boot() {
    (window.__PENDING_UNITS || []).forEach(u => window.registerUnit(u));
    if (!window.__SINGLE_FILE) {
      try { await loadScript('units/manifest.js'); } catch (e) { try { await loadScript('units/manifest.example.js'); } catch (e2) { /* 無單元 */ } }
      for (const f of (window.UNIT_FILES || [])) { try { await loadScript('units/' + f); } catch (e) { failedFiles.push(f); } }
    }
    UNITS.sort((a, b) => (a.order || 0) - (b.order || 0));
    UNITS.forEach(u => (u.article || []).forEach(p => { if (p.lines && !p.en) p.en = p.lines.map(l => l.en).join(' '); }));
    UNITS.forEach(registerAudio);
    render();
  }
  window.__app = { get state() { return S; }, get lesson() { return L; }, units: UNITS, buildLessons };
  boot();
})();
