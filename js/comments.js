async function loadAllCommentPreviews() {
  const { data } = await db.from('task_comments')
    .select('*')
    .order('created_at', {ascending: false});
  if (!data) return;

  // Group by task_id — take latest 2 per task
  const byTask = {};
  data.forEach(c => {
    if (!byTask[c.task_id]) byTask[c.task_id] = [];
    if (byTask[c.task_id].length < 2) byTask[c.task_id].push(c);
  });

  Object.entries(byTask).forEach(([taskId, comments]) => {
    const el = document.getElementById(`comment-preview-${taskId}`);
    if (!el) return;
    const typeIcon = {update:'📝', blocker:'⛔', resolved:'✅', note:'💬'};
    const typeBg   = {update:'var(--c2l)', blocker:'var(--c4l)', resolved:'var(--c1l)', note:'#F1EFE8'};
    const typeCol  = {update:'var(--c2m)', blocker:'var(--c4m)', resolved:'var(--c1m)', note:'#5F5E5A'};
    el.innerHTML = comments.map(c => {
      const ut  = c.update_type || 'note';
      const bg  = typeBg[ut]  || '#F1EFE8';
      const col = typeCol[ut] || '#5F5E5A';
      const icon = typeIcon[ut] || '💬';
      const who  = (c.user_email||'').split('@')[0];
      const ackd = c.ack_by ? `<span style="font-size:10px;background:#E1F5EE;color:#0F6E56;padding:1px 6px;border-radius:8px;margin-left:4px">✓ ຮັບຮູ້</span>` : '';
      const fixed = c.fixed_by ? `<span style="font-size:10px;background:#E6F1FB;color:#185FA5;padding:1px 6px;border-radius:8px;margin-left:4px">🔧 ແກ້ໄປ</span>` : '';
      const canAck   = !c.ack_by   && canAckComment(c);
      const canFixed = !c.fixed_by && canAckComment(c);
      return `<div style="background:${bg};border-radius:6px;padding:5px 8px;margin-bottom:4px;font-size:12px;color:${col}">
        <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">
          <span style="font-weight:500">${icon} ${h(who)}:</span>
          <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h(c.body)}</span>
          ${ackd}${fixed}
        </div>
        ${(canAck || canFixed) ? `<div style="display:flex;gap:4px;margin-top:4px">
          ${canAck   ? `<button onclick="ackComment(${c.id},${taskId},'ack')"   style="font-size:10px;padding:2px 7px;border-radius:6px;border:1px solid #1D9E75;background:#E1F5EE;color:#0F6E56;cursor:pointer;font-family:inherit">✓ ຮັບຮູ້</button>` : ''}
          ${canFixed ? `<button onclick="ackComment(${c.id},${taskId},'fixed')" style="font-size:10px;padding:2px 7px;border-radius:6px;border:1px solid #185FA5;background:#E6F1FB;color:#185FA5;cursor:pointer;font-family:inherit">🔧 ແກ້ໄປ</button>` : ''}
        </div>` : ''}
      </div>`;
    }).join('');
  });
}

async function ackComment(commentId, taskId, type) {
  const field = type === 'ack' ? 'ack_by' : 'fixed_by';
  const label = type === 'ack' ? '✓ ຮັບຮູ້' : '🔧 ແກ້ໄປ';
  await db.from('task_comments').update({
    [field]: currentUser?.email || '—'
  }).eq('id', commentId);
  toast(`${label} ແລ້ວ!`);
  // refresh preview only
  await loadAllCommentPreviews();
  // also refresh full comment list if open
  const open = document.getElementById(`comments-${taskId}`);
  if (open && open.style.display !== 'none') await loadComments(taskId);
}

// track update type per task
const updateTypes = {};

function setUpdateType(taskId, type) {
  updateTypes[taskId] = type;
  const types = ['update','blocker','resolved','note'];
  const styles = {
    update:   {bg:'var(--c2l)',  border:'var(--c2)',  color:'var(--c2m)'},
    blocker:  {bg:'var(--c4l)',  border:'var(--c4)',  color:'var(--c4m)'},
    resolved: {bg:'var(--c1l)',  border:'var(--c1)',  color:'var(--c1m)'},
    note:     {bg:'var(--c5l)',  border:'var(--c5)',  color:'var(--c5m)'},
  };
  types.forEach(t => {
    const btn = document.getElementById(`utype-${t}-${taskId}`);
    if (!btn) return;
    const s = t === type ? styles[t] : {bg:'transparent', border:'var(--border)', color:'var(--muted)'};
    btn.style.background = s.bg;
    btn.style.borderColor = s.border;
    btn.style.color = s.color;
  });
}

async function toggleComments(taskId) {
  const el = document.getElementById(`comments-${taskId}`);
  if (!el) return;
  if (el.style.display === 'none') {
    el.style.display = 'block';
    setUpdateType(taskId, 'update');
    await loadComments(taskId);
  } else {
    el.style.display = 'none';
  }
}

