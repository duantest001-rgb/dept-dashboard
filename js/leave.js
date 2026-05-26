async function populateLeaveOwnerDropdowns() {
  const users = await loadUserOptions();
  const meVal = myEmail();
  const opts = users.map(u =>
    `<option value="${u.value}" ${u.value===meVal?'selected':''}>${u.label}</option>`
  ).join('');

  ['lOwner','eLOwner'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = opts;
  });
}

function todayLocalStr() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function getCurrentYear() {
  return new Date().getFullYear();
}

function getLeaveDisplayStatus(l) {
  if (l.status !== 'approved') return l.status;

  const todayStr = todayLocalStr();

  if (l.date_from <= todayStr && l.date_to >= todayStr) {
    return 'active';
  }

  return 'approved';
}

let allLeaveBalance = [];

async function loadLeave() {
  try {
    await populateLeaveOwnerDropdowns();

    const [lRes, bRes] = await Promise.all([
      db.from('leaves').select('*').order('date_from', { ascending: true }),
      db.from('leave_balance').select('*')
    ]);

    if (lRes.error) throw lRes.error;
    if (bRes.error) throw bRes.error;

    allLeaves = lRes.data || [];

    const year = getCurrentYear();

    allLeaveBalance = (bRes.data || []).filter(b => {
      if (b.year === undefined || b.year === null) return true;
      return Number(b.year) === year;
    });

    renderLeave();
    renderLeaveCalStrip();
    renderLeaveBalance();

  } catch (error) {
    logDbError('loadLeave', error);
    showInlineError('leaveList', 'ໂຫຼດລາພັກບໍ່ສຳເລັດ', error);
    showInlineError('leaveCalStrip', 'ໂຫຼດປະຕິທິນລາພັກບໍ່ສຳເລັດ', error);
    showInlineError('leaveBalanceArea', 'ໂຫຼດວັນລາຄົງເຫຼືອບໍ່ສຳເລັດ', error);
  }
}

function calcDays(from, to, half) {
  if (!from || !to) return null;

  const d = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;

  if (d < 1) return null;

  return half ? 0.5 : d;
}

function calcLeaveDays() {
  const d = calcDays(
    document.getElementById('lFrom').value,
    document.getElementById('lTo').value,
    document.getElementById('lHalf').checked
  );

  document.getElementById('lDaysPreview').textContent = d !== null ? d : '—';
}

function calcLeaveDaysEdit() {
  const d = calcDays(
    document.getElementById('eLFrom').value,
    document.getElementById('eLTo').value,
    document.getElementById('eLHalf').checked
  );

  document.getElementById('eLDaysPreview').textContent = d !== null ? d : '—';
}

function getApprovedVacationUsed(owner) {
  let used = 0;

  allLeaves.forEach(l => {
    if (String(l.owner).toLowerCase() !== String(owner).toLowerCase()) return;
    if (l.leave_type !== 'vacation') return;

    const displayStatus = getLeaveDisplayStatus(l);

    if (l.status === 'approved' || displayStatus === 'active') {
      const d = l.days_count ?? calcDays(l.date_from, l.date_to, l.half_day);
      used += Number(d || 0);
    }
  });

  return used;
}

function getLeaveBalance(owner) {
  const b = allLeaveBalance.find(x =>
    String(x.owner).toLowerCase() === String(owner).toLowerCase()
  );

  const total = Number(b?.total_days ?? b?.annual_quota ?? 15);
  const used = getApprovedVacationUsed(owner);
  const remaining = Math.max(0, total - used);

  return {
    total,
    used,
    remaining
  };
}

