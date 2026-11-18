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
    var tabs = [['dash', 'ภาพรวม'], ['inc', 'รายงานทั้งหมด']];
    if (S.me.user.role === 'admin') tabs.push(['users', 'ผู้ใช้']);
    document.getElementById('tabs').innerHTML = tabs.map(function (t) {
      return '<button class="tab' + (S.tab === t[0] ? ' on' : '') + '" data-act="tab" data-arg="' + t[0] + '">' + t[1] + '</button>';
    }).join('');
  }
  function go(tab) {
    S.tab = tab; drawTabs();
    if (tab === 'dash') viewDash();
    else if (tab === 'inc') viewInc();
    else viewUsers();
  }
  H.tab = go;

  // ------------------------------------------------------------ ภาพรวม
  var DASH = { from: '', to: '' };
  async function viewDash() {
    $app.innerHTML = '<h1>ภาพรวมและตัวชี้วัด</h1>' + dashFilters() + '<p class="muted">กำลังโหลด…</p>';
    try {
      var s = await R.api('stats', { from: DASH.from, to: DASH.to });
      $app.innerHTML = '<h1>ภาพรวมและตัวชี้วัด</h1>' + dashFilters() +
        '<div style="max-width:720px">' + R.statsHtml(s) + '</div>' +
        '<p class="muted">Risk Matrix, Risk Register และตัวชี้วัดครบ 8 ข้อ จะเพิ่มในระยะที่ 3-4</p>';
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
      html += '</div></div></div>';
      document.getElementById('modal').innerHTML = html;
    } catch (e) { R.toast(e.message, true); }
  };
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