async function loadComments(taskId) {
  const { data } = await db.from('task_comments')
    .select('*').eq('task_id', taskId).order('created_at', {ascending:false});
  const list = data || [];
  const el = document.getElementById(`comment-list-${taskId}`);
  if (!el) return;
  const typeIcon = {update:'📝', blocker:'⛔', resolved:'✅', note:'💬'};
  const typeBg   = {update:'var(--c2l)', blocker:'var(--c4l)', resolved:'var(--c1l)', note:'var(--c5l)'};
  const typeColor= {update:'var(--c2m)', blocker:'var(--c4m)', resolved:'var(--c1m)', note:'var(--c5m)'};
  el.innerHTML = list.length === 0
    ? '<div style="font-size:12px;color:var(--muted);padding:4px 0">ຍັງບໍ່ມີ update</div>'
    : list.map(c => {
        const initials = (c.user_email||'?').substring(0,2).toUpperCase();
        const dt = new Date(c.created_at).toLocaleString('lo-LA');
        const ut = c.update_type||'note';
        const icon = typeIcon[ut]||'💬';
        const bg = typeBg[ut]||'var(--c5l)';
        const col = typeColor[ut]||'var(--c5m)';
        const canAck   = !c.ack_by   && canAckComment(c);
        const canFixed = !c.fixed_by && canAckComment(c);
        return `<div class="comment-item" style="border-left:3px solid ${col};padding-left:10px;border-radius:0">
          <div class="comment-header">
            <div class="comment-avatar" style="background:${bg};color:${col}">${initials}</div>
            <span class="comment-meta" style="font-weight:600;color:${col}">${icon} ${{update:'ອັບເດດ',blocker:'ຕິດຂັດ',resolved:'ແກ້ໄຂໄດ້',note:'ໝາຍເຫດ'}[ut]||ut}</span>
            <span class="comment-meta">${c.user_email} · ${dt}</span>
            ${c.ack_by?`<span style="font-size:10px;background:#E1F5EE;color:#0F6E56;padding:1px 6px;border-radius:8px">✓ ຮັບຮູ້ໂດຍ ${c.ack_by.split('@')[0]}</span>`:''}
            ${c.fixed_by?`<span style="font-size:10px;background:#E6F1FB;color:#185FA5;padding:1px 6px;border-radius:8px">🔧 ແກ້ໄປໂດຍ ${c.fixed_by.split('@')[0]}</span>`:''}
          </div>
          <div class="comment-body" style="margin-top:4px">${h(c.body)}</div>
          ${c.progress_snapshot!=null?`<div style="font-size:11px;color:var(--muted);margin-top:3px;padding-left:32px">Progress: ${c.progress_snapshot}% | Status: ${{inprogress:'ດຳເນີນ',blocked:'ຕິດຂັດ',done:'ສຳເລັດ'}[c.status_snapshot]||c.status_snapshot||'—'}</div>`:''}
          ${(canAck||canFixed)?`<div style="display:flex;gap:6px;margin-top:6px;padding-left:0">
            ${canAck?`<button onclick="ackComment(${c.id},${taskId},'ack')" style="font-size:11px;padding:3px 10px;border-radius:6px;border:1px solid #1D9E75;background:#E1F5EE;color:#0F6E56;cursor:pointer;font-family:inherit">✓ ຮັບຮູ້</button>`:''}
            ${canFixed?`<button onclick="ackComment(${c.id},${taskId},'fixed')" style="font-size:11px;padding:3px 10px;border-radius:6px;border:1px solid #185FA5;background:#E6F1FB;color:#185FA5;cursor:pointer;font-family:inherit">🔧 ແກ້ໄປ</button>`:''}
          </div>`:''}
        </div>`;
      }).join('');
}

async function submitUpdate(taskId) {
  const body = document.getElementById(`comment-input-${taskId}`)?.value?.trim();
  if (!body) { toast('⚠️ ຂຽນ update ກ່ອນ'); return; }
  if (!currentUser) { toast('⚠️ ກະລຸນາ Login'); return; }

  const updateType = updateTypes[taskId] || 'note';
  const progress = parseInt(document.getElementById(`prog-${taskId}`)?.value || 0);
  const status = document.getElementById(`stat-${taskId}`)?.value || 'inprogress';

  // Save comment with metadata
  await db.from('task_comments').insert({
    task_id: taskId,
    user_id: currentUser.id,
    user_email: currentUser.email,
    body,
    update_type: updateType,
    progress_snapshot: progress,
    status_snapshot: status
  });

  // Update task progress + status
  await db.from('tasks').update({ progress, status }).eq('id', taskId);

  const task = allTasks.find(t => t.id === taskId);
  await logAction('updated','task', taskId, task?.name||'',
    `${updateType}: ${body.substring(0,60)} | progress:${progress}% status:${status}`);

  document.getElementById(`comment-input-${taskId}`).value = '';
  toast('✅ ບັນທຶກ update ສຳເລັດ!');
  await loadComments(taskId);
  await loadTasks();
  await loadAllCommentPreviews();
}

// ── ADVANCED SEARCH helpers ───────────────────────
