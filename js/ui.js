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

function showPage(p, btn) {
  const page = document.getElementById('page-' + p);
  if (!page) {
    console.warn('Page not found:', p);
    toast('⚠️ ບໍ່ພົບໜ້າ: ' + p);
    return;
  }
  document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.nav button').forEach(x=>x.classList.remove('active'));
  page.classList.add('active');
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
  if (window.showToast) return window.showToast(msg);
  const t=document.getElementById('toast');
  if (!t) { console.log(msg); return; }
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
