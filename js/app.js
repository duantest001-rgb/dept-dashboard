
// ════════════════════════════════════════════
//  ⚙️  CONFIG — ແກ້ຄ່ານີ້ກ່ອນ Deploy
// ════════════════════════════════════════════
const SUPABASE_URL  = 'https://uyvmrqblpttvxvbyvyfa.supabase.co';   // ← ໃສ່ URL ຂອງເຈົ້ານີ້
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5dm1ycWJscHR0dnh2Ynl2eWZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1NDkyNDYsImV4cCI6MjA5NDEyNTI0Nn0.Y4XmNdJt4LiiewbPtKJlsYjt7oCTEqZBNA9X5qrukms';                      // ← ໃສ່ anon/public key ຂອງເຈົ້ານີ້
// ════════════════════════════════════════════

const { createClient } = supabase;
let db;

// ── SAFE HELPERS ─────────────────────────────────
const $ = (id) => document.getElementById(id);
function h(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
function safeAttr(value) { return h(value).replaceAll('`', '&#096;'); }
function showLoadError(elId, error, label='ໂຫຼດຂໍ້ມູນ') {
  const el = $(elId);
  if (el) el.innerHTML = `<div class="empty">❌ ${h(label)} ບໍ່ສຳເລັດ: ${h(error?.message || error || 'Unknown error')}</div>`;
}
function requireDbReady() {
  if (!db) {
    $('config-warn').style.display = 'block';
    return false;
  }
  return true;
}


// ── ROLE / PROFILE / PERMISSION helpers ─────────────────────────────────
let currentUser = null;
let currentProfile = null;
let currentRole = 'viewer';

const ROLE_LABELS = {
  admin: 'Admin',
  manager: 'ຫົວໜ້າ',
  employee: 'ພະນັກງານ',
  viewer: 'Viewer'
};

function normalizeRole(role) {
  const r = String(role || 'viewer').trim().toLowerCase();
  return ['admin','manager','employee','viewer'].includes(r) ? r : 'viewer';
}

function formatRoleLabel(role) {
  return ROLE_LABELS[normalizeRole(role)] || role || 'Viewer';
}

function hasRole(...roles) {
  return roles.includes(currentRole);
}

function myEmail() {
  return (currentUser?.email || currentProfile?.email || '').trim().toLowerCase();
}

// Backward-compatible name: now returns full email, not prefix.
function myEmailPrefix() {
  return myEmail();
}

function myEmailKey() {
  return myEmail().split('@')[0] || '';
}

// Query/RLS Sync helper: owner/created_by must be stored as full email.
// This keeps new data aligned with Supabase RLS policies.

// ════ PRODUCTION MODE SETTINGS (v15) ════
const APP_DEBUG = false;
function debugLog(...args) { if (APP_DEBUG) console.log(...args); }
function debugError(...args) { if (APP_DEBUG) console.error(...args); }
function userSafeErrorMessage(error, fallback = 'ບໍ່ສາມາດໂຫຼດຂໍ້ມູນໄດ້') {
  if (APP_DEBUG) return errorMessage(error) || fallback;
  return fallback;
}

function normalizeUserRef(value, fallbackEmail = myEmail()) {
  const v = String(value || '').trim().toLowerCase();
  const fallback = String(fallbackEmail || '').trim().toLowerCase();
  if (!v || v === '—') return fallback || '—';

  // Dropdown values from profiles are already emails.
  if (v.includes('@')) return v;

  // If old code gives only prefix of current user, map it to current email.
  if (fallback && v === fallback.split('@')[0]) return fallback;

  // Try to map prefix/full label against loaded users.
  const found = (cachedUserOptions || []).find(u => {
    const email = String(u.email || u.value || '').trim().toLowerCase();
    const key = email.split('@')[0];
    const label = String(u.label || '').trim().toLowerCase();
    return v === email || v === key || label.includes(v);
  });
  return found?.email || found?.value || v;
}

function requireEmailRef(value, fallbackEmail = myEmail(), fieldLabel = 'user') {
  const normalized = normalizeUserRef(value, fallbackEmail);
  const email = String(normalized || '').trim().toLowerCase();
  if (!email || email === '—' || !email.includes('@')) {
    debugError('Invalid user reference for save:', { fieldLabel, value, normalized, fallbackEmail });
    toast(`⚠️ ${fieldLabel} ຕ້ອງເປັນ email ເຊັ່ນ pou@bd.com`);
    return null;
  }
  return email;
}

function matchesMe(value) {
  const v = String(value || '').trim().toLowerCase();
  return !!v && (v === myEmail() || v === myEmailKey());
}

async function loadUserProfile() {
  try {
    currentRole = 'viewer';
    currentUser = null;
    currentProfile = null;

    const { data: { user }, error: userError } = await db.auth.getUser();
    if (userError) throw userError;
    if (!user) return null;

    currentUser = user;

    const { data: profile, error } = await db
      .from('profiles')
      .select('id,email,full_name,role')
      .eq('id', user.id)
      .maybeSingle();

    if (error) throw error;

    currentProfile = profile || {
      id: user.id,
      email: user.email,
      full_name: '',
      role: 'viewer'
    };

    currentRole = normalizeRole(currentProfile.role);

    const userEmailEl = $('userEmail');
    if (userEmailEl) {
      const label = formatRoleLabel(currentRole);
      userEmailEl.textContent = `${currentProfile.email || user.email} (${label})`;
      userEmailEl.dataset.role = currentRole;
    }

    applyPermissionUI();
    debugLog('Profile loaded:', currentProfile.email, currentRole);
    return currentProfile;
  } catch (err) {
    debugError('loadUserProfile failed:', err);
    toast('⚠️ ໂຫຼດ Profile/Role ບໍ່ສຳເລັດ');
    return null;
  }
}

function setVisible(el, visible, fallbackDisplay = '') {
  if (!el) return;

  // IMPORTANT:
  // Many buttons are initially written as style="display:none".
  // If we store "none" as the default display, they will never show again.
  // So we store fallbackDisplay instead when initial display is none.
  if (el.dataset.defaultDisplay === undefined) {
    const currentDisplay = (el.style.display || '').trim();
    el.dataset.defaultDisplay =
      currentDisplay && currentDisplay !== 'none'
        ? currentDisplay
        : (fallbackDisplay || '');
  }

  el.style.display = visible
    ? (el.dataset.defaultDisplay || fallbackDisplay || '')
    : 'none';
}

function applyPermissionUI() {
  const role = currentRole || 'viewer';
  const isViewer = role === 'viewer';
  const superior = hasRole('admin','manager');

  // ===== NAV / MAIN ACTIONS =====
  setVisible($('adminNavBtn'), hasRole('admin'), 'inline-flex');
  setVisible($('addAnnBtn'), superior, 'inline-flex');

  // ===== ATTRIBUTE-BASED PERMISSIONS =====
  document.querySelectorAll('[data-admin-only]').forEach(el => {
    setVisible(el, hasRole('admin'));
  });

  document.querySelectorAll('[data-manager-only]').forEach(el => {
    setVisible(el, superior);
  });

  document.querySelectorAll('[data-employee-only]').forEach(el => {
    setVisible(el, hasRole('employee'));
  });

  // Generic write actions: admin/manager/employee can write, viewer read-only.
  document.querySelectorAll('[data-write-action], .btn-add, .btn-edit, .btn-delete').forEach(el => {
    setVisible(el, !isViewer);
  });

  // Disable forms for viewer if a form is already open.
  document.querySelectorAll('#mainApp input, #mainApp select, #mainApp textarea, #mainApp button').forEach(el => {
    if (el.closest('.nav') || el.id === 'userEmail') return;
    if (isViewer && (el.matches('[data-write-action], .btn-primary') || el.closest('form'))) {
      el.disabled = true;
    } else if (!isViewer && el.dataset.forceDisabled !== 'true') {
      el.disabled = false;
    }
  });

  debugLog('Permission UI Applied:', role);
}

function canWrite()   { return !hasRole('viewer'); }
function canManageMeetings() { return isSuperior(); }
function canManageLeaveBalance() { return isSuperior(); }
function canAdmin()   { return hasRole('admin'); }
function isSuperior() { return hasRole('admin','manager'); }

// Tasks
function canEditTask(task)   { return isSuperior() || matchesMe(task?.owner); }
function canDeleteTask()     { return isSuperior(); }
function canCommentTask(task){ return isSuperior() || matchesMe(task?.owner); }

// Docs
function canEditDoc(doc)   { return isSuperior() || matchesMe(doc?.created_by); }
function canDeleteDoc()    { return isSuperior(); }

// Announcements
function canManageAnn()  { return hasRole('admin','manager'); }

// ack/fixed: superior ຫຼື ຄົນທີ່ບໍ່ແມ່ນເຈົ້າຂອງ comment
function canAckComment(comment) { return isSuperior() || (currentUser && comment.user_id !== currentUser.id); }

// Legacy aliases (meetings ໃຊ້)
function canEdit()   { return isSuperior(); }
function canDelete() { return isSuperior(); }

// ── ACTIVITY LOG ──────────────────────────────────
async function logAction(action, target_type, target_id, target_name, detail='') {
  if (!currentUser) return;
  await db.from('activity_log').insert({
    user_id: currentUser.id,
    user_email: currentUser.email,
    action, target_type, target_id, target_name, detail
  });
}

async function loadLog() {
  // Populate user dropdown ຄັ້ງທຳອິດ
  const userSel = document.getElementById('logUserFilter');
  if (userSel && userSel.options.length <= 1) {
    const opts = await loadUserOptions();
    opts.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.email;
      opt.textContent = o.label + (o.value === myEmail() ? ' (ທ່ານ)' : '');
      userSel.appendChild(opt);
    });
  }
  const typeFilter = document.getElementById('logFilter')?.value || '';
  const userFilter = document.getElementById('logUserFilter')?.value || '';
  let q = db.from('activity_log').select('*').order('created_at', {ascending:false}).limit(200);
  if (typeFilter) q = q.eq('target_type', typeFilter);
  if (userFilter) q = q.eq('user_email', userFilter);
  const { data } = await q;
  const list = data || [];
  const icons  = {created:'➕', updated:'✏️', deleted:'🗑️', approved:'✅', commented:'💬'};
  const colors = {created:'#E1F5EE', updated:'#E6F1FB', deleted:'#FAECE7', approved:'#EAF3DE', commented:'#EEEDFE'};
  document.getElementById('logList').innerHTML = list.length === 0
    ? '<div class="empty">ບໍ່ມີ activity</div>'
    : list.map(l => {
        const dt   = new Date(l.created_at).toLocaleString('lo-LA');
        const who  = l.user_email || '?';
        const name = who.split('@')[0];
        return `<div class="log-item">
          <div class="log-icon" style="background:${colors[l.action]||'#F1EFE8'}">${icons[l.action]||'•'}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;color:var(--text)">
              <strong style="cursor:pointer;color:var(--c2m)" onclick="filterLogByUser('${h(who)}')" title="ກອງຕາມ ${h(name)}">${h(name)}</strong>
              <span style="color:var(--muted)"> ${l.action} </span>
              <strong>${h(l.target_name||'')}</strong>
            </div>
            ${l.detail?`<div style="font-size:11px;color:var(--muted);margin-top:2px">${h(l.detail)}</div>`:''}
            <div style="font-size:11px;color:var(--muted);margin-top:2px">${dt} · ${l.target_type}</div>
          </div>
        </div>`;
      }).join('');
}

function filterLogByUser(email) {
  const sel = document.getElementById('logUserFilter');
  if (sel) { sel.value = email; loadLog(); }
}

