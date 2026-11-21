/* NID RUN CLUB × 2027 RUN FOR FUTURE 第五屆順發x港都公益路跑 團報頁
 * 所有可調整的內容都在 config.js，這個檔案只放畫面與報名邏輯。 */
(function () {
  'use strict';

  var C = window.RACE_CONFIG;
  var OTHER = '__other__';
  var RECEIVE_LAST5 = String(C.bank.account).replace(/\D/g, '').slice(-5);
  /* --c = 填色（色帶、圓點），--ct = 白底上的文字色 */
  var DIST_VAR = { '21K': '--c:var(--k21);--ct:var(--k21-t)', '10K': '--c:var(--k10);--ct:var(--k10-t)', '5K': '--c:var(--k5);--ct:var(--k5-t)' };
  var DIST_MOD = { '21K': '21', '10K': '10', '5K': '5' };
  var DIST_FACTS = {
    '21K': '06:15 起跑・限時 <b>3 小時 30 分</b><br>比賽當天須滿 <b>16 歲</b><br>晶片計時・分 5 個年齡組',
    '10K': '06:25 起跑・限時 <b>2 小時 30 分</b><br>不限年齡<br>晶片計時・分男女組',
    '5K': '06:42 起跑<br>5 公里組限時 <b>1 小時 30 分</b>・晶片計時<br>健走組・兒童組限時 3 小時 30 分・不計時'
  };
  var DIST_PICK = {
    '21K': '06:15 起跑・限時 3 小時 30 分・須滿 16 歲',
    '10K': '06:25 起跑・限時 2 小時 30 分',
    '5K': '06:42 起跑'
  };

  var catByKey = {};
  C.categories.forEach(function (c) { catByKey[c.key] = c; });

  var state = {
    agreedAt: null,
    formOpenedAt: 0,
    submitting: false,
    tried: false,
    touched: {},
    lastOpener: null
  };

  /* ---------- helpers */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function money(n) { return 'NT$' + Number(n || 0).toLocaleString('en-US'); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function todayISO() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function radioVal(name) { var el = $('input[name="' + name + '"]:checked'); return el ? el.value : ''; }
  function val(id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }

  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('is-on'); }, 2600);
  }

  /* ---------- config text */
  function applyConfigText() {
    var map = {
      shipStudent: money(C.shipping.student),
      shipChild: money(shipFor('child')),
      shipGuest: money(C.shipping.guest),
      chip: money(C.chipDeposit),
      chipShort: '晶片押金 ' + C.chipDeposit,
      shipShort: '運費 ' + C.shipping.student + ' / ' + C.shipping.guest,
      insPrice: C.insurance ? money(C.insurance.price) : '',
      contact: C.contact
    };
    $$('[data-cfg]').forEach(function (el) {
      var k = el.getAttribute('data-cfg');
      if (map[k] != null) el.textContent = map[k];
    });
    if (!(C.chipDeposit > 0)) $$('[data-needs-chip]').forEach(function (el) { el.hidden = true; });
    var bank = {
      bankCode: C.bank.bankCode, bankName: C.bank.bankName, branch: C.bank.branch,
      account: C.bank.account, name: C.bank.name
    };
    $$('[data-bank]').forEach(function (el) {
      var k = el.getAttribute('data-bank');
      if (bank[k] != null) el.textContent = bank[k];
    });
    $$('.js-official').forEach(function (a) { a.href = C.officialUrl; });

  }

  /* ---------- 團報時間：開放前鎖住按鈕，截止時間一到自動關閉 */
  var OPEN_AT = C.openAt ? new Date(C.openAt) : null;
  var CLOSE_AT = C.deadline ? new Date(C.deadline) : null;
  var TEST_MODE = /(^|[#&])test(&|$)/.test(location.hash);
  // 在已經打開的頁面網址後面加 #test，瀏覽器不會重新載入；這裡自動重新整理，讓測試模式馬上生效
  window.addEventListener('hashchange', function () {
    if (!TEST_MODE && /(^|[#&])test(&|$)/.test(location.hash)) location.reload();
  });
  var WEEK = ['日', '一', '二', '三', '四', '五', '六'];
  var GATE_DEFAULT = null;
  var currentPhase = null;

  /* 一律用台灣時間顯示，不受手機時區影響 */
  function twParts(d) {
    var t = new Date(d.getTime() + 8 * 3600 * 1000);
    return { m: pad(t.getUTCMonth() + 1), d: pad(t.getUTCDate()), w: WEEK[t.getUTCDay()], hh: pad(t.getUTCHours()), mi: pad(t.getUTCMinutes()) };
  }
  function fmtTW(d) { var p = twParts(d); return p.m + '/' + p.d + '（' + p.w + '）' + p.hh + ':' + p.mi; }
  function fmtShort(d) { var p = twParts(d); return p.m + '/' + p.d; }
  function isBeforeOpen() { return !!OPEN_AT && Date.now() < OPEN_AT.getTime(); }

  function phaseNow() {
    if (CLOSE_AT && Date.now() > CLOSE_AT.getTime()) return 'closed';
    if (isBeforeOpen() && !TEST_MODE) return 'before';
    return 'open';
  }

  function renderPeriod() {
    var ph = phaseNow(), st = $('#phaseText');
    $('#periodText').textContent = OPEN_AT && CLOSE_AT ? fmtTW(OPEN_AT) + ' – ' + fmtTW(CLOSE_AT)
      : CLOSE_AT ? '即日起 – ' + fmtTW(CLOSE_AT) : '待公告';
    st.setAttribute('data-phase', ph);
    // 時間倒數交給下面的 countdown；狀態只寫一句
    if (ph === 'before') st.textContent = '即將開放';
    else if (ph === 'closed') st.textContent = '已截止';
    else st.textContent = isBeforeOpen() ? '測試模式' : '報名中';
    renderCountdown();
    $('#testBar').hidden = !(TEST_MODE && isBeforeOpen());
    if (ph !== currentPhase) { currentPhase = ph; applyPhase(ph); }
  }

  /* 首頁倒數：開放前倒數開放、報名中倒數截止（每秒更新） */
  function renderCountdown() {
    var box = $('#countdown');
    if (!box) return;
    var ph = phaseNow(), target = 0, label = '';
    if (ph === 'before' && OPEN_AT) { target = OPEN_AT.getTime(); label = '距離開放'; }
    else if (ph === 'open' && CLOSE_AT) { target = CLOSE_AT.getTime(); label = '距離截止'; }
    if (!target) { box.hidden = true; return; }
    var sec = Math.max(0, Math.floor((target - Date.now()) / 1000));
    $('#cdLabel').textContent = label;
    $('#cdD').textContent = Math.floor(sec / 86400);
    $('#cdH').textContent = pad(Math.floor((sec % 86400) / 3600));
    $('#cdM').textContent = pad(Math.floor((sec % 3600) / 60));
    $('#cdS').textContent = pad(sec % 60);
    box.hidden = false;
    if (sec === 0 && ph !== currentPhaseAt0) { currentPhaseAt0 = ph; setTimeout(renderPeriod, 1200); }
  }
  var currentPhaseAt0 = null;

  function applyPhase(ph) {
    if (!GATE_DEFAULT) GATE_DEFAULT = { t: $('#gateTitle').textContent, p: $('#gateText').textContent };
    $$('.js-open-terms').forEach(function (b) {
      if (!b.hasAttribute('data-label')) b.setAttribute('data-label', b.innerHTML);
      var small = b.classList.contains('btn--sm');
      b.disabled = ph !== 'open';
      if (ph === 'before') b.textContent = fmtShort(OPEN_AT) + (small ? ' 開放' : ' 00:00 開放報名');
      else if (ph === 'closed') b.textContent = small ? '已截止' : '團報已截止';
      else b.innerHTML = b.getAttribute('data-label');
    });
    if (ph === 'before') {
      $('#gateTitle').textContent = '團報 ' + fmtShort(OPEN_AT) + ' 開放';
      $('#gateText').textContent = '團報時間 ' + fmtTW(OPEN_AT) + ' 到 ' + fmtTW(CLOSE_AT) + '。開放後就能閱讀參賽聲明、填寫報名表，先看看組別、路線和紀念品吧。';
    } else if (ph === 'closed') {
      $('#gateTitle').textContent = '團報已截止';
      $('#gateText').textContent = '本次團報已在 ' + fmtTW(CLOSE_AT) + ' 截止收件，謝謝大家。如有問題請洽' + C.contact + '。';
      $$('.modal').forEach(function (m) { if (!m.hidden) closeModal(m); });
      if ($('#doneArea').hidden) {
        $('#formArea').hidden = true;
        $('#gate').hidden = false;
      }
      setTotalBar(false);
    } else {
      $('#gateTitle').textContent = GATE_DEFAULT.t;
      $('#gateText').textContent = GATE_DEFAULT.p;
    }
  }

  /* ---------- categories, bibs, fee table */
  function groupByDist() {
    var order = ['21K', '10K', '5K'], groups = {};
    C.categories.forEach(function (c) { (groups[c.dist] = groups[c.dist] || []).push(c); });
    return order.filter(function (d) { return groups[d]; }).map(function (d) { return { dist: d, items: groups[d] }; });
  }

  function renderBibs() {
    var html = groupByDist().map(function (g) {
      var bibs = g.items.map(function (c) {
        var chips = ['<span class="chip">' + c.start + ' 起跑</span>', '<span class="chip">限時 ' + esc(c.limit) + '</span>'];
        chips.push('<span class="chip">' + (c.chip ? '晶片計時' : '不計時') + '</span>');
        if (ageRule(c)) chips.push('<span class="chip">' + esc(ageRule(c)) + '</span>');
        if (c.gift) chips.push('<span class="chip chip--hl">好禮二選一</span>');
        return '<article class="bib">' +
          '<div class="bib__band"><b>' + c.dist + '</b></div>' +
          '<h3 class="bib__name">' + esc(c.name) + '</h3>' +
          '<p class="bib__price"><small>NT$</small>' + c.price.toLocaleString('en-US') + '</p>' +
          '<div class="bib__chips">' + chips.join('') + '</div>' +
          '</article>';
      }).join('');
      return '<div class="dist dist--' + DIST_MOD[g.dist] + '">' +
        '<div class="dist__label"><span class="dist__km">' + g.dist + '</span><p class="dist__facts">' + DIST_FACTS[g.dist] + '</p></div>' +
        '<div class="bibs">' + bibs + '</div></div>';
    }).join('');
    $('#distGroups').innerHTML = html;
  }

  function renderFeeTable() {
    var showChip = C.chipDeposit > 0;
    var head = '<tr><th scope="col">組別</th><th scope="col" class="col-detail">報名費</th>' + (showChip ? '<th scope="col" class="col-detail">晶片押金</th>' : '') +
      '<th scope="col">當期學員／小孩應匯</th><th scope="col">非當期學員應匯</th></tr>';
    $('#feeTable thead').innerHTML = head;
    $('#feeTable tbody').innerHTML = C.categories.map(function (c) {
      var chip = c.chip ? C.chipDeposit : 0;
      var base = c.price + chip;
      return '<tr><td><span class="dot" style="' + DIST_VAR[c.dist] + '"></span><span class="fee-cat"><b>' + c.dist + '</b> ' + esc(c.name) + '</span></td>' +
        '<td class="col-detail">' + money(c.price) + '</td>' +
        (showChip ? '<td class="col-detail">' + (chip ? money(chip) : '—') + '</td>' : '') +
        '<td class="total st">' + money(base + C.shipping.student) + '</td>' +
        '<td class="total">' + money(base + C.shipping.guest) + '</td></tr>';
    }).join('');
  }

  /* ---------- form options */
  function fillSelect(sel, placeholder, opts) {
    sel.innerHTML = '<option value="">' + esc(placeholder) + '</option>' + opts;
  }
  function optionList(arr) { return arr.map(function (v) { return '<option value="' + esc(v) + '">' + esc(v) + '</option>'; }).join(''); }
  function sizeList() {
    return C.sizes.map(function (v) {
      return '<option value="' + esc(v) + '">' + esc(/^\d+$/.test(v) ? v + ' 號（兒童款）' : v) + '</option>';
    }).join('');
  }
  /* 組別的年齡資格（比賽當天） */
  function ageRule(c) {
    if (c.minAge) return '比賽當天須滿 ' + c.minAge + ' 歲';
    if (c.maxAge != null) return '比賽當天未滿 ' + (c.maxAge + 1) + ' 歲';
    return '';
  }
  function classOptions() {
    return C.classes.map(function (g) {
      return '<optgroup label="' + esc(g.group) + '">' + optionList(g.items) + '</optgroup>';
    }).join('') + '<option value="' + OTHER + '">其他（自行填寫）</option>';
  }

  function renderFormOptions() {
    fillSelect($('#f-class'), '選擇你的班級', classOptions());
    fillSelect($('#f-ref-class'), '選擇朋友的班級', classOptions());
    fillSelect($('#f-parent-class'), '選擇爸爸或媽媽的班級', classOptions());
    fillSelect($('#f-size'), '選擇尺寸', sizeList());

    var thisYear = new Date().getFullYear(), years = [];
    for (var y = thisYear; y >= 1930; y--) years.push('<option value="' + y + '">' + y + '</option>');
    fillSelect($('#f-birth-y'), '年', years.join(''));
    var months = [];
    for (var m = 1; m <= 12; m++) months.push('<option value="' + m + '">' + m + ' 月</option>');
    fillSelect($('#f-birth-m'), '月', months.join(''));
    renderDays();
    $('#f-paydate').max = todayISO();

    $('#catPick').innerHTML = groupByDist().map(function (g) {
      return '<div class="cat-pick__dist" style="' + DIST_VAR[g.dist] + '">' +
        '<p class="cat-pick__title"><b>' + g.dist + '</b>' + DIST_PICK[g.dist] + '</p>' +
        '<div class="cat-pick__grid">' + g.items.map(function (c) {
          var sub = [];
          sub.push(c.chip ? '另加晶片押金 ' + C.chipDeposit : '無晶片・不計時');
          sub.push('限時 ' + c.limit);
          return '<label class="choice cat-opt"><input type="radio" name="category" id="f-cat-' + c.key + '" value="' + c.key + '">' +
            '<span class="choice__body"><span class="nm"><b>' + esc(c.name) + '</b><small>' + esc(sub.join('・')) + '</small>' +
            (c.gift ? '<small class="cat-note">好禮二選一</small>' : '') +
            (ageRule(c) ? '<small class="cat-lock">' + esc(ageRule(c)) + '</small>' : '') + '</span>' +
            '<span class="pr">' + money(c.price) + '</span></span></label>';
        }).join('') + '</div></div>';
    }).join('');

    $('#giftPick').innerHTML = (C.gifts || []).map(function (g, i) {
      return '<label class="choice gift-opt"><input type="radio" name="gift" id="f-gift-' + i + '" value="' + esc(g.value) + '">' +
        '<span class="choice__body"><b>' + esc(g.name) + '</b><small>' + esc(g.note) + '</small></span></label>';
    }).join('');

    renderInsurance();
  }

  function renderDays() {
    var y = parseInt(val('f-birth-y'), 10), m = parseInt(val('f-birth-m'), 10);
    var max = (y && m) ? new Date(y, m, 0).getDate() : 31;
    var sel = $('#f-birth-d'), cur = parseInt(sel.value, 10);
    var days = [];
    for (var d = 1; d <= max; d++) days.push('<option value="' + d + '">' + d + ' 日</option>');
    fillSelect(sel, '日', days.join(''));
    if (cur && cur <= max) sel.value = String(cur);
  }

  /* ---------- 加購：一日旅平險（比賽當天 15–85 歲才能買） */
  function insuranceOn() { return !!(C.insurance && C.insurance.enabled); }
  function renderInsurance() {
    var step = $('#step-4');
    if (!insuranceOn()) { step.hidden = true; return; }
    var a = C.insurance;
    $('#insBox').innerHTML =
      '<label class="check check--card" for="f-ins"><input type="checkbox" id="f-ins" name="insurance">' +
      '<span><b>加購' + esc(a.name) + '　' + money(a.price) + '</b>' +
      '<small>' + esc(a.note) + '。限比賽當天 ' + a.minAge + '–' + a.maxAge + ' 歲。</small>' +
      '<small class="ins-off" id="insOff" hidden></small></span></label>';
  }
  function insuranceEligible() {
    var b = birthParts();
    if (!b || !insuranceOn()) return true;
    var age = ageOnRaceDay(b);
    return age >= C.insurance.minAge && age <= C.insurance.maxAge;
  }

  /* ---------- conditional fields */
  function fieldValue(name) {
    var r = $('input[name="' + name + '"]:checked');
    if (r) return r.value;
    var el = document.querySelector('[name="' + name + '"]');
    return el && el.type !== 'radio' ? el.value : '';
  }

  function birthParts() {
    var y = parseInt(val('f-birth-y'), 10), m = parseInt(val('f-birth-m'), 10), d = parseInt(val('f-birth-d'), 10);
    return (y && m && d) ? { y: y, m: m, d: d } : null;
  }
  function ageOnRaceDay(b) {
    var r = C.raceDate.split('-').map(Number);
    var age = r[0] - b.y;
    if (r[1] < b.m || (r[1] === b.m && r[2] < b.d)) age--;
    return age;
  }
  function isMinor() { var b = birthParts(); return !!b && ageOnRaceDay(b) < 18; }

  function updateConditionals() {
    $$('[data-when]').forEach(function (el) {
      var p = el.getAttribute('data-when').split('=');
      el.hidden = fieldValue(p[0]) !== p[1];
    });
    $('#f-class-other').hidden = val('f-class') !== OTHER;
    $('#f-ref-class-other').hidden = val('f-ref-class') !== OTHER;
    $('#f-parent-class-other').hidden = val('f-parent-class') !== OTHER;
    $('#ecHelp').textContent = isMinor() ? '比賽當天未滿 18 歲，請填家長或監護人。' : '比賽當天找得到的家人或朋友，不能填自己。';

    // 組別年齡資格（比賽當天）：生日填好後，不符合的組別鎖起來
    var b = birthParts();
    var age = b ? ageOnRaceDay(b) : null;
    C.categories.forEach(function (c) {
      var el = document.getElementById('f-cat-' + c.key);
      if (!el) return;
      el.disabled = age != null && !ageOk(c, age);
      el.closest('.choice').classList.toggle('is-locked', el.disabled);
    });
    $('#kidNotice').hidden = !(age != null && age <= 12);

    var cat = catByKey[radioVal('category')];
    $('#giftField').hidden = !(cat && cat.gift);

    if (insuranceOn()) {
      var ok = insuranceEligible(), box = $('#f-ins');
      box.disabled = !ok;
      if (!ok) box.checked = false;
      $('#insOff').hidden = ok;
      $('#insOff').textContent = ok ? '' : '依你的生日，比賽當天是 ' + age + ' 歲，不能加購（限 ' + C.insurance.minAge + '–' + C.insurance.maxAge + ' 歲）。';
      box.closest('.check').classList.toggle('is-locked', !ok);
    }
  }
  function ageOk(c, age) {
    if (c.minAge && age < c.minAge) return false;
    if (c.maxAge != null && age > c.maxAge) return false;
    return true;
  }

  /* ---------- 報名身分：當期學員／當期學員的小孩／非當期學員 */
  var MEMBER_LABEL = { student: '當期學員', child: '當期學員的小孩', guest: '非當期學員' };
  function shipFor(m) {
    if (m === 'student') return C.shipping.student;
    if (m === 'child') return C.shipping.child != null ? C.shipping.child : C.shipping.student;
    if (m === 'guest') return C.shipping.guest;
    return 0;
  }
  function whoText(v, short) {
    if (v.member === 'student') return '當期學員・' + v.className;
    if (v.member === 'child') return '當期學員的小孩・家長 ' + v.refName + '（' + v.refClass + '）';
    return '非當期學員・' + (short ? '朋友 ' : '當期學員朋友 ') + v.refName + '（' + v.refClass + '）';
  }

  /* ---------- fee */
  function calcFee() {
    var cat = catByKey[radioVal('category')];
    var member = radioVal('member');
    var lines = [];
    var entry = cat ? cat.price : 0;
    var chip = cat && cat.chip ? C.chipDeposit : 0;
    var ship = shipFor(member);
    lines.push(cat ? { k: '報名費・' + cat.label, v: entry } : { k: '報名費（請選組別）', v: null });
    if (cat && C.chipDeposit > 0) lines.push(cat.chip ? { k: '晶片押金（可退）', v: chip } : { k: '晶片押金（' + cat.label + '免收）', v: 0, muted: true });
    lines.push(member ? { k: '運費・' + MEMBER_LABEL[member], v: ship } : { k: '運費（請選身分）', v: null });
    var addons = 0;
    var ins = $('#f-ins');
    if (insuranceOn() && ins && ins.checked && !ins.disabled) {
      addons += C.insurance.price;
      lines.push({ k: '加購・' + C.insurance.name, v: C.insurance.price });
    }
    var ready = !!cat && !!member;
    return { lines: lines, entry: entry, chip: chip, ship: ship, addons: addons, total: entry + chip + ship + addons, ready: ready };
  }

  function renderFee() {
    var f = calcFee();
    var linesHTML = f.lines.map(function (l) {
      return '<li' + (l.muted || l.v === null ? ' class="muted"' : '') + '><span>' + esc(l.k) + '</span><span>' + (l.v === null ? '—' : money(l.v)) + '</span></li>';
    }).join('');
    $('#sumLines').innerHTML = linesHTML;
    $('#sumLinesInline').innerHTML = linesHTML;
    var t = f.ready ? money(f.total) : '—';
    $('#sumTotal').textContent = t;
    $('#payAmount').textContent = t;
    $('#tbTotal').textContent = t;
    return f;
  }

  /* ---------- validation */
  var LETTER = { A: 10, B: 11, C: 12, D: 13, E: 14, F: 15, G: 16, H: 17, I: 34, J: 18, K: 19, L: 20, M: 21, N: 22, O: 35, P: 23, Q: 24, R: 25, S: 26, T: 27, U: 28, V: 29, W: 32, X: 30, Y: 31, Z: 33 };
  function twIdValid(id) {
    var m = /^([A-Z])([A-D1289])(\d{8})$/.exec(id);
    if (!m) return false;
    var n = LETTER[m[1]];
    var second = /\d/.test(m[2]) ? parseInt(m[2], 10) : LETTER[m[2]] % 10;
    var digits = [second].concat(m[3].split('').map(Number));
    var w = [8, 7, 6, 5, 4, 3, 2, 1];
    var sum = Math.floor(n / 10) + (n % 10) * 9;
    for (var i = 0; i < 8; i++) sum += digits[i] * w[i];
    sum += digits[8];
    return sum % 10 === 0;
  }
  function idGender(id) {
    var c = id.charAt(1);
    if (c === '1' || c === '8') return '男';
    if (c === '2' || c === '9') return '女';
    return '';
  }
  function cleanPhone(s) { return String(s || '').replace(/[\s\-()]/g, ''); }
  function digitsOnly(s) { return String(s || '').replace(/\D/g, ''); }

  function collect() {
    var b = birthParts();
    var cls = val('f-class') === OTHER ? val('f-class-other') : val('f-class');
    var ref = val('f-ref-class') === OTHER ? val('f-ref-class-other') : val('f-ref-class');
    var par = val('f-parent-class') === OTHER ? val('f-parent-class-other') : val('f-parent-class');
    var cat = catByKey[radioVal('category')];
    var mem = radioVal('member');
    return {
      member: mem,
      className: mem === 'student' ? cls : '',
      refName: mem === 'guest' ? val('f-ref-name') : mem === 'child' ? val('f-parent-name') : '',
      refClass: mem === 'guest' ? ref : mem === 'child' ? par : '',
      categoryKey: cat ? cat.key : '',
      category: cat ? cat.label : '',
      gift: cat && cat.gift ? radioVal('gift') : '',
      size: val('f-size'),
      name: val('f-name'),
      gender: radioVal('gender'),
      birth: b ? (b.y + '-' + pad(b.m) + '-' + pad(b.d)) : '',
      idno: val('f-id').toUpperCase().replace(/\s/g, ''),
      phone: cleanPhone(val('f-phone')),
      tel: cleanPhone(val('f-tel')),
      email: val('f-email'),
      minor: isMinor(),
      ecName: val('f-ec-name'),
      ecPhone: cleanPhone(val('f-ec-phone')),
      insurance: insuranceOn() && !!$('#f-ins') && $('#f-ins').checked && insuranceEligible(),
      last5: val('f-last5'),
      payDate: val('f-paydate'),
      note: val('f-note'),
      paid: $('#f-paid').checked
    };
  }

  function validate(v) {
    var e = {}, w = {};
    if (!v.member) e.member = '請選擇報名身分';
    if (v.member === 'student' && !v.className) e.className = val('f-class') === OTHER ? '請填寫你的班級名稱' : '請選擇你的班級';
    if (v.member === 'guest') {
      if (!v.refName) e.refName = '請填寫你的當期學員朋友姓名';
      else if (v.refName === v.name) e.refName = '請填另一位當期學員朋友，不能填自己';
      if (!v.refClass) e.refClass = val('f-ref-class') === OTHER ? '請填寫朋友的班級名稱' : '請選擇朋友的班級';
    }
    if (v.member === 'child') {
      if (!v.refName) e.parentName = '請填寫爸爸或媽媽的姓名';
      else if (v.refName === v.name) e.parentName = '請填爸爸或媽媽的姓名，不是小朋友自己的';
      if (!v.refClass) e.parentClass = val('f-parent-class') === OTHER ? '請填寫爸爸或媽媽的班級名稱' : '請選擇爸爸或媽媽的班級';
      var cb = birthParts();
      if (cb && ageOnRaceDay(cb) >= 18) e.member = '「當期學員的小孩」限比賽當天未滿 18 歲；已成年請改選「非當期學員」';
    }
    var cat = catByKey[v.categoryKey];
    if (!cat) e.category = '請選擇報名組別';
    if (cat && cat.gift && !v.gift) e.gift = '請選擇好禮（藍牙耳機或藍牙喇叭）';
    if (!v.size) e.size = '請選擇紀念T恤尺寸';
    if (!v.name) e.name = '請填寫姓名';
    else if (v.name.length < 2) e.name = '姓名至少 2 個字';
    if (!v.gender) e.gender = '請選擇性別';
    var b = birthParts();
    if (!b) e.birth = '請選完整的出生年月日';
    else {
      var bd = new Date(b.y, b.m - 1, b.d);
      if (bd > new Date()) e.birth = '出生日期不能在未來';
      else if (cat && !ageOk(cat, ageOnRaceDay(b))) {
        var age = ageOnRaceDay(b);
        var other = cat.maxAge != null ? '5 公里健走組或其他組別' : cat.minAge >= 16 ? '10K 或 5K' : '5 公里健走兒童組';
        e.category = cat.label + ageRule(cat) + '；依生日比賽當天是 ' + age + ' 歲，請改選 ' + other;
        e.birth = '這個生日不能報' + cat.label + '，請到上面「報名組別」改選 ' + other;
      }
    }
    if (!v.idno) e.idno = '請填寫身分證字號';
    else if (!twIdValid(v.idno)) e.idno = '身分證字號（或居留證號碼）格式或檢查碼不正確，請再核對一次';
    else if (v.gender && idGender(v.idno) && idGender(v.idno) !== v.gender) w.idno = '提醒：身分證第 2 碼和你選的性別不一致，請確認。';
    if (!v.phone) e.phone = '請填寫行動電話';
    else if (!/^09\d{8}$/.test(v.phone)) e.phone = '請填 09 開頭的 10 碼手機號碼';
    if (v.tel && !/^0\d{6,10}(#\d{1,6})?$/.test(v.tel)) e.tel = '市話請填區碼＋號碼，例如 0212345678（沒有可以空白）';
    if (!v.email) e.email = '請填寫 Email';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email)) e.email = 'Email 格式不正確';
    if (!v.ecName) e.ecName = v.minor ? '請填寫緊急聯絡人（家長或監護人）' : '請填寫緊急聯絡人';
    else if (v.ecName === v.name) e.ecName = '緊急聯絡人不能填自己';
    if (!v.ecPhone) e.ecPhone = '請填寫緊急聯絡人電話';
    else if (!/^0\d{7,9}(#\d{1,6})?$/.test(v.ecPhone)) e.ecPhone = '請填手機 09 開頭 10 碼，或市話區碼＋號碼';
    else if (v.phone && v.ecPhone === v.phone) e.ecPhone = '不能和你自己的手機相同';
    if (!v.last5) e.last5 = '請填寫匯款帳號後五碼';
    else if (!/^\d{5}$/.test(v.last5)) e.last5 = '後五碼是 5 個數字';
    else if (v.last5 === RECEIVE_LAST5) e.last5 = RECEIVE_LAST5 + ' 是 NID 收款帳號的後五碼，請填「你自己匯出帳號」的後五碼';
    if (!v.payDate) e.payDate = '請選擇匯款日期';
    else if (v.payDate > todayISO()) e.payDate = '匯款日期不能在未來';
    if (!v.paid) e.paid = '請確認已完成匯款並勾選';
    return { errors: e, warnings: w };
  }

  function showErrors(result, all) {
    $$('[data-field]').forEach(function (f) {
      var k = f.getAttribute('data-field');
      var old = f.querySelectorAll('.err, .warn');
      for (var i = 0; i < old.length; i++) old[i].remove();
      f.classList.remove('is-invalid');
      var show = all || state.touched[k];
      if (show && result.errors[k] && !f.closest('[hidden]')) {
        f.classList.add('is-invalid');
        var p = document.createElement('p');
        p.className = 'err';
        p.textContent = result.errors[k];
        f.appendChild(p);
      } else if (show && result.warnings[k]) {
        var q = document.createElement('p');
        q.className = 'warn';
        q.textContent = result.warnings[k];
        f.appendChild(q);
      }
    });
  }

  /* ---------- refresh cycle */
  function refresh() {
    updateConditionals();
    renderFee();
    if (state.tried || Object.keys(state.touched).length) showErrors(validate(collect()), state.tried);
  }

  /* ---------- modals */
  function focusables(root) {
    return $$('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])', root)
      .filter(function (el) { return !el.closest('[hidden]'); });
  }
  function openModal(m, opener) {
    state.lastOpener = opener || document.activeElement;
    m.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    var f = focusables(m);
    setTimeout(function () {
      var t = m.querySelector('.modal__body[tabindex]') || f[0];
      if (t) t.focus({ preventScroll: true });
    }, 30);
  }
  function closeModal(m) {
    m.hidden = true;
    if (!$$('.modal').some(function (x) { return !x.hidden; })) document.documentElement.style.overflow = '';
    if (state.lastOpener && state.lastOpener.focus) state.lastOpener.focus({ preventScroll: true });
  }
  function wireModal(m, onDismiss) {
    m.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) { closeModal(m); if (onDismiss) onDismiss(); }
    });
    m.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeModal(m); if (onDismiss) onDismiss(); }
      if (e.key === 'Tab') {
        var f = focusables(m);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    });
  }

  /* ---------- terms (參賽聲明) */
  function checkTermsRead() {
    var body = $('#termsBody');
    if (body.scrollTop + body.clientHeight >= body.scrollHeight - 28) {
      $('#btnAgree').disabled = false;
      $('#agreeHint').textContent = '按「同意」表示你已閱讀並同意大會簡章第十八、二十條與 NID 團報資料說明。';
    }
  }
  function openTerms(opener) {
    if (phaseNow() !== 'open') { renderPeriod(); return; }
    if (!$('#doneArea').hidden) { resetForAnother(); return; }
    if (state.agreedAt) { revealForm(false); return; }
    var m = $('#termsModal');
    $('#termsBody').scrollTop = 0;
    $('#btnAgree').disabled = true;
    $('#agreeHint').textContent = '請先閱讀到最下方，「同意」按鈕就會亮起。';
    openModal(m, opener);
    setTimeout(checkTermsRead, 60);
  }
  function revealForm(first) {
    $('#gate').hidden = true;
    $('#formArea').hidden = false;
    if (first) state.formOpenedAt = Date.now();
    var target = $('#signup');
    setTimeout(function () {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (first) { var r = $('#f-member-student'); if (r) r.focus({ preventScroll: true }); }
    }, 60);
    observeTotalBar();
  }

  /* ---------- review + submit */
  function reviewHTML(v, f) {
    var cat = catByKey[v.categoryKey];
    var rows = [];
    rows.push(['身分', whoText(v)]);
    rows.push(['組別', v.category]);
    if (cat && cat.gift) rows.push(['好禮二選一', giftName(v.gift)]);
    rows.push(['紀念T恤', sizeText(v.size)]);
    rows.push(['姓名', v.name + '・' + v.gender]);
    rows.push(['出生年月日', v.birth]);
    rows.push(['身分證字號', v.idno]);
    rows.push(['行動電話', v.phone + (v.tel ? '・市話 ' + v.tel : '')]);
    rows.push(['Email', v.email]);
    rows.push(['緊急聯絡人', v.ecName + '・' + v.ecPhone]);
    if (insuranceOn()) rows.push(['加購', v.insurance ? C.insurance.name : '無']);
    rows.push(['匯款後五碼', v.last5 + '・' + v.payDate]);
    if (v.note) rows.push(['備註', v.note]);
    return '<dl>' + rows.map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('') + '</dl>' +
      '<div class="big"><span>應匯金額</span><b>' + money(f.total) + '</b></div>';
  }

  function giftName(value) {
    var g = (C.gifts || []).filter(function (x) { return x.value === value; })[0];
    return g ? g.name : value;
  }
  function sizeText(s) { return /^\d+$/.test(s) ? s + ' 號（兒童款）' : s; }

  function onSubmit(e) {
    e.preventDefault();
    state.tried = true;
    var v = collect();
    var result = validate(v);
    showErrors(result, true);
    var keys = Object.keys(result.errors);
    var box = $('#formError');
    if (keys.length) {
      box.textContent = '還有 ' + keys.length + ' 個地方需要修正，已用紅字標示。';
      box.hidden = false;
      var first = $('.field.is-invalid');
      if (first) {
        first.scrollIntoView({ behavior: 'smooth', block: 'center' });
        var inp = first.querySelector('input, select, textarea');
        if (inp) setTimeout(function () { inp.focus({ preventScroll: true }); }, 350);
      }
      return;
    }
    box.hidden = true;
    var f = calcFee();
    $('#reviewBody').innerHTML = reviewHTML(v, f);
    openModal($('#reviewModal'), $('#submitBtn'));
  }

  function payload(v, f) {
    var data = JSON.parse(JSON.stringify(v));
    data.memberLabel = MEMBER_LABEL[v.member] || '';
    data.fee = { entry: f.entry, chip: f.chip, shipping: f.ship, addons: f.addons, total: f.total };
    data.agreedAt = state.agreedAt;
    data.submittedAt = new Date().toISOString();
    data.elapsedMs = state.formOpenedAt ? Date.now() - state.formOpenedAt : 0;
    data.website = val('f-website');
    data.test = TEST_MODE && isBeforeOpen();
    data.ua = navigator.userAgent.slice(0, 180);
    return data;
  }

  function confirmSubmit() {
    if (state.submitting) return;
    var v = collect(), f = calcFee();
    if (Object.keys(validate(v).errors).length) { closeModal($('#reviewModal')); return; }
    if (phaseNow() !== 'open') { renderPeriod(); return; }
    var btn = $('#btnConfirm');
    state.submitting = true;
    btn.disabled = true;
    btn.textContent = '送出中…';
    var body = payload(v, f);

    var done = function (res) {
      state.submitting = false;
      btn.disabled = false;
      btn.textContent = '確認送出';
      if (res && res.ok) {
        closeModal($('#reviewModal'));
        showDone(v, f, res);
      } else {
        closeModal($('#reviewModal'));
        var box = $('#formError');
        box.textContent = (res && res.message) || '送出失敗，請稍後再試一次。';
        box.hidden = false;
        box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    };

    if (!C.endpoint) {
      setTimeout(function () { done({ ok: true, id: 'PREVIEW', preview: true }); }, 500);
      return;
    }
    /* 很多人同時送出時：收件程式一次寫一筆，排不到會回 BUSY；Google 同時執行太多會回錯誤頁（不是 JSON）。
       這兩種都是「還沒寫進去」，自動等 2–5 秒再送，最多再試 2 次。同一個證件號碼重送會被擋下，不會重複報名。 */
    var MAX_TRY = 3;
    var attempt = 0;
    var hint = setTimeout(function () { btn.textContent = '排隊送出中，請不要關閉頁面…'; }, 6000);
    var finish = function (res) { clearTimeout(hint); done(res); };
    var send = function () {
      attempt++;
      var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      var timedOut = false;
      var timer = setTimeout(function () { timedOut = true; if (ctrl) ctrl.abort(); }, 60000);
      var retry = function () {
        clearTimeout(timer);
        if (attempt >= MAX_TRY) return false;
        clearTimeout(hint);
        btn.textContent = '排隊中，自動重新送出（第 ' + (attempt + 1) + ' 次）…';
        setTimeout(send, 2000 + Math.random() * 3000);
        return true;
      };
      fetch(C.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
        signal: ctrl ? ctrl.signal : undefined
      }).then(function (r) {
        return r.text().then(function (t) {
          try { return JSON.parse(t); } catch (e) { return { ok: false, code: 'NOT_JSON' }; }
        });
      }).then(function (res) {
        clearTimeout(timer);
        if (!res.ok && (res.code === 'BUSY' || res.code === 'NOT_JSON') && retry()) return;
        if (!res.ok && res.code === 'NOT_JSON') res.message = '目前同時報名的人比較多，資料沒有送出。請等 10 秒再按一次「確認送出」。';
        if (!res.ok && res.code === 'DUPLICATE') {
          res.message = attempt > 1
            ? '這個證件號碼已經報名成功了（剛剛排隊時已經送進去），不用再報一次。確認信會寄到你填的 Email；沒收到請洽' + C.contact + '。'
            : '這個證件號碼已經報名過了，不用再報一次。如需修改資料，請洽' + C.contact + '。';
        }
        if (!res.ok && res.code === 'CLOSED') res.message = '團報已在 ' + (CLOSE_AT ? fmtTW(CLOSE_AT) : '截止時間') + ' 截止收件，這筆資料沒有送出。';
        if (!res.ok && res.code === 'NOT_OPEN') res.message = '團報還沒開放，' + (OPEN_AT ? fmtTW(OPEN_AT) : '開放時間') + ' 開始收件。';
        finish(res);
      }).catch(function () {
        clearTimeout(timer);
        if (timedOut) {
          finish({ ok: false, message: '等太久沒有回應，資料可能已經送到。請先看 Email 有沒有收到確認信；沒有的話再按一次「確認送出」（重複送出會被擋下，不會報名兩次）。' });
          return;
        }
        if (retry()) return;
        finish({ ok: false, message: '網路連線失敗，資料沒有送出。請確認網路後再按一次「檢查資料並送出」；若一直失敗，請截圖並聯繫' + C.contact + '。' });
      });
    };
    send();
  }

  /* ---------- 報名完成：頁面上的完成區＋跳出視窗（請學員截圖、傳給官方 LINE 小編） */
  function dayText(iso) {
    var p = String(iso || '').split('-');
    return p.length === 3 ? Number(p[1]) + '/' + Number(p[2]) : String(iso || '');
  }
  /* 「傳給官方 LINE 小編」按鈕：config.js 有設 line.url（官方帳號頁面）就直接開那一頁；
     沒設的話改用 LINE URL scheme 開聊天室並先打好訊息（line.me/R/oaMessage/{LINE ID}/?{訊息}） */
  function lineLink(text) {
    if (C.line && C.line.url) return C.line.url;
    var id = C.line && C.line.id;
    return id ? 'https://line.me/R/oaMessage/' + encodeURIComponent(id) + '/?' + encodeURIComponent(text) : '';
  }
  function lineMessage(v, f, res) {
    var test = res.preview || /^TEST-/.test(String(res.id || ''));
    return (test ? '【測試】' : '') + '【' + C.raceShort + ' 團報】報名完成\n' +
      '編號：' + (res.id || '—') + '\n' +
      '姓名：' + v.name + '\n' +
      '組別：' + v.category + '\n' +
      '應匯金額：' + money(f.total) + '\n' +
      '匯款後五碼：' + v.last5 + '（' + dayText(v.payDate) + ' 匯款）\n' +
      '截圖附上，麻煩小編確認，謝謝！';
  }

  function showDone(v, f, res) {
    var area = $('#doneArea');
    var cat = catByKey[v.categoryKey];
    var link = lineLink(lineMessage(v, f, res));
    var lineName = (C.line && C.line.name) || 'NID 官方 LINE';
    var who = whoText(v, true);
    var rows =
      '<dt>組別</dt><dd>' + esc(v.category) + '</dd>' +
      (cat && cat.gift ? '<dt>好禮</dt><dd>' + esc(giftName(v.gift)) + '</dd>' : '') +
      '<dt>紀念T恤</dt><dd>' + esc(sizeText(v.size)) + '</dd>' +
      '<dt>應匯金額</dt><dd>' + money(f.total) + '</dd>' +
      '<dt>匯款後五碼</dt><dd>' + esc(v.last5) + '（' + esc(dayText(v.payDate)) + ' 匯款）</dd>';
    var preview = res.preview ? '<p class="preview-flag">預覽模式：尚未設定收件網址，這筆資料沒有送出。</p>' : '';
    var lineBtn = link ? '<a class="btn btn--lineapp" href="' + esc(link) + '" target="_blank" rel="noopener">傳給官方 LINE 小編</a>' : '';
    var bp = birthParts();
    var kid = !!bp && ageOnRaceDay(bp) <= 12;   // 12 歲以下要有 20 歲以上的大人陪同，陪同的大人也要報名

    area.innerHTML = '<div class="done">' +
      '<span class="done__badge">報名資料已送出</span>' +
      '<h3>' + esc(v.name) + '，謝謝你加入 NID 團報！</h3>' +
      '<div><p class="done__label">報名編號</p><p class="done__id">' + esc(res.id || '—') + '</p></div>' +
      '<dl>' + rows + '</dl>' +
      '<p>請截圖保存這個畫面，並傳給 ' + esc(lineName) + ' 小編。有問題請洽' + esc(C.contact) + '。</p>' +
      (res.mailed ? '<p class="done__mail">確認信已寄到 <b>' + esc(v.email) + '</b>，沒看到請看一下垃圾郵件匣。</p>' : '') +
      (kid ? '<p class="done__family">12 歲以下要有 <b>20 歲以上的大人陪同</b>，陪同的大人也要報名（大會嚴禁沒報名的人陪跑）。還沒報的話，請按「再幫一位報名」。</p>' : '') +
      preview +
      '<div class="done__actions">' + lineBtn + '<button class="btn btn--line" type="button" id="btnAnother">再幫一位報名</button></div>' +
      '</div>';

    // 跳出視窗：一個畫面放得下，方便學員截圖
    $('#doneShot').innerHTML =
      '<p class="shot__badge">✓ 報名完成</p>' +
      '<h2 class="shot__title" id="doneModalTitle">請截圖這個畫面</h2>' +
      '<div class="shot__card">' +
      '<p class="shot__label">報名編號</p><p class="shot__id">' + esc(res.id || '—') + '</p>' +
      '<dl class="shot__list"><dt>姓名</dt><dd>' + esc(v.name) + '</dd>' + rows + '<dt>身分</dt><dd>' + esc(who) + '</dd></dl>' +
      '</div>' +
      '<ol class="shot__steps">' +
      '<li><span><b>截圖</b>這個畫面（電源鍵＋音量鍵一起按）。</span></li>' +
      '<li><span>把截圖<b>傳給 ' + esc(lineName) + ' 小編</b>' + (link ? (C.line && C.line.url ? '：按下面的按鈕打開官方 LINE。' : '：按下面的按鈕，報名資料會先幫你打好。') : '。') + '</span></li>' +
      (kid ? '<li><span>12 歲以下要有<b>20 歲以上的大人陪同</b>，大人也要報名：還沒報的話，按「我截好了」再點「再幫一位報名」。</span></li>' : '') +
      '</ol>' +
      (res.mailed ? '<p class="shot__mail">確認信已寄到 ' + esc(v.email) + '</p>' : '') + preview;
    var btn = $('#doneLineBtn');
    btn.hidden = !link;
    if (link) btn.href = link; else btn.removeAttribute('href');

    $('#formArea').hidden = true;
    area.hidden = false;
    setTotalBar(false);
    area.scrollIntoView({ block: 'start' });
    $('#btnAnother').addEventListener('click', resetForAnother);
    openModal($('#doneModal'), $('#btnAnother'));
  }

  function resetForAnother() {
    if (!$('#doneModal').hidden) closeModal($('#doneModal'));
    $('#signupForm').reset();
    renderDays();
    state.tried = false;
    state.touched = {};
    state.agreedAt = null;
    $('#doneArea').hidden = true;
    $('#gate').hidden = false;
    refresh();
    showErrors({ errors: {}, warnings: {} }, false);
    openTerms();
  }

  /* ---------- totals bar on phones */
  var io;
  function setTotalBar(on) {
    var bar = $('#totalBar');
    bar.classList.toggle('is-on', !!on);
    document.body.classList.toggle('has-totalbar', !!on);
    bar.setAttribute('aria-hidden', on ? 'false' : 'true');
  }
  function observeTotalBar() {
    if (io || typeof IntersectionObserver !== 'function') return;
    var formIn = false, payIn = false;
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.target.id === 'signupForm') formIn = en.isIntersecting;
        if (en.target.id === 'step-5') payIn = en.isIntersecting;
      });
      setTotalBar(formIn && !payIn && !$('#formArea').hidden);
    }, { threshold: 0 });
    io.observe($('#signupForm'));
    io.observe($('#step-5'));
  }

  /* ---------- copy */
  function copyText(text, btn) {
    var ok = function () { toast('已複製：' + text); };
    var fallback = function () {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      var done = false;
      try { done = document.execCommand('copy'); } catch (err) { done = false; }
      document.body.removeChild(ta);
      if (done) ok(); else toast('請長按帳號手動複製：' + text);
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(ok, fallback);
        return;
      }
    } catch (err) { /* fall through */ }
    fallback();
  }

  /* ---------- route tabs */
  function wireTabs() {
    var tabs = $$('.tabs [role="tab"]');
    // 路線圖（Ride with GPS）只在切到那一頁時才載入
    function loadMap(panel) {
      var f = panel && panel.querySelector('iframe[data-src]');
      if (f && !f.getAttribute('src')) f.setAttribute('src', f.getAttribute('data-src'));
    }
    function select(t) {
      tabs.forEach(function (x) {
        var on = x === t;
        var panel = document.getElementById(x.getAttribute('aria-controls'));
        x.setAttribute('aria-selected', on ? 'true' : 'false');
        x.tabIndex = on ? 0 : -1;
        panel.hidden = !on;
        if (on) loadMap(panel);
      });
    }
    var first = tabs.filter(function (x) { return x.getAttribute('aria-selected') === 'true'; })[0];
    if (first) {
      var firstPanel = document.getElementById(first.getAttribute('aria-controls'));
      if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (es) {
          if (es.some(function (e) { return e.isIntersecting; })) { loadMap(firstPanel); io.disconnect(); }
        }, { rootMargin: '400px' });
        io.observe(firstPanel);
      } else loadMap(firstPanel);
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(t); });
      t.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        var n = tabs[(i + d + tabs.length) % tabs.length];
        select(n);
        n.focus();
      });
    });
  }

  /* ---------- 團報進度：每滿 50 人 1 頂帳篷（人數來自收件程式，只有總數） */
  var TENT_EVERY = (C.team && C.team.tentEvery) || 50;
  var MAX_TENTS = (C.team && C.team.maxTents) || 2;   // 帳篷最多幾頂
  var TENT_SVG = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d=\"M5 41 24 12l19 29\"/><path d=\"M3 41h42\"/><path d=\"M24 25l-5.5 16\"/><path d=\"M24 25l5.5 16\"/><path d=\"M24 12V4l8 3.5-8 3.5\"/></svg>';
  function renderMeter(total) {
    var countEl = $('#tmCount');
    if (!countEl) return;
    var known = typeof total === 'number' && total >= 0;
    var n = known ? total : 0;
    var tents = Math.min(MAX_TENTS, Math.floor(n / TENT_EVERY));
    var max = MAX_TENTS * TENT_EVERY;
    var scale = max * 1.12;   // 進度條比最後一個里程碑長一點，標籤才不會被切到
    countEl.textContent = known ? String(n) : '—';
    $('#tmFill').style.width = (n >= max ? 100 : Math.min(100, (n / scale) * 100)) + '%';   // 兩頂都解鎖就整條填滿
    var marks = '';
    for (var m = TENT_EVERY; m <= max; m += TENT_EVERY) {
      var k = m / TENT_EVERY;
      marks += '<li class="' + (n >= m ? 'is-done' : '') + '" style="left:' + ((m / scale) * 100) + '%">' +
        '<span class="meter__tent">' + TENT_SVG + '</span><b>' + m + ' 人</b><small>' + (k === 1 ? '帳篷＋福利' : '第 ' + k + ' 頂帳篷') + '</small></li>';
    }
    $('#tmMarks').innerHTML = marks;
    var msg;
    if (!known) msg = '滿 ' + TENT_EVERY + ' 人解鎖 NID 帳篷＋團報福利！報名開放後人數會即時更新。';
    else if (tents === 0) msg = '再 ' + (TENT_EVERY - n) + ' 人，就解鎖 NID 帳篷＋團報福利！';
    else if (tents < MAX_TENTS) msg = '已解鎖 ' + tents + ' 頂帳篷！再 ' + ((tents + 1) * TENT_EVERY - n) + ' 人就有第 ' + (tents + 1) + ' 頂（最多 ' + MAX_TENTS + ' 頂）。';
    else msg = MAX_TENTS + ' 頂帳篷全部解鎖！帳篷最多 ' + MAX_TENTS + ' 頂，人再多也歡迎一起來。';
    $('#tmMsg').textContent = msg;
    $('#teamMeter').classList.toggle('is-unlocked', tents > 0);
  }

  /* ---------- live count (optional, needs endpoint) */
  function loadStats() {
    renderMeter(null);
    if (!C.endpoint || typeof fetch !== 'function') return;
    fetch(C.endpoint + (C.endpoint.indexOf('?') > -1 ? '&' : '?') + 'action=stats')
      .then(function (r) { return r.json(); })
      .then(function (s) {
        if (s && s.ok && typeof s.total === 'number') {
          renderMeter(s.total);
          if (s.total > 0) {
            var el = $('#statsText');
            el.textContent = '目前已有 ' + s.total + ' 人報名';
            el.hidden = false;
          }
        }
      })
      .catch(function () { /* 只是顯示人數，失敗就不顯示 */ });
  }

  /* ---------- wire everything */
  function init() {
    applyConfigText();
    renderBibs();
    renderFeeTable();
    renderFormOptions();
    wireTabs();

    $$('.js-open-terms').forEach(function (b) {
      b.addEventListener('click', function () { openTerms(b); });
    });
    wireModal($('#termsModal'), null);
    wireModal($('#reviewModal'), null);
    wireModal($('#doneModal'), null);
    $('#termsBody').addEventListener('scroll', checkTermsRead, { passive: true });
    window.addEventListener('resize', function () { if (!$('#termsModal').hidden) checkTermsRead(); });
    $('#btnAgree').addEventListener('click', function () {
      state.agreedAt = new Date().toISOString();
      closeModal($('#termsModal'));
      toast('已同意參賽聲明，開始填寫報名表');
      revealForm(true);
    });
    $('#btnDisagree').addEventListener('click', function () {
      closeModal($('#termsModal'));
      toast('需要同意參賽聲明才能報名');
      $('#gateText').textContent = '你選擇了不同意，因此還不能報名。想報名時請重新閱讀並按「同意」；有疑問請洽' + C.contact + '。';
    });

    var form = $('#signupForm');
    form.addEventListener('submit', onSubmit);
    form.addEventListener('input', function (e) {
      var t = e.target;
      if (t.id === 'f-last5') t.value = t.value.replace(/\D/g, '').slice(0, 5);
      if (t.id === 'f-id') {
        var pos = t.selectionStart;
        t.value = t.value.toUpperCase().replace(/\s/g, '');
        try { t.setSelectionRange(pos, pos); } catch (err) { /* some inputs refuse */ }
      }
      refresh();
    });
    form.addEventListener('change', function (e) {
      var t = e.target;
      if (t.id === 'f-birth-y' || t.id === 'f-birth-m') renderDays();
      var holder = t.closest('[data-field]');
      if (holder && (t.type === 'radio' || t.tagName === 'SELECT' || t.type === 'checkbox')) state.touched[holder.getAttribute('data-field')] = true;
      refresh();
    });
    form.addEventListener('focusout', function (e) {
      var holder = e.target.closest && e.target.closest('[data-field]');
      if (holder && (e.target.value || '').trim()) {
        state.touched[holder.getAttribute('data-field')] = true;
        refresh();
      }
    });
    $('#btnConfirm').addEventListener('click', confirmSubmit);

    document.addEventListener('click', function (e) {
      var b = e.target.closest('.js-copy');
      if (!b) return;
      var from = b.getAttribute('data-copy-from');
      var text = from === 'accountDigits' ? String(C.bank.account).replace(/\D/g, '') : from === 'bankCode' ? C.bank.bankCode : '';
      if (text) copyText(text, b);
    });

    refresh();
    renderPeriod();
    setInterval(renderPeriod, 30000);
    setInterval(renderCountdown, 1000);
    renderMeter(null);
    setTimeout(loadStats, Math.random() * 1200);   // 開放那一刻很多人同時打開網頁：錯開一點再問人數
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
