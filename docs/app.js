// หน้าจอผู้ใช้ใน LINE (LIFF): ลงทะเบียน, รายงานเหตุการณ์, เรื่องของฉัน, คิวยืนยัน, สถิติ
(function () {
  'use strict';
  var R = window.RM, esc = R.esc;
  var $app = document.getElementById('app');
  var $footer = document.getElementById('footer-slot');
  var S = { me: null, conf: null, back: null, friend: null, lastList: null };
  var W = null;   // สถานะฟอร์มรายงาน
  var D = null;   // สถานะแผงตัดสินของหัวหน้า
  var REG = null; // สถานะฟอร์มลงทะเบียน
  var RK = null;  // สถานะฟอร์ม Risk Register
  var H = {};     // ตัวจัดการปุ่ม (data-act)

  var CARD_ICON = {
    'สิ่งส่งตรวจและผลแล็บ': '🧪', 'ธนาคารเลือด': '🩸', 'เข็มตำและสัมผัสเชื้อ': '💉',
    'ความปลอดภัยในการทำงาน': '🦺', 'ระบบ IT และข้อมูล': '💻', 'พัสดุ น้ำยา และบริการ': '📦',
    'สถานที่ สิ่งแวดล้อม ความรุนแรง': '🏢', 'อื่นๆ': '📝'
  };
  var ROLE_TEXT = { staff: 'เจ้าหน้าที่', head: 'หัวหน้าหน่วย', committee: 'กรรมการ RM', admin: 'Admin' };

  // ------------------------------------------------------------------ พื้นฐาน
  function render(html, footer) {
    $app.innerHTML = html;
    $footer.innerHTML = footer ? '<div class="footer"><div class="inner">' + footer + '</div></div>' : '';
    window.scrollTo(0, 0);
  }
  function header(title, backFn) {
    S.back = backFn || null;
    return '<div class="top">' + (backFn ? '<button class="back" data-act="back" aria-label="ย้อนกลับ">‹</button>' : '') +
      '<div class="title">' + esc(title) + '</div></div>';
  }
  function loading() { return '<p class="muted center" style="margin-top:30vh">กำลังโหลด…</p>'; }
  function fatal(msg) {
    render('<div class="card" style="margin-top:20vh"><h2>ใช้งานไม่ได้ในขณะนี้</h2><p>' + esc(msg) +
      '</p><button class="btn" data-act="reload">ลองใหม่</button></div>');
  }
  function chip(label, on, act, arg) {
    return '<button class="chip' + (on ? ' on' : '') + '" data-act="' + act + '" data-arg="' + esc(arg) + '">' + esc(label) + '</button>';
  }
  function friendBanner() {
    if (S.friend !== false) return '';
    var url = (S.conf && S.conf.oa_add_friend_url) || R.cfg.OA_ADD_FRIEND_URL || '';
    return '<div class="notice">ยังไม่ได้เพิ่ม LINE OA เป็นเพื่อน จึงจะไม่ได้รับแจ้งเตือนความคืบหน้า' +
      (url ? '<div style="margin-top:8px"><a class="btn small" href="' + esc(url) + '">เพิ่มเพื่อน</a></div>' : '') + '</div>';
  }
  async function guard(el, fn) {
    if (el) el.disabled = true;
    try { await fn(); } catch (e) { R.toast(e.message || 'เกิดข้อผิดพลาด', true); } finally { if (el) el.disabled = false; }
  }
  function unitName(id) {
    var u = (S.conf ? S.conf.units : S.me.units || []).filter(function (x) { return x.id === id; })[0];
    return u ? u.name : id;
  }
  function toggleIn(arr, v) { var i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var fn = H[el.dataset.act];
    if (fn) fn(el.dataset.arg, el, e);
  });
  function onModel(e) {
    var m = e.target.dataset && e.target.dataset.model;
    if (!m) return;
    var parts = m.split('.');
    var o = parts[0] === 'W' ? W : parts[0] === 'D' ? D : parts[0] === 'RK' ? RK : REG;
    for (var i = 1; i < parts.length - 1; i++) o = o[parts[i]];
    o[parts[parts.length - 1]] = e.target.value;
    if (m === 'W.q') { document.getElementById('s1body').innerHTML = s1Body(); }
    if (m === 'W.event_date' || m === 'W.event_time') { onWhenChange(); }
  }
  document.addEventListener('input', onModel);
  document.addEventListener('change', onModel);
  H.back = function () { if (S.back) S.back(); };
  H.reload = function () { location.reload(); };

  // ------------------------------------------------------------------ เริ่มระบบ
  (async function () {
    try {
      if (!(await R.initLiff())) return;
    } catch (e) {
      fatal('เปิดผ่าน LINE ไม่สำเร็จ: ' + e.message + ' (ตรวจ LIFF_ID ใน config.js)');
      return;
    }
    await boot();
  })();

  async function boot() {
    render(loading());
    try {
      try { S.friend = (await liff.getFriendship()).friendFlag; } catch (e) { S.friend = null; }
      S.me = await R.api('me', S.friend === null ? {} : { friend: S.friend });
      var u = S.me.user;
      if (!u) return viewRegister();
      if (u.status === 'pending') return viewPending();
      if (u.status !== 'active') return fatal('บัญชีนี้ถูกปิดการใช้งาน กรุณาติดต่อ Admin');
      S.conf = await R.api('config');
      var id = new URLSearchParams(location.search).get('id');
      if (id) return viewDetail(id, viewHome);
      viewHome();
    } catch (e) {
      fatal(e.message);
    }
  }

  // ------------------------------------------------------------------ ลงทะเบียน
  var POSITIONS = ['นักเทคนิคการแพทย์', 'เจ้าพนักงานวิทยาศาสตร์การแพทย์', 'ผู้ช่วย/พนักงานทั่วไป', 'อื่นๆ'];
  function viewRegister() {
    REG = REG || { name: '', position: '', unit_ids: [] };
    var units = S.me.units || [];
    render(header('ลงทะเบียนใช้งาน') +
      '<p class="muted">กรอกครั้งเดียว แล้วรอ Admin อนุมัติ</p>' + friendBanner() +
      '<label class="f">ชื่อ-สกุล</label><input type="text" data-model="REG.name" value="' + esc(REG.name) + '" placeholder="เช่น สมชาย ใจดี">' +
      '<label class="f">ตำแหน่ง</label><div class="chips">' +
      POSITIONS.map(function (p) { return chip(p, REG.position === p, 'reg-pos', p); }).join('') + '</div>' +
      '<label class="f">หน่วยงาน (เลือกได้หลายหน่วย)</label>' +
      R.unitPicker('reg', { units: function () { return units; }, multi: true, selected: function () { return REG.unit_ids; }, toggle: function (id) { toggleIn(REG.unit_ids, id); } }),
      '<button class="btn" data-act="reg-submit">ส่งคำขอลงทะเบียน</button>');
  }
  H['reg-pos'] = function (p) { REG.position = REG.position === p ? '' : p; viewRegister(); };
  R.bindPickers(H);
  H['reg-submit'] = function (_, el) {
    guard(el, async function () {
      if (REG.name.trim().length < 2) throw new Error('กรุณากรอกชื่อ-สกุล');
      if (!REG.unit_ids.length) throw new Error('กรุณาเลือกหน่วยงานอย่างน้อย 1 หน่วย');
      await R.api('register', { name: REG.name, position: REG.position, unit_ids: REG.unit_ids, friend: S.friend === true });
      await boot();
    });
  };
  function viewPending() {
    render(header('รออนุมัติ') + '<div class="card center"><div style="font-size:42px">⏳</div>' +
      '<h2>ส่งคำขอแล้ว</h2><p class="muted">รอ Admin อนุมัติบัญชี เมื่ออนุมัติแล้วจะแจ้งทาง LINE (หากเพิ่ม OA เป็นเพื่อนไว้)</p>' +
      '<button class="btn" data-act="reload">ตรวจสอบอีกครั้ง</button></div>' + friendBanner());
  }

  // ------------------------------------------------------------------ หน้าแรก
  async function viewHome() {
    render(loading());
    var u = S.me.user, canQueue = ['head', 'committee', 'admin'].indexOf(u.role) >= 0, qn = 0;
    var od = 0;
    if (canQueue) { try { var t = await R.api('todo', {}); qn = t.pending.length + t.close.length; od = t.fixing.filter(function (x) { return x.overdue; }).length; } catch (e) { /* ignore */ } }
    S.back = null;
    render('<h1>สวัสดี ' + esc(u.name) + '</h1><div class="muted">' + esc(ROLE_TEXT[u.role] || '') + ' · ' +
      esc(u.unit_ids.map(unitName).join(', ')) + '</div>' + friendBanner() +
      '<div class="big-actions">' +
      '<button class="btn big" data-act="start-full"><span class="ico">📝</span><span>รายงานเหตุการณ์<small>เลือกประเภท ระดับ เวลา แล้วส่ง</small></span></button>' +
      '<button class="btn big secondary" data-act="start-quick"><span class="ico">⚡</span><span>Near miss ด่วน<small>เกือบพลาด ส่งได้ในไม่กี่แตะ</small></span></button>' +
      '<button class="btn big secondary" data-act="mine"><span class="ico">📂</span><span>เรื่องของฉัน<small>ดูความคืบหน้าเรื่องที่รายงาน</small></span></button>' +
      '<button class="btn big secondary" data-act="stats"><span class="ico">📊</span><span>สถิติ<small>ภาพรวมของห้องปฏิบัติการ</small></span></button>' +
      (canQueue ? '<button class="btn big warn" data-act="queue"><span class="ico">✅</span><span>งานของฉัน' +
        (qn ? '<span class="badge-n">' + qn + '</span>' : '') + (od ? '<span class="badge-n">เกินกำหนด ' + od + '</span>' : '') + '<small>ยืนยัน แก้ไข RCA และปิดเคส</small></span></button>' : '') +
      (canQueue ? '<button class="btn big secondary" data-act="risks"><span class="ico">🛡️</span><span>Risk Register<small>ทะเบียนความเสี่ยงของหน่วย</small></span></button>' : '') +
      ((u.role === 'admin' || u.role === 'committee') ?
        '<button class="btn secondary" data-act="admin-web">เปิดหน้า Admin (เว็บ)</button>' : '') +
      '</div>');
  }
  H['start-full'] = function () { startReport('full'); };
  H['start-quick'] = function () { startReport('quick'); };
  H.mine = viewMine;
  H.stats = viewStats;
  H.queue = function () { viewQueue('pending'); };
  H.risks = function () { viewRisks(); };
  H['admin-web'] = function () {
    var url = new URL('admin.html', location.href).href;
    try { liff.openWindow({ url: url, external: true }); } catch (e) { location.href = url; }
  };

  // ------------------------------------------------------------------ ฟอร์มรายงาน
  function startReport(mode) {
    var now = R.bkkNow();
    W = {
      mode: mode, step: 1, card: null, code: null, subtype: '', pickSub: false, q: '',
      severity_group: null, severity_code: null,
      unit_id: S.me.user.unit_ids[0] || '', event_date: now.date, event_time: now.time,
      office_hours: R.suggestOffice(now.date, now.time, S.conf.office), officeTouched: false,
      details_chips: [], details_text: '', action_chips: [], action_text: '',
      hasPatient: false, patient: { hn: '', an: '', full_name: '', sex: '', age: '' },
      anonymous: false, is_sentinel: false, sending: false
    };
    viewWizard();
  }
  function curItem() { return S.conf.items.filter(function (i) { return i.code === W.code; })[0]; }
  function progress(n) {
    var s = '<div class="progress">';
    for (var i = 1; i <= 5; i++) s += '<i class="' + (i <= n ? 'on' : '') + '"></i>';
    return s + '</div>';
  }
  function navFooter(next) {
    return '<button class="btn secondary" data-act="prev" style="max-width:130px">ย้อนกลับ</button>' +
      '<button class="btn" data-act="next">' + esc(next || 'ถัดไป') + '</button>';
  }
  function viewWizard() {
    if (W.mode === 'quick' && W.step === 2) return viewQuick();
    var steps = { 1: s1, 2: s2, 3: s3, 4: s4, 5: s5 };
    steps[W.step]();
  }
  H.prev = function () {
    if (W.step === 1) return viewHome();
    W.step -= 1; W.pickSub = false; viewWizard();
  };
  H.next = function (_, el) {
    if (W.step === 1) {
      if (!W.code) return R.toast('กรุณาเลือกเรื่อง', true);
      return goAfterItem();
    }
    if (W.step === 2) {
      if (!W.severity_code) return R.toast('กรุณาเลือกระดับความรุนแรง', true);
    }
    if (W.step === 3) {
      var now = R.bkkNow();
      if (!W.event_date || !W.event_time) return R.toast('กรุณาระบุวันและเวลา', true);
      if (W.event_date + ' ' + W.event_time > now.date + ' ' + now.time) return R.toast('วันเวลาที่เกิดเหตุต้องไม่เป็นอนาคต', true);
      if (!W.unit_id) return R.toast('กรุณาเลือกหน่วยงาน', true);
    }
    if (W.step === 5) return submitReport(el);
    W.step += 1;
    viewWizard();
  };
  function goAfterItem() {
    W.step = 2;
    W.pickSub = false;
    viewWizard();
  }

  // ขั้น 1: เลือกประเภท
  function s1() {
    var back = function () { if (W.card && !W.q) { W.card = null; W.code = null; W.pickSub = false; s1(); } else viewHome(); };
    var body = header(W.mode === 'quick' ? 'Near miss ด่วน' : 'รายงานเหตุการณ์', back) +
      (W.mode === 'quick' ? '' : progress(1)) +
      '<h2>เกิดเรื่องอะไรขึ้น?</h2>' +
      '<input type="search" data-model="W.q" value="' + esc(W.q) + '" placeholder="ค้นหาเรื่อง เช่น ติดฉลากผิด, เข็มตำ">' +
      '<div id="s1body">' + s1Body() + '</div>';
    render(body, W.pickSub ? navFooter('ถัดไป') : '');
  }
  function s1Body() {
    var items = S.conf.items, cards = S.conf.cards, q = (W.q || '').trim().toLowerCase();
    if (W.pickSub) return subtypeBody();
    if (q) {
      return itemList(items.filter(function (i) {
        return (i.code + ' ' + i.name + ' ' + i.subtypes.join(' ') + ' ' + i.card).toLowerCase().indexOf(q) >= 0;
      }), true);
    }
    if (!W.card) {
      return '<div class="grid2" style="margin-top:10px">' + cards.map(function (c, i) {
        return '<button class="card tap" data-act="pick-card" data-arg="' + i + '" style="border:0;text-align:center;font:inherit;padding:18px 8px">' +
          '<div style="font-size:30px">' + (CARD_ICON[c] || '📝') + '</div><div class="item-title" style="font-size:15px">' + esc(c) + '</div></button>';
      }).join('') + '</div>';
    }
    return '<div class="row spread" style="margin-top:10px"><b>' + (CARD_ICON[W.card] || '') + ' ' + esc(W.card) + '</b>' +
      '<button class="btn secondary small" data-act="clear-card">เปลี่ยนกลุ่ม</button></div>' +
      itemList(items.filter(function (i) { return i.card === W.card; }), false);
  }
  function itemList(list, showCard) {
    if (!list.length) return '<p class="muted center" style="margin-top:20px">ไม่พบรายการ ลองคำค้นอื่น หรือเลือกจากกลุ่มด้านบน</p>';
    return list.map(function (i) {
      return '<button class="opt' + (W.code === i.code ? ' on' : '') + '" data-act="pick-item" data-arg="' + esc(i.code) + '"><b>' + esc(i.name) + '</b>' +
        (showCard ? '<span>' + esc(i.card) + '</span>' : '') + '</button>';
    }).join('');
  }
  function subtypeBody() {
    var it = curItem();
    return '<div class="card"><b>' + esc(it.name) + '</b><div class="muted">เลือกเรื่องย่อย (ไม่บังคับ)</div><div class="chips">' +
      it.subtypes.map(function (s) { return chip(s, W.subtype === s, 'pick-sub', s); }).join('') + '</div></div>';
  }
  H['pick-card'] = function (i) { W.card = S.conf.cards[Number(i)]; s1(); };
  H['clear-card'] = function () { W.card = null; W.code = null; W.pickSub = false; W.q = ''; s1(); };
  H['pick-item'] = function (code) {
    var prevType = W.code ? curItem().type : null;
    W.code = code;
    var it = curItem();
    W.card = it.card;
    W.subtype = '';
    if (prevType && prevType !== it.type) { W.severity_group = null; W.severity_code = null; }
    if (it.subtypes.length) { W.pickSub = true; s1(); } else { goAfterItem(); }
  };
  H['pick-sub'] = function (s, el) {
    W.subtype = W.subtype === s ? '' : s;
    var chips = document.querySelectorAll('[data-act="pick-sub"]');
    for (var i = 0; i < chips.length; i++) chips[i].classList.toggle('on', chips[i].dataset.arg === W.subtype);
  };

  // ขั้น 2: ความรุนแรง
  function s2() {
    var it = curItem(), groups = R.SEV[it.type];
    var body = header('ความรุนแรง', function () { W.step = 1; s1(); }) + progress(2) +
      '<h2>ผลที่เกิดขึ้นรุนแรงแค่ไหน?</h2><div class="muted">' + esc(it.name) + '</div>' +
      groups.map(function (g) {
        return '<button class="opt' + (W.severity_group === g.group ? ' on' : '') + '" data-act="sev-group" data-arg="' + g.group + '">' +
          '<b>' + esc(g.label) + '</b><span>' + esc(g.desc) + '</span></button>';
      }).join('');
    var sel = W.severity_group && groups.filter(function (g) { return g.group === W.severity_group; })[0];
    if (sel && sel.letters && sel.letters.length > 1) {
      body += '<h3>เลือกให้ตรงที่สุด</h3>' + sel.letters.map(function (l) {
        return '<button class="opt' + (W.severity_code === l.code ? ' on' : '') + '" data-act="sev-letter" data-arg="' + l.code + '"><b>' + esc(l.label) + '</b></button>';
      }).join('');
    }
    render(body, navFooter());
  }
  H['sev-group'] = function (g) {
    var it = curItem(), grp = R.SEV[it.type].filter(function (x) { return x.group === Number(g); })[0];
    W.severity_group = Number(g);
    if (it.type === 'general') W.severity_code = String(g);
    else if (grp.letters.length === 1) W.severity_code = grp.letters[0].code;
    else W.severity_code = null;
    s2();
  };
  H['sev-letter'] = function (c) { W.severity_code = c; s2(); };

  // ขั้น 3: เมื่อไร ที่ไหน
  function s3() {
    var now = R.bkkNow();
    render(header('เวลาและหน่วยงาน', function () { W.step = 2; viewWizard(); }) + progress(3) +
      '<h2>เกิดเมื่อไร ที่หน่วยไหน?</h2>' +
      '<div class="grid2"><div><label class="f">วันที่เกิดเหตุ</label><input type="date" data-model="W.event_date" value="' + esc(W.event_date) + '" max="' + now.date + '"></div>' +
      '<div><label class="f">เวลา</label><input type="time" data-model="W.event_time" value="' + esc(W.event_time) + '"></div></div>' +
      '<label class="f">ช่วงเวลา</label><div class="chips" id="officeBox">' + officeChips() + '</div>' +
      '<div class="muted" id="shiftNote">' + esc(R.shiftOf(W.event_time || '00:00')) + '</div>' +
      '<label class="f">หน่วยงานที่เกิดเหตุ</label><div id="unitBox">' + unitChips() + '</div>',
      navFooter());
  }
  function officeChips() {
    return ['ในเวลาราชการ', 'นอกเวลาราชการ'].map(function (o) { return chip(o, W.office_hours === o, 'pick-office', o); }).join('');
  }
  function unitChips() {
    return R.unitPicker('ev', { units: function () { return S.conf.units; }, selected: function () { return [W.unit_id]; }, toggle: function (id) { W.unit_id = id; } });
  }
  function onWhenChange() {
    if (!W.officeTouched && W.event_date && W.event_time) {
      W.office_hours = R.suggestOffice(W.event_date, W.event_time, S.conf.office);
      var box = document.getElementById('officeBox'); if (box) box.innerHTML = officeChips();
    }
    var note = document.getElementById('shiftNote'); if (note && W.event_time) note.textContent = R.shiftOf(W.event_time);
  }
  H['pick-office'] = function (o) { W.office_hours = o; W.officeTouched = true; document.getElementById('officeBox').innerHTML = officeChips(); };

  // ขั้น 4: รายละเอียด (แตะเลือก)
  function quickList(field) {
    var q = S.conf.quick[curItem().card] || S.conf.quick['*'] || {};
    return q[field] || [];
  }
  function s4() {
    var d = quickList('details'), a = quickList('action');
    render(header('รายละเอียด', function () { W.step = 3; viewWizard(); }) + progress(4) +
      '<h2>เกิดอะไรขึ้น?</h2><div class="muted">แตะเลือกได้หลายข้อ พิมพ์เพิ่มได้แต่ไม่บังคับ</div>' +
      '<div class="chips">' + d.map(function (t, i) { return chip(t, W.details_chips.indexOf(t) >= 0, 'tog-detail', i); }).join('') + '</div>' +
      '<textarea data-model="W.details_text" placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)">' + esc(W.details_text) + '</textarea>' +
      '<h2>จัดการเบื้องต้นอย่างไร?</h2>' +
      '<div class="chips">' + a.map(function (t, i) { return chip(t, W.action_chips.indexOf(t) >= 0, 'tog-action', i); }).join('') + '</div>' +
      '<textarea data-model="W.action_text" placeholder="สิ่งที่ทำไปแล้ว (ถ้ามี)">' + esc(W.action_text) + '</textarea>',
      navFooter());
  }
  H['tog-detail'] = function (i, el) { toggleIn(W.details_chips, quickList('details')[Number(i)]); el.classList.toggle('on'); };
  H['tog-action'] = function (i, el) { toggleIn(W.action_chips, quickList('action')[Number(i)]); el.classList.toggle('on'); };

  // ขั้น 5: ผู้ป่วย / นิรนาม / ตรวจทาน
  function s5() {
    var it = curItem(), p = W.patient;
    render(header('ตรวจทานและส่ง', function () { W.step = 4; viewWizard(); }) + progress(5) +
      '<div class="card"><b>' + esc(it.name) + '</b>' + (W.subtype ? '<div>' + esc(W.subtype) + '</div>' : '') +
      '<div class="muted">' + esc(R.sevText({ severity_type: it.type, severity_code: W.severity_code })) + ' · ' +
      esc(R.thaiDateTime(W.event_date + ' ' + W.event_time)) + ' · ' + esc(W.office_hours) + ' · ' + esc(unitName(W.unit_id)) + '</div></div>' +
      '<div class="chips"><button class="chip' + (W.hasPatient ? ' on' : '') + '" data-act="flag" data-arg="hasPatient">เกี่ยวข้องกับผู้ป่วย</button>' +
      '<button class="chip' + (W.anonymous ? ' on' : '') + '" data-act="flag" data-arg="anonymous">ไม่ระบุชื่อผู้รายงาน</button>' +
      '<button class="chip' + (W.is_sentinel ? ' on' : '') + '" data-act="flag" data-arg="is_sentinel">Sentinel event</button></div>' +
      '<div id="ptBox" style="display:' + (W.hasPatient ? 'block' : 'none') + '" class="card">' +
      '<div class="grid2"><div><label class="f">HN</label><input type="text" inputmode="numeric" data-model="W.patient.hn" value="' + esc(p.hn) + '"></div>' +
      '<div><label class="f">AN</label><input type="text" inputmode="numeric" data-model="W.patient.an" value="' + esc(p.an) + '"></div></div>' +
      '<label class="f">ชื่อ-สกุลผู้ป่วย</label><input type="text" data-model="W.patient.full_name" value="' + esc(p.full_name) + '">' +
      '<div class="grid2"><div><label class="f">เพศ</label><div class="chips" id="sexBox">' + sexChips() + '</div></div>' +
      '<div><label class="f">อายุ (ปี)</label><input type="number" inputmode="numeric" min="0" max="130" data-model="W.patient.age" value="' + esc(p.age) + '"></div></div>' +
      '<div class="muted">อายุน้อยกว่า 6 เดือนให้ใส่ 0 ตั้งแต่ 6 เดือนใส่ 1</div></div>' +
      '<div id="senBox" style="display:' + (W.is_sentinel ? 'block' : 'none') + '" class="notice"><b>Sentinel event ตามคู่มือ</b><ul style="margin:6px 0 0;padding-left:18px">' +
      R.SENTINEL_LIST.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div>' +
      (W.anonymous ? '<div id="anonNote" class="notice">รายงานนี้จะแสดงเป็น "ไม่ระบุชื่อ" แต่ Admin ยังติดตามเจ้าของเรื่องได้ตามระเบียบ</div>' : ''),
      navFooter('ส่งรายงาน'));
  }
  function sexChips() {
    return ['ชาย', 'หญิง', 'ไม่ระบุ'].map(function (s) { return chip(s, W.patient.sex === s, 'pick-sex', s); }).join('');
  }
  H.flag = function (k, el) {
    W[k] = !W[k]; el.classList.toggle('on', W[k]);
    if (k === 'hasPatient') document.getElementById('ptBox').style.display = W.hasPatient ? 'block' : 'none';
    if (k === 'is_sentinel') document.getElementById('senBox').style.display = W.is_sentinel ? 'block' : 'none';
    if (k === 'anonymous') s5keep();
  };
  function s5keep() { /* แสดงข้อความนิรนามใหม่โดยไม่รีเซ็ตช่องที่กรอก */
    var existing = document.getElementById('anonNote');
    if (W.anonymous && !existing) {
      var d = document.createElement('div'); d.id = 'anonNote'; d.className = 'notice';
      d.textContent = 'รายงานนี้จะแสดงเป็น "ไม่ระบุชื่อ" แต่ Admin ยังติดตามเจ้าของเรื่องได้ตามระเบียบ';
      $app.appendChild(d);
    } else if (!W.anonymous && existing) { existing.remove(); }
  }
  H['pick-sex'] = function (s) { W.patient.sex = W.patient.sex === s ? '' : s; document.getElementById('sexBox').innerHTML = sexChips(); };

  function buildPayload() {
    var p = {
      code: W.code, subtype: W.subtype, unit_id: W.unit_id, severity_code: W.severity_code,
      event_date: W.event_date, event_time: W.event_time, office_hours: W.office_hours,
      details_chips: W.details_chips, details_text: W.details_text,
      action_chips: W.action_chips, action_text: W.action_text,
      anonymous: W.anonymous, is_sentinel: W.is_sentinel
    };
    if (W.hasPatient) p.patient = W.patient;
    return p;
  }
  function submitReport(el) {
    if (W.sending) return;
    guard(el, async function () {
      W.sending = true;
      try {
        var r = await R.api('submitIncident', buildPayload());
        viewDone(r.incident_id);
      } finally { W.sending = false; }
    });
  }
  function viewDone(id) {
    S.back = null;
    render('<div class="card center" style="margin-top:12vh"><div style="font-size:46px">✅</div><h2>ส่งรายงานแล้ว</h2>' +
      '<p>เลขที่ <b>' + esc(id) + '</b></p><p class="muted">หัวหน้าหน่วยจะได้รับแจ้งเตือน ติดตามความคืบหน้าได้ที่ "เรื่องของฉัน"</p>' +
      '<button class="btn" data-act="home">กลับหน้าแรก</button>' +
      '<div style="height:10px"></div><button class="btn secondary" data-act="start-full">รายงานเรื่องใหม่</button></div>');
  }
  H.home = viewHome;

  // Near miss ด่วน: เลือกเรื่อง -> ยืนยัน
  function viewQuick() {
    var it = curItem(), now = R.bkkNow();
    W.event_date = now.date; W.event_time = now.time;
    W.office_hours = R.suggestOffice(now.date, now.time, S.conf.office);
    if (it.type === 'general') W.severity_code = '1';
    else if (['A', 'B'].indexOf(W.severity_code) < 0) W.severity_code = 'A';
    render(header('Near miss ด่วน', function () { W.step = 1; s1(); }) +
      '<div class="card"><b>' + esc(it.name) + '</b>' + (W.subtype ? '<div>' + esc(W.subtype) + '</div>' : '') +
      '<div class="muted">ตอนนี้ · ' + esc(W.office_hours) + ' · ' + esc(R.shiftOf(W.event_time)) + '</div></div>' +
      (it.type === 'clinical' ?
        '<label class="f">เกือบพลาดแบบไหน</label>' + R.SEV.clinical[0].letters.map(function (l) {
          return '<button class="opt' + (W.severity_code === l.code ? ' on' : '') + '" data-act="quick-letter" data-arg="' + l.code + '"><b>' + esc(l.label) + '</b></button>';
        }).join('') : '') +
      '<label class="f">หน่วยงาน</label><div id="unitBox">' + unitChips() + '</div>' +
      '<div class="chips"><button class="chip' + (W.anonymous ? ' on' : '') + '" data-act="flag" data-arg="anonymous">ไม่ระบุชื่อ</button></div>',
      '<button class="btn secondary" data-act="prev" style="max-width:130px">ย้อนกลับ</button><button class="btn" data-act="quick-send">ส่ง Near miss</button>');
  }
  H['quick-letter'] = function (c) { W.severity_code = c; viewQuick(); };
  H['quick-send'] = function (_, el) { submitReport(el); };

  // ------------------------------------------------------------------ Risk Register (หัวหน้าหน่วย/กรรมการ/Admin)
  var LV_COLOR = { red: '#d9363e', orange: '#f08a24', yellow: '#d9a400', green: '#3fae5a' };
  var LV = [[15, 'red', 'สูงมาก'], [10, 'orange', 'สูง'], [5, 'yellow', 'ปานกลาง'], [1, 'green', 'ต่ำ']];
  var L_LABEL = ['', 'น้อยมาก', 'น้อย', 'ปานกลาง', 'บ่อย', 'บ่อยมาก'];
  var C_LABEL = ['', 'เล็กน้อย', 'น้อย', 'ปานกลาง', 'มาก', 'รุนแรงมาก'];
  function lvOf(score) { return LV.filter(function (l) { return score >= l[0]; })[0]; }
  function scoreBadge() {
    var s = (Number(RK.likelihood) || 0) * (Number(RK.consequence) || 0);
    if (!s) return '<span class="muted">เลือกโอกาสและความรุนแรงเพื่อดูระดับ</span>';
    var l = lvOf(s);
    return '<span class="badge" style="background:' + LV_COLOR[l[1]] + ';font-size:15px;padding:4px 14px">คะแนน ' + s + ' · ' + l[2] + '</span>';
  }
  async function viewRisks() {
    S.lastList = viewRisks;
    render(header('Risk Register', viewHome) + loading());
    try {
      var d = await R.api('listRisks', {});
      S.risks = d.risks;
      render(header('Risk Register', viewHome) + '<button class="btn" data-act="risk-new">+ เพิ่มความเสี่ยง</button>' +
        (d.risks.length ? d.risks.map(function (r) {
          return '<div class="card tap" data-act="risk-open" data-arg="' + esc(r.id) + '"><div class="item-title">' + esc(r.title) + '</div>' +
            '<div><span class="badge" style="background:' + LV_COLOR[r.level_key] + '">' + r.score + ' · ' + esc(r.level) + '</span>' +
            (r.review_due ? '<span class="badge" style="background:#d9363e">ถึงรอบทบทวน</span>' : '') + '</div>' +
            '<div class="muted">' + esc(r.unit) + (r.owner ? ' · ' + esc(r.owner) : '') + ' · ทบทวนครั้งถัดไป ' + esc(r.next_review) + '</div></div>';
        }).join('') : '<p class="muted center" style="margin-top:12vh">ยังไม่มีรายการ แตะ "เพิ่มความเสี่ยง" เพื่อเริ่ม</p>'));
    } catch (e) { R.toast(e.message, true); }
  }
  H['risk-new'] = function () {
    var own = S.me.user.unit_ids[0] || '';
    RK = { id: '', unit_id: own, title: '', definition: '', likelihood: 0, consequence: 0, prevention: '', monitor: '', mitigation: '', qi_plan: '', owner: S.me.user.name, result: '' };
    viewRiskForm();
  };
  H['risk-open'] = function (id) {
    var r = (S.risks || []).filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    RK = { id: r.id, unit_id: r.unit_id, title: r.title, definition: r.definition, likelihood: r.likelihood, consequence: r.consequence,
      prevention: r.prevention, monitor: r.monitor, mitigation: r.mitigation, qi_plan: r.qi_plan, owner: r.owner, result: '',
      next_review: r.next_review, last_review: r.last_review, result_of_review: r.result_of_review, review_due: r.review_due };
    viewRiskForm();
  };
  function riskUnits() {
    var all = S.conf ? S.conf.units : S.me.units;
    return S.me.user.role === 'head' ? all.filter(function (u) { return S.me.user.unit_ids.indexOf(u.id) >= 0; }) : all;
  }
  function scaleChips(field, labels, act) {
    var out = '<div class="chips">';
    for (var n = 1; n <= 5; n++) out += '<button class="chip' + (Number(RK[field]) === n ? ' on' : '') + '" data-act="' + act + '" data-arg="' + n + '">' + n + ' ' + labels[n] + '</button>';
    return out + '</div>';
  }
  function ta(model, label, ph, v) { return '<label class="f">' + label + '</label><textarea data-model="RK.' + model + '" placeholder="' + esc(ph || '') + '">' + esc(v || '') + '</textarea>'; }
  function viewRiskForm() {
    var h = header(RK.id || 'เพิ่มความเสี่ยง', viewRisks) +
      '<label class="f">หน่วยงาน</label>' +
      R.unitPicker('rk', { units: riskUnits, selected: function () { return [RK.unit_id]; }, toggle: function (id) { RK.unit_id = id; } }) +
      '<label class="f">ชื่อความเสี่ยง</label><input type="text" data-model="RK.title" value="' + esc(RK.title) + '" placeholder="เช่น ตัวอย่างเลือดแตกระหว่างขนส่ง">' +
      ta('definition', 'คำอธิบาย', '', RK.definition) +
      '<label class="f">โอกาสเกิด</label><div id="rkL">' + scaleChips('likelihood', L_LABEL, 'rk-l') + '</div>' +
      '<label class="f">ผลกระทบ/ความรุนแรง</label><div id="rkC">' + scaleChips('consequence', C_LABEL, 'rk-c') + '</div>' +
      '<div id="rkScore" style="margin:8px 0">' + scoreBadge() + '</div>' +
      ta('prevention', 'มาตรการป้องกัน', '', RK.prevention) + ta('monitor', 'การเฝ้าระวัง/ติดตาม', '', RK.monitor) +
      ta('mitigation', 'มาตรการบรรเทาผลกระทบ', '', RK.mitigation) + ta('qi_plan', 'แผนพัฒนาคุณภาพ (ถ้ามี)', '', RK.qi_plan) +
      '<label class="f">ผู้รับผิดชอบ</label><input type="text" data-model="RK.owner" value="' + esc(RK.owner) + '">';
    if (RK.id) {
      h += '<div class="card"><h2>ทบทวนมาตรการ' + (RK.review_due ? ' <span class="badge" style="background:#d9363e">ถึงรอบ</span>' : '') + '</h2>' +
        '<div class="muted">ทบทวนล่าสุด: ' + esc(RK.last_review || '-') + (RK.result_of_review ? ' · ' + esc(RK.result_of_review) : '') + ' · ครบรอบ ' + esc(RK.next_review) + '</div>' +
        ta('result', 'ผลการทบทวน', 'เช่น มาตรการเดิมยังเหมาะสม / ปรับขั้นตอน...', RK.result) +
        '<div class="muted">ปรับโอกาส/ความรุนแรงด้านบนได้หากเปลี่ยนไป</div>' +
        '<div style="height:8px"></div><button class="btn secondary" data-act="rk-review">บันทึกการทบทวน</button></div>';
    }
    render(h, '<button class="btn" data-act="rk-save">บันทึก</button>');
  }
  H['rk-l'] = function (n) { RK.likelihood = Number(n); document.getElementById('rkL').innerHTML = scaleChips('likelihood', L_LABEL, 'rk-l'); document.getElementById('rkScore').innerHTML = scoreBadge(); };
  H['rk-c'] = function (n) { RK.consequence = Number(n); document.getElementById('rkC').innerHTML = scaleChips('consequence', C_LABEL, 'rk-c'); document.getElementById('rkScore').innerHTML = scoreBadge(); };
  function checkRisk() {
    if (!RK.unit_id) throw new Error('กรุณาเลือกหน่วยงาน');
    if (!RK.likelihood || !RK.consequence) throw new Error('กรุณาเลือกโอกาสเกิดและความรุนแรง');
  }
  H['rk-save'] = function (_, el) {
    guard(el, async function () {
      if (!RK.title || RK.title.trim().length < 3) throw new Error('กรุณาระบุชื่อความเสี่ยง');
      checkRisk();
      await R.api('saveRisk', { risk_id: RK.id, unit_id: RK.unit_id, title: RK.title, definition: RK.definition, likelihood: RK.likelihood, consequence: RK.consequence,
        prevention: RK.prevention, monitor: RK.monitor, mitigation: RK.mitigation, qi_plan: RK.qi_plan, owner: RK.owner });
      R.toast('บันทึกแล้ว'); viewRisks();
    });
  };
  H['rk-review'] = function (_, el) {
    guard(el, async function () {
      checkRisk();
      await R.api('reviewRisk', { risk_id: RK.id, result: RK.result, likelihood: RK.likelihood, consequence: RK.consequence });
      R.toast('บันทึกการทบทวนแล้ว'); viewRisks();
    });
  };

  // ------------------------------------------------------------------ รายการ
  function listCard(r) {
    return '<div class="card tap" data-act="open" data-arg="' + esc(r.id) + '"><div class="item-title">' + esc(r.name) + (r.subtype ? ' · ' + esc(r.subtype) : '') + '</div>' +
      '<div>' + R.badge(r.status) + R.sevBadge(r) + (r.is_sentinel ? '<span class="badge" style="background:#7a1020">Sentinel</span>' : '') + '</div>' +
      '<div class="muted">' + esc(r.unit) + ' · ' + esc(R.thaiDateTime(r.event_datetime)) + ' · ' + esc(r.id) + '</div></div>';
  }
  H.open = function (id) { viewDetail(id, S.lastList || viewHome); };

  async function viewMine() {
    S.lastList = viewMine;
    render(header('เรื่องของฉัน', viewHome) + loading());
    try {
      var d = await R.api('myIncidents', {});
      render(header('เรื่องของฉัน', viewHome) + (d.incidents.length ? d.incidents.map(listCard).join('') :
        '<p class="muted center" style="margin-top:20vh">ยังไม่มีรายงาน</p>') + friendBanner());
    } catch (e) { R.toast(e.message, true); }
  }

  async function viewQueue(tab) {
    tab = tab || 'pending';
    S.lastList = function () { viewQueue(tab); };
    render(header('งานของฉัน', viewHome) + loading());
    try {
      var d = await R.api('todo', {});
      var names = [['pending', 'รอยืนยัน'], ['fixing', 'แก้ไข'], ['close', 'รอปิดเคส']];
      var tabs = names.map(function (n) { return chip(n[1] + ' (' + d[n[0]].length + ')', n[0] === tab, 'queue-tab', n[0]); }).join('');
      var list = d[tab];
      render(header('งานของฉัน', viewHome) + '<div class="chips">' + tabs + '</div>' +
        (list.length ? list.map(function (r) {
          return listCard(r).replace('</div></div>', '</div>' + (r.overdue ? '<span class="badge" style="background:#d9363e">เกินกำหนด ' + esc(r.due_action_date) + '</span>' : '') + '</div>');
        }).join('') : '<p class="muted center" style="margin-top:16vh">ไม่มีเรื่องค้าง</p>'));
    } catch (e) { R.toast(e.message, true); }
  }
  H['queue-tab'] = function (s) { viewQueue(s); };

  // ------------------------------------------------------------------ รายละเอียด + ตัดสิน
  async function viewDetail(id, backFn) {
    render(header('รายละเอียด', backFn) + loading());
    var inc;
    try { inc = (await R.api('incidentDetail', { incident_id: id })).incident; }
    catch (e) { render(header('รายละเอียด', backFn) + '<div class="notice err">' + esc(e.message) + '</div>'); return; }
    var p = inc.patient;
    var rows = [
      ['เลขที่', inc.id], ['เหตุการณ์', inc.name + (inc.subtype ? ' · ' + inc.subtype : '')],
      ['เกิดเมื่อ', R.thaiDateTime(inc.event_datetime) + ' (' + inc.office_hours + ', ' + inc.shift + ')'],
      ['หน่วยงาน', inc.unit], ['ผู้รายงาน', inc.reporter], ['รายละเอียด', inc.details || '-'],
      ['จัดการเบื้องต้น', inc.first_action || '-']
    ];
    if (p) rows.push(['ผู้ป่วย', 'HN ' + (p.hn || '-') + (p.an ? ' · AN ' + p.an : '') + (p.full_name ? ' · ' + p.full_name : '') +
      (p.sex ? ' · ' + p.sex : '') + (p.age !== '' ? ' · ' + p.age + ' ปี' : '') + (p.name_masked ? ' (ชื่อปิดบางส่วน)' : '')]);
    if (inc.confirmed_by) rows.push(['ผู้พิจารณา', inc.confirmed_by + ' · ' + R.thaiDateTime(inc.confirmed_at)]);
    if (inc.assigned_unit_id) rows.push(['หน่วยที่แก้ไข', unitName(inc.assigned_unit_id) + (inc.co_units.length ? ' (ร่วม: ' + inc.co_units.map(unitName).join(', ') + ')' : '')]);
    if (inc.due_action_date) rows.push(['กำหนดแก้ไข', R.thaiDateTime(inc.due_action_date)]);
    if (inc.reject_reason) rows.push(['เหตุผลที่ไม่ใช่ความเสี่ยง', inc.reject_reason]);
    var html = header('รายละเอียด', backFn) + '<div>' + R.badge(inc.status) + R.sevBadge(inc) +
      (inc.is_sentinel ? '<span class="badge" style="background:#7a1020">Sentinel</span>' : '') + '</div>' +
      '<div class="card"><dl class="kv">' + rows.map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('') + '</dl></div>';
    if (inc.can_decide) {
      D = { id: inc.id, type: inc.severity_type, severity_code: inc.severity_code, assigned_unit_id: inc.unit_id,
        co_units: [], is_sentinel: inc.is_sentinel, reason_chip: '', reason_text: '', unit_id: inc.unit_id, back: backFn };
      html += decidePanel();
    }
    html += R.workHtml(inc);
    render(html);
  }
  R.bindWork(H, guard, function (id, done) { if (done === 'list') viewQueue('pending'); else viewDetail(id, S.lastList || viewHome); });
  function sevOptions() {
    if (D.type === 'general') return ['1', '2', '3', '4', '5'].map(function (c) {
      return '<option value="' + c + '"' + (c === D.severity_code ? ' selected' : '') + '>ระดับ ' + c + ' · ' + esc(R.GROUP_LABEL[c]) + '</option>';
    }).join('');
    var out = '';
    R.SEV.clinical.forEach(function (g) {
      g.letters.forEach(function (l) {
        out += '<option value="' + l.code + '"' + (l.code === D.severity_code ? ' selected' : '') + '>' + l.code + ' · ' + esc(g.label) + ' · ' + esc(l.label) + '</option>';
      });
    });
    return out;
  }
  function decidePanel() {
    return '<div class="card"><h2>พิจารณารายงาน</h2>' +
      '<label class="f">ระดับความรุนแรง (ปรับได้)</label><select data-model="D.severity_code">' + sevOptions() + '</select>' +
      '<label class="f">หน่วยหลักที่แก้ไข (เลือกกลุ่มก่อน)</label><div id="dUnit">' + decUnitChips() + '</div>' +
      '<label class="f">หน่วยร่วมแก้ไข เช่น หอผู้ป่วย/หน่วยสนับสนุน (ถ้ามี)</label><div id="dCo">' + decCoChips() + '</div>' +
      '<div class="chips"><button class="chip' + (D.is_sentinel ? ' on' : '') + '" data-act="dec-sentinel">Sentinel event</button></div>' +
      '<button class="btn" data-act="dec-confirm">ยืนยันเป็นอุบัติการณ์ความเสี่ยง</button>' +
      '<div style="height:10px"></div><button class="btn secondary" data-act="dec-reject-open">ไม่ใช่ความเสี่ยง</button>' +
      '<div id="rejectBox" style="display:none"><label class="f">เหตุผล</label><div class="chips">' +
      ['ไม่เข้าข่ายอุบัติการณ์', 'รายงานซ้ำ', 'ข้อมูลไม่ครบ ต้องรายงานใหม่'].map(function (r) { return chip(r, false, 'dec-reason', r); }).join('') + '</div>' +
      '<textarea data-model="D.reason_text" placeholder="เหตุผลเพิ่มเติม"></textarea>' +
      '<button class="btn danger" data-act="dec-reject">ยืนยันว่าไม่ใช่ความเสี่ยง</button></div></div>';
  }
  function decUnitChips() {
    return R.unitPicker('asg', { units: function () { return S.conf.units; }, selected: function () { return [D.assigned_unit_id]; },
      toggle: function (id) { D.assigned_unit_id = id; D.co_units = D.co_units.filter(function (x) { return x !== id; }); },
      after: function () { R.refreshPicker('co'); } });
  }
  function decCoChips() {
    return R.unitPicker('co', { units: function () { return S.conf.units; }, multi: true, selected: function () { return D.co_units; },
      exclude: function () { return D.assigned_unit_id; }, toggle: function (id) { toggleIn(D.co_units, id); } });
  }
  H['dec-sentinel'] = function (_, el) { D.is_sentinel = !D.is_sentinel; el.classList.toggle('on', D.is_sentinel); };
  H['dec-reject-open'] = function () { document.getElementById('rejectBox').style.display = 'block'; };
  H['dec-reason'] = function (r, el) {
    D.reason_chip = D.reason_chip === r ? '' : r;
    var cs = document.querySelectorAll('[data-act="dec-reason"]');
    for (var i = 0; i < cs.length; i++) cs[i].classList.toggle('on', cs[i].dataset.arg === D.reason_chip);
  };
  H['dec-confirm'] = function (_, el) {
    guard(el, async function () {
      await R.api('decideIncident', { incident_id: D.id, decision: 'confirm', severity_code: D.severity_code,
        assigned_unit_id: D.assigned_unit_id, co_units: D.co_units, is_sentinel: D.is_sentinel });
      R.toast('ยืนยันแล้ว');
      viewQueue('pending');
    });
  };
  H['dec-reject'] = function (_, el) {
    guard(el, async function () {
      var reason = (D.reason_chip + ' ' + D.reason_text).trim();
      await R.api('decideIncident', { incident_id: D.id, decision: 'reject', reason: reason });
      R.toast('บันทึกว่าไม่ใช่ความเสี่ยงแล้ว');
      viewQueue('pending');
    });
  };

  // ------------------------------------------------------------------ สถิติ
  async function viewStats(range) {
    range = range || 'all';
    var now = R.bkkNow(), p = {};
    if (range === '30') p.from = new Date(Date.now() - 30 * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
    if (range === 'year') p.from = now.date.slice(0, 4) + '-01-01';
    var tabs = [['all', 'ทั้งหมด'], ['year', 'ปีนี้'], ['30', '30 วัน']].map(function (t) { return chip(t[1], t[0] === range, 'stats-range', t[0]); }).join('');
    render(header('สถิติ', viewHome) + '<div class="chips">' + tabs + '</div>' + loading());
    try {
      var s = await R.api('stats', p);
      render(header('สถิติ', viewHome) + '<div class="chips">' + tabs + '</div>' + R.statsHtml(s));
    } catch (e) { R.toast(e.message, true); }
  }
  H['stats-range'] = function (r) { viewStats(r); };
})();