function clearLogFilter() {
  const t = document.getElementById('logFilter');
  const u = document.getElementById('logUserFilter');
  if (t) t.value = '';
  if (u) u.value = '';
  loadLog();
}
// ── COMMENTS ─────────────────────────────────────
// ── COMMENT PREVIEW (show latest in task list) ──────────
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
function clearSearch() {
  ['taskSearch','sOwner','sStatus','sPriority','sDueBefore'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  renderTasks();
}

// ── EXPORT CSV ────────────────────────────────────
// Document workflow status helper
// ສຳຄັນ: ຂັ້ນຕອນສຸດທ້າຍ ≠ ສຳເລັດ.
// ເອກະສານຈະສຳເລັດກໍຕໍ່ເມື່ອ doc_status === 'done' ເທົ່ານັ້ນ.
function getDocWorkflowStatus(doc) {
  if (!doc) return 'inprogress';
  if (doc.doc_status === 'cancelled') return 'cancelled';
  if (doc.doc_status === 'done') return 'done';
  return 'inprogress';
}

function isDocDone(doc) {
  return getDocWorkflowStatus(doc) === 'done';
}

function isDocCancelled(doc) {
  return getDocWorkflowStatus(doc) === 'cancelled';
}

function isDocInProgress(doc) {
  return getDocWorkflowStatus(doc) === 'inprogress';
}

function isDocAtFinalStep(doc) {
  const steps = Array.isArray(doc?.steps) ? doc.steps : [];
  const lastIndex = Math.max(steps.length - 1, 0);
  return Number(doc?.current_step || 0) >= lastIndex;
}


function exportXLSX() {
  const statusMap   = {inprogress:'ດຳເນີນການ', done:'ສຳເລັດ', blocked:'ຕິດຂັດ', todo:'ລໍຖ້າ', review:'ກວດສອບ'};

  const priorityMap = {high:'ສູງ 🔴', normal:'ປົກກະຕິ 🟡', low:'ຕ່ຳ 🟢', urgent:'ດ່ວນ 🔴'};

  // ── Sheet 1: ໜ້າວຽກ ──────────────────────────────────
  const headers = ['#','ຊື່ວຽກ','ຜູ້ຮັບຜິດຊອບ','ກຳນົດສົ່ງ','ສະຖານະ','ຄວາມສຳຄັນ','ຄວາມຄືບໜ້າ','ໝາຍເຫດ'];
  const rows = allTasks.map(t => {
    const pct = t.progress || 0;
    const bar = '█'.repeat(Math.floor(pct/10)) + '░'.repeat(10 - Math.floor(pct/10));
    return [
      t.id,
      t.name || '',
      t.owner || '',
      t.due_date || '',
      statusMap[t.status]   || t.status   || '',
      priorityMap[t.priority] || t.priority || '',
      `${bar} ${pct}%`,
      (t.notes || '').replace(/\n/g, ' | ')
    ];
  });

  const ws1Data = [headers, ...rows];
  const ws1 = XLSX.utils.aoa_to_sheet(ws1Data);

  // Column widths
  ws1['!cols'] = [
    {wch:5},{wch:38},{wch:18},{wch:14},
    {wch:14},{wch:14},{wch:22},{wch:45}
  ];

  // ── Sheet 2: ສະຫຼຸບ ─────────────────────────────────
  const counts = {};
  allTasks.forEach(t => {
    const s = statusMap[t.status] || t.status || 'ບໍ່ລະບຸ';
    counts[s] = (counts[s] || 0) + 1;
  });
  const ws2Data = [
    ['ສະຖານະ','ຈຳນວນ (ວຽກ)'],
    ...Object.entries(counts),
    [],
    ['ລວມທັງໝົດ', allTasks.length],
    ['Export ວັນທີ', new Date().toLocaleDateString('lo-LA')]
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(ws2Data);
  ws2['!cols'] = [{wch:18},{wch:14}];

  // ── Workbook ─────────────────────────────────────────
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, 'ໜ້າວຽກ');
  XLSX.utils.book_append_sheet(wb, ws2, 'ສະຫຼຸບ');

  const date = new Date().toISOString().slice(0,10);
  XLSX.writeFile(wb, `tasks_${date}.xlsx`);
  toast('📥 Export Excel ສຳເລັດ!');
}

// ════ MEETING PARTICIPANTS HELPERS ════
// Store participants as email array, not Lao names or comma text.
function normalizeParticipants(value) {
  let arr = [];
  if (Array.isArray(value)) arr = value;
  else if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      arr = Array.isArray(parsed) ? parsed : value.split(',');
    } catch (_) {
      arr = value.split(',');
    }
  }
  return [...new Set(arr
    .map(v => requireEmailRef(v, '', 'ຜູ້ເຂົ້າຮ່ວມ'))
    .filter(Boolean)
    .map(v => String(v).trim().toLowerCase()))];
}

function selectedParticipantEmails(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return [];
  return [...sel.selectedOptions]
    .map(o => String(o.value || '').trim().toLowerCase())
    .filter(v => v.includes('@'));
}

async function populateParticipantSelect(selectId, selected = []) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const opts = await loadUserOptions();
  const selectedEmails = new Set(normalizeParticipants(selected));
  if (selectedEmails.size === 0 && selectId === 'mAtt' && myEmail()) {
    selectedEmails.add(myEmail());
  }
  sel.innerHTML = opts.map(o => `<option value="${h(o.email)}" ${selectedEmails.has(o.email) ? 'selected' : ''}>${h(o.label)}</option>`).join('');
  renderParticipantPicker(selectId);
}

function renderParticipantPicker(selectId) {
  const sel = document.getElementById(selectId);
  const picker = document.getElementById(selectId + 'Picker');
  const summary = document.getElementById(selectId + 'Summary');
  if (!sel || !picker) return;
  const options = [...sel.options];
  const selected = new Set(selectedParticipantEmails(selectId));
  picker.innerHTML = options.map(o => {
    const email = String(o.value || '').trim().toLowerCase();
    const label = o.textContent || email;
    const name = label.split('(')[0].trim() || email;
    const checked = selected.has(email);
    return `<button type="button" class="participant-chip ${checked ? 'selected' : ''}" onclick="toggleParticipant('${selectId}','${h(email)}')" title="${h(label)}">
      <span class="p-avatar">${h(participantInitial(email))}</span>
      <span class="p-main"><span class="p-name">${h(name)}</span><span class="p-email">${h(email)}</span></span>
      <span class="p-check">${checked ? '✓' : ''}</span>
    </button>`;
  }).join('');
  if (summary) {
    summary.textContent = selected.size
      ? `ເລືອກແລ້ວ ${selected.size} ຄົນ: ${[...selected].map(participantLabel).join(', ')}`
      : 'ເລືອກຜູ້ເຂົ້າຮ່ວມຢ່າງໜ້ອຍ 1 ຄົນ';
  }
}

function toggleParticipant(selectId, email) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const target = String(email || '').trim().toLowerCase();
  [...sel.options].forEach(o => {
    if (String(o.value || '').trim().toLowerCase() === target) o.selected = !o.selected;
  });
  renderParticipantPicker(selectId);
}

function participantLabel(email) {
  const e = String(email || '').trim().toLowerCase();
  const found = (cachedUserOptions || []).find(u => u.email === e);
  return found?.label || e || '—';
}

function participantInitial(email) {
  const label = participantLabel(email).split('(')[0].trim();
  const key = String(email || label || '?').trim();
  if (key.includes('@')) return key.split('@')[0].slice(0, 2).toUpperCase();
  return key.slice(0, 2).toUpperCase();
}


// ════ ADMIN ════
let allUsers = [];

async function loadAdmin() {
  if (!canAdmin()) { toast('⛔ ສິດທິ Admin ເທົ່ານັ້ນ'); return; }
  document.getElementById('adminUserList').innerHTML = '<div class="spinner">ໂຫຼດ...</div>';
  const { data, error } = await db.from('profiles').select('*').order('created_at', {ascending: true});
  if (error) { document.getElementById('adminUserList').innerHTML = '<div class="empty">❌ ໂຫຼດຂໍ້ມູນບໍ່ສຳເລັດ</div>'; return; }
  allUsers = data || [];
  renderAdminUsers();
}

