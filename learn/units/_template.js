/* ============================================================
 * 單元範本（也是示範單元）
 * 新增雜誌單元：複製這個檔案 → 改名（例如 u02-xxx.js）→ 修改內容
 * → 在 units/manifest.js 加上檔名 → 重新整理網頁。
 *
 * 除了 id、title、article 以外，其他欄位都可以省略；
 * App 會依照有提供的欄位自動產生關卡：
 *   vocab        → 單字課（每 4 個字一課：單字卡、選意思、聽音辨字、配對、填空、拼字、跟讀）
 *   extraVocab   → 補充單字課
 *   article      → 課文聽讀（逐段朗讀＋排句子）；checks 可加每段理解小題
 *   grammar      → 每個文法重點一課（說明卡＋練習題 drills）
 *   shadowing    → 跟讀口說＋聽寫
 *   reading      → 閱讀測驗
 *   discussion   → 開口聊一聊（說或打字回答，附自我檢核）
 *   最後自動加上「單元挑戰」綜合題。
 * ============================================================ */
registerUnit({
  id: 'demo-night-market',          // 唯一代號（英文、數字、-），改了會讓進度重算
  order: 99,                        // 排序用，數字小的在前面
  series: '示範單元',                 // 欄目名稱（例如「大師名作選」「生活英語」）
  short: 'Demo Night Market',       // 單元切換按鈕上的短名稱
  title: 'A Night at the Market',
  titleZh: '夜市的一晚',
  author: 'Sample text',
  intro: '這是示範單元，用來說明單元檔的格式。',

  // 課文：每段一個物件；zh 為中文翻譯（可省略）
  // zhSentences：排句子題目會用到的單句翻譯（可省略）
  article: [
    {
      en: 'Every Friday, Amy and her brother visit the night market near their home. The air is full of delicious smells, and the streets are crowded with happy families.',
      zh: '每個星期五，艾美和她弟弟都會去家附近的夜市。空氣中充滿美味的香氣，街上擠滿了快樂的家庭。',
      zhSentences: { 'Every Friday, Amy and her brother visit the night market near their home.': '每個星期五，艾美和她弟弟都會去家附近的夜市。' }
    },
    {
      en: 'Amy always orders bubble tea, while her brother prefers spicy noodles. Before they leave, they buy a small gift for their grandmother, who is waiting at home.',
      zh: '艾美總是點珍珠奶茶，而她弟弟比較喜歡辣麵。離開前，他們會買一個小禮物給在家等候的奶奶。'
    }
  ],

  // 課文頁以藍色標示的文法片語（可省略）
  highlights: ['while her brother prefers'],

  // 本課單字：forms 寫出課文或例句中出現的變化形（填空題會用到）
  vocab: [
    { word: 'delicious', ipa: '[dɪˋlɪʃəs]', pos: 'adj.', zh: '美味的', example: 'The soup smells delicious.', exampleZh: '這湯聞起來很美味。' },
    { word: 'crowded', ipa: '[ˋkraʊdɪd]', pos: 'adj.', zh: '擁擠的', note: 'be crowded with 擠滿……', example: 'The train was crowded with students.', exampleZh: '火車上擠滿了學生。' },
    { word: 'prefer', forms: ['prefers', 'preferred'], ipa: '[prɪˋfɝ]', pos: 'v.', zh: '比較喜歡；偏好', example: 'I prefer tea to coffee.', exampleZh: '比起咖啡我比較喜歡茶。' },
    { word: 'gift', forms: ['gifts'], ipa: '[gɪft]', pos: 'n.', zh: '禮物', example: 'She bought a gift for her teacher.', exampleZh: '她買了一份禮物給老師。' }
  ],

  // 補充單字（可省略）
  extraVocab: [
    { word: 'spicy', ipa: '[ˋspaɪsɪ]', pos: 'adj.', zh: '辣的' },
    { word: 'noodle', ipa: '[ˋnudḷ]', pos: 'n.', zh: '麵條' }
  ],

  // Info Box 補充說明（可省略）
  infoBox: [
    { ref: '第 1 行 night market', zh: '夜市。' }
  ],

  // 文法重點：drills 題型
  //   { type:'mc',    q, options:[...], answer: 正確選項索引(從0開始), explain, shuffle:false(不打亂選項) }
  //   { type:'fill',  q:'含 ____ 的句子', answers:['可接受的答案',...], hint, full:'完整句（答完會朗讀）', explain }
  //   { type:'order', en:'要排列的英文句子', zh:'中文提示' }
  //   { type:'speak', en:'要說的句子', zh }
  grammar: [
    {
      short: 'while 對比',
      title: 'while 表示「對比」',
      formula: 'S1 + V1, while + S2 + V2',
      explain: '<p>while 可以表示「而；然而」，用來對比兩件事。</p>',
      examples: [{ en: 'Amy orders bubble tea, while her brother prefers spicy noodles.', zh: '艾美點珍奶，而她弟弟比較喜歡辣麵。' }],
      drills: [
        { type: 'mc', q: 'I like summer, ____ my sister likes winter.', options: ['while', 'because', 'so', 'if'], answer: 0, explain: '對比 → while' },
        { type: 'order', en: 'Amy always orders bubble tea, while her brother prefers spicy noodles.', zh: '艾美總是點珍奶，而她弟弟比較喜歡辣麵。' }
      ]
    }
  ],

  // 每段課文後的理解小題（para 從 0 開始算）
  checks: [
    { para: 0, q: 'When do Amy and her brother visit the night market?', options: ['Every Friday', 'Every Sunday', 'Every morning', 'Once a year'], answer: 0 }
  ],

  // 閱讀測驗（雜誌的 Reading Comprehension）
  reading: [
    { q: 'Who is the gift for?', options: ['Their grandmother', 'Their teacher', 'Their mother', 'Amy'], answer: 0, explain: 'a small gift for their grandmother' }
  ],

  // 跟讀句：建議避免數字
  shadowing: [
    { en: 'The air is full of delicious smells.', zh: '空氣中充滿美味的香氣。' }
  ],

  // 真人錄音（可省略）：把 mp3 放進 learn/audio/ 資料夾，有錄音的句子會優先播放錄音，其餘用電腦朗讀。
  //   課文段落：在 article 每段加上 audio: 'audio/u02/p1.mp3'
  //            或同一個音軌用秒數切段：audio: { src: 'audio/u02/track04.mp3', start: 12.5, end: 31.0 }
  //   單字：vocab 每個字可加 audio（單字）與 exampleAudio（例句）
  //   跟讀句：shadowing 每句可加 audio
  //   其他任何句子：audio: { 'The exact sentence.': 'audio/u02/s1.mp3' }

  // 開口說（What Do You Think?）
  discussion: [
    {
      q: 'What is your favorite night market food? Why?',
      qZh: '你最喜歡的夜市食物是什麼？為什麼？',
      frames: ['My favorite night market food is ... because ...'],
      words: ['delicious', 'prefer', 'crowded'],
      minWords: 15,
      sample: 'My favorite night market food is stinky tofu because it is crispy and delicious, even though the market is always crowded.'
    }
  ]
});
