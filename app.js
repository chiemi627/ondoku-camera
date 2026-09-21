(function(){
  "use strict";
  var $ = function(id){ return document.getElementById(id); };

  /* ================= 言語ごとの違い ================= */
  // 処理本体は英語版とスペイン語版で共有し、言語による違いはここにだけ書く。
  // 各項目の文（items[i].en）には、その言語の文が入る（英語に限らない）。
  var LANGS = {
    en: {
      key: "ondoku",                 // 保存名の頭。英語は従来のまま（息子さんの既存の記録を壊さない）
      ocr: "eng",
      tts: /^en(-|_|$)/i, ttsPrefer: "en[-_]US",
      tr: "en",
      name: "英語", text: "英文",
      L: "A-Za-z", LO: "a-z", UP: "A-Z", vowels: "aeiouAEIOU",
      marks: "",                     // その言語の文に出てくる、文字以外の記号
      singles: "AaIi",               // 行の端に1文字で出てきても、語として残すもの
      contractions: true,            // does n't → doesn't のような分断を直す
      acronyms: true,                // TV のような短い大文字語を語として認める
      confuse: [],
      dict: { type: "json", base: "https://cdn.jsdelivr.net/npm/wordlist-english@1.2.1/",
              files: ["english-words-10.json","english-words-20.json","english-words-35.json",
                      "american-words-10.json","american-words-20.json","american-words-35.json"] },
      extra: ["doesn","don","isn","aren","wasn","weren","didn","couldn","wouldn","shouldn",
              "haven","hasn","hadn","won","ain","o'clock","tv","ok","mom","dad","grandma",
              "grandpa","math","okay","hi","bye","yeah"],
      probe: ["This is a pen.", "I have a dog."],
      sample: [
        { en:"Read the passage and answer the questions.", ja:"文章を読んで、質問に答えましょう。", kind:"heading" },
        { en:"library", ja:"図書館", kind:"word" },
        { en:"borrow", ja:"借りる", kind:"word" },
        { en:"I go to the library every Saturday.", ja:"わたしは毎週土曜日に図書館へ行きます。", kind:"sentence" },
        { en:"She borrowed three books yesterday.", ja:"彼女はきのう本を三さつ借りました。", kind:"sentence" },
        { en:"Where does he go on Saturday?", ja:"彼は土曜日にどこへ行きますか。", kind:"sentence" }
      ]
    },
    es: {
      key: "ondoku-es",
      ocr: "spa",
      tts: /^es(-|_|$)/i, ttsPrefer: "es[-_]ES",
      tr: "es",
      name: "スペイン語", text: "スペイン語の文",
      L: "A-Za-zÁÉÍÓÚÜÑáéíóúüñ", LO: "a-záéíóúüñ", UP: "A-ZÁÉÍÓÚÜÑ", vowels: "aeiouáéíóúAEIOUÁÉÍÓÚ",
      marks: "¿¡",
      singles: "AaEeOoUuYy",         // a / e / o / u / y はそれだけで語になる
      contractions: false,
      acronyms: false,
      // OCR はアクセント記号を落としやすい。落ちて辞書に無い語になったら、元に戻す
      confuse: [["a","á"],["e","é"],["i","í"],["o","ó"],["u","ú"],["n","ñ"]],
      // 字幕コーパスの頻度上位5万語（hermitdave/FrequencyWords, MIT）
      dict: { type: "freq", url: "https://cdn.jsdelivr.net/gh/hermitdave/FrequencyWords@master/content/2018/es/es_50k.txt" },
      extra: [],
      probe: ["Esto es un bolígrafo.", "Tengo un perro."],
      sample: [
        { en:"Lee el texto y contesta las preguntas.", ja:"文章を読んで、質問に答えましょう。", kind:"heading" },
        { en:"biblioteca", ja:"図書館", kind:"word" },
        { en:"prestar", ja:"貸す", kind:"word" },
        { en:"Voy a la biblioteca todos los sábados.", ja:"私は毎週土曜日に図書館に行きます。", kind:"sentence" },
        { en:"¿Dónde vives?", ja:"どこに住んでいますか。", kind:"sentence" },
        { en:"Me gustaría un café, por favor.", ja:"コーヒーをお願いします。", kind:"sentence" }
      ]
    }
  };
  var CFG = window.ONDOKU || {};
  var LG = LANGS[CFG.lang] || LANGS.en;
  var BASE = CFG.base || "";

  // 画面の文言の {L}（言語名）と {T}（文の呼び方）を埋める
  function T(s){ return String(s).replace(/\{L\}/g, LG.name).replace(/\{T\}/g, LG.text); }
  // 保存名。英語は ondoku-prefs、スペイン語は ondoku-es-prefs のように分ける
  function K(name){ return LG.key + "-" + name; }

  // 言語の文字集合から組み立てる正規表現
  var RX = {
    notAllowed:     new RegExp("[^" + LG.L + "0-9 .,!?;:'\"()\\-" + LG.marks + "]", "g"),
    quoteAfterWord: new RegExp("([" + LG.L + "])\"(?=\\s|$)", "g"),
    punctThenWord:  new RegExp("([.,!?;:])(?=[" + LG.L + "])", "g"),
    edgeLead:       new RegExp("^\\s*[^" + LG.singles + LG.marks + "\\s]\\s+"),
    edgeTail:       new RegExp("\\s+[^" + LG.singles + "0-9.!?\"')\\s]\\s*$"),
    letters:        new RegExp("[" + LG.L + "]", "g"),
    hasLetter:      new RegExp("[" + LG.L + "]"),
    leadNon:        new RegExp("^[^" + LG.L + "0-9']+"),
    tailNon:        new RegExp("[^" + LG.L + "0-9']+$"),
    hasUpper:       new RegExp("[" + LG.UP + "]"),
    capWord:        new RegExp("^[" + LG.UP + "][" + LG.LO + "]+$"),
    vowel:          new RegExp("[" + LG.vowels + "]"),
    acronym:        new RegExp("^[" + LG.UP + "]{1,3}$"),
    startsLower:    new RegExp("^[" + LG.LO + "]")
  };

  // 画面の文言のうち、言語で変わる部分を埋める。
  // 子要素を持つ要素に textContent を入れると中身が消えるので、data-t は文字だけの要素に付ける。
  (function applyLabels(){
    var els = document.querySelectorAll("[data-t]");
    for(var i = 0; i < els.length; i++) els[i].textContent = T(els[i].textContent);
    var ph = document.querySelectorAll("[data-tp]");
    for(var k = 0; k < ph.length; k++) ph[k].setAttribute("placeholder", T(ph[k].getAttribute("placeholder") || ""));
    // 英語版以外は、見出しに言語の札を出して取り違えを防ぐ
    var tag = document.getElementById("langTag");
    if(tag && LG !== LANGS.en){ tag.textContent = LG.name; tag.hidden = false; }
  })();

  /* ================= state ================= */
  var items = [];
  var playing = false, singleMode = false, cursor = -1, loopLeft = 0;
  var fixMode = false;
  var fixSnap = null;          // 「なおす」に入ったときの内容（項目ごと）
  var currentHistoryT = null;  // いま表示しているシートに対応する、きろくの時刻
  var objUrl = null;
  var workers = {}, workerPromise = {}, busy = false;
  var keepAlive = null, waitTimer = null;
  var spokenMs = 0;   // まねする間の長さを決めるため、その行の英語の所要時間を覚える

  var prefs = { rate:0.85, repeat:1, voice:"", jaVoice:"", mode:"whole",
                practice:"en", order:"ja", translate:true, v:2 };

  var SAMPLE = LG.sample;

  function loadPrefs(){
    try{
      var r = localStorage.getItem(K("prefs"));
      if(!r) return;
      var p = JSON.parse(r);
      for(var k in prefs) if(p[k] !== undefined) prefs[k] = p[k];
      // 読む順の既定を「日本語 → 英語」に変えたぶんを、保存済みの設定にも反映する
      if(!p.v || p.v < 2){ prefs.order = "ja"; prefs.v = 2; savePrefs(); }
    }catch(e){}
  }
  function savePrefs(){ try{ localStorage.setItem(K("prefs"), JSON.stringify(prefs)); }catch(e){} }

  /* ================= history ================= */
  function getHistory(){
    try{ var r = localStorage.getItem(K("history")); return r ? (JSON.parse(r) || []) : []; }
    catch(e){ return []; }
  }
  // 保存には読み上げに要るものだけ残す（認識時の座標は捨てる）
  function slim(list){
    return list.map(function(x){
      return { en:x.en, ja:x.ja || "", kind:x.kind || "sentence" };
    });
  }
  function pushHistory(list){
    var t = Date.now();
    currentHistoryT = t;
    try{
      var h = getHistory();
      h.unshift({ t:t, items: slim(list) });
      localStorage.setItem(K("history"), JSON.stringify(h.slice(0, 10)));
    }catch(e){}
    renderHistory();
  }
  // 直した内容を、いま開いているきろくに書き戻す
  function updateHistory(){
    if(currentHistoryT == null) return;
    try{
      var h = getHistory();
      for(var i = 0; i < h.length; i++){
        if(h[i].t === currentHistoryT){
          h[i].items = slim(items);
          localStorage.setItem(K("history"), JSON.stringify(h));
          break;
        }
      }
    }catch(e){}
    renderHistory();
  }
  function renderHistory(){
    var h = getHistory(), ul = $("histList");
    ul.innerHTML = "";
    if(!h.length){
      var li0 = document.createElement("li");
      var sp0 = document.createElement("span");
      sp0.style.cssText = "color:var(--ink-faint);font-size:13px";
      sp0.textContent = "まだありません。";
      li0.appendChild(sp0); ul.appendChild(li0);
      return;
    }
    h.forEach(function(rec){
      var li = document.createElement("li");
      var b = document.createElement("button");
      var d = new Date(rec.t);
      var when = (d.getMonth()+1) + "/" + d.getDate() + " " +
                 String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0");
      var s1 = document.createElement("span"); s1.className = "when";
      s1.textContent = when + " ・ " + rec.items.length + "行";
      var s2 = document.createElement("span"); s2.className = "peek";
      s2.textContent = (rec.items[0] && rec.items[0].en) || "";
      b.appendChild(s1); b.appendChild(s2);
      b.addEventListener("click", function(){
        setSheet(rec.items.map(function(x){ return { en:x.en, ja:x.ja || "", kind:x.kind }; }), "きろく", false);
        currentHistoryT = rec.t;   // 直したらこのきろくに書き戻す
        $("history").hidden = true;
        $("btnHistory").setAttribute("aria-pressed","false");
      });
      li.appendChild(b); ul.appendChild(li);
    });
  }

  /* ================= speech ================= */
  var synth = window.speechSynthesis;
  var enVoices = [], jaVoices = [], enVoice = null, jaVoice = null;

  // 同じ名前の声が地域違いで並ぶ（Eddy のスペイン版とメキシコ版など）ので、そのときは地域を添える
  var REGION = { "es-ES":"スペイン", "es-MX":"メキシコ", "es-US":"米国", "es-AR":"アルゼンチン",
                 "es-CO":"コロンビア", "en-US":"米国", "en-GB":"英国", "en-AU":"豪州",
                 "en-IN":"インド", "en-IE":"アイルランド", "en-ZA":"南アフリカ" };
  function voiceLabel(v, list){
    var base = v.name.replace(/\s*\(.*\)$/, "");
    var twins = list.filter(function(x){ return x.name.replace(/\s*\(.*\)$/, "") === base; }).length;
    if(twins < 2) return base;
    var lang = String(v.lang || "").replace("_", "-");
    return base + "（" + (REGION[lang] || lang) + "）";
  }

  function fillVoiceSelect(sel, list, chosenName, fallbackLang){
    sel.innerHTML = "";
    list.forEach(function(v, i){
      var o = document.createElement("option");
      o.value = String(i);
      o.textContent = voiceLabel(v, list);
      sel.appendChild(o);
    });
    var idx = 0, i;
    for(i = 0; i < list.length; i++){ if(list[i].name === chosenName){ idx = i; break; } }
    if(!chosenName){
      for(i = 0; i < list.length; i++){
        if(new RegExp("^" + fallbackLang, "i").test(list[i].lang || "")){ idx = i; break; }
      }
    }
    sel.value = String(idx);
    return list[idx] || null;
  }

  function pickVoices(){
    if(!synth) return;
    var all = [];
    try{ all = synth.getVoices() || []; }catch(e){ return; }
    if(!all.length) return;

    enVoices = all.filter(function(v){ return LG.tts.test(v.lang || ""); });
    if(!enVoices.length) enVoices = all.slice();
    jaVoices = all.filter(function(v){ return /^ja(-|_|$)/i.test(v.lang || ""); });

    enVoice = fillVoiceSelect($("voice"), enVoices, prefs.voice, LG.ttsPrefer);
    $("voiceRow").hidden = enVoices.length < 2;

    if(jaVoices.length){
      jaVoice = fillVoiceSelect($("jaVoice"), jaVoices, prefs.jaVoice, "ja");
      $("jaVoiceRow").hidden = jaVoices.length < 2;
    } else {
      jaVoice = null;
      $("jaVoiceRow").hidden = true;
    }
    updatePracticeOptions();
  }

  // 日本語の声が無い端末では、日本語を聞くモードを選べないようにする
  function updatePracticeOptions(){
    var opt = $("practice").querySelector('option[value="enja"]');
    if(!opt) return;
    if(jaVoices.length){
      opt.disabled = false;
      opt.textContent = T("{L}と日本語を聞く");
    } else {
      opt.disabled = true;
      opt.textContent = T("{L}と日本語を聞く（日本語の声なし）");
      if(prefs.practice === "enja"){ prefs.practice = "en"; $("practice").value = "en"; savePrefs(); }
    }
  }

  function speak(text, voice, rate, onDone){
    if(!synth || !text){ onDone && onDone(); return; }
    try{ synth.cancel(); }catch(e){}
    var u = new SpeechSynthesisUtterance(text);
    if(voice){ u.voice = voice; u.lang = voice.lang; } else { u.lang = "en-US"; }
    u.rate = rate; u.pitch = 1;
    var fired = false;
    var finish = function(){ if(fired) return; fired = true; onDone && onDone(); };
    u.onend = finish; u.onerror = finish;
    clearInterval(keepAlive);
    keepAlive = setInterval(function(){
      try{ if(synth.speaking && !synth.paused){ synth.pause(); synth.resume(); } else clearInterval(keepAlive); }
      catch(e){ clearInterval(keepAlive); }
    }, 10000);
    setTimeout(function(){ try{ synth.speak(u); }catch(e){ finish(); } }, 0);
  }
  function stopSpeaking(){
    clearInterval(keepAlive);
    clearTimeout(waitTimer);
    try{ synth && synth.cancel(); }catch(e){}
  }

  /* ================= playback ================= */
  function setNow(i){
    var ol = $("lines"), els = ol.children;
    var said = ol.querySelectorAll(".say");
    for(var m = 0; m < said.length; m++) said[m].classList.remove("say");
    for(var k = 0; k < els.length; k++){
      els[k].classList.toggle("now", k === i);
      if(k !== i) els[k].classList.remove("waiting");
    }
    if(i >= 0 && els[i]){ try{ els[i].scrollIntoView({ block:"center", behavior:"smooth" }); }catch(e){} }
    $("playPos").textContent = (playing && !singleMode && i >= 0) ? (i+1) + " / " + items.length : "";
  }

  function chunkGroups(text, mode){
    var toks = String(text).split(/\s+/).filter(Boolean);
    if(!toks.length) return [{ text:text, idx:null }];
    if(mode === "word") return toks.map(function(t, i){ return { text:t, idx:[i] }; });
    if(mode === "chunk"){
      var out = [], cur = [], curIdx = [];
      toks.forEach(function(t, i){
        cur.push(t); curIdx.push(i);
        if(/[,;:.!?]["')\]]?$/.test(t) || cur.length >= 4){
          out.push({ text:cur.join(" "), idx:curIdx }); cur = []; curIdx = [];
        }
      });
      if(cur.length) out.push({ text:cur.join(" "), idx:curIdx });
      return out;
    }
    return [{ text:text, idx:null }];
  }

  function highlight(lineIndex, idx){
    var el = $("lines").children[lineIndex];
    if(!el) return;
    var ws = el.querySelectorAll(".en .w");
    for(var i = 0; i < ws.length; i++){
      ws[i].classList.toggle("say", !!idx && idx.indexOf(i) !== -1);
    }
  }
  function markJa(lineIndex, on){
    var el = $("lines").children[lineIndex];
    if(!el) return;
    var ja = el.querySelector(".ja");
    if(ja) ja.classList.toggle("say", !!on);
  }
  function showCue(lineIndex, on){
    var el = $("lines").children[lineIndex];
    if(!el) return;
    el.classList.toggle("waiting", !!on);
    var old = el.querySelector(".cue");
    if(old) old.parentNode.removeChild(old);
    if(!on) return;
    var body = el.querySelector(".body");
    if(!body) return;
    var cue = document.createElement("div");
    cue.className = "cue";
    var dot = document.createElement("i");
    var t = document.createElement("span");
    t.textContent = "まねして言ってみよう";
    cue.appendChild(dot); cue.appendChild(t);
    body.appendChild(cue);
  }

  function playFrom(i, single){
    if(!items.length) return;
    playing = true; singleMode = !!single; cursor = i; loopLeft = prefs.repeat;
    updatePlayButton(); step();
  }

  // 1行ぶんの「読む順番」を組み立てる
  function buildSequence(it){
    var seq = [];
    var groups = chunkGroups(it.en, prefs.mode);
    var gap = prefs.mode === "word" ? 350 : (prefs.mode === "chunk" ? 500 : 0);
    var useJa = (prefs.practice === "enja") && !!it.ja && !!jaVoice;

    if(useJa && prefs.order === "ja") seq.push({ kind:"ja", text:it.ja, after:400 });
    groups.forEach(function(g, gi){
      seq.push({ kind:"en", text:g.text, idx:g.idx,
                 after: gi < groups.length - 1 ? gap : ((useJa && prefs.order === "en") ? 400 : 0) });
    });
    if(useJa && prefs.order === "en") seq.push({ kind:"ja", text:it.ja, after:0 });
    if(prefs.practice === "repeat") seq.push({ kind:"wait" });
    return seq;
  }

  function runSeq(line, seq, i, done){
    if(!playing || cursor !== line) return;
    if(i >= seq.length){ highlight(line, null); markJa(line, false); done(); return; }
    var st = seq[i];

    if(st.kind === "wait"){
      highlight(line, null);
      showCue(line, true);
      var ms = Math.max(1400, Math.round(spokenMs * 1.2) + 400);
      waitTimer = setTimeout(function(){
        showCue(line, false);
        runSeq(line, seq, i + 1, done);
      }, ms);
      return;
    }

    var isEn = st.kind === "en";
    highlight(line, isEn ? st.idx : null);
    markJa(line, !isEn);
    var t0 = Date.now();
    // 日本語は母語なので、英語のためのゆっくり設定には引きずらせない
    speak(st.text, isEn ? enVoice : jaVoice, isEn ? prefs.rate : 0.95, function(){
      if(!playing || cursor !== line) return;
      if(isEn) spokenMs += Date.now() - t0;
      setTimeout(function(){ runSeq(line, seq, i + 1, done); }, st.after || 0);
    });
  }

  function step(){
    if(!playing) return;
    if(cursor < 0 || cursor >= items.length){ stopAll(); return; }
    setNow(cursor);
    var line = cursor;
    spokenMs = 0;
    runSeq(line, buildSequence(items[line]), 0, afterLine);
  }

  function afterLine(){
    loopLeft -= 1;
    if(loopLeft > 0){ setTimeout(step, 420); return; }
    if(singleMode){ stopAll(); return; }
    cursor += 1; loopLeft = prefs.repeat;
    if(cursor >= items.length){ stopAll(); return; }
    setTimeout(step, 520);
  }

  function stopAll(){
    playing = false; singleMode = false;
    var old = cursor;
    cursor = -1;
    stopSpeaking();
    if(old >= 0) showCue(old, false);
    setNow(-1);
    updatePlayButton();
  }

  function updatePlayButton(){
    var btn = $("playAll");
    btn.classList.toggle("stopping", playing);
    $("playLabel").textContent = playing ? "とめる" : "ぜんぶ読む";
    $("playIcon").innerHTML = playing
      ? '<rect x="6" y="5" width="4" height="14" rx="1"></rect><rect x="14" y="5" width="4" height="14" rx="1"></rect>'
      : '<path d="M8 5v14l11-7z"></path>';
    btn.disabled = !items.length || !synth || fixMode;
    if(!playing) $("playPos").textContent = "";
  }

  /* ================= rendering ================= */
  function render(){
    var ol = $("lines");
    var suspects = 0;
    ol.innerHTML = "";
    if(!items.length){
      var p = document.createElement("li");
      p.className = "empty";
      p.textContent = T("{T}がありません。プリントを撮りなおしてください。");
      ol.appendChild(p);
      $("sheetCount").textContent = "";
      updatePlayButton();
      return;
    }
    items.forEach(function(it, i){
      var li = document.createElement("li");
      li.className = "line " + (it.kind || "sentence");

      var no = document.createElement("span");
      no.className = "no"; no.textContent = String(i+1);
      li.appendChild(no);

      var body = document.createElement("div");
      body.className = "body";

      if(fixMode){
        var inp = document.createElement("input");
        inp.type = "text"; inp.className = "edit"; inp.value = it.en;
        inp.setAttribute("aria-label", (i+1) + T("行目の{T}"));
        inp.addEventListener("input", function(){ items[i].en = inp.value; });
        body.appendChild(inp);

        if(it.ja){
          var jin = document.createElement("input");
          jin.type = "text"; jin.className = "edit jaedit"; jin.value = it.ja;
          jin.setAttribute("aria-label", (i+1) + "行目の日本語");
          jin.addEventListener("input", function(){ items[i].ja = jin.value; });
          body.appendChild(jin);
        }
        li.appendChild(body);

        var del = document.createElement("button");
        del.className = "del"; del.type = "button";
        del.setAttribute("aria-label", (i+1) + "行目をけす");
        del.textContent = "×";
        del.addEventListener("click", function(){
          items.splice(i, 1);
          items = items.filter(function(x){ return x.en.trim(); });
          render();
        });
        li.appendChild(del);
      } else {
        var en = document.createElement("span");
        en.className = "en";
        it.en.split(/(\s+)/).forEach(function(p){
          if(!p) return;
          if(/^\s+$/.test(p)){ en.appendChild(document.createTextNode(p)); return; }
          var sp = document.createElement("span");
          sp.className = "w";
          sp.textContent = p;
          if(wordStatus(p) === "bad"){
            sp.classList.add("sus");
            sp.title = "読みまちがいかもしれません";
            suspects++;
          }
          en.appendChild(sp);
        });
        body.appendChild(en);

        if(it.ja){
          var jaEl = document.createElement("div");
          jaEl.className = "ja";
          jaEl.textContent = it.ja;
          body.appendChild(jaEl);
        }
        li.appendChild(body);

        var spk = document.createElement("span");
        spk.className = "spk";
        spk.innerHTML = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a9 9 0 0 1 0 14"/></svg>';
        li.appendChild(spk);

        li.tabIndex = 0;
        li.setAttribute("role","button");
        li.setAttribute("aria-label", it.en + " を読み上げる");
        li.addEventListener("click", function(){ onLineTap(i); });
        li.addEventListener("keydown", function(e){
          if(e.key === "Enter" || e.key === " "){ e.preventDefault(); onLineTap(i); }
        });
      }
      ol.appendChild(li);
    });
    var withJa = items.filter(function(x){ return x.ja; }).length;
    $("sheetCount").textContent = items.length + " 行"
      + (withJa ? " ・ 訳 " + withJa : "")
      + (suspects ? " ・ あやしい " + suspects + " 語" : "");
    updatePlayButton();
  }

  function onLineTap(i){
    if(playing && cursor === i){ stopAll(); return; }
    stopSpeaking();
    playFrom(i, true);
  }

  function setSheet(list, tagText, remember){
    stopAll();
    if(fixMode) setFixMode(false, true);
    items = list;
    var tag = $("sheetTag");
    tag.textContent = tagText;
    tag.classList.add("live");
    $("sheetNote").textContent = "タップで1行ずつ";
    render();
    if(remember && list.length) pushHistory(list);
    try{ $("lines").scrollIntoView({ block:"start", behavior:"smooth" }); }catch(e){}
  }

  function setFixMode(on, skipRetranslate){
    if(on){
      // 直す前の内容を控えておく。あとで「英語が変わったか」を見るために使う。
      fixSnap = new Map();
      items.forEach(function(it){ fixSnap.set(it, { en:it.en, ja:it.ja || "" }); });
    }
    fixMode = !!on;
    $("btnFix").setAttribute("aria-pressed", fixMode ? "true" : "false");
    $("hint").textContent = fixMode
      ? T("まちがった文字を直したり、いらない行を × でけせます。{L}を直すと、訳はつけ直されます。")
      : T("{T}をタップすると、その1行だけをくりかえします。点線の語は読みまちがいかもしれません。");
    stopAll();
    if(!fixMode){
      items = items.filter(function(x){ return x.en.trim(); });
      render();
      if(skipRetranslate){ fixSnap = null; return; }
      retranslateEdited();
      return;
    }
    render();
  }

  // 英語を直した行だけ、訳をつけ直す。
  // 日本語も手で直していたら、そちらを尊重して触らない。
  function retranslateEdited(){
    var snap = fixSnap;
    fixSnap = null;
    if(!prefs.translate || !snap){ updateHistory(); return; }

    var targets = items.filter(function(it){
      var s = snap.get(it);
      if(!s) return !it.ja;                          // あとから増えた行
      return it.en !== s.en && (it.ja || "") === s.ja;
    });
    if(!targets.length){ updateHistory(); return; }
    fillTranslations(targets, "日本語訳をつけ直しています…");
  }

  // 訳を入れ直す。失敗した行は前の訳を残し、やり直せるようにする。
  async function fillTranslations(targets, title){
    trLastError = "";
    var keep = targets.map(function(it){ return it.ja || ""; });
    targets.forEach(function(it){ it.ja = ""; });
    showStatus(title, "", { busy:true, progress:0 });
    await translateAll(targets, function(p){ showStatus(title, "", { busy:true, progress:p }); });

    var missed = [];
    targets.forEach(function(it, i){
      if(!it.ja){ it.ja = keep[i]; missed.push(it); }
    });
    render();
    updateHistory();
    if(missed.length){
      showStatus(
        missed.length + " 行に訳をつけられませんでした",
        (trLastError ? "理由: " + trLastError + "。" : "") + T("{L}の読み上げはそのまま使えます。"),
        { error:true, actionLabel:"もう一度",
          onAction: function(){ fillTranslations(missed, title); } }
      );
    } else {
      hideStatus();
    }
  }

  /* ================= status ================= */
  function showStatus(title, note, opts){
    opts = opts || {};
    var s = $("status");
    s.hidden = false;
    s.classList.toggle("err", !!opts.error);
    $("statusSpin").hidden = !opts.busy;
    $("statusTitle").textContent = title;
    $("statusNote").textContent = note || "";
    $("statusProg").hidden = (opts.progress === undefined);
    if(opts.progress !== undefined) $("statusBar").style.width = Math.round(opts.progress*100) + "%";
    var act = $("statusAction");
    if(opts.actionLabel){ act.hidden = false; act.textContent = opts.actionLabel; act.onclick = opts.onAction || null; }
    else { act.hidden = true; act.onclick = null; }
  }
  function hideStatus(){ $("status").hidden = true; $("statusAction").onclick = null; }

  /* ================= image preparation ================= */
  function loadViaImg(file){
    return new Promise(function(resolve, reject){
      var url = URL.createObjectURL(file);
      var im = new Image();
      im.onload = function(){ resolve(im); };
      im.onerror = function(){ URL.revokeObjectURL(url); reject(new Error("decode")); };
      im.src = url;
    });
  }

  async function prepare(file){
    var bmp = null;
    if(typeof createImageBitmap === "function"){
      try{ bmp = await createImageBitmap(file, { imageOrientation:"from-image" }); }
      catch(e){ try{ bmp = await createImageBitmap(file); }catch(e2){ bmp = null; } }
    }
    if(!bmp) bmp = await loadViaImg(file);

    var long = Math.max(bmp.width, bmp.height);
    var scale = 1;
    if(long > 2400) scale = 2400 / long;
    else if(long < 1500) scale = Math.min(2, 1500 / long);

    var w = Math.max(1, Math.round(bmp.width * scale));
    var h = Math.max(1, Math.round(bmp.height * scale));
    var cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    var ctx = cv.getContext("2d", { willReadFrequently:true });
    ctx.drawImage(bmp, 0, 0, w, h);
    if(bmp.close) bmp.close();

    try{
      var img = ctx.getImageData(0, 0, w, h);
      var d = img.data, hist = new Uint32Array(256), i, g;
      for(i = 0; i < d.length; i += 4){
        g = (d[i]*0.299 + d[i+1]*0.587 + d[i+2]*0.114) | 0;
        d[i] = d[i+1] = d[i+2] = g;
        hist[g]++;
      }
      var total = w*h, lo = 0, hi = 255, acc = 0, cut = total * 0.02;
      for(i = 0; i < 256; i++){ acc += hist[i]; if(acc > cut){ lo = i; break; } }
      acc = 0;
      for(i = 255; i >= 0; i--){ acc += hist[i]; if(acc > cut){ hi = i; break; } }
      if(hi - lo > 20){
        var lut = new Uint8Array(256), span = hi - lo;
        for(i = 0; i < 256; i++){
          var v = Math.round((i - lo) * 255 / span);
          lut[i] = v < 0 ? 0 : (v > 255 ? 255 : v);
        }
        for(i = 0; i < d.length; i += 4){ d[i] = d[i+1] = d[i+2] = lut[d[i]]; }
      }
      ctx.putImageData(img, 0, 0);
    }catch(e){}

    return cv;
  }

  /* ================= 英文の掃除 ================= */
  function tidy(s){
    s = String(s);
    s = s.replace(/[‘’ʼ＇]/g, "'")
         .replace(/[“”＂]/g, '"')
         .replace(/[‐-―－]/g, "-")
         .replace(/[ 　]/g, " ");
    s = s.replace(RX.notAllowed, " ");
    s = s.replace(/-{2,}/g, " ").replace(/\.{4,}/g, "...");

    if(((s.match(/"/g) || []).length % 2) === 1){
      s = s.replace(RX.quoteAfterWord, "$1");
    }
    if(((s.match(/"/g) || []).length % 2) === 1){ s = s.replace(/"/g, ""); }
    s = s.replace(/(^|\s)'(?=\s|$)/g, "$1");

    if(LG.contractions){
      s = s.replace(/([A-Za-z])\s+n\s*'\s*t\b/gi, "$1n't");
      s = s.replace(/([A-Za-z])\s+'\s*(t|s|re|ve|ll|m|d)\b/gi, "$1'$2");
      s = s.replace(/'\s+(t|s|re|ve|ll|m|d)\b/gi, "'$1");
    }
    if(LG.marks){
      s = s.replace(/([¿¡])\s+/g, "$1");   // ¿ ¡ の直後に入った空白を詰める
    }

    s = s.replace(/\s+([.,!?;:])/g, "$1");
    s = s.replace(RX.punctThenWord, "$1 ");
    s = s.replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");

    s = s.replace(RX.edgeLead, "");
    s = s.replace(RX.edgeTail, "");

    return s.replace(/\s+/g, " ").trim();
  }

  /* ================= 英単語の辞書 ================= */
  var DICT = null, dictPromise = null;
  function loadDict(){
    if(dictPromise) return dictPromise;
    dictPromise = (async function(){
      var set = new Set(), got = 0, d = LG.dict;
      if(d.type === "freq"){
        // 「語 出現数」が1行ずつ並んだ頻度リスト
        try{
          var r = await fetch(d.url);
          if(r.ok){
            var freq = Object.create(null);   // constructor などの語で既存の性質に当たらないように
            (await r.text()).split(/\r?\n/).forEach(function(line){
              var parts = line.split(" ");
              if(parts[0]) freq[parts[0].toLowerCase()] = Number(parts[1]) || 0;
            });
            pruneUnaccented(freq);
            Object.keys(freq).forEach(function(w){ set.add(w); });
            if(set.size) got = 1;
          }
        }catch(e){}
      } else {
        for(var i = 0; i < d.files.length; i++){
          try{
            var r2 = await fetch(d.base + d.files[i]);
            if(!r2.ok) continue;
            var arr = await r2.json();
            if(Array.isArray(arr)){
              for(var k = 0; k < arr.length; k++) set.add(String(arr[k]).toLowerCase());
              got++;
            }
          }catch(e){}
        }
      }
      if(!got) return null;
      LG.extra.forEach(function(w){ set.add(w); });
      DICT = set;
      return set;
    })();
    return dictPromise;
  }

  // 字幕由来の単語リストには、アクセントの書き間違いも「語」として入っている。
  // 抜けたもの（tambien）も、位置を誤ったもの（tambíen）もある。そのままだと
  // OCR がアクセントを落としたとき、直す先が定まらない。
  // アクセント以外が同じ綴りの仲間の中で、最多の綴りの 1/12 未満しか使われない
  // ものは誤記とみなして外す。12 を境にしたのは実測から: 直したい誤記は 14.5〜275 倍
  // 少なく、両方とも正しい語（esta/está, donde/dónde, papa/papá）は 11.2 倍以内だった。
  var UNACCENT = { "á":"a","é":"e","í":"i","ó":"o","ú":"u","ü":"u","ñ":"n" };
  function stripAccents(w){ return w.replace(/[áéíóúüñ]/g, function(ch){ return UNACCENT[ch]; }); }
  function pruneUnaccented(freq){
    var groups = Object.create(null);
    Object.keys(freq).forEach(function(w){
      var g = stripAccents(w);
      (groups[g] = groups[g] || []).push(w);
    });
    Object.keys(groups).forEach(function(g){
      var vs = groups[g];
      if(vs.length < 2) return;
      var top = 0;
      vs.forEach(function(w){ if(freq[w] > top) top = freq[w]; });
      vs.forEach(function(w){ if(freq[w] * 12 < top) delete freq[w]; });
    });
  }

  function wordStatus(tok){
    var core = String(tok).replace(RX.leadNon, "").replace(RX.tailNon, "");
    if(!core) return "skip";
    if(RX.hasUpper.test(core)) return "skip";
    if(/^[0-9]+$/.test(core)) return "skip";
    if(!DICT) return "skip";
    var bits = core.split("'");
    var base = bits[0], suf = bits[1];
    if(suf !== undefined && !/^(t|s|re|ve|ll|m|d|clock)?$/.test(suf)) return "bad";
    if(!base) return "skip";
    return DICT.has(base) ? "ok" : "bad";
  }

  var CONFUSE = [
    ["0","o"],["1","l"],["1","i"],["5","s"],["8","b"],["9","g"],["6","b"],["3","e"],["7","t"],["4","a"],
    ["rn","m"],["cl","d"],["vv","w"],["ii","u"],
    ["l","i"],["i","l"],["c","e"],["e","c"],["o","a"],["a","o"],["t","f"],["f","t"],["u","v"],["v","u"],["h","b"],["b","h"]
  ];

  function candidates(core, table){
    var hits = new Set();
    for(var c = 0; c < table.length; c++){
      var from = table[c][0], to = table[c][1];
      var at = core.indexOf(from);
      while(at !== -1){
        var cand = core.slice(0, at) + to + core.slice(at + from.length);
        if(DICT.has(cand.split("'")[0])) hits.add(cand);
        at = core.indexOf(from, at + 1);
      }
    }
    return hits;
  }

  function repairWord(tok){
    if(!DICT) return tok;
    var lead = (tok.match(RX.leadNon) || [""])[0];
    var tail = (tok.match(RX.tailNon) || [""])[0];
    var core = tok.slice(lead.length, tok.length - tail.length);
    if(core.length < 3) return tok;
    if(RX.hasUpper.test(core)) return tok;
    if(wordStatus(core) !== "bad") return tok;

    // その言語に固有の直し方（スペイン語ならアクセントの復元）を先に試し、
    // それで決まらないときだけ、形の似た文字の取り違えを試す。
    // 逆順にすると、スペイン語では a↔o の入れ替えが別の実在語（nino → nina）を当ててしまう。
    var tiers = [LG.confuse, CONFUSE];
    for(var t = 0; t < tiers.length; t++){
      var hits = candidates(core, tiers[t]);
      if(hits.size === 1) return lead + hits.values().next().value + tail;
      if(hits.size > 1) return tok;   // 決めきれないものは触らない
    }
    return tok;
  }

  function repairLine(s){
    if(!DICT) return s;
    return s.split(/(\s+)/).map(function(p){
      return /^\s*$/.test(p) ? p : repairWord(p);
    }).join("");
  }

  // プリント上の日本語を、その言語の文字として誤読した行を落とす。
  // 辞書で通る語が1つも無ければ、それはその言語の文ではない。
  function notTarget(s){
    if(!DICT) return false;
    var toks = String(s).split(/\s+/).filter(function(t){ return RX.hasLetter.test(t); });
    if(toks.length < 2) return false;
    var ok = 0;
    toks.forEach(function(t){
      var core = t.replace(RX.leadNon, "").replace(RX.tailNon, "");
      if(!core) return;
      var low = core.toLowerCase().split("'")[0];
      // 誤読はたいてい大文字の羅列になる。EL のような短い大文字語は、
      // 辞書に載っていても偶然の一致とみなして数えない
      var allCaps = RX.hasUpper.test(core) && core === core.toUpperCase();
      if(DICT.has(low) && (!allCaps || core.length >= 3)){ ok++; return; }
      if(RX.capWord.test(core) && RX.vowel.test(core)){ ok++; return; }   // Ken などの人名、文頭の語
      if(LG.acronyms && RX.acronym.test(core)){ ok++; return; }           // TV などの略語
    });
    return (ok / toks.length) < 0.34;
  }

  function looksLikeJunk(s){
    var letters = (s.match(RX.letters) || []).length;
    if(letters < 2) return true;
    var solid = s.replace(/\s/g, "").length;
    if(!solid) return true;
    if(letters / solid < 0.5) return true;
    if(/^[A-Z]{1,2}\s?\d{1,3}\s?[ab]?$/.test(s)) return true;
    if(/^(kumon|name|date)$/i.test(s)) return true;
    return false;
  }

  /* ================= 日本語訳 ================= */
  // 送るのは読み取った英文だけ。一度訳したものは端末に保存し、同じ英文は二度と送らない。
  // 経路がひとつ塞がれても訳がつくよう、翻訳先を2つ用意している。
  var TR_KEY = K("tr");
  var trCache = null;
  var trLastError = "";

  function trLoad(){
    if(trCache) return trCache;
    try{ trCache = JSON.parse(localStorage.getItem(TR_KEY) || "{}") || {}; }
    catch(e){ trCache = {}; }
    return trCache;
  }
  function trSave(){
    try{
      var c = trLoad(), keys = Object.keys(c);
      if(keys.length > 600){
        var trimmed = {};
        keys.slice(keys.length - 600).forEach(function(k){ trimmed[k] = c[k]; });
        trCache = c = trimmed;
      }
      localStorage.setItem(TR_KEY, JSON.stringify(c));
    }catch(e){}
  }
  function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

  function trGet(url, parse){
    var ctl = new AbortController();
    var timer = setTimeout(function(){ ctl.abort(); }, 15000);
    return fetch(url, { signal: ctl.signal, mode:"cors", credentials:"omit" }).then(function(r){
      clearTimeout(timer);
      if(!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }, function(e){
      clearTimeout(timer);
      throw new Error((e && e.name === "AbortError") ? "時間切れ" : ((e && e.message) || "通信できません"));
    }).then(parse);
  }

  /* --- 翻訳先 1: Google --- */
  function gUrl(q){
    return "https://translate.googleapis.com/translate_a/single?" +
      new URLSearchParams({ client:"gtx", sl:LG.tr, tl:"ja", dt:"t", q:q }).toString();
  }
  function gSegments(j){
    var segs = (j && j[0]) || [];
    var bySrc = Object.create(null), order = [];
    segs.forEach(function(seg){
      if(!seg) return;
      var dst = String(seg[0] == null ? "" : seg[0]).replace(/\n/g, "").trim();
      var src = String(seg[1] == null ? "" : seg[1]).replace(/\n/g, "").trim();
      order.push(dst);
      if(src) bySrc[src] = dst;
    });
    return { bySrc:bySrc, order:order };
  }
  function trGoogleOne(q){
    return trGet(gUrl(q), function(j){ return gSegments(j).order.join("").trim(); });
  }
  // まとめ送りは URL に改行（%0A）が入る。これを弾く経路があるため、失敗しても1文ずつに切り替える。
  function trGoogleBatch(lines){
    return trGet(gUrl(lines.join("\n")), function(j){
      var m = gSegments(j);
      return lines.map(function(t, i){
        var hit = m.bySrc[t.trim()];
        if(hit) return hit;
        return (m.order.length === lines.length && m.order[i]) ? m.order[i] : "";
      });
    });
  }

  /* --- 翻訳先 2: MyMemory --- */
  // 翻訳メモリの寄せ集めを返すことがあり、そのままだと無関係な訳が混じる。
  // 機械翻訳の結果だけを取り出して使う。
  function trMyMemoryOne(q){
    var url = "https://api.mymemory.translated.net/get?" +
      new URLSearchParams({ q:q, langpair:LG.tr + "|ja" }).toString();
    return trGet(url, function(d){
      if(d && d.responseStatus && Number(d.responseStatus) !== 200){
        throw new Error("応答 " + d.responseStatus);
      }
      var ms = (d && d.matches) || [];
      for(var i = 0; i < ms.length; i++){
        var by = String(ms[i]["created-by"] || "");
        if((String(ms[i].id) === "0" || by.indexOf("MT") !== -1) && ms[i].translation){
          return String(ms[i].translation).trim();
        }
      }
      return String(((d || {}).responseData || {}).translatedText || "").trim();
    });
  }

  // Google は回数制限（429）をかける。制限中に叩き続けると解除が遅れ、
  // そのたびに待たされるので、一度失敗したらしばらく呼ばない。
  var G_COOL_MS = 10 * 60 * 1000;
  function googleCoolUntil(){
    try{ return Number(localStorage.getItem(K("gcool")) || 0); }catch(e){ return 0; }
  }
  function googleCooling(){ return Date.now() < googleCoolUntil(); }
  function googleFailed(){
    try{ localStorage.setItem(K("gcool"), String(Date.now() + G_COOL_MS)); }catch(e){}
  }
  function googleRecovered(){
    try{ localStorage.removeItem(K("gcool")); }catch(e){}
  }

  // 1かたまりを訳す。まとめ送り → 1文ずつ → 別の翻訳先、の順に手を変える。
  async function trBatch(batch){
    var out = batch.map(function(){ return ""; });
    var i, k;
    var useGoogle = !googleCooling();

    if(useGoogle){
      var batchOk = false;
      try{
        var res = await trGoogleBatch(batch);
        for(i = 0; i < batch.length; i++) out[i] = res[i] || "";
        batchOk = true;
      }catch(e){
        trLastError = "Google: " + e.message;
      }

      // まとめ送りだけが弾かれている可能性があるので、1文で試し直す
      if(!batchOk){
        try{
          out[0] = await trGoogleOne(batch[0]);
        }catch(e2){
          trLastError = "Google: " + e2.message;
          useGoogle = false;
          googleFailed();
        }
      }

      if(useGoogle){
        for(k = 0; k < batch.length; k++){
          if(out[k]) continue;
          try{
            await sleep(180);
            out[k] = await trGoogleOne(batch[k]);
          }catch(e3){
            trLastError = "Google: " + e3.message;
            googleFailed();
            break;   // 続けても同じ失敗になる
          }
        }
      }
    }

    // ここまでで埋まらなかったぶんは、別の翻訳先へ
    for(k = 0; k < batch.length; k++){
      if(out[k]) continue;
      try{
        await sleep(180);
        out[k] = await trMyMemoryOne(batch[k]);
      }catch(e4){
        trLastError = (trLastError ? trLastError + " / " : "") + "MyMemory: " + e4.message;
        break;
      }
    }
    return out;
  }

  // どの経路が通ってどれが弾かれているかを、端末自身に調べさせる
  async function trDiagnose(){
    var lines = [];
    async function probe(label, fn){
      var t0 = Date.now();
      try{
        var v = await fn();
        lines.push("○ " + label + " … " + (v ? String(v).slice(0, 18) : "(空の応答)") + "  " + (Date.now() - t0) + "ms");
      }catch(e){
        lines.push("× " + label + " … " + (e.message || "失敗"));
      }
    }
    var cooling = googleCooling();
    var googleOk = false;
    await probe("Google 1文", function(){
      return trGoogleOne(LG.probe[0]).then(function(v){ googleOk = !!v; return v; });
    });
    await probe("Google まとめ送り", function(){
      return trGoogleBatch(LG.probe).then(function(a){ return a.join(" / "); });
    });
    await probe("MyMemory 1文", function(){ return trMyMemoryOne(LG.probe[0]); });
    if(googleOk && cooling){
      googleRecovered();
      lines.push("（Google は回数制限で休ませていましたが、戻ったので使います）");
    } else if(cooling){
      var min = Math.max(1, Math.round((googleCoolUntil() - Date.now()) / 60000));
      lines.push("（Google は回数制限のため、あと約" + min + "分休ませています）");
    }
    return lines;
  }

  async function translateAll(list, onProgress){
    var cache = trLoad();
    var todo = [], idx = [];
    list.forEach(function(it, i){
      var key = String(it.en || "").trim();
      if(!key) return;
      if(Object.prototype.hasOwnProperty.call(cache, key) && typeof cache[key] === "string"){ it.ja = cache[key]; return; }
      todo.push(key); idx.push(i);
    });
    if(!todo.length) return { done:0, failed:0 };

    // URL が長くなりすぎないよう、文字数と件数で区切る
    var batches = [], cur = [], len = 0;
    todo.forEach(function(t){
      if(cur.length && (len + t.length > 1000 || cur.length >= 8)){ batches.push(cur); cur = []; len = 0; }
      cur.push(t); len += t.length + 1;
    });
    if(cur.length) batches.push(cur);

    var done = 0, failed = 0, at = 0;
    for(var b = 0; b < batches.length; b++){
      var batch = batches[b];
      if(b > 0) await sleep(250);
      var res = await trBatch(batch);
      for(var k = 0; k < batch.length; k++){
        var ja = res[k] || "";
        if(ja){
          cache[batch[k]] = ja;
          done++;
          if(list[idx[at + k]]) list[idx[at + k]].ja = ja;
        } else failed++;
      }
      at += batch.length;
      if(onProgress) onProgress((b + 1) / batches.length);
    }
    trSave();
    return { done:done, failed:failed };
  }

  /* ================= OCR ================= */
  var STAGE = {
    "loading tesseract core":"エンジンを読みこんでいます",
    "initializing tesseract":"エンジンを準備しています",
    "loading language traineddata":"辞書データを読みこんでいます",
    "initializing api":"準備しています",
    "recognizing text":"文字を読み取っています"
  };

  // 英語と日本語で別の認識器を使う。英語の精度を保ったまま日本語を足すため。
  function getWorker(lang){
    if(workerPromise[lang]) return workerPromise[lang];
    workerPromise[lang] = (async function(){
      if(typeof Tesseract === "undefined") throw new Error("no-tesseract");
      var w = await Tesseract.createWorker(lang, 1, {
        logger: function(m){
          var label = STAGE[m.status] || "処理中";
          var p = (typeof m.progress === "number") ? m.progress : 0;
          showStatus(label + "…", "はじめの1回だけ、少し時間がかかります。", { busy:true, progress:p });
        }
      });
      workers[lang] = w;
      return w;
    })();
    workerPromise[lang].catch(function(){ workerPromise[lang] = null; });
    return workerPromise[lang];
  }

  function extractLines(data){
    var out = [];
    if(!data) return out;
    (function walk(node){
      if(!node || typeof node !== "object") return;
      if(Array.isArray(node)){ node.forEach(walk); return; }
      if(Array.isArray(node.lines)){
        node.lines.forEach(function(l){
          if(l && typeof l.text === "string"){
            out.push({
              text: l.text,
              conf: (typeof l.confidence === "number") ? l.confidence : 100,
              bbox: l.bbox || null
            });
          }
        });
      }
      ["blocks","paragraphs","children"].forEach(function(k){
        if(Array.isArray(node[k])) node[k].forEach(walk);
      });
    })(data.blocks);
    if(!out.length && typeof data.text === "string"){
      data.text.split(/\r?\n/).forEach(function(t){ out.push({ text:t, conf:100, bbox:null }); });
    }
    return out;
  }

  function mergeBox(a, b){
    if(!a) return b;
    if(!b) return a;
    return { x0:Math.min(a.x0,b.x0), y0:Math.min(a.y0,b.y0), x1:Math.max(a.x1,b.x1), y1:Math.max(a.y1,b.y1) };
  }

  // 英語の認識結果 -> 読み上げる単位の配列（座標つき）
  function cleanUp(raw){
    var lines = [];
    raw.forEach(function(r){
      if(r.conf < 50) return;
      var t = tidy(r.text);
      if(!t) return;
      if(looksLikeJunk(t) || notTarget(t)) return;
      lines.push({ text:t, bbox:r.bbox });
    });

    // 折り返された文をつなぐ。
    // 文字の条件（複数語・終止符なし・次の行が小文字始まり）だけでは、終止符のない
    // 見出しの後に単語リストが続くと、全部を1行につないでしまう。折り返しは行が右端
    // 近くまで埋まったときにしか起きないので、その行が本文の幅の大半を占めることも条件にする。
    var left = Infinity, right = 0;
    lines.forEach(function(l){
      if(!l.bbox) return;
      if(l.bbox.x0 < left) left = l.bbox.x0;
      if(l.bbox.x1 > right) right = l.bbox.x1;
    });
    function fillsLine(l){
      if(!l.bbox || !(right > left)) return true;   // 座標が無いときは文字の条件だけで判断する
      return (l.bbox.x1 - left) >= (right - left) * 0.75;
    }

    var joined = [];
    for(var i = 0; i < lines.length; i++){
      var cur = lines[i].text, box = lines[i].bbox, last = lines[i];
      while(i + 1 < lines.length
            && /\s/.test(cur)
            && !/[.!?:;"']$/.test(cur)
            && RX.startsLower.test(lines[i+1].text)
            && fillsLine(last)){
        cur = cur + " " + lines[i+1].text;
        box = mergeBox(box, lines[i+1].bbox);
        last = lines[i+1];
        i++;
      }
      joined.push({ text:cur, bbox:box });
    }

    var out = [];
    joined.forEach(function(line){
      var parts = line.text.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || [line.text];
      parts.forEach(function(p){
        p = repairLine(p.trim());
        if(!p || looksLikeJunk(p) || notTarget(p)) return;
        if(out.length && out[out.length-1].en === p) return;
        out.push({ en:p, ja:"", kind: /\s/.test(p) ? "sentence" : "word", bbox: line.bbox });
      });
    });
    return out.slice(0, 120);
  }

  async function readPhoto(file){
    if(busy) return;
    busy = true;
    stopAll();
    try{
      showStatus("写真を準備しています…", "", { busy:true, progress:0 });
      var canvas = await prepare(file);

      var engWorker = await getWorker(LG.ocr);
      showStatus(T("{L}を読み取っています…"), "", { busy:true, progress:0 });
      var engRes = await engWorker.recognize(canvas, {}, { text:true, blocks:true });

      try{ await loadDict(); }catch(e){}
      var list = cleanUp(extractLines(engRes && engRes.data));

      if(!list.length){
        showStatus(T("{T}が見つかりませんでした"), "明るい場所で、プリントが画面いっぱいに写るように撮りなおしてください。", { error:true });
        return;
      }

      // 先に英文を出す。訳を待たずに読み上げを始められるようにするため。
      hideStatus();
      setSheet(list, "このプリント", true);
      if(prefs.translate){
        await fillTranslations(list, "日本語訳をつけています…");
      }
    }catch(err){
      var msg = (err && err.message) || "";
      if(msg === "no-tesseract"){
        showStatus("読み取りエンジンを読みこめませんでした", "通信できる状態で一度開くと、次からはオフラインでも使えます。", { error:true });
      } else {
        showStatus("読み取りに失敗しました", "もう一度撮りなおしてください。それでも直らないときは、ページを開き直してください。", { error:true });
      }
      if(window.console) console.error(err);
    }finally{
      busy = false;
    }
  }

  /* ================= manual input ================= */
  function parseManual(text){
    var out = [];
    text.split(/\r?\n/).forEach(function(line){
      line = line.trim();
      if(!line) return;
      var parts = line.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || [line];
      parts.forEach(function(p){
        p = p.trim();
        if(p) out.push({ en:p, ja:"", kind: /\s/.test(p) ? "sentence" : "word" });
      });
    });
    return out.slice(0, 120);
  }

  /* ================= wiring ================= */
  loadPrefs();
  $("rate").value = String(prefs.rate);
  $("rateVal").textContent = Number(prefs.rate).toFixed(2);
  $("repeat").value = String(prefs.repeat);
  $("mode").value = prefs.mode;
  $("practice").value = prefs.practice;
  $("order").value = prefs.order;
  $("translate").checked = !!prefs.translate;

  $("rate").addEventListener("input", function(){
    prefs.rate = parseFloat(this.value);
    $("rateVal").textContent = prefs.rate.toFixed(2);
    savePrefs();
  });
  $("repeat").addEventListener("change", function(){
    prefs.repeat = parseInt(this.value, 10) || 1; savePrefs();
  });
  $("mode").addEventListener("change", function(){
    prefs.mode = this.value; savePrefs();
    if(playing){ stopSpeaking(); step(); }
  });
  $("practice").addEventListener("change", function(){
    prefs.practice = this.value; savePrefs();
    if(playing){ stopSpeaking(); step(); }
  });
  $("order").addEventListener("change", function(){ prefs.order = this.value; savePrefs(); });
  $("translate").addEventListener("change", function(){ prefs.translate = this.checked; savePrefs(); });
  $("voice").addEventListener("change", function(){
    enVoice = enVoices[parseInt(this.value, 10)] || null;
    prefs.voice = enVoice ? enVoice.name : ""; savePrefs();
  });
  $("jaVoice").addEventListener("change", function(){
    jaVoice = jaVoices[parseInt(this.value, 10)] || null;
    prefs.jaVoice = jaVoice ? jaVoice.name : ""; savePrefs();
  });
  $("btnFix").addEventListener("click", function(){ setFixMode(!fixMode); });
  $("playAll").addEventListener("click", function(){
    if(playing){ stopAll(); return; }
    playFrom(0, false);
  });

  function handleFile(file){
    if(!file) return;
    if(objUrl){ URL.revokeObjectURL(objUrl); objUrl = null; }
    objUrl = URL.createObjectURL(file);
    var t = $("thumb"); t.src = objUrl; t.hidden = false;
    readPhoto(file);
  }
  $("btnCamera").addEventListener("click", function(){ $("fileCamera").click(); });
  $("btnLibrary").addEventListener("click", function(){ $("fileLibrary").click(); });
  $("fileCamera").addEventListener("change", function(){ handleFile(this.files && this.files[0]); this.value = ""; });
  $("fileLibrary").addEventListener("change", function(){ handleFile(this.files && this.files[0]); this.value = ""; });

  $("btnManual").addEventListener("click", function(){
    $("manual").hidden = false;
    $("btnManual").hidden = true;
    try{ $("manualText").focus({ preventScroll:true }); }catch(e){}
  });
  $("btnManualGo").addEventListener("click", async function(){
    var list = parseManual($("manualText").value || "");
    if(!list.length){ showStatus(T("{T}が入力されていません"), "1行に1文ずつ入れてください。", { error:true }); return; }
    hideStatus();
    setSheet(list, T("入力した{T}"), true);
    if(prefs.translate){
      await fillTranslations(list, "日本語訳をつけています…");
    }
  });

  function togglePanel(id, btnId){
    var open = $(id).hidden;
    $(id).hidden = !open;
    $(btnId).setAttribute("aria-pressed", open ? "true" : "false");
    return open;
  }
  $("btnHistory").addEventListener("click", function(){
    if(togglePanel("history","btnHistory")) renderHistory();
  });
  $("btnSettings").addEventListener("click", function(){ togglePanel("settings","btnSettings"); });
  $("btnDiag").addEventListener("click", async function(){
    var out = $("diagOut");
    this.disabled = true;
    out.hidden = false;
    out.textContent = "調べています…";
    try{
      out.textContent = (await trDiagnose()).join("\n");
    }catch(e){
      out.textContent = "調べられませんでした: " + ((e && e.message) || "");
    }
    this.disabled = false;
  });
  $("btnClearHist").addEventListener("click", function(){
    try{ localStorage.removeItem(K("history")); }catch(e){}
    renderHistory();
  });

  if(synth){
    pickVoices();
    try{ synth.addEventListener("voiceschanged", pickVoices); }catch(e){ synth.onvoiceschanged = pickVoices; }
    setTimeout(pickVoices, 600);
    setTimeout(pickVoices, 2000);
  } else {
    showStatus("この端末では読み上げができません", "Safari か Chrome で開いてみてください。", { error:true });
  }

  window.addEventListener("pagehide", function(){
    stopSpeaking();
    Object.keys(workers).forEach(function(k){
      try{ workers[k] && workers[k].terminate && workers[k].terminate(); }catch(e){}
    });
  });
  document.addEventListener("visibilitychange", function(){ if(document.hidden) stopAll(); });

  items = SAMPLE.slice();
  render();
  renderHistory();
  loadDict().then(function(d){ if(d) render(); }, function(){});

  if("serviceWorker" in navigator){
    window.addEventListener("load", function(){
      navigator.serviceWorker.register(BASE + "sw.js").catch(function(){});
    });
  }

  // ローカル検証用の入口（通常の利用では使いません）
  window.__ondoku = {
    readPhoto: readPhoto, cleanUp: cleanUp, buildSequence: buildSequence,
    extractLines: extractLines, translateAll: translateAll, trBatch: trBatch,
    trDiagnose: trDiagnose, trGoogleOne: trGoogleOne, trMyMemoryOne: trMyMemoryOne,
    setFixMode: setFixMode, getHistory: getHistory,
    loadDict: loadDict, dictSize: function(){ return DICT ? DICT.size : null; },
    getItems: function(){ return items; },
    setItems: function(l){ setSheet(l, "テスト", false); },
    getPrefs: function(){ return prefs; }
  };
})();