function renderAdminUsers() {
  const roleBadge = {
    admin:    {bg:'#FAECE7', color:'#993C1D', label:'Admin'},
    manager:  {bg:'#E6F1FB', color:'#185FA5', label:'ຫົວໜ້າ'},
    employee: {bg:'#E1F5EE', color:'#0F6E56', label:'ພະນັກງານ'},
    viewer:   {bg:'#F1EFE8', color:'#5F5E5A', label:'Viewer'},
  };
  document.getElementById('adminUserList').innerHTML = allUsers.length === 0
    ? '<div class="empty">ບໍ່ພົບ Users</div>'
    : allUsers.map(u => {
        const rb = roleBadge[u.role] || roleBadge.viewer;
        const isSelf = currentUser && u.id === currentUser.id;
        return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
          <div style="width:36px;height:36px;border-radius:50%;background:var(--c2l);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:500;color:var(--c2m);flex-shrink:0">
            ${(u.email||'?').substring(0,2).toUpperCase()}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:500;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              ${h(u.email||'—')} ${isSelf ? '<span style="font-size:10px;color:var(--muted)">(ຕົວທ່ານ)</span>' : ''}
            </div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px">
              ເຂົ້າໃຊ້ຄັ້ງທຳອິດ: ${u.created_at ? new Date(u.created_at).toLocaleDateString('lo-LA') : '—'}
            </div>
          </div>
          <span style="background:${rb.bg};color:${rb.color};padding:3px 10px;border-radius:10px;font-size:11px;font-weight:500;flex-shrink:0">${h(rb.label)}</span>
          ${!isSelf ? `<button onclick="openEditRole('${safeAttr(u.id)}','${safeAttr(u.email)}','${safeAttr(u.role)}')" style="border:1px solid var(--border);background:var(--c2l);border-radius:6px;padding:3px 10px;cursor:pointer;font-size:11px;color:var(--c2m);flex-shrink:0"><i class="ti ti-pencil"></i> Role</button>` : ''}
        </div>`;
      }).join('');
}

function openEditRole(userId, email, currentRoleVal) {
  document.getElementById('editRoleUserId').value = userId;
  document.getElementById('editRoleEmail').textContent = email;
  document.getElementById('editRoleSelect').value = currentRoleVal;
  const form = document.getElementById('editRoleForm');
  form.style.display = 'block';
  form.scrollIntoView({behavior:'smooth', block:'nearest'});
}

async function saveUserRole() {
  const userId  = document.getElementById('editRoleUserId').value;
  const newRole = document.getElementById('editRoleSelect').value;
  const email   = document.getElementById('editRoleEmail').textContent;
  const { error } = await db.from('profiles').update({ role: newRole }).eq('id', userId);
  if (error) { toast('❌ ' + error.message); return; }
  await logAction('updated', 'user', 0, email, `role → ${newRole}`);
  toast('✅ ອັບເດດ Role ສຳເລັດ!');
  document.getElementById('editRoleForm').style.display = 'none';
  loadAdmin();
}

// ════ PROFILE ════
function openProfileModal() {
  if (!currentUser) return;
  const roleName  = {admin:'Admin',manager:'ຫົວໜ້າ',employee:'ພະນັກງານ',viewer:'Viewer'}[currentRole] || currentRole;
  const roleColor = {admin:'#993C1D',manager:'#185FA5',employee:'#0F6E56',viewer:'#5F5E5A'}[currentRole] || '#5F5E5A';
  const roleBg    = {admin:'#FAECE7',manager:'#E6F1FB',employee:'#E1F5EE',viewer:'#F1EFE8'}[currentRole] || '#F1EFE8';
  const initials  = (currentUser.email||'?').substring(0,2).toUpperCase();
  document.getElementById('profileAvatar').textContent      = initials;
  document.getElementById('profileEmailLabel').textContent  = currentUser.email;
  document.getElementById('profileRoleBadge').textContent   = roleName;
  document.getElementById('profileRoleBadge').style.background = roleBg;
  document.getElementById('profileRoleBadge').style.color      = roleColor;
  document.getElementById('newPwd').value     = '';
  document.getElementById('confirmPwd').value = '';
  const modal = document.getElementById('profileModal');
  modal.style.display = 'flex';
}

function closeProfileModal() {
  document.getElementById('profileModal').style.display = 'none';
}

async function changePassword() {
  const pwd1 = document.getElementById('newPwd').value;
  const pwd2 = document.getElementById('confirmPwd').value;
  if (!pwd1 || pwd1.length < 6) { toast('⚠️ ລະຫັດຕ້ອງຢ່າງໜ້ອຍ 6 ຕົວ'); return; }
  if (pwd1 !== pwd2)             { toast('⚠️ ລະຫັດທັງສອງບໍ່ຕົງກັນ'); return; }
  const { error } = await db.auth.updateUser({ password: pwd1 });
  if (error) { toast('❌ ' + error.message); return; }
  await logAction('updated', 'profile', 0, currentUser.email, 'ປ່ຽນລະຫັດຜ່ານ');
  toast('✅ ປ່ຽນລະຫັດຜ່ານສຳເລັດ!');
  closeProfileModal();
}

// close modal when clicking backdrop
document.addEventListener('click', e => {
  const modal = document.getElementById('profileModal');
  if (modal && e.target === modal) closeProfileModal();
});

function initApp() {
  const badConfig = !SUPABASE_URL || !SUPABASE_KEY ||
    SUPABASE_URL.includes('YOUR_PROJECT') || SUPABASE_KEY.includes('YOUR_ANON') ||
    !SUPABASE_URL.startsWith('https://') || SUPABASE_KEY.length < 20;
  if (badConfig) {
    $('config-warn').style.display = 'block';
    $('loginPage').style.display = 'none';
    $('mainApp').style.display = 'none';
    return;
  }
  db = createClient(SUPABASE_URL, SUPABASE_KEY);
  checkSession();
}

async function checkSession() {
  if (!requireDbReady()) return;
  try {
    const { data: { session }, error } = await db.auth.getSession();
    if (error) throw error;
    if (session) {
      await showApp(session.user.email);
    } else {
      $('loginPage').style.display = 'block';
    }
    db.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) await showApp(session.user.email);
      if (event === 'SIGNED_OUT') showLogin();
    });
  } catch (err) {
    debugError('checkSession failed:', err);
    showErr('❌ ເຊື່ອມຕໍ່ Supabase ບໍ່ສຳເລັດ: ' + (err.message || err));
    $('loginPage').style.display = 'block';
  }
}

async function showApp(email) {
  $('loginPage').style.display = 'none';
  $('mainApp').style.display = 'block';
  $('userEmail').textContent = email || '';

  await loadUserProfile();
  applyPermissionUI();

  $('dateNow').textContent = new Date().toLocaleDateString('lo-LA',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
  await Promise.allSettled([loadUserOptions(true), loadDash()]);
}

function showLogin() {
  document.getElementById('mainApp').style.display = 'none';
  document.getElementById('loginPage').style.display = 'block';
  document.getElementById('loginEmail').value = '';
  document.getElementById('loginPassword').value = '';
}

async function doLogin() {
  if (!requireDbReady()) return;
  const email = $('loginEmail').value.trim();
  const password = $('loginPassword').value;
  const btn = $('loginBtn');
  const errEl = $('loginError');
  if (!email || !password) { showErr('ກະລຸນາໃສ່ Email ແລະ Password'); return; }
  btn.disabled = true; btn.textContent = 'ກຳລັງ Login...';
  errEl.style.display = 'none';
  try {
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) showErr(error.message === 'Invalid login credentials' ? '❌ Email ຫຼື Password ບໍ່ຖືກ' : '❌ ' + error.message);
  } catch (err) {
    showErr('❌ ລະບົບ Login ມີບັນຫາ: ' + (err.message || err));
  } finally {
    btn.disabled = false; btn.textContent = 'Login';
  }
}

function showErr(msg) {
  const el = document.getElementById('loginError');
  el.textContent = msg; el.style.display = 'block';
}

async function doLogout() {
  if (!confirm('ຢືນຢັນອອກຈາກລະບົບ?')) return;
  await db.auth.signOut();
  showLogin();
}

async function doReset() {
  const email = document.getElementById('loginEmail').value.trim();
  if (!email) { showErr('ໃສ່ Email ກ່ອນກົດ Reset'); return; }
  const { error } = await db.auth.resetPasswordForEmail(email);
  if (error) showErr('❌ ' + error.message);
  else { document.getElementById('loginError').style.display='none'; toast('📧 ສົ່ງ Reset email ໄປຫາ ' + email + ' ແລ້ວ!'); }
}

function togglePwd() {
  const inp = document.getElementById('loginPassword');
  inp.type = inp.type === 'password' ? 'text' : 'password';
  document.getElementById('eyeIcon').textContent = inp.type === 'password' ? '👁' : '🙈';
}

// ── State ──
let allTasks=[], allDocs=[], allMeets=[], allLeaves=[], currentFilter='all';

// ── Page nav ──
function showPage(p, btn) {
  document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.nav button').forEach(x=>x.classList.remove('active'));
  document.getElementById('page-'+p).classList.add('active');
  if(btn) btn.classList.add('active');
  const map = {dash:loadDash, profile:loadProfileDashboard, tasks:loadTasks, docs:loadDocs, meet:loadMeet, leave:loadLeave, report:loadReport, log:loadLog, admin:loadAdmin};
  if(map[p]) map[p]();
}

// ════ USER OPTIONS (for dropdowns) ════
let cachedUserOptions = null;

async function loadUserOptions(forceRefresh=false) {
  if (cachedUserOptions && !forceRefresh) return cachedUserOptions;
  const { data, error } = await db.from('profiles').select('id, email, full_name, role').order('email');
  if (error) {
    debugError('loadUserOptions failed:', error);
    cachedUserOptions = [];
    return cachedUserOptions;
  }
  cachedUserOptions = (data || [])
    .filter(u => !!u.email)
    .map(u => ({
      value: String(u.email).trim().toLowerCase(),
      label: u.full_name ? `${u.full_name} (${u.email})` : String(u.email).trim().toLowerCase(),
      email: String(u.email).trim().toLowerCase(),
      role: normalizeRole(u.role)
    }));
  return cachedUserOptions;
}

async function populateUserSelect(selectId, currentVal, lockToSelf) {
  const opts = await loadUserOptions();
  const sel  = document.getElementById(selectId);
  if (!sel) return;
  const me = myEmail();
  const selectedVal = String(currentVal || me || '').trim().toLowerCase();
  let finalOpts = [...opts];
  if (selectedVal && selectedVal.includes('@') && !finalOpts.some(o => o.value === selectedVal)) {
    finalOpts.push({ value:selectedVal, label:selectedVal, email:selectedVal, role:'employee' });
  }
  if (finalOpts.length === 0 && me) {
    finalOpts = [{ value:me, label:`${me} (ທ່ານ)`, email:me, role:currentRole }];
  }
  sel.innerHTML = finalOpts.map(o => `<option value="${h(o.value)}" ${o.value === selectedVal ? 'selected' : ''}>
        ${h(o.label)}${o.value === me ? ' (ທ່ານ)' : ''}
      </option>`).join('');
  if (lockToSelf && me) sel.value = me;
  sel.disabled = lockToSelf;
  sel.style.background = lockToSelf ? 'var(--bg2)' : '';
  sel.title = lockToSelf ? 'ຕື່ມໂດຍ account ຂອງທ່ານ' : 'ສາມາດ assign ໃຫ້ຄົນອື່ນໄດ້';
}

function toggleForm(id) {
  const el = document.getElementById(id);
  el.style.display = el.style.display==='none' ? 'block' : 'none';
  if (el.style.display !== 'block') return;
  el.scrollIntoView({behavior:'smooth', block:'nearest'});
  const me = myEmail();
  if (id === 'addTaskForm') populateUserSelect('tOwner', me, !isSuperior());
  if (id === 'addDocForm')  {
    populateUserSelect('dFrom', me, !isSuperior());
    generateDocNumber();
  }
}

function toast(msg) {
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2500);
}

// ════ ERROR / PRODUCTION HELPERS (v15) ════
function errorMessage(error) {
  if (!error) return '';
  return error.message || error.details || error.hint || String(error);
}

function showInlineError(targetId, title, error) {
  const el = document.getElementById(targetId);
  if (!el) return;
  const msg = userSafeErrorMessage(error);
  el.innerHTML = `
    <div class="error-box">
      <strong>⚠️ ${h(title || 'ຂໍ້ມູນບໍ່ພ້ອມ')}</strong><br>
      ${h(msg)}
    </div>`;
}

function showMultiError(targetIds, title, error) {
  (targetIds || []).forEach(id => showInlineError(id, title, error));
}

function logDbError(context, error) {
  if (!error) return;
  debugError(`[DB ERROR] ${context}`, error);
  toast('⚠️ ບໍ່ສາມາດດຳເນີນການໄດ້');
}

window.addEventListener('unhandledrejection', ev => {
  debugError('[Unhandled Promise]', ev.reason);
  if (APP_DEBUG) toast('❌ ມີ error ໃນລະບົບ — ເບິ່ງ Console');
});

window.addEventListener('error', ev => {
  debugError('[JS ERROR]', ev.error || ev.message);
});

// ── Colours ──
const acBg  =['#E1F5EE','#E6F1FB','#FAEEDA','#EEEDFE','#FAECE7'];
const acText=['#0F6E56','#185FA5','#854F0B','#534AB7','#993C1D'];

// ════ ANNOUNCEMENTS ════
async function saveAnnouncement() {
  const msg = document.getElementById('annMsg').value.trim();
  if (!msg) { toast('⚠️ ໃສ່ຂໍ້ຄວາມກ່ອນ'); return; }
  const { data: { user } } = await db.auth.getUser();
  const { error } = await db.from('announcements').insert({
    message: msg,
    author: user?.email?.split('@')[0] || 'Admin'
  });
  if (error) { toast('❌ ' + error.message); return; }
  await logAction('created', 'announcement', 0, msg.substring(0, 40), '');
  toast('✅ ໂພສປະກາດສຳເລັດ!');
  document.getElementById('annMsg').value = '';
  toggleForm('addAnnForm');
  loadDash();
}

async function deleteAnnouncement(id) {
  if (!confirm('ຢືນຢັນລຶບປະກາດນີ້?')) return;
  const { error } = await db.from('announcements').delete().eq('id', id);
  if (error) { toast('❌ ' + error.message); return; }
  await logAction('deleted', 'announcement', id, 'ປະກາດ #' + id, '');
  toast('🗑️ ລຶບປະກາດສຳເລັດ');
  loadDash();
}


// ════ MY PROFILE DASHBOARD ════
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
async function loadDash() {
  let tasksRes, docsRes, meetsRes, annRes;
  try {
    [tasksRes, docsRes, meetsRes, annRes] = await Promise.all([
      db.from('tasks').select('*').order('created_at',{ascending:false}),
      db.from('documents').select('*').order('created_at',{ascending:false}),
      db.from('meetings').select('*').order('meet_date'),
      db.from('announcements').select('*').order('created_at',{ascending:false}),
    ]);
    if (tasksRes.error) throw tasksRes.error;
    if (docsRes.error) throw docsRes.error;
    if (meetsRes.error) throw meetsRes.error;
    if (annRes.error) throw annRes.error;
  } catch (error) {
    logDbError('loadDash', error);
    showMultiError(['metricsBar','urgentPreview','docPreview','meetPreview','announceArea'], 'ໂຫຼດ Dashboard ບໍ່ສຳເລັດ', error);
    return;
  }
  allTasks = tasksRes.data||[];
  allDocs  = docsRes.data||[];
  allMeets = meetsRes.data||[];

  const done=allTasks.filter(t=>t.status==='done').length;
  const inprog=allTasks.filter(t=>t.status==='inprogress').length;
  const blk=allTasks.filter(t=>t.status==='blocked').length;
  const pendDoc=allDocs.filter(d=>isDocInProgress(d)).length;

  document.getElementById('metricsBar').innerHTML=`
    <div class="metric"><div class="num" style="color:var(--c2)">${allTasks.length}</div><div class="lbl">ວຽກທັງໝົດ</div></div>
    <div class="metric"><div class="num" style="color:var(--c1)">${done}</div><div class="lbl">ສຳເລັດ</div></div>
    <div class="metric"><div class="num" style="color:var(--c3)">${inprog}</div><div class="lbl">ດຳເນີນຢູ່</div></div>
    <div class="metric"><div class="num" style="color:var(--c4)">${blk}</div><div class="lbl">ຕິດຂັດ</div></div>
    <div class="metric"><div class="num" style="color:var(--c5)">${pendDoc}</div><div class="lbl">ເອກະສານລໍຖ້າ</div></div>
    <div class="metric"><div class="num" style="color:var(--c2)">${allMeets.length}</div><div class="lbl">ກອງປະຊຸມ</div></div>`;

  document.getElementById('blockerAlert').innerHTML = blk>0
    ? `<div class="alert warn"><i class="ti ti-alert-triangle"></i> ວຽກຕິດຂັດ ${blk} ລາຍການ — ຕ້ອງການການຕັດສິນໃຈ</div>` : '';

  // ── ກອງປະຊຸມກາຍມື້ ຍັງບໍ່ໄດ້ຢືນຢັນສະຖານະ ──────────────
  const todayStr = new Date().toISOString().slice(0,10);
  const pendMeets = allMeets.filter(m =>
    m.meet_date &&
    m.meet_date < todayStr &&
    (!m.meet_status || m.meet_status === 'scheduled')
  );
  const meetAlertEl = document.getElementById('meetStatusAlert');
  if (pendMeets.length > 0) {
    meetAlertEl.innerHTML = `
      <div class="card" style="border:1.5px solid #FAC775;background:#FFFBF2;margin-bottom:1rem">
        <div class="card-title" style="color:#854F0B;margin-bottom:8px">
          <i class="ti ti-clock-exclamation"></i> ກອງປະຊຸມກາຍມື້ — ຕ້ອງກວດສະຖານະ
        </div>
        ${pendMeets.map(m => `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #FAC775">
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:500;color:var(--text)">${h(m.title)}</div>
              <div style="font-size:11px;color:#854F0B;margin-top:2px">
                <i class="ti ti-calendar" style="font-size:11px"></i> ${m.meet_date} ${m.meet_time||''} · ${m.location||'—'}
              </div>
            </div>
            <div style="display:flex;gap:5px;flex-shrink:0">
              ${isSuperior() ? `
              <button onclick="quickConfirmMeet(${m.id})" style="font-size:11px;padding:3px 8px;border:1px solid #9FE1CB;background:#E1F5EE;border-radius:6px;cursor:pointer;color:#0F6E56;font-weight:500">✅ ແລ້ວ</button>
              <button onclick="quickPostponeMeet(${m.id})" style="font-size:11px;padding:3px 8px;border:1px solid #FAC775;background:#FFF3CD;border-radius:6px;cursor:pointer;color:#856404">⏩ ເລື່ອນ</button>
              <button onclick="quickCancelMeet(${m.id})" style="font-size:11px;padding:3px 8px;border:1px solid #F5C4B3;background:#FDF5F3;border-radius:6px;cursor:pointer;color:#993C1D">🚫 ຍົກເລີກ</button>
              ` : `<span style="font-size:11px;color:#856404;font-style:italic">ລໍຖ້າຫົວໜ້າຢືນຢັນ</span>`}
            </div>
          </div>`).join('')}
      </div>`;
  } else {
    meetAlertEl.innerHTML = '';
  }

  const urgent = allTasks.filter(t=>t.priority==='urgent');
  document.getElementById('urgentPreview').innerHTML = urgent.length===0
    ? '<div class="empty">✅ ບໍ່ມີວຽກດ່ວນ</div>'
    : urgent.map(t=>`<div style="padding:7px 0;border-bottom:1px solid var(--border);font-size:13px">
        <span style="width:8px;height:8px;border-radius:50%;display:inline-block;background:${t.status==='blocked'?'var(--c4)':t.status==='done'?'var(--c1)':'var(--c3)'};margin-right:6px"></span>${h(t.name)}
        <br><span style="font-size:11px;color:var(--muted);margin-left:14px">${h(t.owner)} · ${t.due_date}</span>
      </div>`).join('');

  const pendDocs = allDocs.filter(d=>isDocInProgress(d));
  document.getElementById('docPreview').innerHTML = pendDocs.length===0
    ? '<div class="empty">✅ ບໍ່ມີເອກະສານຄ້າງ</div>'
    : pendDocs.map(d=>`<div style="padding:7px 0;border-bottom:1px solid var(--border);font-size:13px">
        ${d.doc_type} ${h(d.name)}
        <br><span style="font-size:11px;color:var(--muted)">ລໍຖ້າ: ${(d.steps||[])[d.current_step]||'—'}</span>
      </div>`).join('');

  const todayForMeet = new Date().toISOString().slice(0,10);
  const next2 = [...allMeets]
    .filter(m =>
      m.meet_date >= todayForMeet &&
      (!m.meet_status || m.meet_status === 'scheduled')
    )
    .sort((a,b)=>{
      const ad = (a.meet_date||'9999')+(a.meet_time||'');
      const bd = (b.meet_date||'9999')+(b.meet_time||'');
      return ad > bd ? 1 : -1;
    }).slice(0,2);
  document.getElementById('meetPreview').innerHTML = next2.length===0
    ? '<div class="empty">ບໍ່ມີກອງປະຊຸມທີ່ກຳນົດໄວ້</div>'
    : next2.map(m=>`<div style="padding:7px 0;border-bottom:1px solid var(--border);font-size:13px">
        <i class="ti ti-calendar-event" style="color:var(--c2);font-size:13px"></i> <strong>${h(m.title)}</strong>
        <br><span style="font-size:11px;color:var(--muted);margin-left:18px">${m.meet_date||'ບໍ່ກຳນົດ'} ${m.meet_time||''} · ${h(m.location)}</span>
      </div>`).join('');

  const anns = annRes.data||[];
  if (canManageAnn()) {
    const btn = document.getElementById('addAnnBtn');
    if (btn) btn.style.display = 'inline-block';
  }
  document.getElementById('announceArea').innerHTML = anns.length === 0
    ? '<div class="empty" style="font-size:13px;color:var(--muted);padding:8px 0">ຍັງບໍ່ມີປະກາດ</div>'
    : anns.map(a=>`
    <div class="announce" style="justify-content:space-between">
      <div style="display:flex;gap:12px;align-items:center;flex:1;min-width:0">
        <span style="font-size:22px">📢</span>
        <div class="announce-text">
          <strong>${a.message}</strong>
          <span>ໂດຍ ${a.author} · ${new Date(a.created_at).toLocaleDateString('lo-LA')}</span>
        </div>
      </div>
      ${canManageAnn()?`<button class="btn-delete" data-manager-only onclick="deleteAnnouncement(${a.id})" style="flex-shrink:0;margin-left:10px;border:1px solid var(--border);background:#faece7;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:11px;color:#993C1D"><i class="ti ti-trash"></i></button>`:''}
    </div>`).join('');
}

// ════ TASKS ════
async function loadTasks() {
  try {
    const {data, error} = await db.from('tasks').select('*').order('created_at',{ascending:false});
    if (error) throw error;
    allTasks = data||[];
    renderTasks();
    renderBlockers();
    setTimeout(loadAllCommentPreviews, 100);
  } catch (error) {
    logDbError('loadTasks', error);
    showInlineError('taskList', 'ໂຫຼດວຽກບໍ່ສຳເລັດ', error);
    showInlineError('blockerList', 'ໂຫຼດບັນຫາ/ຕິດຂັດບໍ່ສຳເລັດ', error);
    document.getElementById('taskCount').textContent = '0';
  }
}

function getDueInfo(due_date, status) {
  if (status === 'done' || !due_date || due_date === '—') return {label: due_date||'ບໍ່ກຳນົດ', cls: 'color:var(--muted)', tag: ''};
  const today = new Date(); today.setHours(0,0,0,0);
  const due = new Date(due_date); due.setHours(0,0,0,0);
  const diff = Math.ceil((due - today) / (1000*60*60*24));
  if (diff < 0)  return {label: due_date, cls: 'color:var(--c4);font-weight:600', tag: `<span class="badge urgent" style="font-size:10px">ຊ້າ ${Math.abs(diff)} ວັນ</span>`};
  if (diff === 0) return {label: due_date, cls: 'color:var(--c4);font-weight:600', tag: `<span class="badge urgent" style="font-size:10px">ໝົດວັນນີ້!</span>`};
  if (diff <= 3)  return {label: due_date, cls: 'color:var(--c3);font-weight:600', tag: `<span class="badge review" style="font-size:10px">ອີກ ${diff} ວັນ</span>`};
  return {label: due_date, cls: '', tag: ''};
}

function renderTasks() {
  const q = (document.getElementById('taskSearch')?.value||'').toLowerCase();
  let list = currentFilter==='all' ? allTasks
    : currentFilter==='urgent' ? allTasks.filter(t=>t.priority==='urgent')
    : allTasks.filter(t=>t.status===currentFilter);
  if (q) list = list.filter(t => t.name.toLowerCase().includes(q) || (t.owner||'').toLowerCase().includes(q));
  const sOwner = (document.getElementById('sOwner')?.value||'').toLowerCase();
  const sStatus = document.getElementById('sStatus')?.value||'';
  const sPriority = document.getElementById('sPriority')?.value||'';
  const sDueBefore = document.getElementById('sDueBefore')?.value||'';
  if (sOwner) list = list.filter(t => (t.owner||'').toLowerCase().includes(sOwner));
  if (sStatus) list = list.filter(t => t.status === sStatus);
  if (sPriority) list = list.filter(t => t.priority === sPriority);
  if (sDueBefore) list = list.filter(t => t.due_date && t.due_date !== '—' && t.due_date <= sDueBefore);
  document.getElementById('taskCount').textContent = list.length;
  document.getElementById('taskList').innerHTML = list.length===0
    ? '<div class="empty">ບໍ່ມີລາຍການ</div>'
    : list.map(t=>{
      const due = getDueInfo(t.due_date, t.status);
      const rowBg = t.status!=='done' && due.tag.includes('ຊ້າ') ? 'background:var(--c4l);' : t.status!=='done' && due.tag.includes('ໝົດ') ? 'background:var(--c4l);' : t.status!=='done' && due.tag.includes('ອີກ') ? 'background:var(--c3l);' : '';
      return `
      <div class="task-item" id="ti-${t.id}" style="${rowBg}">
        <div class="task-check ${t.status==='done'?'done':''}" ${canEditTask(t)?`onclick="toggleDone(${t.id},'${t.status}')"`:'style="opacity:.45;cursor:not-allowed" title="ບໍ່ມີສິດແກ້ໄຂ"'}>${t.status==='done'?'✓':''}</div>
        <div class="task-info">
          <div class="task-name ${t.status==='done'?'done':''}">${h(t.name)}</div>
          <div class="task-meta">
            <span><i class="ti ti-user" style="font-size:11px"></i> ${h(t.owner)}</span>
            <span style="${due.cls}"><i class="ti ti-calendar" style="font-size:11px"></i> ${due.label}</span>
            ${due.tag}
            <span class="badge ${t.priority}">${t.priority==='urgent'?'🔴 ດ່ວນ':'🔵 ປົກກະຕິ'}</span>
            <span class="badge ${t.status==='done'?'done-b':t.status==='blocked'?'blocked':'inprogress'}">${{done:'ສຳເລັດ',inprogress:'ດຳເນີນຢູ່',blocked:'ຕິດຂັດ'}[t.status]||t.status}</span>
          </div>
          <div class="progress-bar"><div class="progress-fill" style="width:${t.progress}%;background:${t.status==='blocked'?'var(--c4)':t.status==='done'?'var(--c1)':'var(--c2)'}"></div></div>
          ${t.notes?`<div style="font-size:11px;color:var(--muted);margin-top:5px;font-style:italic">📝 ${h(t.notes)}</div>`:''}
          <div id="comment-preview-${t.id}" style="margin-top:4px"></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;flex-shrink:0">
          <span style="font-size:12px;font-weight:600;color:var(--muted)">${t.progress}%</span>
          <div style="display:flex;gap:4px">
            ${canEditTask(t)?`<button class="btn-edit" data-write-action onclick="openEditTask(${t.id})" style="border:1px solid var(--border);background:#e6f1fb;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:12px;color:#185FA5" title="ແກ້ໄຂ"><i class="ti ti-edit"></i></button>`:''}
            ${canDeleteTask()?`<button class="btn-delete" data-manager-only onclick="deleteTask(${t.id})" style="border:1px solid var(--border);background:#faece7;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:12px;color:#993C1D" title="ລຶບ"><i class="ti ti-trash"></i></button>`:''}
            ${canCommentTask(t)?`<button data-write-action onclick="toggleComments(${t.id})" style="border:1px solid var(--border);background:#eeedfe;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:12px;color:#534AB7" title="Comment"><i class="ti ti-message"></i></button>`:'<button disabled style="border:1px solid var(--border);background:var(--bg2);border-radius:6px;padding:3px 8px;font-size:12px;color:var(--muted);cursor:not-allowed" title="ເບິ່ງໄດ້ຢ່າງດຽວ"><i class="ti ti-lock"></i></button>'}
          </div>
        </div>
      </div>
      <div id="comments-${t.id}" style="display:none;border-top:1px solid var(--border);margin-top:8px;padding:12px 0 4px 0">
        
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;padding:0 2px">
          <div>
            <div style="font-size:11px;color:var(--muted);margin-bottom:4px;font-weight:600">ອັບເດດ Progress %</div>
            <div style="display:flex;gap:6px;align-items:center">
              <input type="range" id="prog-${t.id}" min="0" max="100" step="5" value="${t.progress}"
                oninput="document.getElementById('prog-val-${t.id}').textContent=this.value+'%'"
                style="flex:1;accent-color:var(--c1)">
              <span id="prog-val-${t.id}" style="font-size:12px;font-weight:600;min-width:32px;color:var(--c1)">${t.progress}%</span>
            </div>
          </div>
          <div>
            <div style="font-size:11px;color:var(--muted);margin-bottom:4px;font-weight:600">ສະຖານະ</div>
            <select id="stat-${t.id}" style="width:100%;font-size:12px;padding:4px 6px;border-radius:var(--radius);border:1px solid var(--border);background:var(--bg);color:var(--text);font-family:inherit">
              <option value="inprogress" ${t.status==='inprogress'?'selected':''}>🔄 ດຳເນີນຢູ່</option>
              <option value="blocked" ${t.status==='blocked'?'selected':''}>⛔ ຕິດຂັດ</option>
              <option value="done" ${t.status==='done'?'selected':''}>✅ ສຳເລັດ</option>
            </select>
          </div>
        </div>

        <div style="margin-bottom:10px;padding:0 2px">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px;font-weight:600">ປະເພດ update</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button onclick="setUpdateType(${t.id},'update')" id="utype-update-${t.id}"
              style="font-size:11px;padding:3px 10px;border-radius:12px;border:1px solid var(--c2);background:var(--c2l);color:var(--c2m);cursor:pointer;font-family:inherit"
              title="ລາຍງານຄວາມຄືບໜ້າ ຫຼື ຜົນດຳເນີນວຽກ">📝 ອັບເດດ</button>
            <button onclick="setUpdateType(${t.id},'blocker')" id="utype-blocker-${t.id}"
              style="font-size:11px;padding:3px 10px;border-radius:12px;border:1px solid var(--border);background:transparent;color:var(--muted);cursor:pointer;font-family:inherit"
              title="ແຈ້ງໃຫ້ຫົວໜ້າຮູ້ວ່າວຽກຕິດຂັດ ລໍຖ້າການຊ່ວຍເຫຼືອ">⛔ ຕິດຂັດ</button>
            <button onclick="setUpdateType(${t.id},'resolved')" id="utype-resolved-${t.id}"
              style="font-size:11px;padding:3px 10px;border-radius:12px;border:1px solid var(--border);background:transparent;color:var(--muted);cursor:pointer;font-family:inherit"
              title="ແຈ້ງວ່າຂໍ້ຕິດຂັດໄດ້ຖືກແກ້ໄຂແລ້ວ">✅ ແກ້ໄຂໄດ້</button>
            <button onclick="setUpdateType(${t.id},'note')" id="utype-note-${t.id}"
              style="font-size:11px;padding:3px 10px;border-radius:12px;border:1px solid var(--border);background:transparent;color:var(--muted);cursor:pointer;font-family:inherit"
              title="ໝາຍເຫດ ຫຼື ຂໍ້ຄວາມທົ່ວໄປ ບໍ່ກ່ຽວກັບ progress">💬 ໝາຍເຫດ</button>
          </div>
          <div style="font-size:10px;color:var(--muted);margin-top:5px;padding:4px 8px;background:var(--bg2);border-radius:5px;line-height:1.5">
            💡 <strong>ຮັບຮູ້</strong> = ຫົວໜ້າ/admin ຢັ້ງຢືນວ່າໄດ້ຮັບຊາບ update ແລ້ວ &nbsp;|&nbsp;
            <strong>ແກ້ໄປ</strong> = ຢັ້ງຢືນວ່າຂໍ້ຕິດຂັດໄດ້ຖືກດຳເນີນການແລ້ວ
          </div>
        </div>

        <div style="padding:0 2px;margin-bottom:10px">
          <textarea id="comment-input-${t.id}" placeholder="ຂຽນ update, ຂໍ້ຕິດຂັດ, ຫຼື ໝາຍເຫດ..."
            rows="2" style="width:100%;font-size:13px;padding:8px 10px;border-radius:var(--radius);border:1px solid var(--border);background:var(--bg);color:var(--text);font-family:inherit;resize:vertical"></textarea>
          <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:6px">
            <button data-write-action onclick="toggleComments(${t.id})" style="font-size:12px;padding:5px 12px;border:1px solid var(--border);background:transparent;border-radius:var(--radius);cursor:pointer;color:var(--muted);font-family:inherit">ຍົກເລີກ</button>
            <button onclick="submitUpdate(${t.id})" style="font-size:12px;padding:5px 14px;border:none;background:var(--c1);color:#fff;border-radius:var(--radius);cursor:pointer;font-family:inherit;font-weight:600">💾 ບັນທຶກ update</button>
          </div>
        </div>

        <div style="border-top:1px solid var(--border);padding-top:10px">
          <div style="font-size:11px;color:var(--muted);margin-bottom:8px;font-weight:600">ປະຫວັດ Update</div>
          <div id="comment-list-${t.id}"><div style="font-size:12px;color:var(--muted)">ໂຫຼດ...</div></div>
        </div>
      </div>`;
    }).join('');
}

function openEditTask(id) {
  const t = allTasks.find(x=>x.id===id);
  if(!t) return;
  document.getElementById('eName').value = t.name;
  document.getElementById('eDue').value = t.due_date;
  document.getElementById('ePri').value = t.priority;
  document.getElementById('eStatus').value = t.status;
  document.getElementById('eProgress').value = t.progress;
  document.getElementById('eProgressVal').textContent = t.progress+'%';
  document.getElementById('eNotes').value = t.notes||'';
  document.getElementById('editTaskId').value = id;
  // populate owner dropdown — superior ເລືອກໄດ້, owner ຂອງຕົນ lock
  const lockOwner = !isSuperior();
  populateUserSelect('eOwner', t.owner, lockOwner);
  const form = document.getElementById('editTaskForm');
  form.style.display='block';
  form.scrollIntoView({behavior:'smooth',block:'nearest'});
}

async function saveEditTask() {
  const task = allTasks.find(t => t.id == document.getElementById('editTaskId').value);
  if (!canEditTask(task)) return toast('⛔ ບໍ່ມີສິດແກ້ໄຂວຽກນີ້');
  const id = parseInt(document.getElementById('editTaskId').value);
  const n = document.getElementById('eName').value.trim();
  if(!n){toast('⚠️ ໃສ່ຊື່ວຽກ');return;}
  const taskOwnerEmail = requireEmailRef(document.getElementById('eOwner').value, myEmail(), 'ຜູ້ຮັບຜິດຊອບ');
  if (!taskOwnerEmail) return;
  const {error} = await db.from('tasks').update({
    name:n,
    owner: taskOwnerEmail,
    due_date:document.getElementById('eDue').value||null,
    priority:document.getElementById('ePri').value,
    status:document.getElementById('eStatus').value,
    progress:parseInt(document.getElementById('eProgress').value),
    notes:document.getElementById('eNotes').value
  }).eq('id',id);
  if(error){toast('❌ '+error.message);return;}
  await logAction('updated','task', id, document.getElementById('eName').value,
    `status: ${document.getElementById('eStatus').value}, progress: ${document.getElementById('eProgress').value}%`);
  toast('✅ ແກ້ໄຂສຳເລັດ!');
  document.getElementById('editTaskForm').style.display='none';
  loadTasks();
}

async function deleteTask(id) {
  if(!confirm('ຢືນຢັນລຶບວຽກນີ້?')) return;
  const task = allTasks.find(t=>t.id===id);
  const {error} = await db.from('tasks').delete().eq('id',id);
  if(error){toast('❌ '+error.message);return;}
  await logAction('deleted','task', id, task?.name||'', `ຜູ້ຮັບຜິດຊອບ: ${task?.owner||'—'}`);
  toast('🗑️ ລຶບສຳເລັດ');
  loadTasks();
}

function renderBlockers() {
  const blk = allTasks.filter(t=>t.status==='blocked');
  document.getElementById('blockerList').innerHTML = blk.length===0
    ? '<div class="empty">✅ ບໍ່ມີວຽກຕິດຂັດ</div>'
    : blk.map(t=>`<div class="blocker-item">
        <div class="blocker-title">⛔ ${h(t.name)}</div>
        <div class="blocker-meta">ຮັບຜິດຊອບ: ${h(t.owner)} · ກຳນົດ: ${t.due_date}${t.notes?' · '+t.notes:''}</div>
      </div>`).join('');
}

function setFilter(f, btn) {
  currentFilter = f;
  document.querySelectorAll('.filter-btns button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderTasks();
}

async function toggleDone(id, status) {
  const task = allTasks.find(t => t.id == id);
  if (!canEditTask(task)) return toast('⛔ ບໍ່ມີສິດແກ້ໄຂວຽກນີ້');
  const newStatus = status==='done' ? 'inprogress' : 'done';
  const newProg   = newStatus==='done' ? 100 : 80;
  await db.from('tasks').update({status:newStatus, progress:newProg}).eq('id',id);
  const t = allTasks.find(x=>x.id===id);
  await logAction(newStatus==='done'?'updated':'updated','task',id,t?.name||'',`status → ${newStatus}`);
  toast(newStatus==='done'?'✅ ໝາຍສຳເລັດ!':'↩️ ຍ້ອນກັບ');
  loadTasks();
}

async function saveTask() {
  if (!canWrite()) return toast('⛔ Viewer ເບິ່ງໄດ້ຢ່າງດຽວ');
  const n = document.getElementById('tName').value.trim();
  if(!n){toast('⚠️ ໃສ່ຊື່ວຽກດ້ວຍ');return;}
  const btn = document.getElementById('saveTaskBtn');
  btn.disabled=true; btn.textContent='ກຳລັງບັນທຶກ...';
  // Normalize owner — always save full email so frontend stays synced with RLS
  const ownerRaw = document.getElementById('tOwner').value.trim();
  const owner = requireEmailRef(ownerRaw, myEmail(), 'ຜູ້ຮັບຜິດຊອບ');
  if (!owner) { btn.disabled=false; btn.textContent='💾 ບັນທຶກ'; return; }
  const {data, error} = await db.from('tasks').insert({
    name:n, owner,
    due_date:document.getElementById('tDue').value||null,
    priority:document.getElementById('tPri').value,
    status:document.getElementById('tStatus').value,
    notes:document.getElementById('tNotes').value,
    progress: document.getElementById('tStatus').value==='done'?100:0
  }).select();
  btn.disabled=false; btn.textContent='💾 ບັນທຶກ';
  if(error){toast('❌ Error: '+error.message);return;}
  toast('✅ ເພີ່ມວຽກສຳເລັດ!');
  toggleForm('addTaskForm');
  ['tName','tOwner','tNotes'].forEach(id=>document.getElementById(id).value='');
  loadTasks();
}

// ════ DOCUMENTS ════
async function loadDocs() {
  try {
    const {data, error} = await db.from('documents').select('*').order('created_at',{ascending:false});
    if (error) throw error;
    allDocs = data||[];
    renderDocs();
  } catch (error) {
    logDbError('loadDocs', error);
    showInlineError('docList', 'ໂຫຼດເອກະສານບໍ່ສຳເລັດ', error);
  }
}

function renderDocs() {
  const q        = (document.getElementById('docSearch')?.value||'').toLowerCase();
  const fromQ    = (document.getElementById('dSearchFrom')?.value||'').toLowerCase();
  const typeQ    = document.getElementById('dSearchType')?.value||'';
  const statusQ  = document.getElementById('dSearchStatus')?.value||'';
  const dirQ    = document.getElementById('dSearchDir')?.value||'';
  let docs = allDocs;
  if (q)       docs = docs.filter(d => d.name.toLowerCase().includes(q));
  if (fromQ)   docs = docs.filter(d => (d.created_by||'').toLowerCase().includes(fromQ));
  if (typeQ)   docs = docs.filter(d => d.doc_type === typeQ);
  if (dirQ)    docs = docs.filter(d => (d.doc_direction||'in') === dirQ);
  if (statusQ === 'done')       docs = docs.filter(d => isDocDone(d));
  if (statusQ === 'inprogress') docs = docs.filter(d => isDocInProgress(d));
  if (statusQ === 'cancelled')  docs = docs.filter(d => d.doc_status === 'cancelled');

  const statusBadge = {
    done:      `<span style="background:#D4EDDA;color:#155724;font-size:10px;padding:2px 8px;border-radius:10px;font-weight:500">✅ ສຳເລັດ</span>`,
    cancelled: `<span style="background:#F8D7DA;color:#721C24;font-size:10px;padding:2px 8px;border-radius:10px;font-weight:500">🚫 ຍົກເລີກ</span>`,
    inprogress:`<span style="background:#FFF3CD;color:#856404;font-size:10px;padding:2px 8px;border-radius:10px;font-weight:500">🔄 ດຳເນີນຢູ່</span>`,
  };

  document.getElementById('docList').innerHTML = docs.length===0
    ? '<div class="empty">ບໍ່ພົບເອກະສານ</div>'
    : docs.map(d=>{
      const steps       = d.steps||[];
      const isDone      = isDocDone(d);
      const isCancelled = isDocCancelled(d);
      const isFinalStep = isDocAtFinalStep(d);
      const docStatus   = getDocWorkflowStatus(d);
      const stepComments = d.step_comments || {};

      const canStepComment = isSuperior() || matchesMe(d.created_by);
      const stepsHtml = steps.map((s,i)=>{
        const done    = i < d.current_step || isDone;
        const current = i === d.current_step && !isDone && !isCancelled;
        const cls     = done ? 'done' : current ? 'current' : 'wait';
        const line    = i < steps.length-1
          ? `<div class="fstep-line" style="background:${done?'var(--c1)':'var(--border)'}"></div>` : '';
        const coms    = stepComments[i] || [];
        const comBadge = coms.length > 0
          ? `<div style="font-size:9px;background:#E6F1FB;color:#185FA5;border-radius:8px;padding:1px 5px;margin-top:2px;cursor:pointer;font-weight:500" onclick="openDocHistory(${d.id})" title="ກົດເບິ່ງ history">💬 ${coms.length}</div>` : '';
        const comBtn = canStepComment
          ? `<div style="font-size:9px;color:var(--c2m);margin-top:2px;cursor:pointer;text-decoration:underline" onclick="openStepComment(${d.id},${i},\`${s}\`)">+ comment</div>` : '';
        return `<div class="fstep-wrap">
          <div class="fstep ${cls}">
            <div class="fstep-circle">${done?'✓':i+1}</div>
            <div class="fstep-label">${s}</div>
            ${comBadge}
            ${comBtn}
          </div>
          ${line}
        </div>`;
      }).join('');

      return `<div class="doc-item" style="${isCancelled?'opacity:0.65':''}">
        <div class="doc-icon">${d.doc_type}</div>
        <div class="doc-info">
          <div class="doc-name" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            ${d.doc_number ? (() => {
              const dirCfg = {
                in:       {icon:'📥', bg:'#E6F1FB', color:'#185FA5', border:'#B5D4F4'},
                out:      {icon:'📤', bg:'#E1F5EE', color:'#0F6E56', border:'#9FE1CB'},
                internal: {icon:'📋', bg:'#FAEEDA', color:'#854F0B', border:'#FAC775'},
              }[d.doc_direction||'in'] || {icon:'📄', bg:'#F1EFE8', color:'#5F5E5A', border:'#DDD'};
              return `<span style="font-family:var(--font-mono);font-size:11px;font-weight:600;background:${dirCfg.bg};color:${dirCfg.color};padding:2px 8px;border-radius:6px;border:1px solid ${dirCfg.border}">${dirCfg.icon} ${d.doc_number}</span>`;
            })() : `<span style="font-size:10px;color:var(--muted);font-style:italic">
              ${{in:'📥 ຂາເຂົ້າ', out:'📤 ຂາອອກ', internal:'📋 ພາຍໃນ'}[d.doc_direction||'in']||'📄'}
            </span>`}
            ${h(d.name)} ${statusBadge[docStatus]||statusBadge.inprogress}
          </div>
          <div class="doc-sub">ສ້າງໂດຍ ${d.created_by} → ${d.sent_to}</div>
          <div class="flow-steps">${stepsHtml}</div>
          <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
            <button onclick="openDocHistory(${d.id})" style="border:1px solid var(--border);background:var(--bg2);border-radius:6px;padding:3px 8px;cursor:pointer;font-size:11px;color:var(--muted)"><i class="ti ti-history"></i> History</button>
            ${!isDone && !isCancelled && isSuperior()
              ? `<button class="btn-outline" data-manager-only style="font-size:11px;padding:4px 10px" onclick="advanceDoc(${d.id},${d.current_step},${steps.length})">${isFinalStep?'✅ ປິດສຳເລັດ':'➡️ ຜ່ານຂັ້ນຕໍ່ໄປ'}</button>` : ''}
            ${!isCancelled && canAdmin() && d.current_step > 0
              ? `<button data-admin-only onclick="revertDoc(${d.id},${d.current_step})" style="border:1px solid var(--border);background:var(--bg2);border-radius:6px;padding:3px 8px;cursor:pointer;font-size:11px;color:var(--muted)" title="ຍ້ອນກັບຂັ້ນກ່ອນໜ້າ">◀ ຍ້ອນກັບ</button>` : ''}
            ${!isCancelled && isSuperior()
              ? `<button data-manager-only onclick="cancelDoc(${d.id})" style="border:1px solid #F5C4B3;background:#FDF5F3;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:11px;color:#993C1D"><i class="ti ti-ban"></i> ຍົກເລີກ</button>` : ''}
            ${isCancelled && isSuperior()
              ? `<button data-manager-only onclick="restoreDoc(${d.id})" style="border:1px solid var(--border);background:var(--c2l);border-radius:6px;padding:3px 8px;cursor:pointer;font-size:11px;color:var(--c2m)"><i class="ti ti-refresh"></i> ຟື້ນຟູ</button>` : ''}
            ${canEditDoc(d) && !isCancelled
              ? `<button class="btn-edit" data-write-action onclick="openEditDoc(${d.id})" style="border:1px solid var(--border);background:var(--c2l);border-radius:6px;padding:3px 8px;cursor:pointer;font-size:11px;color:var(--c2m)"><i class="ti ti-pencil"></i> ແກ້ໄຂ</button>` : ''}
            ${canDeleteDoc()
              ? `<button class="btn-delete" data-manager-only onclick="deleteDoc(${d.id})" style="border:1px solid var(--border);background:#faece7;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:11px;color:#993C1D"><i class="ti ti-trash"></i> ລຶບ</button>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');
}


async function cancelDoc(id) {
  if (!confirm('ຢືນຢັນຍົກເລີກເອກະສານນີ້?')) return;
  const {error} = await db.from('documents').update({doc_status:'cancelled'}).eq('id',id);
  if (error) { toast('❌ '+error.message); return; }
  await logAction('updated','document',id,'','doc_status → cancelled');
  toast('🚫 ຍົກເລີກເອກະສານແລ້ວ');
  loadDocs();
}

async function restoreDoc(id) {
  const {error} = await db.from('documents').update({doc_status:'inprogress'}).eq('id',id);
  if (error) { toast('❌ '+error.message); return; }
  await logAction('updated','document',id,'','doc_status → inprogress');
  toast('✅ ຟື້ນຟູເອກະສານແລ້ວ');
  loadDocs();
}

function toggleStepComments(docId, stepIdx) {
  const el = document.getElementById(`stepcom-${docId}-${stepIdx}`);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function openDocHistory(docId) {
  const d = allDocs.find(x=>x.id===docId);
  if (!d) return;
  const steps = d.steps||[];
  const stepComments = d.step_comments||{};
  const isDone      = isDocDone(d);
  const isCancelled = isDocCancelled(d);
  const docStatus   = getDocWorkflowStatus(d);
  const statusLabel = {done:'✅ ສຳເລັດ', cancelled:'🚫 ຍົກເລີກ', inprogress:'🔄 ດຳເນີນຢູ່'}[docStatus]||'';
  const statusColor = {done:'#D4EDDA', cancelled:'#F8D7DA', inprogress:'#FFF3CD'}[docStatus]||'#FFF3CD';

  document.getElementById('dhTitle').textContent = d.name;
  document.getElementById('dhStatus').textContent = statusLabel;
  document.getElementById('dhStatus').style.background = statusColor;
  document.getElementById('dhMeta').textContent = `ສ້າງໂດຍ ${d.created_by} → ${d.sent_to}`;

  // Build timeline
  let html = '';
  steps.forEach((s,i) => {
    const done    = i < d.current_step || isDone;
    const current = i === d.current_step && !isDone && !isCancelled;
    const coms    = stepComments[i]||[];
    const stepColor = done ? '#0F6E56' : current ? '#185FA5' : '#999';
    const stepBg   = done ? '#E1F5EE' : current ? '#E6F1FB' : '#F1EFE8';
    const canStepComment = isSuperior() || matchesMe(d.created_by);

    html += `<div style="display:flex;gap:12px;margin-bottom:16px">
      <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0">
        <div style="width:30px;height:30px;border-radius:50%;background:${stepBg};color:${stepColor};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;border:2px solid ${stepColor}">
          ${done?'✓':i+1}
        </div>
        ${i<steps.length-1?`<div style="width:2px;flex:1;background:${done?'var(--c1)':'var(--border)'};margin-top:4px;min-height:20px"></div>`:''}
      </div>
      <div style="flex:1;min-width:0;padding-bottom:8px">
        <div style="font-size:13px;font-weight:500;color:${stepColor};margin-bottom:4px">
          ${s} ${current?'<span style="font-size:10px;background:#E6F1FB;color:#185FA5;padding:1px 6px;border-radius:8px">ຂັ້ນຕໍ່ໄປ</span>':''}
        </div>
        ${coms.length===0
          ? `<div style="font-size:11px;color:var(--muted);font-style:italic">ຍັງບໍ່ມີ comment</div>`
          : coms.map(cm=>`
            <div style="background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:7px 10px;margin-bottom:5px">
              <div style="font-size:12px;color:var(--text);margin-bottom:2px">${cm.text}</div>
              <div style="font-size:10px;color:var(--muted)"><strong>${cm.by}</strong> · ${cm.at}</div>
            </div>`).join('')
        }
        ${canStepComment ? `<div style="margin-top:4px">
          <button onclick="closeDocHistory();openStepComment(${docId},${i},\`${s}\`)" style="font-size:11px;padding:3px 10px;border:1px dashed var(--border);background:transparent;border-radius:6px;cursor:pointer;color:var(--muted);font-family:inherit">+ ເພີ່ມ comment</button>
        </div>` : ''}
      </div>
    </div>`;
  });

  document.getElementById('dhTimeline').innerHTML = html;
  document.getElementById('docHistoryModal').style.display = 'flex';

  // ໃສ່ revert button ໃນ modal footer ຖ້າ admin + cur > 0
  const footerEl = document.getElementById('dhFooter');
  if (footerEl) {
    footerEl.innerHTML = !isCancelled && canAdmin() && d.current_step > 0
      ? `<button onclick="closeDocHistory();revertDoc(${docId},${d.current_step})" style="font-size:12px;padding:5px 14px;border:1px solid var(--border);background:var(--bg2);border-radius:6px;cursor:pointer;color:var(--muted);font-family:inherit">◀ ຍ້ອນຂັ້ນກ່ອນໜ້າ</button>`
      : '';
  }
}

function closeDocHistory() {
  document.getElementById('docHistoryModal').style.display = 'none';
}

function openStepComment(docId, stepIdx, stepName) {
  document.getElementById('scDocId').value   = docId;
  document.getElementById('scStepIdx').value = stepIdx;
  document.getElementById('scStepName').textContent = `ຂັ້ນ ${stepIdx+1}: ${stepName}`;
  document.getElementById('scText').value    = '';
  document.getElementById('stepCommentModal').style.display = 'flex';
}

function closeStepComment() {
  document.getElementById('stepCommentModal').style.display = 'none';
}

async function saveStepComment() {
  const docId   = parseInt(document.getElementById('scDocId').value);
  const stepIdx = parseInt(document.getElementById('scStepIdx').value);
  const text    = document.getElementById('scText').value.trim();
  if (!text) { toast('⚠️ ໃສ່ຂໍ້ຄວາມກ່ອນ'); return; }

  // ດຶງ doc ປັດຈຸບັນ
  const {data, error} = await db.from('documents').select('step_comments').eq('id',docId).single();
  if (error) { toast('❌ '+error.message); return; }

  const existing = data.step_comments || {};
  const stepComs = existing[stepIdx] || [];
  stepComs.push({
    by:  myEmail() || 'unknown',
    text: text,
    at:  new Date().toLocaleString('lo-LA')
  });
  existing[stepIdx] = stepComs;

  const {error: e2} = await db.from('documents').update({step_comments: existing}).eq('id',docId);
  if (e2) { toast('❌ '+e2.message); return; }
  await logAction('commented','document', docId, `ຂັ້ນ ${stepIdx+1}`, text);
  toast('💬 ບັນທຶກ comment ແລ້ວ!');
  closeStepComment();
  await loadDocs();
  // refresh history modal ຖ້າຍັງເປີດຢູ່
  if (document.getElementById('docHistoryModal').style.display === 'flex') openDocHistory(docId);
}

async function advanceDoc(id, cur, total) {
  const doc = allDocs.find(d=>d.id===id);
  if (!doc) return;

  const lastIndex = Math.max((total || 1) - 1, 0);

  // ຖ້າຢູ່ຂັ້ນສຸດທ້າຍແລ້ວ ໃຫ້ກົດອີກຄັ້ງເພື່ອປິດສຳເລັດ
  // ບໍ່ໃຫ້ current_step ສຸດທ້າຍຖືກນັບເປັນ done ອັດຕະໂນມັດ.
  if (cur >= lastIndex) {
    const { error } = await db.from('documents')
      .update({ current_step: lastIndex, doc_status: 'done' })
      .eq('id', id);
    if (error) { toast('❌ ' + error.message); return; }
    await logAction('updated','document', id, doc?.name||'', 'doc_status → done');
    toast('✅ ປິດເອກະສານສຳເລັດ!');
    loadDocs();
    return;
  }

  const nextStepIndex = cur + 1;
  const { error } = await db.from('documents')
    .update({ current_step: nextStepIndex, doc_status: 'inprogress' })
    .eq('id', id);
  if (error) { toast('❌ ' + error.message); return; }

  const nextStep = (doc?.steps||[])[nextStepIndex]||'';
  await logAction('updated','document', id, doc?.name||'', `ຜ່ານຂັ້ນ → ${nextStep}`);
  toast(nextStepIndex >= lastIndex ? '📄 ເຖິງຂັ້ນສຸດທ້າຍແລ້ວ — ກົດປິດສຳເລັດເມື່ອສຳເລັດຈິງ' : '📄 ເລື່ອນຂັ້ນຕໍ່ໄປ!');
  loadDocs();
}

async function revertDoc(id, cur) {
  if (cur <= 0) { toast('⚠️ ຢູ່ຂັ້ນທຳອິດແລ້ວ'); return; }
  if (!confirm('ຢືນຢັນຍ້ອນກັບຂັ້ນກ່ອນໜ້າ?')) return;
  const doc = allDocs.find(d=>d.id===id);
  const prevStep = (doc?.steps||[])[cur-1]||'';
  await db.from('documents').update({
    current_step: cur-1,
    doc_status: 'inprogress'
  }).eq('id',id);
  await logAction('updated','document', id, doc?.name||'', `◀ ຍ້ອນກັບຂັ້ນ → ${prevStep}`);
  toast('◀ ຍ້ອນກັບຂັ້ນກ່ອນໜ້າແລ້ວ');
  loadDocs();
}

function openEditDoc(id) {
  const d = allDocs.find(x=>x.id===id);
  if(!d) return;
  document.getElementById('editDocId').value  = id;
  document.getElementById('eDName').value     = d.name;
  document.getElementById('eDTo').value       = d.sent_to||'';
  document.getElementById('eDSteps').value    = (d.steps||[]).join(',');
  document.getElementById('eDNumber').value   = d.doc_number||'';
  document.getElementById('eDDir').value      = d.doc_direction||'in';
  const sel = document.getElementById('eDType');
  const tp = d.doc_type||'📄';
  for(let i=0;i<sel.options.length;i++){
    if(sel.options[i].value.startsWith(tp)){ sel.selectedIndex=i; break; }
  }
  populateUserSelect('eDFrom', d.created_by||'', !isSuperior());
  const form = document.getElementById('editDocForm');
  form.style.display = 'block';
  form.scrollIntoView({behavior:'smooth', block:'nearest'});
}

async function saveEditDoc() {
  const doc = allDocs.find(d => d.id == document.getElementById('editDocId').value);
  if (!canEditDoc(doc)) return toast('⛔ ບໍ່ມີສິດແກ້ເອກະສານນີ້');
  const id = parseInt(document.getElementById('editDocId').value);
  const n  = document.getElementById('eDName').value.trim();
  if(!n){ toast('⚠️ ໃສ່ຊື່ເອກະສານ'); return; }
  const steps  = document.getElementById('eDSteps').value.split(',').map(s=>s.trim()).filter(Boolean);
  const from   = requireEmailRef(document.getElementById('eDFrom').value, myEmail(), 'ຜູ້ສ້າງເອກະສານ');
  if (!from) return;
  const to     = document.getElementById('eDTo').value||'—';
  const docNum = document.getElementById('eDNumber').value.trim()||null;
  const docDir = document.getElementById('eDDir').value||'in';
  const {error} = await db.from('documents').update({
    name:n, doc_type: document.getElementById('eDType').value.split(' ')[0],
    created_by:from, sent_to:to, steps,
    doc_number: docNum, doc_direction: docDir
  }).eq('id',id);
  if(error){ toast('❌ '+error.message); return; }
  await logAction('updated','document', id, n, `${docNum||''} | ${from} → ${to}`);
  toast('✅ ແກ້ໄຂເອກະສານສຳເລັດ!');
  document.getElementById('editDocForm').style.display = 'none';
  loadDocs();
}

async function deleteDoc(id) {
  if(!confirm('ຢືນຢັນລຶບເອກະສານນີ້?')) return;
  const doc = allDocs.find(d=>d.id===id);
  const {error} = await db.from('documents').delete().eq('id',id);
  if(error){toast('❌ '+error.message);return;}
  await logAction('deleted','document', id, doc?.name||'', `ສ້າງໂດຍ: ${doc?.created_by||'—'}`);
  toast('🗑️ ລຶບສຳເລັດ');
  loadDocs();
}

// ════ DOC NUMBER GENERATOR ════
async function generateDocNumber() {
  const dir    = document.getElementById('dDir')?.value || 'in';
  const prefix = {in:'ຂຂ', out:'ຂອ', internal:'ພນ'}[dir] || 'ຂຂ';
  const year   = new Date().getFullYear();

  const { data } = await db.from('documents')
    .select('doc_number')
    .eq('doc_direction', dir)
    .like('doc_number', `%/${year}`)
    .order('created_at', {ascending: false})
    .limit(50);

  let maxNum = 0;
  (data||[]).forEach(r => {
    const m = (r.doc_number||'').match(/(\d+)\//);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1]));
  });

  const next = String(maxNum + 1).padStart(3, '0');
  const numEl = document.getElementById('dNumber');
  if (numEl) numEl.value = `${prefix}-${next}/${year}`;
}

async function saveDoc() {
  if (!canWrite()) return toast('⛔ Viewer ເບິ່ງໄດ້ຢ່າງດຽວ');
  const n = document.getElementById('dName').value.trim();
  if(!n){toast('⚠️ ໃສ່ຊື່ເອກະສານ');return;}
  const tp       = document.getElementById('dType').value.split(' ')[0];
  const rawSteps = document.getElementById('dSteps').value;
  const steps    = rawSteps.split(',').map(s=>s.trim()).filter(Boolean);
  const fromRaw  = document.getElementById('dFrom').value.trim();
  const created_by  = requireEmailRef(fromRaw, myEmail(), 'ຜູ້ສ້າງເອກະສານ');
  if (!created_by) return;
  const doc_number  = document.getElementById('dNumber').value.trim() || null;
  const doc_direction = document.getElementById('dDir').value || 'in';

  const {error} = await db.from('documents').insert({
    name:n, doc_type:tp, created_by,
    sent_to: document.getElementById('dTo').value||'—',
    steps, current_step:0, doc_status:'inprogress',
    doc_number, doc_direction
  });
  if(error){toast('❌ '+error.message);return;}
  await logAction('created','document', 0, n,
    `${doc_direction==='in'?'ຂາເຂົ້າ':'ຂາອອກ'} ${doc_number||''} | ${created_by} → ${document.getElementById('dTo').value}`);
  toast('✅ ເພີ່ມເອກະສານສຳເລັດ!');
  toggleForm('addDocForm');
  ['dName','dTo','dNumber'].forEach(id=>document.getElementById(id).value='');
  loadDocs();
}
// ════ MEETINGS ════
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

// ຄຳນວນ display status — ຖ້າ approved ແລະ ວັນນີ້ຢູ່ໃນຊ່ວງ = "active"
function getLeaveDisplayStatus(l) {
  if (l.status !== 'approved') return l.status;
  const todayStr = new Date().toISOString().slice(0,10);
  if (l.date_from <= todayStr && l.date_to >= todayStr) return 'active';
  return 'approved';
}

let allLeaveBalance = []; // [{owner, total_days, used_days}]

async function loadLeave() {
  try {
    await populateLeaveOwnerDropdowns();
    const [lRes, bRes] = await Promise.all([
      db.from('leaves').select('*').order('date_from', { ascending: true }),
      db.from('leave_balance').select('*')
    ]);
    if (lRes.error) throw lRes.error;
    if (bRes.error) throw bRes.error;
    allLeaves       = lRes.data || [];
    allLeaveBalance = bRes.data || [];
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


function renderLeaveCalStrip() {
  const today = new Date();
  today.setHours(0,0,0,0);
  const next30 = new Date(today); next30.setDate(today.getDate()+30);
  const todayStr = today.toISOString().slice(0,10);
  const next30Str = next30.toISOString().slice(0,10);

  const upcoming = allLeaves.filter(l =>
    l.status !== 'rejected' &&
    l.date_to >= todayStr &&
    l.date_from <= next30Str
  ).sort((a,b) => a.date_from.localeCompare(b.date_from));

  const el = document.getElementById('leaveCalStrip');
  if (!upcoming.length) {
    el.innerHTML = '<div class="empty">ບໍ່ມີລາຍການລ່ວງໜ້າ 30 ວັນ</div>';
    return;
  }

  el.innerHTML = upcoming.map(l => {
    const tm = leaveTypeMap[l.leave_type] || leaveTypeMap.other;
    const dStatus = getLeaveDisplayStatus(l);
    const sm = leaveStatusMap[dStatus] || leaveStatusMap.approved;
    const days = l.days_count ?? (Math.round((new Date(l.date_to)-new Date(l.date_from))/(86400000))+1);
    const isActive = dStatus === 'active';
    return `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);${isActive?'background:var(--c1l);margin:0 -1.25rem;padding:9px 1.25rem;':''}">
      <div style="min-width:52px;text-align:center;background:${tm.bg};border-radius:var(--radius);padding:6px 4px">
        <div style="font-size:18px">${tm.icon}</div>
        <div style="font-size:9px;color:${tm.color};font-weight:600">${tm.label}</div>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:600">${l.owner||'—'}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px">
          📅 ${l.date_from} ${l.date_from!==l.date_to ? '→ '+l.date_to : ''} &nbsp;·&nbsp; ${days} ວັນ
          ${l.reason ? ' · '+l.reason : ''}
        </div>
      </div>
      <span style="background:${sm.bg};color:${sm.color};font-size:10px;padding:2px 8px;border-radius:10px;font-weight:500;flex-shrink:0">${sm.label}</span>
      ${isActive ? '<span style="background:var(--c1);color:#fff;font-size:10px;padding:2px 8px;border-radius:10px;font-weight:600;flex-shrink:0">ມື້ນີ້</span>' : ''}
    </div>`;
  }).join('');
}

function renderLeave() {
  const stQ   = document.getElementById('lFilterStatus')?.value || '';
  const typeQ = document.getElementById('lFilterType')?.value || '';
  let items = allLeaves;
  if (typeQ) items = items.filter(l => l.leave_type === typeQ);
  if (stQ) {
    if (stQ === 'active') {
      items = items.filter(l => getLeaveDisplayStatus(l) === 'active');
    } else {
      items = items.filter(l => l.status === stQ && getLeaveDisplayStatus(l) !== 'active');
    }
  }

  const el = document.getElementById('leaveList');
  if (!items.length) { el.innerHTML = '<div class="empty">ບໍ່ພົບລາຍການ</div>'; return; }

  el.innerHTML = items.map(l => {
    const tm      = leaveTypeMap[l.leave_type] || leaveTypeMap.other;
    const dStatus = getLeaveDisplayStatus(l);
    const sm      = leaveStatusMap[dStatus] || leaveStatusMap.pending;
    const days    = l.days_count ?? (Math.round((new Date(l.date_to)-new Date(l.date_from))/(86400000))+1);
    const halfBadge = l.half_day ? '<span style="font-size:9px;background:#EEEDFE;color:#534AB7;padding:1px 5px;border-radius:8px;font-weight:600">½</span>' : '';
    const isPending  = l.status === 'pending';
    const isActive   = dStatus === 'active';
    return `<div style="display:flex;align-items:flex-start;gap:10px;padding:11px 0;border-bottom:1px solid var(--border);${isActive?'background:var(--c1l);margin:0 -1.25rem;padding:11px 1.25rem;border-radius:var(--radius);margin-bottom:4px;':''}">
      <div style="min-width:48px;text-align:center;background:${tm.bg};border-radius:var(--radius);padding:6px 4px;flex-shrink:0">
        <div style="font-size:16px">${tm.icon}</div>
        <div style="font-size:9px;color:${tm.color};font-weight:600;margin-top:2px">${tm.label}</div>
      </div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:3px">
          <strong style="font-size:14px">${l.owner||'—'}</strong>
          <span style="background:${sm.bg};color:${sm.color};font-size:10px;padding:2px 8px;border-radius:10px;font-weight:600">${sm.label}</span>
          ${isActive ? `<span style="background:var(--c1);color:#fff;font-size:10px;padding:2px 8px;border-radius:10px;font-weight:700;animation:pulse 1.5s infinite">● ກຳລັງລາ</span>` : ''}
        </div>
        <div style="font-size:12px;color:var(--muted)">📅 ${l.date_from}${l.date_from!==l.date_to?' → '+l.date_to:''} &nbsp;·&nbsp; <strong>${days}</strong> ວັນ ${halfBadge}</div>
        ${l.reason ? `<div style="font-size:12px;color:var(--text);margin-top:3px">💬 ${l.reason}</div>` : ''}
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:7px">
          ${isPending && isSuperior() ? `
            <button data-manager-only onclick="approveLeave(${l.id})" style="border:1px solid #9FE1CB;background:#E1F5EE;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:11px;color:#0F6E56;font-weight:500">✅ ອະນຸມັດ</button>
            <button data-manager-only onclick="rejectLeave(${l.id})" style="border:1px solid #F5C4B3;background:#FDF5F3;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:11px;color:#993C1D">❌ ປະຕິເສດ</button>
          ` : ''}
          ${(isSuperior() || matchesMe(l.owner)) && l.status==='pending' ? `
            <button class="btn-edit" data-write-action onclick="openEditLeave(${l.id})" style="border:1px solid var(--border);background:var(--c2l);border-radius:6px;padding:3px 8px;cursor:pointer;font-size:11px;color:var(--c2m)"><i class="ti ti-pencil"></i> ແກ້ໄຂ</button>
          ` : ''}
          ${isSuperior() ? `
            <button class="btn-delete" data-manager-only onclick="deleteLeave(${l.id})" style="border:1px solid var(--border);background:#faece7;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:11px;color:#993C1D"><i class="ti ti-trash"></i> ລຶບ</button>
          ` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

async function saveLeave() {
  if (!canWrite()) return toast('⛔ Viewer ເບິ່ງໄດ້ຢ່າງດຽວ');
  const owner = requireEmailRef(document.getElementById('lOwner').value, myEmail(), 'ຜູ້ຂໍລາ');
  if (!owner) return;
  const lType = document.getElementById('lType').value;
  const dFrom = document.getElementById('lFrom').value;
  const dTo   = document.getElementById('lTo').value;
  const half  = document.getElementById('lHalf').checked;
  if (!dFrom || !dTo) { toast('⚠️ ເລືອກວັນທີເລີ່ມ ແລະ ສິ້ນສຸດ'); return; }
  if (dTo < dFrom)    { toast('⚠️ ວັນທີສິ້ນສຸດຕ້ອງ >= ວັນທີເລີ່ມ'); return; }
  const daysCount = calcDays(dFrom, dTo, half);
  const { error } = await db.from('leaves').insert({
    owner, leave_type: lType,
    date_from: dFrom, date_to: dTo,
    half_day: half, days_count: daysCount,
    reason: document.getElementById('lReason').value.trim(),
    status: 'pending'
  });
  if (error) { toast('❌ '+error.message); return; }
  await logAction('created','leave',0, owner, `${leaveTypeMap[lType]?.label||lType} ${dFrom}→${dTo} (${daysCount}ວັນ)`);
  toast('✅ ສົ່ງຄຳຂໍສຳເລັດ!');
  toggleForm('addLeaveForm');
  ['lFrom','lTo','lReason'].forEach(id => document.getElementById(id).value='');
  document.getElementById('lHalf').checked = false;
  document.getElementById('lDaysPreview').textContent = '—';
  loadLeave();
}

async function openEditLeave(id) {
  const l = allLeaves.find(x=>x.id===id);
  if (!l) return;
  await populateLeaveOwnerDropdowns();
  document.getElementById('editLeaveId').value = id;
  document.getElementById('eLType').value      = l.leave_type;
  document.getElementById('eLOwner').value     = l.owner||'';
  document.getElementById('eLFrom').value      = l.date_from;
  document.getElementById('eLTo').value        = l.date_to;
  document.getElementById('eLHalf').checked    = l.half_day || false;
  document.getElementById('eLReason').value    = l.reason||'';
  document.getElementById('eLDaysPreview').textContent = l.days_count ?? '—';
  const form = document.getElementById('editLeaveForm');
  form.style.display = 'block';
  form.scrollIntoView({behavior:'smooth', block:'nearest'});
}

async function saveEditLeave() {
  const leave = allLeaves.find(l => l.id == document.getElementById('editLeaveId').value);
  if (!(isSuperior() || (leave && matchesMe(leave.owner) && leave.status === 'pending'))) return toast('⛔ ບໍ່ມີສິດແກ້ໃບລານີ້');
  const id    = parseInt(document.getElementById('editLeaveId').value);
  const owner = requireEmailRef(document.getElementById('eLOwner').value, myEmail(), 'ຜູ້ຂໍລາ');
  if (!owner) return;
  const lType = document.getElementById('eLType').value;
  const dFrom = document.getElementById('eLFrom').value;
  const dTo   = document.getElementById('eLTo').value;
  const half  = document.getElementById('eLHalf').checked;
  if (!dFrom||!dTo) { toast('⚠️ ເລືອກວັນທີ'); return; }
  const daysCount = calcDays(dFrom, dTo, half);
  const { error } = await db.from('leaves').update({
    owner, leave_type: lType, date_from: dFrom, date_to: dTo,
    half_day: half, days_count: daysCount,
    reason: document.getElementById('eLReason').value.trim()
  }).eq('id', id);
  if (error) { toast('❌ '+error.message); return; }
  await logAction('updated','leave', id, owner, `${leaveTypeMap[lType]?.label||lType} ${dFrom}→${dTo} (${daysCount}ວັນ)`);
  toast('✅ ແກ້ໄຂສຳເລັດ!');
  document.getElementById('editLeaveForm').style.display='none';
  loadLeave();
}

async function approveLeave(id) {
  if (!isSuperior()) return toast('⛔ ສະເພາະ Admin/Manager ອະນຸມັດໄດ້');
  const l = allLeaves.find(x=>x.id===id);
  const { error } = await db.from('leaves').update({ status:'approved' }).eq('id',id);
  if (error) { toast('❌ '+error.message); return; }
  await logAction('approved','leave', id, l?.owner||'', `${l?.date_from}→${l?.date_to}`);
  toast('✅ ອະນຸມັດລາພັກສຳເລັດ!');
  loadLeave();
}

async function rejectLeave(id) {
  if (!isSuperior()) return toast('⛔ ສະເພາະ Admin/Manager ປະຕິເສດໄດ້');
  const l = allLeaves.find(x=>x.id===id);
  const { error } = await db.from('leaves').update({ status:'rejected' }).eq('id',id);
  if (error) { toast('❌ '+error.message); return; }
  await logAction('rejected','leave', id, l?.owner||'', `${l?.date_from}→${l?.date_to}`);
  toast('🚫 ປະຕິເສດການລາພັກ');
  loadLeave();
}

async function deleteLeave(id) {
  if (!confirm('ຢືນຢັນລຶບລາຍການນີ້?')) return;
  const l = allLeaves.find(x=>x.id===id);
  const { error } = await db.from('leaves').delete().eq('id',id);
  if (error) { toast('❌ '+error.message); return; }
  await logAction('deleted','leave', id, l?.owner||'', '');
  toast('🗑️ ລຶບສຳເລັດ');
  loadLeave();
}


// ── ຄຳນວນຈຳນວນວັນລາ (ຮອງຮັບ 0.5) ──
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
function renderLeaveBalance() {
  const el = document.getElementById('leaveBalanceArea');
  if (!el) return;
  // ຄຳນວນວັນທີ່ໃຊ້ຈາກ leaves table (approved/active only)
  const usedByOwner = {};
  allLeaves.forEach(l => {
    if (l.status === 'approved' || getLeaveDisplayStatus(l) === 'active') {
      const d = l.days_count ?? (Math.round((new Date(l.date_to)-new Date(l.date_from))/(86400000))+1);
      usedByOwner[l.owner] = (usedByOwner[l.owner]||0) + d;
    }
  });

  if (!allLeaveBalance.length) {
    el.innerHTML = '<div class="empty" style="font-size:12px">ຍັງບໍ່ມີຂໍ້ມູນວັນລາ — ກົດ "ແກ້ໄຂ" ເພື່ອຕັ້ງຄ່າ</div>';
    return;
  }

  el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px">
    ${allLeaveBalance.map(b => {
      const used    = b.used_days ?? usedByOwner[b.owner] ?? 0;
      const total   = b.total_days ?? 15;
      const remain  = Math.max(0, total - used);
      const pct     = total > 0 ? Math.min(100, Math.round((used/total)*100)) : 0;
      const color   = pct >= 90 ? '#993C1D' : pct >= 60 ? '#856404' : '#0F6E56';
      const bgColor = pct >= 90 ? '#FAECE7' : pct >= 60 ? '#FFF3CD' : '#E1F5EE';
      return `<div style="background:${bgColor};border-radius:var(--radius);padding:10px 12px">
        <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:6px">👤 ${b.owner}</div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:4px">ໃຊ້ ${used} / ${total} ວັນ</div>
        <div style="height:5px;background:rgba(0,0,0,.1);border-radius:3px;overflow:hidden;margin-bottom:5px">
          <div style="height:100%;width:${pct}%;background:${color};border-radius:3px;transition:width .4s"></div>
        </div>
        <div style="font-size:18px;font-weight:700;color:${color}">${remain} <span style="font-size:10px;font-weight:400">ວັນຍັງເຫຼືອ</span></div>
      </div>`;
    }).join('')}
  </div>`;
}

async function openBalanceModal() {
  const users = await loadUserOptions();
  const sel = document.getElementById('balOwner');
  sel.innerHTML = '<option value="">ເລືອກພະນັກງານ...</option>' +
    users.map(u => `<option value="${u.value}">${u.label}</option>`).join('');
  document.getElementById('balTotal').value  = '';
  document.getElementById('balUsed').value   = '';
  document.getElementById('balRemain').value = '';
  // auto-calc remain
  ['balTotal','balUsed'].forEach(id => {
    document.getElementById(id).oninput = () => {
      const t = parseFloat(document.getElementById('balTotal').value)||0;
      const u = parseFloat(document.getElementById('balUsed').value)||0;
      document.getElementById('balRemain').value = Math.max(0,t-u);
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
  const existing = allLeaveBalance.find(b => String(b.owner).toLowerCase() === owner);
  if (existing) {
    document.getElementById('balTotal').value  = existing.total_days ?? 15;
    document.getElementById('balUsed').value   = existing.used_days  ?? 0;
    document.getElementById('balRemain').value = Math.max(0,(existing.total_days??15)-(existing.used_days??0));
  } else {
    document.getElementById('balTotal').value  = 15;
    document.getElementById('balUsed').value   = 0;
    document.getElementById('balRemain').value = 15;
  }
}

async function saveBalance() {
  const owner = requireEmailRef(document.getElementById('balOwner').value, myEmail(), 'ພະນັກງານ');
  if (!owner) return;
  const total = parseFloat(document.getElementById('balTotal').value)||0;
  const used  = parseFloat(document.getElementById('balUsed').value)||0;
  const existing = allLeaveBalance.find(b => String(b.owner).toLowerCase() === owner);
  let error;
  if (existing) {
    ({ error } = await db.from('leave_balance').update({ total_days:total, used_days:used }).eq('owner', owner));
  } else {
    ({ error } = await db.from('leave_balance').insert({ owner, total_days:total, used_days:used }));
  }
  if (error) { toast('❌ '+error.message); return; }
  toast('✅ ບັນທຶກວັນລາສຳເລັດ!');
  closeBalanceModal();
  loadLeave();
}

// ════ REPORT ════
async function loadReport() {
  let t = [], d = [];
  try {
    const [tRes, dRes] = await Promise.all([
      db.from('tasks').select('*').order('created_at'),
      db.from('documents').select('*'),
    ]);
    if (tRes.error) throw tRes.error;
    if (dRes.error) throw dRes.error;
    t = tRes.data||[];
    d = dRes.data||[];
  } catch (error) {
    logDbError('loadReport', error);
    showMultiError(['kpiOverdue','kpiPendingDocs','kpiCompletion','statusChart','reportSummary'], 'ໂຫຼດລາຍງານບໍ່ສຳເລັດ', error);
    return;
  }

  // ── Base counts ──────────────────────────────────
  const done = t.filter(x=>x.status==='done').length;
  const inp  = t.filter(x=>x.status==='inprogress').length;
  const blk  = t.filter(x=>x.status==='blocked').length;
  const pct  = t.length ? Math.round(done/t.length*100) : 0;

  const today = new Date(); today.setHours(0,0,0,0);

  // ── Overdue tasks ─────────────────────────────────
  const overdue = t.filter(x => {
    if (x.status==='done' || !x.due_date || x.due_date==='—') return false;
    return new Date(x.due_date) < today;
  });

  // ── Pending docs ──────────────────────────────────
  const pendingDocs = d.filter(x => isDocInProgress(x));
  const approvedDocs = d.length - pendingDocs.length;

  // ── Weekly completed (last 4 weeks) ───────────────
  const weeks = [0,1,2,3].map(w => {
    const wStart = new Date(today); wStart.setDate(wStart.getDate() - (w+1)*7);
    const wEnd   = new Date(today); wEnd.setDate(wEnd.getDate() - w*7);
    const label  = `${wStart.getDate()}/${wStart.getMonth()+1}`;
    const count  = t.filter(x => {
      if (x.status !== 'done') return false;
      const d = new Date(x.updated_at || x.created_at);
      return d >= wStart && d < wEnd;
    }).length;
    return {label, count};
  }).reverse();

  // ── Workload per person ───────────────────────────
  const workMap = {};
  t.filter(x=>x.status!=='done').forEach(x => {
    const o = x.owner||'—';
    if (!workMap[o]) workMap[o] = {total:0, blocked:0, urgent:0};
    workMap[o].total++;
    if (x.status==='blocked') workMap[o].blocked++;
    if (x.priority==='urgent') workMap[o].urgent++;
  });
  const workload = Object.entries(workMap)
    .sort((a,b)=>b[1].total-a[1].total).slice(0,5);

  // ── KPI Cards ─────────────────────────────────────
  document.getElementById('kpiCards').innerHTML = `
    <div class="metric"><div class="num" style="color:var(--c1)">${pct}%</div><div class="lbl">ຄວາມຄືບໜ້າ</div></div>
    <div class="metric"><div class="num" style="color:var(--c1)">${done}</div><div class="lbl">ສຳເລັດ</div></div>
    <div class="metric"><div class="num" style="color:var(--c3)">${inp}</div><div class="lbl">ດຳເນີນຢູ່</div></div>
    <div class="metric"><div class="num" style="color:var(--c4)">${blk}</div><div class="lbl">ຕິດຂັດ</div></div>
    <div class="metric"><div class="num" style="color:var(--c4)">${overdue.length}</div><div class="lbl">ຊ້າ Deadline</div></div>
    <div class="metric"><div class="num" style="color:var(--c3)">${pendingDocs.length}</div><div class="lbl">ເອກະສານຄ້າງ</div></div>`;

  // ── Overdue list ──────────────────────────────────
  document.getElementById('kpiOverdue').innerHTML = overdue.length === 0
    ? '<div class="empty">✅ ບໍ່ມີວຽກຊ້າ</div>'
    : overdue.map(x => {
        const days = Math.ceil((today - new Date(x.due_date)) / (1000*60*60*24));
        return `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border)">
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h(x.name)}</div>
            <div style="font-size:11px;color:var(--muted)">${h(x.owner)} · Due: ${x.due_date}</div>
          </div>
          <span style="background:var(--c4l);color:var(--c4m);padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;white-space:nowrap">ຊ້າ ${days} ວັນ</span>
        </div>`;
      }).join('');

  // ── Pending docs list ─────────────────────────────
  document.getElementById('kpiPendingDocs').innerHTML = pendingDocs.length === 0
    ? '<div class="empty">✅ ບໍ່ມີເອກະສານຄ້າງ</div>'
    : pendingDocs.map(x => {
        const step = (x.steps||[])[x.current_step]||'—';
        return `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border)">
          <span style="font-size:18px">${x.doc_type}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h(x.name)}</div>
            <div style="font-size:11px;color:var(--muted)">ລໍຖ້າ: ${step}</div>
          </div>
        </div>`;
      }).join('');

  // ── Workload chart ────────────────────────────────
  const maxW = Math.max(...workload.map(w=>w[1].total), 1);
  document.getElementById('kpiWorkload').innerHTML = workload.length === 0
    ? '<div class="empty">ບໍ່ມີຂໍ້ມູນ</div>'
    : workload.map(([name, stat], i) => {
        const pct2 = Math.round(stat.total/maxW*100);
        const medal = i===0 ? '🥇' : i===1 ? '🥈' : i===2 ? '🥉' : '';
        return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
          <div style="min-width:28px;font-size:14px;text-align:center">${medal||`${i+1}.`}</div>
          <div style="min-width:90px;font-size:13px;color:var(--text);font-weight:${i===0?'600':'400'}">${h(name)}</div>
          <div style="flex:1;height:8px;background:var(--border);border-radius:4px;overflow:hidden">
            <div style="height:100%;width:${pct2}%;background:${i===0?'var(--c4)':'var(--c2)'};border-radius:4px;transition:width .4s"></div>
          </div>
          <div style="font-size:12px;min-width:60px;text-align:right;color:var(--muted)">
            ${stat.total} ວຽກ${stat.blocked>0?` · <span style="color:var(--c4m)">⛔${stat.blocked}</span>`:''}${stat.urgent>0?` · <span style="color:var(--c3m)">🔴${stat.urgent}</span>`:''}
          </div>
        </div>`;
      }).join('');

  // ── Weekly bar chart ──────────────────────────────
  const maxWk = Math.max(...weeks.map(w=>w.count), 1);
  document.getElementById('kpiWeeklyChart').innerHTML = weeks.map(w => `
    <div class="bar-col">
      <div class="bar-val">${w.count}</div>
      <div class="bar-fill" style="height:${Math.max(w.count/maxWk*80,4)}px;background:var(--c1)"></div>
      <div class="bar-lbl">${w.label}</div>
    </div>`).join('');

  // ── Task status bar chart ─────────────────────────
  const mx = Math.max(done,inp,blk,1);
  document.getElementById('taskBarChart').innerHTML = [
    {l:'ສຳເລັດ',v:done,c:'var(--c1)'},{l:'ດຳເນີນ',v:inp,c:'var(--c2)'},{l:'ຕິດຂັດ',v:blk,c:'var(--c4)'}
  ].map(b=>`<div class="bar-col"><div class="bar-val">${b.v}</div><div class="bar-fill" style="height:${Math.max(b.v/mx*70,4)}px;background:${b.c}"></div><div class="bar-lbl">${b.l}</div></div>`).join('');

  // ── Doc bar chart ─────────────────────────────────
  const mx2 = Math.max(approvedDocs, pendingDocs.length, 1);
  document.getElementById('docBarChart').innerHTML = [
    {l:'ອະນຸມັດ',v:approvedDocs,c:'var(--c1)'},{l:'ລໍຖ້າ',v:pendingDocs.length,c:'var(--c3)'}
  ].map(b=>`<div class="bar-col"><div class="bar-val">${b.v}</div><div class="bar-fill" style="height:${Math.max(b.v/mx2*70,4)}px;background:${b.c}"></div><div class="bar-lbl">${b.l}</div></div>`).join('');

  // ── Progress timeline ─────────────────────────────
  document.getElementById('reportProgress').innerHTML = t.map(x=>`
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
      <div style="width:130px;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h(x.name)}</div>
      <div style="width:70px;font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h(x.owner)}</div>
      <div style="flex:1;height:7px;background:var(--border);border-radius:4px;overflow:hidden">
        <div style="height:100%;width:${x.progress}%;background:${x.status==='blocked'?'var(--c4)':x.status==='done'?'var(--c1)':'var(--c2)'};border-radius:4px"></div>
      </div>
      <span style="font-size:12px;font-weight:600;min-width:32px;text-align:right;color:var(--muted)">${x.progress}%</span>
    </div>`).join('');
}

initApp();


/* ===== split from index v19 ===== */


/* ===== UX REFACTOR V18: non-blocking toast instead of popup alert ===== */
(function(){
  function ensureToastStack(){
    let stack = document.querySelector('.toast-stack-v18');
    if(!stack){
      stack = document.createElement('div');
      stack.className = 'toast-stack-v18';
      document.body.appendChild(stack);
    }
    return stack;
  }
  window.showToast = window.showToast || function(message, type='info'){
    const stack = ensureToastStack();
    const el = document.createElement('div');
    el.className = 'toast-v18 ' + (type || 'info');
    el.textContent = String(message || 'ດຳເນີນການແລ້ວ');
    stack.appendChild(el);
    setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translateY(8px)'; }, 2600);
    setTimeout(()=>{ el.remove(); }, 3100);
  };
  const nativeAlert = window.alert;
  window.alert = function(message){
    const text = String(message || '');
    const lower = text.toLowerCase();
    const type = lower.includes('error') || lower.includes('ຜິດ') || lower.includes('email') ? 'error' : 'info';
    window.showToast(text, type);
  };
  window.__nativeAlert = nativeAlert;
})();
