function profileInitial(email) {
  const key = String(email || '?').trim();
  return (key[0] || '?').toUpperCase();
}

function renderProfileMiniList(items, emptyText, renderer) {
  if (!items || !items.length) return `<div class="empty">${h(emptyText)}</div>`;
  return `<div class="profile-list">${items.map(renderer).join('')}</div>`;
}

function calcLeaveRemaining(balance) {
  if (!balance) return null;
  const total = Number(balance.total_days ?? 0);
  const used = Number(balance.used_days ?? 0);
  if (Number.isNaN(total) || Number.isNaN(used)) return null;
  return Math.max(0, total - used);
}

function formatLeaveDays(value) {
  if (value === null || value === undefined || value === '') return '-';
  const n = Number(value);
  if (Number.isNaN(n)) return '-';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

async function profileSafeQuery(label, queryPromise, fallback = []) {
  try {
    const res = await queryPromise;
    if (res?.error) throw res.error;
    return res?.data ?? fallback;
  } catch (err) {
    logDbError(`profile:${label}`, err);
    return fallback;
  }
}

function profileOwnerMatches(value, email) {
  const v = String(value || '').trim().toLowerCase();
  const e = String(email || '').trim().toLowerCase();
  const k = e.split('@')[0] || '';
  return !!v && (v === e || v === k);
}

function profileListHasUser(value, email) {
  const e = String(email || '').trim().toLowerCase();
  const k = e.split('@')[0] || '';
  if (!value) return false;
  if (Array.isArray(value)) {
    return value.map(x => String(x || '').trim().toLowerCase()).some(x => x === e || x === k);
  }
  const s = String(value || '').toLowerCase();
  return s.includes(e) || (!!k && s.includes(k));
}

async function loadProfileDashboard() {
  try {
    if (!currentProfile) await loadUserProfile();
    const email = myEmail();
    const emailKey = myEmailKey();

    if (!email) {
      showMultiError(['profileStats','profileTasks','profileMeetings','profileDocs','profileLeave','profileActivity'], 'Profile', 'No user email');
      return;
    }

    const name = currentProfile?.full_name || email.split('@')[0];
    $('profileAvatar').textContent = profileInitial(name || email);
    $('profileName').textContent = name;
    $('profileEmail').textContent = email;
    $('profileRoleChip').innerHTML = `<i class="ti ti-shield"></i> ${h(formatRoleLabel(currentRole))}`;

    const tasksRes = profileSafeQuery(
      'tasks',
      db.from('tasks').select('*').or(`owner.eq.${email},owner.eq.${emailKey}`).order('created_at', { ascending:false })
    );

    const docsRes = profileSafeQuery(
      'documents',
      db.from('documents').select('*').or(`created_by.eq.${email},created_by.eq.${emailKey}`).order('created_at', { ascending:false })
    );

    // ດຶງ meetings ແບບກວ້າງກ່ອນ ແລ້ວ filter ໃນ browser
    // ເພື່ອຮອງຮັບ schema ເກົ່າ/ໃໝ່: attendees ຫຼື participants, meet_date ຫຼື meeting_date
    let meetingsPromise = db.from('meetings').select('*').order('meet_date', { ascending:true });
    const meetingsRes = profileSafeQuery('meetings', meetingsPromise);

    const leavesRes = profileSafeQuery(
      'leaves',
      db.from('leaves').select('*').or(`owner.eq.${email},owner.eq.${emailKey}`).order('date_from', { ascending:false })
    );

    const balRes = profileSafeQuery(
      'leave_balance',
      db.from('leave_balance').select('*').or(`owner.eq.${email},owner.eq.${emailKey}`).limit(1).maybeSingle(),
      null
    );

    const logRes = profileSafeQuery(
      'activity_log',
      db.from('activity_log').select('*').or(`user_email.eq.${email},user_email.eq.${emailKey}`).order('created_at', { ascending:false }).limit(8)
    );

    let [myTasks, myDocs, allMeets, myLeaves, balance, myLogs] = await Promise.all([
      tasksRes, docsRes, meetingsRes, leavesRes, balRes, logRes
    ]);

    myTasks = myTasks || [];
    myDocs = myDocs || [];
    myLeaves = myLeaves || [];
    allMeets = allMeets || [];
    myLogs = myLogs || [];

    const myMeets = allMeets.filter(m =>
      profileOwnerMatches(m.created_by, email) ||
      profileListHasUser(m.attendees, email) ||
      profileListHasUser(m.participants, email)
    );

    const remainingLeave = calcLeaveRemaining(balance);
    const openTasks = myTasks.filter(t => t.status !== 'done').length;
    const pendingDocs = myDocs.filter(d => typeof isDocInProgress === 'function' ? isDocInProgress(d) : d.status !== 'done').length;
    const upcomingMeets = myMeets.filter(m => !m.meet_status || m.meet_status === 'scheduled').length;

    $('profileStats').innerHTML = `
      <div class="profile-stat"><div class="profile-stat-icon" style="background:var(--c2l);color:var(--c2m)"><i class="ti ti-checkbox"></i></div><div><div class="profile-stat-num">${myTasks.length}</div><div class="profile-stat-label">ວຽກຂອງຂ້ອຍ · ${openTasks} open</div></div></div>
      <div class="profile-stat"><div class="profile-stat-icon" style="background:var(--c3l);color:var(--c3m)"><i class="ti ti-file-text"></i></div><div><div class="profile-stat-num">${myDocs.length}</div><div class="profile-stat-label">ເອກະສານ · ${pendingDocs} pending</div></div></div>
      <div class="profile-stat"><div class="profile-stat-icon" style="background:var(--c5l);color:var(--c5m)"><i class="ti ti-calendar-event"></i></div><div><div class="profile-stat-num">${myMeets.length}</div><div class="profile-stat-label">ນັດໝາຍ · ${upcomingMeets} upcoming</div></div></div>
      <div class="profile-stat"><div class="profile-stat-icon" style="background:var(--c1l);color:var(--c1m)"><i class="ti ti-calendar-off"></i></div><div><div class="profile-stat-num">${formatLeaveDays(remainingLeave)}</div><div class="profile-stat-label">ວັນລາຄົງເຫຼືອ</div></div></div>
    `;

    $('profileTasks').innerHTML = renderProfileMiniList(
      myTasks.slice(0,6),
      'ຍັງບໍ່ມີວຽກຂອງຂ້ອຍ',
      t => `<div class="profile-mini-item"><div style="min-width:0"><div class="profile-item-title">${h(t.name || t.title || '-')}</div><div class="profile-item-meta">${h(t.status || '-')} · ${h(t.due_date || 'no due')}</div></div><span class="badge ${t.priority === 'urgent' ? 'urgent' : 'normal'}">${t.priority === 'urgent' ? 'ດ່ວນ' : 'ປົກກະຕິ'}</span></div>`
    );

    $('profileDocs').innerHTML = renderProfileMiniList(
      myDocs.slice(0,6),
      'ຍັງບໍ່ມີເອກະສານຂອງຂ້ອຍ',
      d => `<div class="profile-mini-item"><div style="min-width:0"><div class="profile-item-title">${h(d.name || d.title || '-')}</div><div class="profile-item-meta">${h(d.doc_no || d.number || d.status || '')} · step ${Number(d.current_step || 0)+1}/${(d.steps || []).length || 1}</div></div><span>${h(d.type || '📄')}</span></div>`
    );

    $('profileMeetings').innerHTML = renderProfileMiniList(
      myMeets.slice(0,6),
      'ຍັງບໍ່ມີນັດໝາຍຂອງຂ້ອຍ',
      m => `<div class="profile-mini-item"><div style="min-width:0"><div class="profile-item-title">${h(m.title || '-')}</div><div class="profile-item-meta">${h(m.meet_date || m.meeting_date || '-')} ${h(m.meet_time || m.meeting_time || '')} · ${h(m.location || '')}</div></div><span class="badge normal">${h(m.meet_status || m.status || 'scheduled')}</span></div>`
    );

    $('profileLeave').innerHTML = `
      <div style="display:grid;gap:8px">
        <div class="profile-mini-item"><div><div class="profile-item-title">ວັນລາຄົງເຫຼືອ</div><div class="profile-item-meta">${balance ? `ໃຊ້ໄປ ${formatLeaveDays(balance.used_days)} / ${formatLeaveDays(balance.total_days)} ວັນ` : 'ຍັງບໍ່ມີ Balance'}</div></div><strong>${formatLeaveDays(remainingLeave)} ວັນ</strong></div>
        ${renderProfileMiniList(myLeaves.slice(0,4), 'ຍັງບໍ່ມີລາຍການຂໍລາ', l => `<div class="profile-mini-item"><div style="min-width:0"><div class="profile-item-title">${h(l.type || '-')}</div><div class="profile-item-meta">${h(l.date_from || '')} → ${h(l.date_to || '')}</div></div><span class="badge ${l.status === 'approved' ? 'done-b' : l.status === 'rejected' ? 'urgent' : 'inprogress'}">${h(l.status || 'pending')}</span></div>`)}
      </div>`;

    $('profileActivity').innerHTML = renderProfileMiniList(
      myLogs,
      'ຍັງບໍ່ມີ Activity',
      l => `<div class="profile-mini-item"><div style="min-width:0"><div class="profile-item-title">${h(l.action || '-')} ${h(l.target_name || '')}</div><div class="profile-item-meta">${h(l.detail || '')}</div><div class="profile-item-meta">${l.created_at ? new Date(l.created_at).toLocaleString('lo-LA') : ''} · ${h(l.target_type || '')}</div></div><i class="ti ti-history" style="color:var(--muted)"></i></div>`
    );
  } catch (error) {
    logDbError('loadProfileDashboard', error);
    showMultiError(['profileStats','profileTasks','profileMeetings','profileDocs','profileLeave','profileActivity'], 'ໂຫຼດ My Profile ບໍ່ສຳເລັດ', error);
  }
}
