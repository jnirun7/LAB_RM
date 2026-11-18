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
      '<div class="kpi"><b>' + s.overdue + '</b><span>เกินกำหนดแก้ไข</span></div></div>' +
      '<h3>แยกตามระดับความรุนแรง</h3>' + bars(s.by_group, function (k) { return GROUP_LABEL[k] || k; }) +
      '<h3>รายเดือน</h3>' + bars(s.by_month) +
      '<h3>แยกตามหน่วยงาน</h3>' + bars(s.by_unit) +
      '<h3>แยกตามประเภท</h3>' + bars(s.by_card) +
      '<h3>สถานะ</h3>' + bars(s.by_status) +
      '<h3>ในเวลา/นอกเวลาราชการ</h3>' + bars(s.by_office) +
      '<h3>เวร</h3>' + bars(s.by_shift) +
      (s.rejected ? '<p class="muted">ไม่นับ ' + s.rejected + ' เรื่องที่ถูกระบุว่าไม่ใช่ความเสี่ยง</p>' : '');
  }

  return {
    cfg: cfg, SEV: SEV, GROUP_LABEL: GROUP_LABEL, GROUP_COLOR: GROUP_COLOR, STATUS_COLOR: STATUS_COLOR,
    SENTINEL_LIST: SENTINEL_LIST, esc: esc, initLiff: initLiff, api: api, relogin: relogin, toast: toast,
    pad: pad, bkkNow: bkkNow, suggestOffice: suggestOffice, shiftOf: shiftOf, thaiDateTime: thaiDateTime,
    sevText: sevText, badge: badge, sevBadge: sevBadge, bars: bars, statsHtml: statsHtml
  };
})();
