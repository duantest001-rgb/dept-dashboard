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

async function loadProfileDashboard() {
  try {
    if (!currentProfile) await loadUserProfile();
    const email = myEmail();
    if (!email) {
      showMultiError(['profileStats','profileTasks','profileMeetings','profileDocs','profileLeave','profileActivity'], 'Profile', 'No user email');
      return;
    }

    const name = currentProfile?.full_name || email.split('@')[0];
    $('profileAvatar').textContent = profileInitial(name || email);
    $('profileName').textContent = name;
    $('profileEmail').textContent = email;
    $('profileRoleChip').innerHTML = `<i class="ti ti-shield"></i> ${h(formatRoleLabel(currentRole))}`;

    const [tasksRes, docsRes, meetsRes, leavesRes, balRes, logRes] = await Promise.all([
      db.from('tasks').select('*').order('created_at', { ascending:false }),
      db.from('documents').select('*').order('created_at', { ascending:false }),
      db.from('meetings').select('*').order('meet_date', { ascending:true }),
      db.from('leaves').select('*').order('date_from', { ascending:false }),
      db.from('leave_balance').select('*').eq('owner', email).maybeSingle(),
      db.from('activity_log').select('*').order('created_at', { ascending:false }).limit(200)
    ]);

    const firstErr = tasksRes.error || docsRes.error || meetsRes.error || leavesRes.error || balRes.error || logRes.error;
    if (firstErr) throw firstErr;

    const myTasks = (tasksRes.data || []).filter(t => matchesMe(t.owner));
    const myDocs  = (docsRes.data || []).filter(d => matchesMe(d.created_by));
    const myLeaves= (leavesRes.data || []).filter(l => matchesMe(l.owner));
    const myMeets = (meetsRes.data || []).filter(m => {
      const attendees = normalizeParticipants(m.attendees || []);
      return attendees.includes(email) || matchesMe(m.created_by);
    });
    const balance = balRes.data || null;
    const remainingLeave = calcLeaveRemaining(balance);
    const myLogs = (logRes.data || []).filter(l => {
      const logEmail = String(l.user_email || '').toLowerCase().trim();
      const logUserId = String(l.user_id || '').trim();
      const profileId = String(currentProfile?.id || '').trim();
      return logEmail === email.toLowerCase() || (profileId && logUserId === profileId);
    }).slice(0, 8);

    const openTasks = myTasks.filter(t => t.status !== 'done').length;
    const urgentTasks = myTasks.filter(t => t.priority === 'urgent' && t.status !== 'done').length;
    const pendingDocs = myDocs.filter(d => isDocInProgress(d)).length;
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
      d => `<div class="profile-mini-item"><div style="min-width:0"><div class="profile-item-title">${h(d.name || '-')}</div><div class="profile-item-meta">${h(d.doc_no || d.number || '')} · step ${Number(d.current_step || 0)+1}/${(d.steps || []).length || 1}</div></div><span>${h(d.type || '📄')}</span></div>`
    );

    $('profileMeetings').innerHTML = renderProfileMiniList(
      myMeets.slice(0,6),
      'ຍັງບໍ່ມີນັດໝາຍຂອງຂ້ອຍ',
      m => `<div class="profile-mini-item"><div style="min-width:0"><div class="profile-item-title">${h(m.title || '-')}</div><div class="profile-item-meta">${h(m.meet_date || '-')} ${h(m.meet_time || '')} · ${h(m.location || '')}</div></div><span class="badge normal">${h(m.meet_status || 'scheduled')}</span></div>`
    );

    $('profileLeave').innerHTML = `
      <div style="display:grid;gap:8px">
        <div class="profile-mini-item"><div><div class="profile-item-title">ວັນລາຄົງເຫຼືອ</div><div class="profile-item-meta">${balance ? `ໃຊ້ໄປ ${formatLeaveDays(balance.used_days)} / ${formatLeaveDays(balance.total_days)} ວັນ` : 'Balance'}</div></div><strong>${formatLeaveDays(remainingLeave)} ວັນ</strong></div>
        ${renderProfileMiniList(myLeaves.slice(0,4), 'ຍັງບໍ່ມີລາຍການຂໍລາ', l => `<div class="profile-mini-item"><div style="min-width:0"><div class="profile-item-title">${h(l.type || '-')}</div><div class="profile-item-meta">${h(l.date_from || '')} → ${h(l.date_to || '')}</div></div><span class="badge ${l.status === 'approved' ? 'done-b' : l.status === 'rejected' ? 'urgent' : 'inprogress'}">${h(l.status || 'pending')}</span></div>`)}
      </div>`;

    $('profileActivity').innerHTML = renderProfileMiniList(
      myLogs,
      'ຍັງບໍ່ມີ Activity',
      l => `<div class="profile-mini-item"><div style="min-width:0"><div class="profile-item-title">${h(l.action || '-')} ${h(l.target_name || '')}</div><div class="profile-item-meta">${h(l.detail || '')}</div><div class="profile-item-meta">${new Date(l.created_at).toLocaleString('lo-LA')} · ${h(l.target_type || '')}</div></div><i class="ti ti-history" style="color:var(--muted)"></i></div>`
    );
  } catch (error) {
    logDbError('loadProfileDashboard', error);
    showMultiError(['profileStats','profileTasks','profileMeetings','profileDocs','profileLeave','profileActivity'], 'ໂຫຼດ My Profile ບໍ່ສຳເລັດ', error);
  }
}


// ════ DASHBOARD ════