function renderLeaveCalStrip() {
  const today = new Date();
  today.setHours(0,0,0,0);

  const next30 = new Date(today);
  next30.setDate(today.getDate() + 30);

  const todayStr = todayLocalStr();

  const n = new Date();
  n.setDate(n.getDate() + 30);
  n.setMinutes(n.getMinutes() - n.getTimezoneOffset());
  const next30Str = n.toISOString().slice(0,10);

  const upcoming = allLeaves.filter(l =>
    l.status !== 'rejected' &&
    l.date_to >= todayStr &&
    l.date_from <= next30Str
  ).sort((a,b) => a.date_from.localeCompare(b.date_from));

  const el = document.getElementById('leaveCalStrip');
  if (!el) return;

  if (!upcoming.length) {
    el.innerHTML = '<div class="empty">ບໍ່ມີລາຍການລ່ວງໜ້າ 30 ວັນ</div>';
    return;
  }

  el.innerHTML = upcoming.map(l => {
    const tm = leaveTypeMap[l.leave_type] || leaveTypeMap.other;
    const dStatus = getLeaveDisplayStatus(l);
    const sm = leaveStatusMap[dStatus] || leaveStatusMap.approved;
    const days = l.days_count ?? calcDays(l.date_from, l.date_to, l.half_day);
    const isActive = dStatus === 'active';

    return `
      <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);${isActive?'background:var(--c1l);margin:0 -1.25rem;padding:9px 1.25rem;':''}">
        <div style="min-width:52px;text-align:center;background:${tm.bg};border-radius:var(--radius);padding:6px 4px">
          <div style="font-size:18px">${tm.icon}</div>
          <div style="font-size:9px;color:${tm.color};font-weight:600">${tm.label}</div>
        </div>

        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:600">${l.owner || '—'}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px">
            📅 ${l.date_from} ${l.date_from !== l.date_to ? '→ ' + l.date_to : ''} · ${days} ວັນ
            ${l.reason ? ' · ' + l.reason : ''}
          </div>
        </div>

        <span style="background:${sm.bg};color:${sm.color};font-size:10px;padding:2px 8px;border-radius:10px;font-weight:500;flex-shrink:0">${sm.label}</span>
        ${isActive ? '<span style="background:var(--c1);color:#fff;font-size:10px;padding:2px 8px;border-radius:10px;font-weight:600;flex-shrink:0">ມື້ນີ້</span>' : ''}
      </div>
    `;
  }).join('');
}

