async function loadMeet() {
  try {
    const {data, error} = await db.from('meetings').select('*').order('meet_date');
    if (error) throw error;
    allMeets = data||[];
    await populateParticipantSelect('mAtt', [myEmail()]);
    renderMeet();
  } catch (error) {
    logDbError('loadMeet', error);
    showInlineError('meetList', 'ໂຫຼດນັດໝາຍບໍ່ສຳເລັດ', error);
  }
}

function renderMeet() {
  const q       = (document.getElementById('meetSearch')?.value||'').toLowerCase();
  const fromD   = document.getElementById('mSearchFrom')?.value||'';
  const toD     = document.getElementById('mSearchTo')?.value||'';
  const locQ    = (document.getElementById('mSearchLoc')?.value||'').toLowerCase();
  const typeQ   = document.getElementById('mFilterType')?.value||'';
  const statQ   = document.getElementById('mFilterStatus')?.value||'';
  const typeMap = {
    'ກອງປະຊຸມ': {icon:'🏛️', bg:'#E6F1FB', color:'#185FA5'},
    'ນັດໝາຍ':   {icon:'🤝', bg:'#E1F5EE', color:'#0F6E56'},
    'ກິດຈະກຳ':  {icon:'🎯', bg:'#FAECE7', color:'#993C1D'},
    'ອົບຮົມ':   {icon:'📚', bg:'#F5EEF8', color:'#6C3483'},
  };
  const statusMap = {
    scheduled: {label:'📅 ກຳນົດໄວ້', bg:'#E6F1FB', color:'#185FA5'},
    done:      {label:'✅ ແລ້ວ',      bg:'#E1F5EE', color:'#0F6E56'},
    cancelled: {label:'🚫 ຍົກເລີກ',   bg:'#F8D7DA', color:'#721C24'},
    postponed: {label:'⏩ ເລື່ອນ',    bg:'#FFF3CD', color:'#856404'},
  };
  let meets = allMeets;
  if (q)     meets = meets.filter(m => m.title.toLowerCase().includes(q));
  if (fromD) meets = meets.filter(m => m.meet_date && m.meet_date >= fromD);
  if (toD)   meets = meets.filter(m => m.meet_date && m.meet_date <= toD);
  if (locQ)  meets = meets.filter(m => (m.location||'').toLowerCase().includes(locQ));
  if (typeQ) meets = meets.filter(m => (m.meet_type||'ກອງປະຊຸມ') === typeQ);
  if (statQ) meets = meets.filter(m => (m.meet_status||'scheduled') === statQ);

  document.getElementById('meetList').innerHTML = meets.length===0
    ? '<div class="empty">ບໍ່ພົບລາຍການ</div>'
    : meets.map(m=>{
      const att = normalizeParticipants(m.attendees || []);
      const avatars = att.map((a,i)=>`<div class="avatar" title="${h(participantLabel(a))}" style="background:${acBg[i%5]};color:${acText[i%5]}">${h(participantInitial(a))}</div>`).join('');
      const tp  = m.meet_type||'ກອງປະຊຸມ';
      const tm  = typeMap[tp]||{icon:'📅', bg:'#F1EFE8', color:'#5F5E5A'};
      const st  = m.meet_status||'scheduled';
      const sm  = statusMap[st]||statusMap.scheduled;
      const isDone      = st === 'done';
      const isCancelled = st === 'cancelled';
      const isPostponed = st === 'postponed';
      const opacity = (isCancelled||isPostponed) ? 'opacity:0.65;' : '';

      return `<div class="meeting-item" style="${opacity}">
        <div class="meet-date" style="${isCancelled?'background:#F8D7DA':isPostponed?'background:#FFF3CD':''}">
          <div class="md" style="${isCancelled?'color:#721C24':isPostponed?'color:#856404':''}">${m.meet_date ? m.meet_date.slice(5) : '—'}</div>
          <div class="mt" style="${isCancelled?'color:#721C24':isPostponed?'color:#856404':''}">${m.meet_time||'—'}</div>
        </div>
        <div class="meet-info">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;flex-wrap:wrap">
            <span style="background:${tm.bg};color:${tm.color};font-size:10px;padding:2px 8px;border-radius:10px;font-weight:500">${tm.icon} ${tp}</span>
            <span style="background:${sm.bg};color:${sm.color};font-size:10px;padding:2px 8px;border-radius:10px;font-weight:500">${sm.label}</span>
          </div>
          <div class="meet-title" style="${isDone?'text-decoration:line-through;color:var(--muted)':''}">${h(m.title)}</div>
          <div class="meet-detail"><i class="ti ti-map-pin" style="font-size:11px"></i> ${m.location||'—'}${m.notes?' · '+m.notes:''}</div>
          <div class="attendees">${avatars}</div>
          <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
            ${!isDone && !isCancelled && !isPostponed && isSuperior()
              ? `<button data-manager-only onclick="confirmMeet(${m.id})" style="border:1px solid #9FE1CB;background:#E1F5EE;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:11px;color:#0F6E56;font-weight:500">✅ ຢືນຢັນແລ້ວ</button>` : ''}
            ${!isDone && !isCancelled && !isPostponed && isSuperior()
              ? `<button data-manager-only onclick="openPostponeMeet(${m.id})" style="border:1px solid #FAC775;background:#FFF3CD;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:11px;color:#856404">⏩ ເລື່ອນ</button>` : ''}
            ${!isDone && !isCancelled && !isPostponed && isSuperior()
              ? `<button data-manager-only onclick="cancelMeet(${m.id})" style="border:1px solid #F5C4B3;background:#FDF5F3;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:11px;color:#993C1D">🚫 ຍົກເລີກ</button>` : ''}
            ${(isCancelled||isPostponed||isDone) && isSuperior()
              ? `<button data-manager-only onclick="restoreMeet(${m.id})" style="border:1px solid var(--border);background:var(--c2l);border-radius:6px;padding:3px 8px;cursor:pointer;font-size:11px;color:var(--c2m)"><i class="ti ti-refresh"></i> ຟື້ນຟູ</button>` : ''}
            ${canEdit() && !isCancelled
              ? `<button class="btn-edit" data-manager-only onclick="openEditMeet(${m.id})" style="border:1px solid var(--border);background:var(--c2l);border-radius:6px;padding:3px 8px;cursor:pointer;font-size:11px;color:var(--c2m)"><i class="ti ti-pencil"></i> ແກ້ໄຂ</button>` : ''}
            ${canDelete()
              ? `<button class="btn-delete" data-manager-only onclick="deleteMeet(${m.id})" style="border:1px solid var(--border);background:#faece7;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:11px;color:#993C1D"><i class="ti ti-trash"></i> ລຶບ</button>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');
}

async function openEditMeet(id) {
  const m = allMeets.find(x=>x.id===id);
  if(!m) return;
  document.getElementById('editMeetId').value  = id;
  document.getElementById('eMType').value      = m.meet_type||'ກອງປະຊຸມ';
  document.getElementById('eMTitle').value     = m.title;
  document.getElementById('eMDate').value      = m.meet_date;
  document.getElementById('eMTime').value      = m.meet_time;
  document.getElementById('eMLoc').value       = m.location||'';
  await populateParticipantSelect('eMAtt', normalizeParticipants(m.attendees||[]));
  document.getElementById('eMNote').value      = m.notes||'';
  const form = document.getElementById('editMeetForm');
  form.style.display = 'block';
  form.scrollIntoView({behavior:'smooth', block:'nearest'});
}

async function saveEditMeet() {
  if (!canManageMeetings()) return toast('⛔ ສະເພາະ Admin/Manager ແກ້ນັດໝາຍໄດ້');
  const id = parseInt(document.getElementById('editMeetId').value);
  const t  = document.getElementById('eMTitle').value.trim();
  if(!t){ toast('⚠️ ໃສ່ຫົວຂໍ້ກ່ອນ'); return; }
  const att = selectedParticipantEmails('eMAtt');
  if (att.length === 0) { toast('⚠️ ເລືອກຜູ້ເຂົ້າຮ່ວມຢ່າງໜ້ອຍ 1 ຄົນ'); return; }
  const tp  = document.getElementById('eMType').value;
  const {error} = await db.from('meetings').update({
    title:t,
    meet_type: tp,
    meet_date: document.getElementById('eMDate').value||null,
    meet_time: document.getElementById('eMTime').value||null,
    location:  document.getElementById('eMLoc').value||'ຫ້ອງປະຊຸມ',
    notes:     document.getElementById('eMNote').value,
    attendees: att
  }).eq('id',id);
  if(error){ toast('❌ '+error.message); return; }
  await logAction('updated','meeting', id, t,
    `[${tp}] ${document.getElementById('eMDate').value} ${document.getElementById('eMTime').value} | ${document.getElementById('eMLoc').value} | participants: ${att.join(', ')}`);
  toast('✅ ແກ້ໄຂສຳເລັດ!');
  document.getElementById('editMeetForm').style.display = 'none';
  loadMeet();
}

async function quickConfirmMeet(id) {
  const m = allMeets.find(x=>x.id===id);
  const {error} = await db.from('meetings').update({meet_status:'done'}).eq('id',id);
  if (error) { toast('❌ '+error.message); return; }
  await logAction('updated','meeting', id, m?.title||'', 'meet_status → done (dashboard)');
  toast('✅ ຢືນຢັນປະຊຸມແລ້ວ!');
  loadDash();
}

async function quickCancelMeet(id) {
  const m = allMeets.find(x=>x.id===id);
  if (!confirm(`ຢືນຢັນຍົກເລີກ "${m?.title||''}"?`)) return;
  const {error} = await db.from('meetings').update({meet_status:'cancelled'}).eq('id',id);
  if (error) { toast('❌ '+error.message); return; }
  await logAction('updated','meeting', id, m?.title||'', 'meet_status → cancelled (dashboard)');
  toast('🚫 ຍົກເລີກນັດໝາຍແລ້ວ');
  loadDash();
}

function quickPostponeMeet(id) {
  // ເປີດ postpone modal ເດີມ ແລ້ວ callback ໄປ loadDash
  openPostponeMeet(id);
  // override save to also refresh dash
  window._postponeFromDash = true;
}

async function confirmMeet(id) {
  const m = allMeets.find(x=>x.id===id);
  if (!confirm(`ຢືນຢັນວ່າ "${m?.title||''}" ໄດ້ປະຊຸມແລ້ວ?`)) return;
  const {error} = await db.from('meetings').update({meet_status:'done'}).eq('id',id);
  if (error) { toast('❌ '+error.message); return; }
  await logAction('updated','meeting', id, m?.title||'', 'meet_status → done');
  toast('✅ ຢືນຢັນປະຊຸມແລ້ວ!');
  loadMeet();
}

async function cancelMeet(id) {
  const m = allMeets.find(x=>x.id===id);
  if (!confirm(`ຢືນຢັນຍົກເລີກ "${m?.title||''}"?`)) return;
  const {error} = await db.from('meetings').update({meet_status:'cancelled'}).eq('id',id);
  if (error) { toast('❌ '+error.message); return; }
  await logAction('updated','meeting', id, m?.title||'', 'meet_status → cancelled');
  toast('🚫 ຍົກເລີກນັດໝາຍແລ້ວ');
  loadMeet();
}

async function restoreMeet(id) {
  const {error} = await db.from('meetings').update({meet_status:'scheduled'}).eq('id',id);
  if (error) { toast('❌ '+error.message); return; }
  toast('✅ ຟື້ນຟູນັດໝາຍແລ້ວ');
  loadMeet();
}

function openPostponeMeet(id) {
  const m = allMeets.find(x=>x.id===id);
  if (!m) return;
  document.getElementById('pmId').value    = id;
  document.getElementById('pmTitle').textContent = m.title;
  document.getElementById('pmDate').value  = '';
  document.getElementById('pmTime').value  = m.meet_time||'';
  document.getElementById('pmCreate').checked = true;
  document.getElementById('postponeMeetModal').style.display = 'flex';
}

function closePostponeMeet() {
  document.getElementById('postponeMeetModal').style.display = 'none';
}

async function savePostponeMeet() {
  const id      = parseInt(document.getElementById('pmId').value);
  const newDate = document.getElementById('pmDate').value;
  const newTime = document.getElementById('pmTime').value;
  const doCreate = document.getElementById('pmCreate').checked;
  if (!newDate) { toast('⚠️ ເລືອກວັນທີໃໝ່ກ່ອນ'); return; }

  const m = allMeets.find(x=>x.id===id);

  // Mark original as postponed
  await db.from('meetings').update({meet_status:'postponed'}).eq('id',id);
  await logAction('updated','meeting', id, m?.title||'', `⏩ ເລື່ອນ → ${newDate}`);

  if (doCreate) {
    // Create new meeting with same details but new date
    const {error} = await db.from('meetings').insert({
      title:     m.title,
      meet_date: newDate,
      meet_time: newTime||m.meet_time||null,
      location:  m.location,
      notes:     m.notes,
      attendees: normalizeParticipants(m.attendees),
      meet_type: m.meet_type,
      meet_status: 'scheduled'
    });
    if (error) { toast('❌ '+error.message); return; }
    await logAction('created','meeting', 0, m.title, `[ເລື່ອນຈາກ ${m.meet_date}] → ${newDate}`);
    toast('⏩ ເລື່ອນ + ສ້າງນັດໃໝ່ສຳເລັດ!');
  } else {
    toast('⏩ ໝາຍວ່າເລື່ອນແລ້ວ');
  }
  closePostponeMeet();
  if (window._postponeFromDash) {
    window._postponeFromDash = false;
    loadDash();
  } else {
    loadMeet();
  }
}

async function deleteMeet(id) {
  if(!confirm('ຢືນຢັນລຶບກອງປະຊຸມນີ້?')) return;
  const meet = allMeets.find(m=>m.id===id);
  const {error} = await db.from('meetings').delete().eq('id',id);
  if(error){toast('❌ '+error.message);return;}
  await logAction('deleted','meeting', id, meet?.title||'', `${meet?.meet_date||''} ${meet?.meet_time||''}`);
  toast('🗑️ ລຶບສຳເລັດ');
  loadMeet();
}

function clearDocSearch() {
  ['docSearch','dSearchFrom','dSearchDir'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const dt=document.getElementById('dSearchType'); if(dt) dt.value='';
  const ds=document.getElementById('dSearchStatus'); if(ds) ds.value='';
  renderDocs();
}

function clearMeetSearch() {
  ['meetSearch','mSearchFrom','mSearchTo','mSearchLoc','mFilterType','mFilterStatus'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  renderMeet();
}

async function saveMeet() {
  if (!canManageMeetings()) return toast('⛔ ສະເພາະ Admin/Manager ເພີ່ມນັດໝາຍໄດ້');
  const t = document.getElementById('mTitle').value.trim();
  if(!t){toast('⚠️ ໃສ່ຫົວຂໍ້ກ່ອນ');return;}
  const att = selectedParticipantEmails('mAtt');
  if (att.length === 0) { toast('⚠️ ເລືອກຜູ້ເຂົ້າຮ່ວມຢ່າງໜ້ອຍ 1 ຄົນ'); return; }
  const tp = document.getElementById('mType').value;
  const {error} = await db.from('meetings').insert({
    title:t, meet_date:document.getElementById('mDate').value||null,
    meet_time:document.getElementById('mTime').value||null,
    location:document.getElementById('mLoc').value||'ຫ້ອງປະຊຸມ',
    notes:document.getElementById('mNote').value, attendees:att,
    meet_type: tp
  });
  if(error){toast('❌ '+error.message);return;}
  await logAction('created','meeting', 0, t,
    `[${tp}] ${document.getElementById('mDate').value} ${document.getElementById('mTime').value} | ${document.getElementById('mLoc').value} | participants: ${att.join(', ')}`);
  toast('✅ ບັນທຶກສຳເລັດ!');
  toggleForm('addMeetForm');
  ['mTitle','mLoc','mNote'].forEach(id=>document.getElementById(id).value='');
  await populateParticipantSelect('mAtt', [myEmail()]);
  loadMeet();
}

// ════ LEAVE / ABSENCE ════

const leaveTypeMap = {
  sick:     { icon:'🤒', label:'ລາປ່ວຍ',       bg:'#FAECE7', color:'#993C1D' },
  personal: { icon:'🏠', label:'ລາສ່ວນຕົວ',    bg:'#FFF3CD', color:'#856404' },
  vacation: { icon:'🌴', label:'ລາພັກຮ້ອນ',    bg:'#E1F5EE', color:'#0F6E56' },
  overtime: { icon:'⚡', label:'ຄອບລ່ວງໜ້າ',   bg:'#EEEDFE', color:'#534AB7' },
  other:    { icon:'📝', label:'ອື່ນໆ',          bg:'#F1EFE8', color:'#5F5E5A' },
};
const leaveStatusMap = {
  pending:  { label:'⏳ ລໍຖ້າ',        bg:'#FFF3CD', color:'#856404' },
  approved: { label:'✅ ອະນຸມັດ',      bg:'#E1F5EE', color:'#0F6E56' },
  active:   { label:'🟢 ກຳລັງລາ',     bg:'#D1FAE5', color:'#065F46' },
  rejected: { label:'❌ ປະຕິເສດ',     bg:'#FAECE7', color:'#993C1D' },
};

