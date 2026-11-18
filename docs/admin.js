// หน้า Admin (เว็บ): ภาพรวม/สถิติ, รายงานทั้งหมด, จัดการผู้ใช้
(function () {
  'use strict';
  var R = window.RM, esc = R.esc;
  var $app = document.getElementById('app');
  var S = { me: null, conf: null, tab: 'dash', list: [] };
  var H = {};

  var STATUSES = ['รอยืนยัน', 'รอแก้ไข', 'กำลังแก้ไข', 'รอปิดเคส', 'ปิดเคส', 'ไม่ใช่ความเสี่ยง'];
  var ROLE_TEXT = { staff: 'เจ้าหน้าที่', head: 'หัวหน้าหน่วย', committee: 'กรรมการ RM', admin: 'Admin' };

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var fn = H[el.dataset.act];
    if (fn) fn(el.dataset.arg, el, e);
  });

  function unitName(id) {
    var u = S.conf.units.filter(function (x) { return x.id === id; })[0];
    return u ? u.name : id;
  }
  async function guard(el, fn) {
    if (el) el.disabled = true;
    try { await fn(); } catch (e) { R.toast(e.message || 'เกิดข้อผิดพลาด', true); } finally { if (el) el.disabled = false; }
  }

  (async function () {
    try {
      if (!(await R.initLiff())) return;
      S.me = await R.api('me', {});
      var u = S.me.user;
      if (!u || u.status !== 'active' || ['admin', 'committee'].indexOf(u.role) < 0) {
        $app.innerHTML = '<div class="card" style="margin-top:15vh"><h2>ไม่มีสิทธิ์เข้าหน้านี้</h2><p class="muted">หน้านี้สำหรับ Admin และกรรมการ RM</p></div>';
        return;
      }
      S.conf = await R.api('config');
      document.getElementById('who').textContent = u.name + ' (' + ROLE_TEXT[u.role] + ')';
      var lo = document.getElementById('logout'); lo.style.display = ''; lo.onclick = function () { liff.logout(); location.reload(); };
      drawTabs();
      go('dash');
    } catch (e) {
      $app.innerHTML = '<div class="card" style="margin-top:15vh"><h2>เปิดหน้าไม่สำเร็จ</h2><p>' + esc(e.message) + '</p></div>';
    }
  })();

  function drawTabs() {
    var tabs = [['dash', 'ภาพรวม'], ['inc', 'รายงานทั้งหมด'], ['risk', 'Risk Register']];
    if (S.me.user.role === 'admin') tabs.push(['users', 'ผู้ใช้'], ['setup', 'ตั้งค่า']);
    document.getElementById('tabs').innerHTML = tabs.map(function (t) {
      return '<button class="tab' + (S.tab === t[0] ? ' on' : '') + '" data-act="tab" data-arg="' + t[0] + '">' + t[1] + '</button>';
    }).join('');
  }
  function go(tab) {
    S.tab = tab; drawTabs();
    if (tab === 'dash') viewDash();
    else if (tab === 'inc') viewInc();
    else if (tab === 'risk') viewRisk();
    else if (tab === 'setup') viewSetup();
    else viewUsers();
  }
  H.tab = go;

  // ------------------------------------------------------------ ภาพรวม
  var DASH = { from: '', to: '' };
  async function viewDash() {
    $app.innerHTML = '<h1>ภาพรวมและตัวชี้วัด</h1>' + dashFilters() + '<p class="muted">กำลังโหลด…</p>';
    try {
      var res = await Promise.all([R.api('stats', { from: DASH.from, to: DASH.to }), R.api('kpis', { from: DASH.from, to: DASH.to })]);
      var s = res[0], k = res[1];
      $app.innerHTML = '<h1>ภาพรวมและตัวชี้วัด</h1>' + dashFilters() + kpiHtml(k) +
        '<div style="max-width:720px">' + R.statsHtml(s) + '</div>';
      bindDash();
    } catch (e) { R.toast(e.message, true); }
  }
  function dashFilters() {
    return '<div class="filters"><div><label class="f">ตั้งแต่วันที่</label><input type="date" id="dFrom" value="' + esc(DASH.from) + '"></div>' +
      '<div><label class="f">ถึงวันที่</label><input type="date" id="dTo" value="' + esc(DASH.to) + '"></div>' +
      '<div style="align-self:end"><button class="btn small" data-act="dash-go">แสดง</button></div></div>';
  }
  function bindDash() { /* ปุ่มใช้ data-act */ }
  H['dash-go'] = function () {
    DASH.from = document.getElementById('dFrom').value; DASH.to = document.getElementById('dTo').value; viewDash();
  };


  // ------------------------------------------------------------ ตัวชี้วัด + Risk Matrix
  var LV_COLOR = { red: '#d9363e', orange: '#f08a24', yellow: '#f2c230', green: '#3fae5a' };
  function levelOf(score) { return score >= 15 ? 'red' : score >= 10 ? 'orange' : score >= 5 ? 'yellow' : 'green'; }
  function kpiHtml(k) {
    var rows = k.kpis.map(function (x) {
      var mark = x.ok === null ? '<span class="muted">-</span>' : x.ok ? '<span class="badge" style="background:#3fae5a">ผ่าน</span>' : '<span class="badge" style="background:#d9363e">ไม่ผ่าน</span>';
      var v = x.value === null || x.value === undefined ? '-' : x.value + (x.unit === '%' ? '%' : '') + (x.extra !== undefined ? ' / ' + x.extra : '');
      return '<tr><td>' + x.id + '</td><td>' + esc(x.name) + '</td><td><b>' + esc(v) + '</b>' + (x.detail ? ' <span class="muted">(' + esc(x.detail) + ')</span>' : '') +
        '</td><td>' + esc(x.target) + '</td><td>' + mark + '</td></tr>';
    }).join('');
    var m = '<table class="t" style="width:auto;margin-top:8px"><tr><th></th>' + [1, 2, 3, 4, 5].map(function (c) { return '<th>ผลกระทบ ' + c + '</th>'; }).join('') + '</tr>' +
      [5, 4, 3, 2, 1].map(function (l) {
        return '<tr><th>โอกาส ' + l + '</th>' + [1, 2, 3, 4, 5].map(function (c) {
          var n = k.matrix[l + 'x' + c] || 0;
          return '<td style="background:' + LV_COLOR[levelOf(l * c)] + (n ? '' : '55') + ';color:#fff;text-align:center;font-weight:700;min-width:70px">' + (n || '') + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</table>';
    return '<h2>ตัวชี้วัดตามคู่มือ</h2><div style="overflow:auto"><table class="t"><thead><tr><th>#</th><th>ตัวชี้วัด</th><th>ค่า</th><th>เป้าหมาย</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="muted">ตัวชี้วัดข้อ 8 (มาตรฐานความปลอดภัย 9 ข้อ) ใช้ข้อมูลนอกระบบ จึงไม่รวม</p>' +
      '<h2>Risk Matrix (Risk Register ' + k.risk_total + ' รายการ' + (k.review_due ? ' · <span style="color:#d9363e">ถึงรอบทบทวน ' + k.review_due + '</span>' : '') + ')</h2>' + m;
  }

  // ------------------------------------------------------------ Risk Register
  var RK = { unit_id: '', list: [] };
  async function viewRisk() {
    $app.innerHTML = '<h1>Risk Register</h1><p class="muted">กำลังโหลด…</p>';
    try {
      var d = await R.api('listRisks', { unit_id: RK.unit_id });
      RK.list = d.risks;
      $app.innerHTML = '<h1>Risk Register</h1><div class="filters"><div><label class="f">หน่วยงาน</label><select id="rkUnit"><option value="">ทั้งหมด</option>' +
        S.conf.units.map(function (u) { return '<option value="' + esc(u.id) + '"' + (RK.unit_id === u.id ? ' selected' : '') + '>' + esc(u.name) + '</option>'; }).join('') + '</select></div>' +
        '<div style="align-self:end;display:flex;gap:8px"><button class="btn small secondary" data-act="rk-filter">กรอง</button><button class="btn small" data-act="rk-new">+ เพิ่มความเสี่ยง</button></div></div>' +
        '<div style="overflow:auto"><table class="t"><thead><tr><th>รหัส</th><th>ความเสี่ยง</th><th>หน่วย</th><th>คะแนน</th><th>ผู้รับผิดชอบ</th><th>ทบทวนล่าสุด</th><th>ครบรอบ</th></tr></thead><tbody>' +
        (d.risks.length ? d.risks.map(function (r) {
          return '<tr class="click" data-act="rk-open" data-arg="' + esc(r.id) + '"><td>' + esc(r.id) + '</td><td>' + esc(r.title) + '</td><td>' + esc(r.unit) +
            '</td><td><span class="badge" style="background:' + LV_COLOR[r.level_key] + '">' + r.score + ' · ' + esc(r.level) + '</span></td><td>' + esc(r.owner) +
            '</td><td>' + esc(r.last_review || '-') + '</td><td>' + (r.review_due ? '<b style="color:#d9363e">' + esc(r.next_review) + ' (ถึงรอบ)</b>' : esc(r.next_review)) + '</td></tr>';
        }).join('') : '<tr><td colspan="7" class="muted">ยังไม่มีรายการ</td></tr>') + '</tbody></table></div>';
    } catch (e) { R.toast(e.message, true); }
  }
  H['rk-filter'] = function () { RK.unit_id = document.getElementById('rkUnit').value; viewRisk(); };
  function numSel(id, val, label) {
    var o = [1, 2, 3, 4, 5].map(function (n) { return '<option' + (Number(val) === n ? ' selected' : '') + '>' + n + '</option>'; }).join('');
    return '<div><label class="f">' + label + ' (1-5)</label><select id="' + id + '">' + o + '</select></div>';
  }
  function txt(id, label, v) { return '<label class="f">' + label + '</label><textarea id="' + id + '" style="min-height:54px">' + esc(v || '') + '</textarea>'; }
  function riskForm(r) {
    r = r || { likelihood: 3, consequence: 3 };
    var h = '<div class="modal-bg"><div class="modal"><div class="row spread"><h2 style="margin:0">' + (r.id ? esc(r.id) : 'เพิ่มความเสี่ยง') + '</h2><button class="btn small secondary" data-act="close">ปิด</button></div>' +
      '<label class="f">หน่วยงาน</label><select id="rk_unit">' + S.conf.units.map(function (u) { return '<option value="' + esc(u.id) + '"' + (r.unit_id === u.id ? ' selected' : '') + '>' + esc(u.name) + '</option>'; }).join('') + '</select>' +
      '<label class="f">ชื่อความเสี่ยง</label><input type="text" id="rk_title" value="' + esc(r.title || '') + '">' +
      txt('rk_def', 'คำอธิบาย/นิยาม', r.definition) +
      '<div class="grid2">' + numSel('rk_L', r.likelihood, 'โอกาสเกิด') + numSel('rk_C', r.consequence, 'ความรุนแรง') + '</div>' +
      txt('rk_prev', 'มาตรการป้องกัน', r.prevention) + txt('rk_mon', 'การติดตามเฝ้าระวัง', r.monitor) +
      txt('rk_mit', 'มาตรการบรรเทา/ลดผลกระทบ', r.mitigation) + txt('rk_qi', 'แผนพัฒนาคุณภาพ (QI)', r.qi_plan) +
      '<label class="f">ผู้รับผิดชอบ (Risk owner)</label><input type="text" id="rk_owner" value="' + esc(r.owner || '') + '">' +
      '<div style="height:12px"></div><button class="btn" data-act="rk-save" data-arg="' + esc(r.id || '') + '">บันทึก</button>';
    if (r.id) {
      h += '<div class="card"><h3 style="margin-top:0">ทบทวนมาตรการ' + (r.review_due ? ' <span class="badge" style="background:#d9363e">ถึงรอบ</span>' : '') + '</h3>' +
        '<div class="muted">ล่าสุด: ' + esc(r.last_review || '-') + (r.result_of_review ? ' · ' + esc(r.result_of_review) : '') + ' · ครบรอบถัดไป ' + esc(r.next_review) + '</div>' +
        txt('rk_res', 'ผลการทบทวน', '') + '<div class="muted">ปรับโอกาส/ความรุนแรงด้านบนได้ ระบบคำนวณระดับและรอบทบทวนใหม่</div>' +
        '<button class="btn secondary" data-act="rk-review" data-arg="' + esc(r.id) + '">บันทึกการทบทวน</button></div>';
    }
    return h + '</div></div>';
  }
  H['rk-new'] = function () { document.getElementById('modal').innerHTML = riskForm(null); };
  H['rk-open'] = function (id) { document.getElementById('modal').innerHTML = riskForm(RK.list.filter(function (x) { return x.id === id; })[0]); };
  function v(id) { return document.getElementById(id).value.trim(); }
  H['rk-save'] = function (id, el) {
    guard(el, async function () {
      await R.api('saveRisk', { risk_id: id, unit_id: v('rk_unit'), title: v('rk_title'), definition: v('rk_def'), likelihood: v('rk_L'), consequence: v('rk_C'),
        prevention: v('rk_prev'), monitor: v('rk_mon'), mitigation: v('rk_mit'), qi_plan: v('rk_qi'), owner: v('rk_owner') });
      R.toast('บันทึกแล้ว'); H.close(); viewRisk();
    });
  };
  H['rk-review'] = function (id, el) {
    guard(el, async function () {
      await R.api('reviewRisk', { risk_id: id, result: v('rk_res'), likelihood: v('rk_L'), consequence: v('rk_C') });
      R.toast('บันทึกการทบทวนแล้ว'); H.close(); viewRisk();
    });
  };

  // ------------------------------------------------------------ ตั้งค่า (Admin): หน่วย/รหัส/ข้อความ/ค่า/Log
  var ST = { sub: 'units', data: null };
  var SUBS = [['units', 'หน่วยงาน'], ['catalog', 'รหัสเหตุการณ์'], ['quick', 'ข้อความสำเร็จรูป'], ['config', 'ค่าตั้งค่า'], ['logs', 'บันทึกระบบ']];
  async function viewSetup(keep) {
    if (!keep || !ST.data) {
      $app.innerHTML = '<h1>ตั้งค่า</h1><p class="muted">กำลังโหลด…</p>';
      try { ST.data = await R.api('adminData', {}); } catch (e) { R.toast(e.message, true); return; }
    }
    var nav = '<div class="chips">' + SUBS.map(function (s) { return '<button class="chip' + (ST.sub === s[0] ? ' on' : '') + '" data-act="st-sub" data-arg="' + s[0] + '">' + s[1] + '</button>'; }).join('') + '</div>';
    var body = { units: stUnits, catalog: stCatalog, quick: stQuick, config: stConfig, logs: stLogs }[ST.sub]();
    $app.innerHTML = '<h1>ตั้งค่า</h1>' + nav + body;
  }
  H['st-sub'] = function (s) { ST.sub = s; viewSetup(true); };
  function reloadSetup() { ST.data = null; return viewSetup(); }
  function gv(id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; }
  function gc(id) { var e = document.getElementById(id); return !!(e && e.checked); }

  function stUnits() {
    var row = function (u, i) {
      return '<tr><td>' + esc(u.id) + '</td><td><input type="text" id="un_n' + i + '" value="' + esc(u.name) + '"></td>' +
        '<td><input type="number" id="un_s' + i + '" value="' + u.sort + '" style="width:70px"></td>' +
        '<td><label><input type="checkbox" id="un_a' + i + '"' + (u.active ? ' checked' : '') + '> ใช้งาน</label></td>' +
        '<td><button class="btn small" data-act="un-save" data-arg="' + i + '">บันทึก</button></td></tr>';
    };
    return '<div class="notice">การปิดใช้งานหน่วยจะไม่ลบรายงานเดิม แต่จะไม่ให้เลือกเมื่อรายงานใหม่</div><div style="overflow:auto"><table class="t"><thead><tr><th>รหัส</th><th>ชื่อ</th><th>ลำดับ</th><th></th><th></th></tr></thead><tbody>' +
      ST.data.units.map(row).join('') +
      '<tr><td><input type="text" id="un_new_id" placeholder="รหัส (ไม่ใส่ก็ได้)" style="width:120px"></td><td><input type="text" id="un_new_n" placeholder="ชื่อหน่วยใหม่"></td><td></td><td></td><td><button class="btn small" data-act="un-add">+ เพิ่ม</button></td></tr></tbody></table></div>';
  }
  H['un-save'] = function (i, el) {
    var u = ST.data.units[Number(i)];
    guard(el, async function () {
      await R.api('saveUnit', { id: u.id, name: gv('un_n' + i), sort: gv('un_s' + i), active: gc('un_a' + i) });
      R.toast('บันทึกแล้ว'); reloadSetup();
    });
  };
  H['un-add'] = function (_, el) {
    guard(el, async function () {
      await R.api('saveUnit', { id: gv('un_new_id'), name: gv('un_new_n'), active: true, sort: ST.data.units.length + 1 });
      R.toast('เพิ่มแล้ว'); reloadSetup();
    });
  };

  function stCatalog() {
    return '<div class="row spread"><span class="muted">' + ST.data.catalog.length + ' รหัส (รหัสที่ไม่ใช้ให้ปิดใช้งาน อย่าลบ เพื่อคงสถิติเดิม)</span><button class="btn small" data-act="cat-new">+ เพิ่มรหัส</button></div>' +
      '<div style="overflow:auto"><table class="t"><thead><tr><th>รหัส</th><th>เรื่อง</th><th>การ์ด</th><th>ประเภท</th><th>เรื่องย่อย</th><th></th></tr></thead><tbody>' +
      ST.data.catalog.map(function (c, i) {
        return '<tr class="click" data-act="cat-open" data-arg="' + i + '"' + (c.active ? '' : ' style="opacity:.5"') + '><td>' + esc(c.code) + '</td><td>' + esc(c.name) + '</td><td>' + esc(c.card) +
          '</td><td>' + (c.severity_type === 'clinical' ? 'คลินิก' : 'ทั่วไป') + '</td><td>' + c.subtypes.length + '</td><td>' + (c.active ? '' : 'ปิด') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function catForm(c) {
    var isNew = !c; c = c || { code: '', card: ST.data.cards[0], name: '', severity_type: 'general', subtypes: [], sort: ST.data.catalog.length + 1, active: true };
    return '<div class="modal-bg"><div class="modal"><div class="row spread"><h2 style="margin:0">' + (isNew ? 'เพิ่มรหัสเหตุการณ์' : esc(c.code)) + '</h2><button class="btn small secondary" data-act="close">ปิด</button></div>' +
      '<label class="f">รหัส</label><input type="text" id="ct_code" value="' + esc(c.code) + '"' + (isNew ? '' : ' readonly') + '>' +
      '<label class="f">ชื่อเรื่อง</label><input type="text" id="ct_name" value="' + esc(c.name) + '">' +
      '<label class="f">การ์ดหมวด</label><select id="ct_card">' + ST.data.cards.concat(ST.data.cards.indexOf(c.card) < 0 ? [c.card] : []).map(function (x) { return '<option' + (x === c.card ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select>' +
      '<label class="f">ประเภทความรุนแรง</label><select id="ct_type"><option value="clinical"' + (c.severity_type === 'clinical' ? ' selected' : '') + '>ทางคลินิก (A-I)</option><option value="general"' + (c.severity_type === 'general' ? ' selected' : '') + '>ทั่วไป (1-5)</option></select>' +
      '<label class="f">เรื่องย่อย (บรรทัดละ 1 รายการ)</label><textarea id="ct_sub" style="min-height:110px">' + esc(c.subtypes.join('\n')) + '</textarea>' +
      '<div class="grid2"><div><label class="f">ลำดับ</label><input type="number" id="ct_sort" value="' + c.sort + '"></div><div style="align-self:end"><label><input type="checkbox" id="ct_act"' + (c.active ? ' checked' : '') + '> ใช้งาน</label></div></div>' +
      '<div style="height:12px"></div><button class="btn" data-act="cat-save">บันทึก</button></div></div>';
  }
  H['cat-new'] = function () { document.getElementById('modal').innerHTML = catForm(null); };
  H['cat-open'] = function (i) { document.getElementById('modal').innerHTML = catForm(ST.data.catalog[Number(i)]); };
  H['cat-save'] = function (_, el) {
    guard(el, async function () {
      await R.api('saveCatalog', { code: gv('ct_code'), name: gv('ct_name'), card: gv('ct_card'), severity_type: gv('ct_type'),
        subtypes: document.getElementById('ct_sub').value.split('\n'), sort: gv('ct_sort'), active: gc('ct_act') });
      R.toast('บันทึกแล้ว'); H.close(); reloadSetup();
    });
  };

  var QT = { scope: '', field: 'details' };
  function qtScopes() {
    var s = ST.data.cards.slice();
    ST.data.quick.forEach(function (q) { if (s.indexOf(q.scope) < 0) s.push(q.scope); });
    return s;
  }
  function qtLines() {
    return ST.data.quick.filter(function (q) { return q.scope === QT.scope && q.field === QT.field; })
      .sort(function (a, b) { return a.sort - b.sort; }).map(function (q) { return q.text; });
  }
  function stQuick() {
    var scopes = qtScopes(); if (!QT.scope) QT.scope = scopes[0];
    return '<div class="notice">ข้อความที่ผู้ใช้แตะเลือกในขั้นตอนรายงาน แยกตามหมวดการ์ดและช่อง</div><div class="filters">' +
      '<div><label class="f">หมวด</label><select id="qt_scope">' + scopes.map(function (x) { return '<option' + (x === QT.scope ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select></div>' +
      '<div><label class="f">ช่อง</label><select id="qt_field"><option value="details"' + (QT.field === 'details' ? ' selected' : '') + '>รายละเอียดเหตุการณ์</option><option value="action"' + (QT.field === 'action' ? ' selected' : '') + '>การจัดการเบื้องต้น</option></select></div>' +
      '<div style="align-self:end"><button class="btn small secondary" data-act="qt-load">แสดง</button></div></div>' +
      '<label class="f">บรรทัดละ 1 ข้อความ</label><textarea id="qt_text" style="min-height:240px">' + esc(qtLines().join('\n')) + '</textarea>' +
      '<div style="height:10px"></div><button class="btn small" data-act="qt-save">บันทึก</button>';
  }
  H['qt-load'] = function () { QT.scope = gv('qt_scope'); QT.field = gv('qt_field'); viewSetup(true); };
  H['qt-save'] = function (_, el) {
    guard(el, async function () {
      QT.scope = gv('qt_scope'); QT.field = gv('qt_field');
      await R.api('saveQuickText', { scope: QT.scope, field: QT.field, texts: document.getElementById('qt_text').value.split('\n') });
      R.toast('บันทึกแล้ว'); await reloadSetup();
    });
  };

  var CFG_LABEL = { hospital_id: 'รหัส รพ. (ใช้ในเลขที่รายงาน)', hospital_name: 'ชื่อ รพ.', office_start: 'เริ่มเวลาราชการ (HH:MM)', office_end: 'สิ้นสุดเวลาราชการ',
    shift_morning_start: 'เริ่มเวรเช้า', shift_afternoon_start: 'เริ่มเวรบ่าย', shift_night_start: 'เริ่มเวรดึก',
    kpi_near_miss: 'เป้า Near miss (%)', kpi_units_report: 'เป้าหน่วยที่รายงาน (%)', kpi_units_register: 'เป้าหน่วยที่มี Risk Register (%)', kpi_rca: 'เป้าทำ RCA (%)', kpi_repeat: 'เพดานเหตุรุนแรงซ้ำ (%)' };
  function stConfig() {
    return '<div class="notice">เปลี่ยนรหัส รพ. จะมีผลกับเลขที่รายงานใหม่เท่านั้น</div><div style="overflow:auto"><table class="t"><tbody>' + ST.data.config.map(function (c, i) {
      return '<tr><td>' + esc(CFG_LABEL[c.key] || c.key) + '<br><span class="muted">' + esc(c.key) + '</span></td><td><input type="text" id="cf_' + i + '" value="' + esc(c.value) + '"></td>' +
        '<td><button class="btn small" data-act="cf-save" data-arg="' + i + '">บันทึก</button></td></tr>';
    }).join('') + '</tbody></table></div>';
  }
  H['cf-save'] = function (i, el) {
    guard(el, async function () {
      await R.api('saveConfig', { key: ST.data.config[Number(i)].key, value: gv('cf_' + i) });
      R.toast('บันทึกแล้ว'); reloadSetup();
    });
  };
  function stLogs() {
    return '<p class="muted">150 รายการล่าสุด (รวมการเปิดดูชื่อผู้ป่วยและการเปิดเผยผู้รายงานนิรนาม)</p><div style="overflow:auto"><table class="t"><thead><tr><th>เวลา</th><th>ประเภท</th><th>ผู้ทำ</th><th>การกระทำ</th><th>เป้าหมาย</th><th>รายละเอียด</th></tr></thead><tbody>' +
      ST.data.logs.map(function (l) { return '<tr><td>' + esc(l.time) + '</td><td>' + esc(l.type) + '</td><td>' + esc(l.user) + '</td><td>' + esc(l.action) + '</td><td>' + esc(l.target) + '</td><td>' + esc(l.detail) + '</td></tr>'; }).join('') + '</tbody></table></div>';
  }

  // ------------------------------------------------------------ รายงานทั้งหมด
  var F = { from: '', to: '', unit_id: '', status: '', group: '', q: '' };
  async function viewInc() {
    $app.innerHTML = '<h1>รายงานทั้งหมด</h1>' + incFilters() + '<div id="incList"><p class="muted">กำลังโหลด…</p></div>';
    await loadInc();
  }
  function incFilters() {
    return '<div class="filters">' +
      '<div><label class="f">ตั้งแต่</label><input type="date" id="fFrom" value="' + esc(F.from) + '"></div>' +
      '<div><label class="f">ถึง</label><input type="date" id="fTo" value="' + esc(F.to) + '"></div>' +
      '<div><label class="f">หน่วยงาน</label><select id="fUnit"><option value="">ทั้งหมด</option>' +
      S.conf.units.map(function (u) { return '<option value="' + esc(u.id) + '"' + (F.unit_id === u.id ? ' selected' : '') + '>' + esc(u.name) + '</option>'; }).join('') + '</select></div>' +
      '<div><label class="f">สถานะ</label><select id="fStatus"><option value="">ทั้งหมด</option>' +
      STATUSES.map(function (s) { return '<option' + (F.status === s ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select></div>' +
      '<div><label class="f">ความรุนแรง</label><select id="fGroup"><option value="">ทั้งหมด</option>' +
      [1, 2, 3, 4, 5].map(function (g) { return '<option value="' + g + '"' + (String(F.group) === String(g) ? ' selected' : '') + '>' + g + ' · ' + esc(R.GROUP_LABEL[g]) + '</option>'; }).join('') + '</select></div>' +
      '<div><label class="f">ค้นหา</label><input type="search" id="fQ" value="' + esc(F.q) + '" placeholder="เลขที่/รหัส/ชื่อเรื่อง"></div>' +
      '<div style="align-self:end;display:flex;gap:8px"><button class="btn small" data-act="inc-go">ค้นหา</button>' +
      '<button class="btn small secondary" data-act="inc-csv">ส่งออก CSV</button></div></div>';
  }
  H['inc-go'] = function () {
    F.from = document.getElementById('fFrom').value; F.to = document.getElementById('fTo').value;
    F.unit_id = document.getElementById('fUnit').value; F.status = document.getElementById('fStatus').value;
    F.group = document.getElementById('fGroup').value; F.q = document.getElementById('fQ').value;
    loadInc();
  };
  async function loadInc() {
    var box = document.getElementById('incList');
    try {
      var d = await R.api('listIncidents', F);
      S.list = d.incidents;
      box.innerHTML = '<p class="muted">พบ ' + d.total + ' รายการ' + (d.total > d.incidents.length ? ' (แสดง ' + d.incidents.length + ' รายการล่าสุด)' : '') + '</p>' +
        '<div style="overflow:auto"><table class="t"><thead><tr><th>เลขที่</th><th>เกิดเมื่อ</th><th>หน่วย</th><th>เรื่อง</th><th>ระดับ</th><th>สถานะ</th><th>กำหนดแก้ไข</th></tr></thead><tbody>' +
        d.incidents.map(function (r) {
          return '<tr class="click" data-act="inc-open" data-arg="' + esc(r.id) + '"><td>' + esc(r.id) + '</td><td>' + esc(R.thaiDateTime(r.event_datetime)) +
            '</td><td>' + esc(r.unit) + '</td><td>' + esc(r.name) + (r.subtype ? '<br><span class="muted">' + esc(r.subtype) + '</span>' : '') +
            '</td><td>' + R.sevBadge(r) + (r.is_sentinel ? '<span class="badge" style="background:#7a1020">Sentinel</span>' : '') + '</td><td>' + R.badge(r.status) +
            '</td><td>' + esc(r.due_action_date || '-') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    } catch (e) { R.toast(e.message, true); }
  }
  H['inc-csv'] = function () {
    var head = ['เลขที่', 'เกิดเมื่อ', 'หน่วย', 'รหัส', 'เรื่อง', 'เรื่องย่อย', 'ระดับ', 'กลุ่มความรุนแรง', 'สถานะ', 'ช่วงเวลา', 'เวร', 'Sentinel', 'กำหนดแก้ไข'];
    var rows = S.list.map(function (r) {
      return [r.id, r.event_datetime, r.unit, r.code, r.name, r.subtype, r.severity_code, r.severity_group, r.status, r.office_hours, r.shift, r.is_sentinel ? 'ใช่' : '', r.due_action_date];
    });
    var csv = [head].concat(rows).map(function (r) {
      return r.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\r\n');
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'incidents.csv'; a.click();
  };

  // รายละเอียด (modal)
  H['inc-open'] = async function (id) {
    try {
      var inc = (await R.api('incidentDetail', { incident_id: id })).incident;
      var p = inc.patient;
      var rows = [
        ['เลขที่', inc.id], ['เหตุการณ์', inc.name + (inc.subtype ? ' · ' + inc.subtype : '')],
        ['เกิดเมื่อ', R.thaiDateTime(inc.event_datetime) + ' (' + inc.office_hours + ', ' + inc.shift + ')'],
        ['ค้นพบเมื่อ', R.thaiDateTime(inc.discovered_date)], ['หน่วยงาน', inc.unit],
        ['ผู้รายงาน', inc.reporter], ['รายละเอียด', inc.details || '-'], ['จัดการเบื้องต้น', inc.first_action || '-']
      ];
      if (p) rows.push(['ผู้ป่วย', 'HN ' + (p.hn || '-') + (p.an ? ' · AN ' + p.an : '') + (p.full_name ? ' · ' + p.full_name : '') +
        (p.sex ? ' · ' + p.sex : '') + (p.age !== '' ? ' · ' + p.age + ' ปี' : '')]);
      if (inc.confirmed_by) rows.push(['ผู้พิจารณา', inc.confirmed_by + ' · ' + R.thaiDateTime(inc.confirmed_at)]);
      if (inc.assigned_unit_id) rows.push(['หน่วยที่แก้ไข', unitName(inc.assigned_unit_id)]);
      if (inc.reject_reason) rows.push(['เหตุผลที่ไม่ใช่ความเสี่ยง', inc.reject_reason]);
      var html = '<div class="modal-bg"><div class="modal"><div class="row spread"><h2 style="margin:0">รายละเอียดรายงาน</h2>' +
        '<button class="btn small secondary" data-act="close">ปิด</button></div>' +
        '<div style="margin-top:8px">' + R.badge(inc.status) + R.sevBadge(inc) + '</div>' +
        '<div class="card"><dl class="kv">' + rows.map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('') + '</dl></div>' +
        '<div id="revealOut"></div><div class="row">';
      if (S.me.user.role === 'admin' && inc.reporter.indexOf('ไม่ระบุชื่อ') === 0) {
        html += '<button class="btn small secondary" data-act="reveal" data-arg="' + esc(inc.id) + '">ดูตัวตนผู้รายงาน (บันทึก Log)</button>';
      }
      if (inc.can_decide) {
        html += '<button class="btn small" data-act="confirm" data-arg="' + esc(inc.id) + '">ยืนยันเป็นอุบัติการณ์</button>' +
          '<button class="btn small danger" data-act="reject" data-arg="' + esc(inc.id) + '">ไม่ใช่ความเสี่ยง</button>';
      }
      html += '</div>' + R.workHtml(inc) + '</div></div>';
      document.getElementById('modal').innerHTML = html;
    } catch (e) { R.toast(e.message, true); }
  };
  R.bindWork(H, guard, function (id) { H['inc-open'](id); if (S.tab === 'inc') loadInc(); });
  H.close = function () { document.getElementById('modal').innerHTML = ''; };
  H.reveal = function (id, el) {
    if (!confirm('การเปิดดูตัวตนผู้รายงานนิรนามจะถูกบันทึกลง Audit_Log ต้องการดำเนินการต่อหรือไม่?')) return;
    guard(el, async function () {
      var r = await R.api('revealReporter', { incident_id: id });
      document.getElementById('revealOut').innerHTML = '<div class="notice">ผู้รายงาน: <b>' + esc(r.name) + '</b>' + (r.position ? ' (' + esc(r.position) + ')' : '') + '</div>';
    });
  };
  H.confirm = function (id, el) {
    guard(el, async function () {
      await R.api('decideIncident', { incident_id: id, decision: 'confirm' });
      R.toast('ยืนยันแล้ว'); H.close(); if (S.tab === 'inc') loadInc();
    });
  };
  H.reject = function (id, el) {
    var reason = prompt('เหตุผลที่ไม่ใช่ความเสี่ยง');
    if (!reason) return;
    guard(el, async function () {
      await R.api('decideIncident', { incident_id: id, decision: 'reject', reason: reason });
      R.toast('บันทึกแล้ว'); H.close(); if (S.tab === 'inc') loadInc();
    });
  };

  // ------------------------------------------------------------ ผู้ใช้
  async function viewUsers() {
    $app.innerHTML = '<h1>ผู้ใช้</h1><p class="muted">กำลังโหลด…</p>';
    try {
      var d = await R.api('listUsers', {});
      var pending = d.users.filter(function (u) { return u.status === 'pending'; }).length;
      $app.innerHTML = '<h1>ผู้ใช้</h1>' + (pending ? '<div class="notice">มี ' + pending + ' คนรออนุมัติ</div>' : '') +
        '<div style="overflow:auto"><table class="t"><thead><tr><th>ชื่อ</th><th>ตำแหน่ง</th><th>สถานะ</th><th>บทบาท</th><th>หน่วยงาน</th><th>OA</th><th></th></tr></thead><tbody>' +
        d.users.map(function (u) { return userRow(u, d.units); }).join('') + '</tbody></table></div>';
    } catch (e) { R.toast(e.message, true); }
  }
  function userRow(u, units) {
    var roleSel = '<select id="r_' + esc(u.id) + '">' + ['staff', 'head', 'committee', 'admin'].map(function (r) {
      return '<option value="' + r + '"' + (u.role === r ? ' selected' : '') + '>' + ROLE_TEXT[r] + '</option>';
    }).join('') + '</select>';
    var unitBoxes = units.map(function (x) {
      return '<label style="display:inline-block;margin-right:8px;white-space:nowrap"><input type="checkbox" class="u_' + esc(u.id) + '" value="' + esc(x.id) + '"' +
        (u.unit_ids.indexOf(x.id) >= 0 ? ' checked' : '') + '> ' + esc(x.name) + '</label>';
    }).join('');
    var actions = u.status === 'pending' ?
      '<button class="btn small" data-act="user-approve" data-arg="' + esc(u.id) + '">อนุมัติ</button> <button class="btn small danger" data-act="user-reject" data-arg="' + esc(u.id) + '">ปฏิเสธ</button>' :
      '<button class="btn small secondary" data-act="user-save" data-arg="' + esc(u.id) + '">บันทึก</button> ' +
      (u.status === 'active' ? '<button class="btn small danger" data-act="user-disable" data-arg="' + esc(u.id) + '">ปิด</button>' :
        '<button class="btn small" data-act="user-enable" data-arg="' + esc(u.id) + '">เปิด</button>');
    return '<tr><td><b>' + esc(u.name) + '</b><br><span class="muted">' + esc(u.display_name) + '</span></td><td>' + esc(u.position) + '</td><td>' + esc(u.status) +
      '</td><td>' + roleSel + '</td><td>' + unitBoxes + '</td><td>' + (u.friend === '1' ? 'เพื่อน' : u.friend === '0' ? 'ยังไม่เป็นเพื่อน' : '-') + '</td><td>' + actions + '</td></tr>';
  }
  function collect(id) {
    var units = Array.prototype.map.call(document.querySelectorAll('input.u_' + CSS.escape(id) + ':checked'), function (c) { return c.value; });
    return { user_id: id, role: document.getElementById('r_' + id).value, unit_ids: units };
  }
  function review(action) {
    return function (id, el) {
      guard(el, async function () {
        var p = collect(id); p.action = action;
        await R.api('reviewUser', p);
        R.toast('บันทึกแล้ว'); viewUsers();
      });
    };
  }
  H['user-approve'] = review('approve');
  H['user-save'] = review('update');
  H['user-reject'] = review('reject');
  H['user-disable'] = review('disable');
  H['user-enable'] = review('enable');
})();