function renderLeave() {
  const stQ = document.getElementById('lFilterStatus')?.value || '';
  const typeQ = document.getElementById('lFilterType')?.value || '';

  let items = allLeaves;

  if (typeQ) {
    items = items.filter(l => l.leave_type === typeQ);
  }

  if (stQ) {
    if (stQ === 'active') {
      items = items.filter(l => getLeaveDisplayStatus(l) === 'active');
    } else {
      items = items.filter(l => l.status === stQ && getLeaveDisplayStatus(l) !== 'active');
    }
  }

  const el = document.getElementById('leaveList');
  if (!el) return;

  if (!items.length) {
    el.innerHTML = '<div class="empty">ບໍ່ພົບລາຍການ</div>';
    return;
  }

  el.innerHTML = items.map(l => {
    const tm = leaveTypeMap[l.leave_type] || leaveTypeMap.other;
    const dStatus = getLeaveDisplayStatus(l);
    const sm = leaveStatusMap[dStatus] || leaveStatusMap.pending;
    const days = l.days_count ?? calcDays(l.date_from, l.date_to, l.half_day);
    const halfBadge = l.half_day ? '<span style="font-size:9px;background:#EEEDFE;color:#534AB7;padding:1px 5px;border-radius:8px;font-weight:600">½</span>' : '';
    const isPending = l.status === 'pending';
    const isActive = dStatus === 'active';

    return `
      <div style="display:flex;align-items:flex-start;gap:10px;padding:11px 0;border-bottom:1px solid var(--border);${isActive?'background:var(--c1l);margin:0 -1.25rem;padding:11px 1.25rem;border-radius:var(--radius);margin-bottom:4px;':''}">
        <div style="min-width:48px;text-align:center;background:${tm.bg};border-radius:var(--radius);padding:6px 4px;flex-shrink:0">
          <div style="font-size:16px">${tm.icon}</div>
          <div style="font-size:9px;color:${tm.color};font-weight:600;margin-top:2px">${tm.label}</div>
        </div>

        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:3px">
            <strong style="font-size:14px">${l.owner || '—'}</strong>
            <span style="background:${sm.bg};color:${sm.color};font-size:10px;padding:2px 8px;border-radius:10px;font-weight:600">${sm.label}</span>
            ${isActive ? `<span style="background:var(--c1);color:#fff;font-size:10px;padding:2px 8px;border-radius:10px;font-weight:700;animation:pulse 1.5s infinite">● ກຳລັງລາ</span>` : ''}
          </div>

          <div style="font-size:12px;color:var(--muted)">
            📅 ${l.date_from}${l.date_from !== l.date_to ? ' → ' + l.date_to : ''} · <strong>${days}</strong> ວັນ ${halfBadge}
          </div>

          ${l.reason ? `<div style="font-size:12px;color:var(--text);margin-top:3px">💬 ${l.reason}</div>` : ''}

          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:7px">
            ${isPending && isSuperior() ? `
              <button data-manager-only onclick="approveLeave(${l.id})" style="border:1px solid #9FE1CB;background:#E1F5EE;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:11px;color:#0F6E56;font-weight:500">✅ ອະນຸມັດ</button>
              <button data-manager-only onclick="rejectLeave(${l.id})" style="border:1px solid #F5C4B3;background:#FDF5F3;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:11px;color:#993C1D">❌ ປະຕິເສດ</button>
            ` : ''}

            ${(isSuperior() || matchesMe(l.owner)) && l.status === 'pending' ? `
              <button class="btn-edit" data-write-action onclick="openEditLeave(${l.id})" style="border:1px solid var(--border);background:var(--c2l);border-radius:6px;padding:3px 8px;cursor:pointer;font-size:11px;color:var(--c2m)">
                <i class="ti ti-pencil"></i> ແກ້ໄຂ
              </button>
            ` : ''}

            ${isSuperior() ? `
              <button class="btn-delete" data-manager-only onclick="deleteLeave(${l.id})" style="border:1px solid var(--border);background:#faece7;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:11px;color:#993C1D">
                <i class="ti ti-trash"></i> ລຶບ
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function saveLeave() {
  if (!canWrite()) return toast('⛔ Viewer ເບິ່ງໄດ້ຢ່າງດຽວ');

  const owner = requireEmailRef(document.getElementById('lOwner').value, myEmail(), 'ຜູ້ຂໍລາ');
  if (!owner) return;

  const lType = document.getElementById('lType').value;
  const dFrom = document.getElementById('lFrom').value;
  const dTo = document.getElementById('lTo').value;
  const half = document.getElementById('lHalf').checked;

  if (!dFrom || !dTo) {
    toast('⚠️ ເລືອກວັນທີເລີ່ມ ແລະ ສິ້ນສຸດ');
    return;
  }

  if (dTo < dFrom) {
    toast('⚠️ ວັນທີສິ້ນສຸດຕ້ອງ >= ວັນທີເລີ່ມ');
    return;
  }

  const daysCount = calcDays(dFrom, dTo, half);

  const { error } = await db.from('leaves').insert({
    owner,
    leave_type: lType,
    date_from: dFrom,
    date_to: dTo,
    half_day: half,
    days_count: daysCount,
    reason: document.getElementById('lReason').value.trim(),
    status: 'pending'
  });

  if (error) {
    toast('❌ ' + error.message);
    return;
  }

  await logAction('created','leave',0, owner, `${leaveTypeMap[lType]?.label || lType} ${dFrom}→${dTo} (${daysCount}ວັນ)`);

  toast('✅ ສົ່ງຄຳຂໍສຳເລັດ!');

  toggleForm('addLeaveForm');

  ['lFrom','lTo','lReason'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('lHalf').checked = false;
  document.getElementById('lDaysPreview').textContent = '—';

  loadLeave();
}

async function openEditLeave(id) {
  const l = allLeaves.find(x => x.id === id);
  if (!l) return;

  await populateLeaveOwnerDropdowns();

  document.getElementById('editLeaveId').value = id;
  document.getElementById('eLType').value = l.leave_type;
  document.getElementById('eLOwner').value = l.owner || '';
  document.getElementById('eLFrom').value = l.date_from;
  document.getElementById('eLTo').value = l.date_to;
  document.getElementById('eLHalf').checked = l.half_day || false;
  document.getElementById('eLReason').value = l.reason || '';
  document.getElementById('eLDaysPreview').textContent = l.days_count ?? '—';

  const form = document.getElementById('editLeaveForm');
  form.style.display = 'block';
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function saveEditLeave() {
  const leave = allLeaves.find(l => l.id == document.getElementById('editLeaveId').value);

  if (!(isSuperior() || (leave && matchesMe(leave.owner) && leave.status === 'pending'))) {
    return toast('⛔ ບໍ່ມີສິດແກ້ໃບລານີ້');
  }

  const id = parseInt(document.getElementById('editLeaveId').value);
  const owner = requireEmailRef(document.getElementById('eLOwner').value, myEmail(), 'ຜູ້ຂໍລາ');
  if (!owner) return;

  const lType = document.getElementById('eLType').value;
  const dFrom = document.getElementById('eLFrom').value;
  const dTo = document.getElementById('eLTo').value;
  const half = document.getElementById('eLHalf').checked;

  if (!dFrom || !dTo) {
    toast('⚠️ ເລືອກວັນທີ');
    return;
  }

  const daysCount = calcDays(dFrom, dTo, half);

  const { error } = await db.from('leaves').update({
    owner,
    leave_type: lType,
    date_from: dFrom,
    date_to: dTo,
    half_day: half,
    days_count: daysCount,
    reason: document.getElementById('eLReason').value.trim()
  }).eq('id', id);

  if (error) {
    toast('❌ ' + error.message);
    return;
  }

  await logAction('updated','leave', id, owner, `${leaveTypeMap[lType]?.label || lType} ${dFrom}→${dTo} (${daysCount}ວັນ)`);

  toast('✅ ແກ້ໄຂສຳເລັດ!');

  document.getElementById('editLeaveForm').style.display = 'none';

  loadLeave();
}

async function approveLeave(id) {
  if (!isSuperior()) {
    return toast('⛔ ສະເພາະ Admin/Manager ອະນຸມັດໄດ້');
  }

  const l = allLeaves.find(x => x.id === id);

  if (!l) {
    toast('❌ ບໍ່ພົບໃບລາ');
    return;
  }

  if (l.leave_type === 'vacation') {
    const bal = getLeaveBalance(l.owner);
    const requestDays = Number(l.days_count ?? calcDays(l.date_from, l.date_to, l.half_day) ?? 0);

    if (requestDays > bal.remaining) {
      toast(`⛔ ວັນລາພັກບໍ່ພໍ: ຄົງເຫຼືອ ${bal.remaining} ວັນ, ແຕ່ຂໍລາ ${requestDays} ວັນ`);
      return;
    }
  }

  const { error } = await db.from('leaves')
    .update({ status: 'approved' })
    .eq('id', id);

  if (error) {
    toast('❌ ' + error.message);
    return;
  }

  await logAction('approved','leave', id, l?.owner || '', `${l?.date_from}→${l?.date_to}`);

  toast('✅ ອະນຸມັດລາພັກສຳເລັດ!');

  loadLeave();
}

async function rejectLeave(id) {
  if (!isSuperior()) {
    return toast('⛔ ສະເພາະ Admin/Manager ປະຕິເສດໄດ້');
  }

  const l = allLeaves.find(x => x.id === id);

  const { error } = await db.from('leaves')
    .update({ status: 'rejected' })
    .eq('id', id);

  if (error) {
    toast('❌ ' + error.message);
    return;
  }

  await logAction('rejected','leave', id, l?.owner || '', `${l?.date_from}→${l?.date_to}`);

  toast('🚫 ປະຕິເສດການລາພັກ');

  loadLeave();
}

async function deleteLeave(id) {
  if (!confirm('ຢືນຢັນລຶບລາຍການນີ້?')) return;

  const l = allLeaves.find(x => x.id === id);

  const { error } = await db.from('leaves')
    .delete()
    .eq('id', id);

  if (error) {
    toast('❌ ' + error.message);
    return;
  }

  await logAction('deleted','leave', id, l?.owner || '', '');

  toast('🗑️ ລຶບສຳເລັດ');

  loadLeave();
}

function renderLeaveBalance() {
  const el = document.getElementById('leaveBalanceArea');
  if (!el) return;

  if (!allLeaveBalance.length) {
    el.innerHTML = '<div class="empty" style="font-size:12px">ຍັງບໍ່ມີຂໍ້ມູນວັນລາ — ກົດ "ແກ້ໄຂ" ເພື່ອຕັ້ງຄ່າ</div>';
    return;
  }

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px">
      ${allLeaveBalance.map(b => {
        const owner = b.owner;
        const bal = getLeaveBalance(owner);

        const total = bal.total;
        const used = bal.used;
        const remain = bal.remaining;

        const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;

        const color = pct >= 90 ? '#993C1D' : pct >= 60 ? '#856404' : '#0F6E56';
        const bgColor = pct >= 90 ? '#FAECE7' : pct >= 60 ? '#FFF3CD' : '#E1F5EE';

        return `
          <div style="background:${bgColor};border-radius:var(--radius);padding:10px 12px">
            <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:6px">👤 ${owner}</div>
            <div style="font-size:11px;color:var(--muted);margin-bottom:4px">ໃຊ້ ${used} / ${total} ວັນ</div>

            <div style="height:5px;background:rgba(0,0,0,.1);border-radius:3px;overflow:hidden;margin-bottom:5px">
              <div style="height:100%;width:${pct}%;background:${color};border-radius:3px;transition:width .4s"></div>
            </div>

            <div style="font-size:18px;font-weight:700;color:${color}">
              ${remain}
              <span style="font-size:10px;font-weight:400">ວັນຍັງເຫຼືອ</span>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

async function openBalanceModal() {
  const users = await loadUserOptions();

  const sel = document.getElementById('balOwner');

  sel.innerHTML = '<option value="">ເລືອກພະນັກງານ...</option>' +
    users.map(u => `<option value="${u.value}">${u.label}</option>`).join('');

  document.getElementById('balTotal').value = '';
  document.getElementById('balUsed').value = '';
  document.getElementById('balRemain').value = '';

  ['balTotal','balUsed'].forEach(id => {
    document.getElementById(id).oninput = () => {
      const t = parseFloat(document.getElementById('balTotal').value) || 0;
      const u = parseFloat(document.getElementById('balUsed').value) || 0;
      document.getElementById('balRemain').value = Math.max(0, t - u);
    };
  });

  document.getElementById('balanceModal').style.display = 'flex';
}

function closeBalanceModal() {
  document.getElementById('balanceModal').style.display = 'none';
}

async function loadBalanceForUser() {
  const owner = normalizeUserRef(document.getElementById('balOwner').value, myEmail());

  if (!owner || owner === '—') return;

  const existing = allLeaveBalance.find(b =>
    String(b.owner).toLowerCase() === String(owner).toLowerCase()
  );

  const used = getApprovedVacationUsed(owner);

  if (existing) {
    const total = existing.total_days ?? existing.annual_quota ?? 15;

    document.getElementById('balTotal').value = total;
    document.getElementById('balUsed').value = used;
    document.getElementById('balRemain').value = Math.max(0, total - used);

  } else {
    document.getElementById('balTotal').value = 15;
    document.getElementById('balUsed').value = used;
    document.getElementById('balRemain').value = Math.max(0, 15 - used);
  }
}

async function saveBalance() {
  const owner = requireEmailRef(document.getElementById('balOwner').value, myEmail(), 'ພະນັກງານ');

  if (!owner) return;

  const total = parseFloat(document.getElementById('balTotal').value) || 0;
  const used = getApprovedVacationUsed(owner);

  const existing = allLeaveBalance.find(b =>
    String(b.owner).toLowerCase() === String(owner).toLowerCase()
  );

  let error;

  if (existing) {
    ({ error } = await db.from('leave_balance')
      .update({
        total_days: total,
        used_days: used
      })
      .eq('owner', owner));
  } else {
    const payload = {
      owner,
      total_days: total,
      used_days: used
    };

    const insertRes = await db.from('leave_balance').insert(payload);
    error = insertRes.error;
  }

  if (error) {
    toast('❌ ' + error.message);
    return;
  }

  toast('✅ ບັນທຶກວັນລາສຳເລັດ!');

  closeBalanceModal();

  loadLeave();
}
