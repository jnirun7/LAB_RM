// ฟังก์ชันที่ใช้ร่วมกันระหว่างหน้า LIFF (index.html) และหน้า Admin (admin.html)
window.RM = (function () {
  const cfg = window.APP_CONFIG || {};

  const SEV = {
    clinical: [
      { group: 1, label: 'เกือบพลาด', desc: 'พบและแก้ไขได้ก่อนถึงผู้ป่วย/ผู้อื่น',
        letters: [{ code: 'A', label: 'พบและแก้ไขเองได้ทันที' }, { code: 'B', label: 'ส่งต่อให้ผู้อื่น แต่ตรวจพบและแก้ไขได้' }] },
      { group: 2, label: 'น้อย', desc: 'ถึงผู้ป่วยหรือบุคลากร แต่ไม่เกิดอันตราย',
        letters: [{ code: 'C', label: 'ถึงผู้ป่วย/บุคลากร ไม่เกิดอันตราย' }, { code: 'D', label: 'ต้องเฝ้าระวังเป็นพิเศษ' }] },
      { group: 3, label: 'ปานกลาง', desc: 'เกิดอันตรายชั่วคราว ต้องรักษาหรือแก้ไขเพิ่ม',
        letters: [{ code: 'E', label: 'อันตรายชั่วคราว ต้องแก้ไข/รักษาเพิ่ม' }, { code: 'F', label: 'ต้องรักษา/นอนโรงพยาบาลนานขึ้น' }] },
      { group: 4, label: 'มาก', desc: 'พิการถาวร ต้องช่วยชีวิต หรือกระทบชื่อเสียง/ถูกร้องเรียน',
        letters: [{ code: 'G', label: 'พิการถาวร / เสียชื่อเสียง / ถูกร้องเรียน' }, { code: 'H', label: 'ต้องช่วยชีวิต / เรียกร้องค่าเสียหาย' }] },
      { group: 5, label: 'มากที่สุด', desc: 'เสียชีวิต หรือถูกฟ้องร้อง',
        letters: [{ code: 'I', label: 'เสียชีวิต / ถูกฟ้องร้อง' }] }
    ],
    general: [
      { group: 1, label: 'เกือบพลาด', desc: 'ยังไม่เสียหาย หรือเสียหายไม่เกิน 5,000 บาท' },
      { group: 2, label: 'น้อย', desc: 'ควบคุมได้ เสียหาย 5,001-10,000 บาท' },
      { group: 3, label: 'ปานกลาง', desc: 'ต้องแก้ไข เสียหาย 10,001-50,000 บาท' },
      { group: 4, label: 'มาก', desc: 'งานไม่บรรลุเป้าหมาย เสียหาย 50,001-100,000 บาท' },
      { group: 5, label: 'มากที่สุด', desc: 'กระทบภารกิจร้ายแรง เสียหายเกิน 100,000 บาท' }
    ]
  };

  const GROUP_LABEL = { 1: 'เกือบพลาด', 2: 'น้อย', 3: 'ปานกลาง', 4: 'มาก', 5: 'มากที่สุด' };
  const GROUP_COLOR = { 1: '#2e9e5b', 2: '#8bc34a', 3: '#f5a623', 4: '#f06b2a', 5: '#d9363e' };
  const STATUS_COLOR = {
    'รอยืนยัน': '#f5a623', 'รอแก้ไข': '#3b82f6', 'กำลังแก้ไข': '#6366f1', 'รอปิดเคส': '#8b5cf6',
    'ปิดเคส': '#2e9e5b', 'ไม่ใช่ความเสี่ยง': '#8a8f98'
  };

  const SENTINEL_LIST = [
    'ผู้ป่วยตกเตียง/พลัดตกหกล้มจนบาดเจ็บรุนแรง', 'ผู้ป่วยฆ่าตัวตาย/พยายามฆ่าตัวตาย',
    'ลักทรัพย์/ทรัพย์สินสูญหาย/กรรโชกทรัพย์', 'ไฟไหม้ ไฟฟ้าช็อต ทำให้เสียหายหรือบาดเจ็บ',
    'เจ้าหน้าที่เกิดอุบัติเหตุจนอาจพิการ/เสียชีวิต', 'อุบัติเหตุของยานพาหนะโรงพยาบาล',
    'ผู้ป่วยหรือเจ้าหน้าที่ถูกข่มขู่ ทำร้าย ทะเลาะวิวาท', 'ผู้ป่วยหนีออกจากโรงพยาบาลและติดต่อไม่ได้',
    'คอมพิวเตอร์แม่ข่ายล่มโดยไม่ทราบสาเหตุเกิน 30 นาที', 'ไฟฟ้าดับและแก้ไขไม่ได้เกิน 1 ชั่วโมง',
    'ความผิดพลาดที่อาจนำไปสู่การฟ้องร้อง/เสื่อมเสียชื่อเสียง'
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function relogin() {
    try { liff.logout(); } catch (e) { /* ignore */ }
    liff.login({ redirectUri: location.href });
  }

  async function initLiff() {
    await liff.init({ liffId: cfg.LIFF_ID });
    if (!liff.isLoggedIn()) { liff.login({ redirectUri: location.href }); return false; }
    return true;
  }

  async function api(action, payload) {
    const idToken = liff.getIDToken();
    if (!idToken) { relogin(); throw new Error('กำลังเข้าสู่ระบบใหม่'); }
    const res = await fetch(cfg.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, idToken: idToken, payload: payload || {} })
    });
    const j = await res.json();
    if (!j.ok) {
      if (j.code === 'AUTH') relogin();
      const e = new Error(j.error || 'เกิดข้อผิดพลาด');
      e.code = j.code;
      throw e;
    }
    return j.data;
  }

  let toastTimer;
  function toast(msg, bad) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.className = 'show' + (bad ? ' bad' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = ''; }, 3200);
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function bkkNow() {
    const d = new Date();
    return {
      date: d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }),
      time: d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false })
    };
  }

  // เสนอ "ในเวลา/นอกเวลาราชการ" จากวันและเวลา (ไม่รวมวันหยุดราชการ) ผู้ใช้แก้ได้
  function suggestOffice(date, time, office) {
    const dow = new Date(date + 'T12:00:00+07:00').getUTCDay();
    const start = (office && office.start) || '08:30', end = (office && office.end) || '16:30';
    const inHours = dow >= 1 && dow <= 5 && time >= start && time <= end;
    return inHours ? 'ในเวลาราชการ' : 'นอกเวลาราชการ';
  }

  function shiftOf(time) {
    const h = parseInt(time.slice(0, 2), 10);
    return h >= 8 && h < 16 ? 'เวรเช้า' : h >= 16 ? 'เวรบ่าย' : 'เวรดึก';
  }

  function thaiDateTime(s) {
    if (!s) return '-';
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(s);
    if (!m) return s;
    return Number(m[3]) + '/' + Number(m[2]) + '/' + (Number(m[1]) + 543) + (m[4] ? ' ' + m[4] + ':' + m[5] + ' น.' : '');
  }

  function sevText(r) {
    return r.severity_type === 'clinical' ? 'ระดับ ' + r.severity_code : 'ระดับ ' + r.severity_code + ' (ทั่วไป)';
  }

  function badge(status) {
    return '<span class="badge" style="background:' + (STATUS_COLOR[status] || '#8a8f98') + '">' + esc(status) + '</span>';
  }

  function sevBadge(r) {
    return '<span class="badge" style="background:' + (GROUP_COLOR[r.severity_group] || '#888') + '">' +
      esc(sevText(r)) + ' · ' + esc(GROUP_LABEL[r.severity_group] || '') + '</span>';
  }

  function bars(rows, labelFn, color) {
    const max = Math.max.apply(null, rows.map(function (r) { return r.n; }).concat([1]));
    if (!rows.length) return '<p class="muted">ยังไม่มีข้อมูล</p>';
    return rows.map(function (r) {
      return '<div class="bar-row"><div class="bar-label">' + esc(labelFn ? labelFn(r.k) : r.k) + '</div>' +
        '<div class="bar-track"><div class="bar-fill" style="width:' + Math.max(4, Math.round(r.n * 100 / max)) + '%;background:' + (color || '#06c755') + '"></div></div>' +
        '<div class="bar-n">' + r.n + '</div></div>';
    }).join('');
  }

  function statsHtml(s) {
    return '<div class="kpis">' +
      '<div class="kpi"><b>' + s.total + '</b><span>รายงานทั้งหมด</span></div>' +
      '<div class="kpi"><b>' + s.near_miss_pct + '%</b><span>Near miss (เป้า ≥ 60%)</span></div>' +
      '<div class="kpi"><b>' + s.sentinel + '</b><span>Sentinel event</span></div>' +
      '<div class="kpi"><b>' + s.overdue + '</b><span>เกินกำหนดแก้ไข</span></div>' +
      '<div class="kpi"><b>' + (s.closed || 0) + '</b><span>ปิดเคสแล้ว</span></div>' +
      '<div class="kpi"><b>' + (s.avg_close_days || 0) + '</b><span>วันเฉลี่ยจนปิดเคส</span></div></div>' +
      '<h3>แยกตามระดับความรุนแรง</h3>' + bars(s.by_group, function (k) { return GROUP_LABEL[k] || k; }) +
      '<h3>รายเดือน</h3>' + bars(s.by_month) +
      '<h3>แยกตามหน่วยงาน</h3>' + bars(s.by_unit) +
      '<h3>แยกตามประเภท</h3>' + bars(s.by_card) +
      '<h3>สถานะ</h3>' + bars(s.by_status) +
      '<h3>ในเวลา/นอกเวลาราชการ</h3>' + bars(s.by_office) +
      '<h3>เวร</h3>' + bars(s.by_shift) +
      (s.rejected ? '<p class="muted">ไม่นับ ' + s.rejected + ' เรื่องที่ถูกระบุว่าไม่ใช่ความเสี่ยง</p>' : '');
  }


  // ---- กลุ่มหน่วยงาน: ตัวเลือกหน่วยแบบเลือกกลุ่มก่อน
  var UNIT_GROUPS = ['Lab', 'หอผู้ป่วยใน', 'ผู้ป่วยนอก', 'สนับสนุนอื่นๆ'];
  var PK = {}, PKG = {};
  function groupsOf(units) {
    var g = UNIT_GROUPS.filter(function (x) { return units.some(function (u) { return (u.group || 'Lab') === x; }); });
    units.forEach(function (u) { var x = u.group || 'Lab'; if (g.indexOf(x) < 0) g.push(x); });
    return g;
  }
  function pickerInner(key) {
    var o = PK[key], units = o.units(), sel = o.selected(), ex = o.exclude ? o.exclude() : '';
    var gs = groupsOf(units), cur = PKG[key];
    if (gs.indexOf(cur) < 0) {
      var first = units.filter(function (u) { return sel.indexOf(u.id) >= 0; })[0];
      cur = PKG[key] = first ? (first.group || 'Lab') : (gs.length === 1 ? gs[0] : '');
    }
    var gchips = gs.length > 1 ? '<div class="muted" style="margin-top:4px">1) เลือกกลุ่มงาน</div><div class="chips">' + gs.map(function (g) {
      var n = units.filter(function (u) { return (u.group || 'Lab') === g && sel.indexOf(u.id) >= 0; }).length;
      return '<button class="chip' + (g === cur ? ' on' : '') + '" data-act="pk-g" data-arg="' + esc(key + '|' + g) + '">' + esc(g) + (n ? ' (' + n + ')' : '') + '</button>';
    }).join('') + '</div>' : '';
    if (!cur) return gchips + '<div class="muted">เลือกกลุ่มงานก่อน แล้วจะแสดงหน่วยงานในกลุ่มนั้น</div>';
    var uchips = (gs.length > 1 ? '<div class="muted">2) เลือกหน่วยงานในกลุ่ม ' + esc(cur) + '</div>' : '') + '<div class="chips">' + units.filter(function (u) { return (u.group || 'Lab') === cur && u.id !== ex; }).map(function (u) {
      return '<button class="chip' + (sel.indexOf(u.id) >= 0 ? ' on' : '') + '" data-act="pk-u" data-arg="' + esc(key + '|' + u.id) + '">' + esc(u.name) + '</button>';
    }).join('') + '</div>';
    var other = o.multi ? units.filter(function (u) { return sel.indexOf(u.id) >= 0 && (u.group || 'Lab') !== cur; }) : [];
    var sum = other.length ? '<div class="muted">เลือกไว้ในกลุ่มอื่น: ' + other.map(function (u) { return esc(u.name); }).join(', ') + '</div>' : '';
    return gchips + uchips + sum;
  }
  /** o: { units():[], selected():[id], toggle(id), exclude?():id, multi?, after?() } */
  function unitPicker(key, o) {
    PK[key] = o;
    if (!PKG[key]) {
      var s = o.selected()[0], u = o.units().filter(function (x) { return x.id === s; })[0];
      PKG[key] = u ? (u.group || 'Lab') : '';
    }
    return '<div id="pk_' + key + '">' + pickerInner(key) + '</div>';
  }
  function refreshPicker(key) { var b = document.getElementById('pk_' + key); if (b && PK[key]) b.innerHTML = pickerInner(key); }
  function bindPickers(H) {
    H['pk-g'] = function (arg) { var i = arg.indexOf('|'); PKG[arg.slice(0, i)] = arg.slice(i + 1); refreshPicker(arg.slice(0, i)); };
    H['pk-u'] = function (arg) {
      var i = arg.indexOf('|'), key = arg.slice(0, i); PK[key].toggle(arg.slice(i + 1));
      refreshPicker(key); if (PK[key].after) PK[key].after();
    };
  }
  var SEL2 = {};
  function unitOpts2(id, group, selected) {
    var o = SEL2[id], units = o.units.filter(function (u) { return (u.group || 'Lab') === group; });
    var first = group ? (o.all !== undefined ? '<option value="">ทุกหน่วยในกลุ่ม</option>' : '<option value="">— เลือกหน่วย —</option>') : (o.all !== undefined ? '<option value="">' + esc(o.all) + '</option>' : '<option value="">— เลือกกลุ่มก่อน —</option>');
    return first + units.map(function (u) { return '<option value="' + esc(u.id) + '"' + (u.id === selected ? ' selected' : '') + '>' + esc(u.name) + '</option>'; }).join('');
  }
  /** เลือกกลุ่มงานก่อน แล้วค่อยเลือกหน่วยในกลุ่ม (หน้า Admin) — ค่าหน่วยอ่านจาก #id */
  function unitSelect2(id, units, selected, allLabel) {
    SEL2[id] = { units: units, all: allLabel };
    var cur = (units.filter(function (u) { return u.id === selected; })[0] || {}).group || '';
    var gs = groupsOf(units);
    return '<div class="grid2"><select id="' + id + '_g" data-ug="' + id + '"><option value="">' + (allLabel !== undefined ? 'ทุกกลุ่ม' : '— เลือกกลุ่มงาน —') + '</option>' +
      gs.map(function (g) { return '<option' + (g === cur ? ' selected' : '') + '>' + esc(g) + '</option>'; }).join('') + '</select>' +
      '<select id="' + id + '">' + unitOpts2(id, cur, selected) + '</select></div>';
  }
  document.addEventListener('change', function (e) {
    var id = e.target && e.target.dataset && e.target.dataset.ug;
    if (!id || !SEL2[id]) return;
    var sel = document.getElementById(id);
    if (sel) sel.innerHTML = unitOpts2(id, e.target.value, '');
  });
  /** <option> แบ่งกลุ่มด้วย optgroup (หน้า Admin) */
  function unitOptions(units, selected, allLabel) {
    var h = allLabel !== undefined ? '<option value="">' + esc(allLabel) + '</option>' : '';
    groupsOf(units).forEach(function (g) {
      h += '<optgroup label="' + esc(g) + '">' + units.filter(function (u) { return (u.group || 'Lab') === g; }).map(function (u) {
        return '<option value="' + esc(u.id) + '"' + (selected === u.id ? ' selected' : '') + '>' + esc(u.name) + '</option>';
      }).join('') + '</optgroup>';
    });
    return h;
  }

  // ---- Phase 2: ส่วนแก้ไข / RCA / ปิดเคส (ใช้ร่วมกันทั้งสองหน้า)
  var ACTION_LEVELS = ['แก้ไขเฉพาะหน้า', 'แก้ไขเชิงระบบ', 'ป้องกันไม่ให้เกิดซ้ำ'];
  var RCA_FACTORS = ['คน/ทักษะ', 'ขั้นตอน/วิธีปฏิบัติ', 'เครื่องมือ/น้ำยา', 'สิ่งแวดล้อม', 'ระบบ IT', 'การสื่อสาร', 'นโยบาย/ภาระงาน'];
  function ta(id, ph, val, rows) {
    return '<textarea id="' + id + '" placeholder="' + esc(ph) + '" style="min-height:' + (rows || 64) + 'px">' + esc(val || '') + '</textarea>';
  }
  function workHtml(inc, unitName) {
    unitName = unitName || function (x) { return x; };
    var h = '';
    if (inc.actions && inc.actions.length) {
      h += '<h3>การแก้ไขที่ดำเนินการ (' + inc.actions.length + ')</h3>' + inc.actions.map(function (a) {
        return '<div class="card"><div><span class="badge" style="background:#3e7bd6">' + esc(a.level) + '</span>' +
          (a.improved_system === '1' ? '<span class="badge" style="background:#05a647">ปรับปรุงระบบ</span>' : '') + '</div>' +
          '<div style="margin-top:4px">' + esc(a.summary) + '</div>' +
          (a.result ? '<div class="muted">ผล: ' + esc(a.result) + '</div>' : '') +
          (a.contact ? '<div class="muted">ประสาน/ผู้รับเรื่อง: ' + esc(a.contact) + '</div>' : '') +
          '<div class="muted">' + esc(a.actor) + ' · ' + esc(a.started_at) + '</div></div>';
      }).join('');
    }
    if (inc.rca) {
      var r = inc.rca;
      h += '<h3>RCA</h3><div class="card"><dl class="kv"><dt>สาเหตุ</dt><dd>' + esc(r.summary) + '</dd>' +
        (r.factors ? '<dt>ปัจจัย</dt><dd>' + esc(r.factors) + '</dd>' : '') +
        (r.participants ? '<dt>ผู้ร่วมทำ</dt><dd>' + esc(r.participants) + '</dd>' : '') +
        (r.short_term_plan ? '<dt>แผนระยะสั้น</dt><dd>' + esc(r.short_term_plan) + '</dd>' : '') +
        (r.long_term_plan ? '<dt>แผนระยะยาว</dt><dd>' + esc(r.long_term_plan) + '</dd>' : '') +
        (r.owner ? '<dt>ผู้รับผิดชอบ</dt><dd>' + esc(r.owner) + (r.due_date ? ' · ครบ ' + esc(r.due_date) : '') + '</dd>' : '') +
        '</dl></div>';
    }
    if (inc.can_fix) {
      var rc = inc.rca || {}, have = (rc.factors || '').split(', ');
      h += '<div class="card"><h2>บันทึกการแก้ไข</h2>' +
        '<label class="f">ประเภท</label><select id="wk_level">' + ACTION_LEVELS.map(function (l) { return '<option>' + l + '</option>'; }).join('') + '</select>' +
        '<label class="f">สิ่งที่ดำเนินการ</label>' + ta('wk_summary', 'เช่น แจ้งแพทย์ ทำซ้ำ ปรับขั้นตอน') +
        '<label class="f">ผลที่ได้ (ถ้ามี)</label>' + ta('wk_result', 'ผลหลังดำเนินการ', '', 48) +
        '<label class="f">ประสานกับ/ผู้รับเรื่อง (ไม่บังคับ)</label><input type="text" id="wk_contact" placeholder="เช่น ตึกศัลยกรรม: พยาบาลสมศรี รับเรื่อง 14:10">' +
        '<label style="display:block;margin:10px 0"><input type="checkbox" id="wk_sys"> เป็นการปรับปรุงระบบ/ขั้นตอน</label>' +
        '<button class="btn" data-act="w-add" data-arg="' + esc(inc.id) + '">เพิ่มรายการแก้ไข</button></div>' +
        contactsCard(inc, unitName) +
        '<details class="card"' + (inc.rca_required && !inc.rca ? ' open' : '') + '><summary><b>RCA (วิเคราะห์สาเหตุ)</b>' +
        (inc.rca_required ? ' <span class="badge" style="background:#d9363e">จำเป็นก่อนปิดเคส</span>' : '') + '</summary>' +
        '<label class="f">ผู้ร่วมวิเคราะห์</label><input type="text" id="wk_part" value="' + esc(rc.participants || '') + '">' +
        '<label class="f">ปัจจัยที่เกี่ยวข้อง</label><div>' + RCA_FACTORS.map(function (f) {
          return '<label style="display:inline-block;margin:4px 10px 4px 0"><input type="checkbox" class="wk_f" value="' + esc(f) + '"' + (have.indexOf(f) >= 0 ? ' checked' : '') + '> ' + esc(f) + '</label>';
        }).join('') + '</div>' +
        '<label class="f">สาเหตุที่แท้จริง (Root cause)</label>' + ta('wk_rsum', '', rc.summary) +
        '<label class="f">แผนแก้ไขระยะสั้น</label>' + ta('wk_short', '', rc.short_term_plan, 48) +
        '<label class="f">แผนป้องกันระยะยาว</label>' + ta('wk_long', '', rc.long_term_plan, 48) +
        '<div class="grid2"><div><label class="f">ผู้รับผิดชอบ</label><input type="text" id="wk_owner" value="' + esc(rc.owner || '') + '"></div>' +
        '<div><label class="f">กำหนดเสร็จ</label><input type="date" id="wk_due" value="' + esc(rc.due_date || '') + '"></div></div>' +
        '<div style="height:10px"></div><button class="btn secondary" data-act="w-rca" data-arg="' + esc(inc.id) + '">บันทึก RCA</button></details>' +
        '<button class="btn warn" data-act="w-req" data-arg="' + esc(inc.id) + '">ขอปิดเคส (ส่งให้กรรมการ)</button>';
    }
    if (inc.can_close) {
      h += '<div class="card"><h2>พิจารณาปิดเคส</h2>' +
        '<button class="btn" data-act="w-close" data-arg="' + esc(inc.id) + '">ปิดเคส</button><div style="height:10px"></div>' +
        ta('wk_ret', 'ส่งกลับ: ระบุสิ่งที่ต้องแก้ไขเพิ่ม', '', 48) +
        '<button class="btn secondary" data-act="w-return" data-arg="' + esc(inc.id) + '">ส่งกลับให้แก้ไขเพิ่ม</button></div>';
    }
    return h;
  }
  function contactsCard(inc, unitName) {
    var ids = [inc.assigned_unit_id].concat(inc.co_units || []).filter(String);
    if (!ids.length) return '';
    var uc = inc.unit_contacts || {};
    return '<div class="card"><h3 style="margin-top:0">ผู้ประสาน/ผู้รับเรื่องของแต่ละหน่วย</h3>' + ids.map(function (id) {
      return '<label class="f">' + esc(unitName(id)) + '</label><input type="text" class="wk_c" data-unit="' + esc(id) + '" value="' + esc(uc[id] || '') + '" placeholder="ชื่อเจ้าหน้าที่ (ไม่บังคับ)">';
    }).join('') + '<div style="height:8px"></div><button class="btn secondary small" data-act="w-contacts" data-arg="' + esc(inc.id) + '">บันทึกชื่อผู้ประสาน</button></div>';
  }
  function val(id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; }
  function cidOk(s) {
    s = String(s || '').replace(/\D/g, '');
    if (s.length !== 13) return false;
    var sum = 0; for (var i = 0; i < 12; i++) sum += Number(s.charAt(i)) * (13 - i);
    return (11 - (sum % 11)) % 10 === Number(s.charAt(12));
  }
  /** ลงทะเบียนปุ่มของส่วนแก้ไข: reload(id) เรียกหลังบันทึกสำเร็จ */
  function bindWork(H, guard, reload) {
    function run(name, build, msg) {
      H[name] = function (id, el) {
        guard(el, async function () {
          var p = build(id); if (p === null) return;
          await api(p.action, p.payload); toast(msg); reload(id, p.done);
        });
      };
    }
    run('w-add', function (id) {
      return { action: 'addAction', payload: { incident_id: id, level: val('wk_level'), summary: val('wk_summary'), result: val('wk_result'),
        improved_system: !!(document.getElementById('wk_sys') || {}).checked, contact: val('wk_contact') } };
    }, 'บันทึกการแก้ไขแล้ว');
    run('w-contacts', function (id) {
      var m = {};
      Array.prototype.forEach.call(document.querySelectorAll('.wk_c'), function (i) { if (i.value.trim()) m[i.dataset.unit] = i.value.trim(); });
      return { action: 'setContacts', payload: { incident_id: id, unit_contacts: m } };
    }, 'บันทึกชื่อผู้ประสานแล้ว');
    run('w-rca', function (id) {
      var f = Array.prototype.map.call(document.querySelectorAll('.wk_f:checked'), function (c) { return c.value; });
      return { action: 'saveRca', payload: { incident_id: id, participants: val('wk_part'), factors: f, summary: val('wk_rsum'),
        short_term_plan: val('wk_short'), long_term_plan: val('wk_long'), owner: val('wk_owner'), due_date: val('wk_due') } };
    }, 'บันทึก RCA แล้ว');
    run('w-req', function (id) {
      if (!confirm('ส่งเรื่องนี้ให้กรรมการพิจารณาปิดเคส?')) return null;
      return { action: 'requestClose', payload: { incident_id: id }, done: 'list' };
    }, 'ส่งขอปิดเคสแล้ว');
    run('w-close', function (id) {
      if (!confirm('ยืนยันปิดเคส?')) return null;
      return { action: 'closeIncident', payload: { incident_id: id, decision: 'close' }, done: 'list' };
    }, 'ปิดเคสแล้ว');
    run('w-return', function (id) {
      return { action: 'closeIncident', payload: { incident_id: id, decision: 'return', reason: val('wk_ret') } };
    }, 'ส่งกลับแล้ว');
  }

  return {
    cfg: cfg, cidOk: cidOk, UNIT_GROUPS: UNIT_GROUPS, unitPicker: unitPicker, refreshPicker: refreshPicker, bindPickers: bindPickers, unitOptions: unitOptions, unitSelect2: unitSelect2, workHtml: workHtml, bindWork: bindWork, SEV: SEV, GROUP_LABEL: GROUP_LABEL, GROUP_COLOR: GROUP_COLOR, STATUS_COLOR: STATUS_COLOR,
    SENTINEL_LIST: SENTINEL_LIST, esc: esc, initLiff: initLiff, api: api, relogin: relogin, toast: toast,
    pad: pad, bkkNow: bkkNow, suggestOffice: suggestOffice, shiftOf: shiftOf, thaiDateTime: thaiDateTime,
    sevText: sevText, badge: badge, sevBadge: sevBadge, bars: bars, statsHtml: statsHtml
  };
})();
