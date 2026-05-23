
// ════════════════════════════════════════════════════════════════════════
// Notification System v22: toast, unread badge, reminders, overdue alerts
// ════════════════════════════════════════════════════════════════════════
let notificationItems = [];
let notificationReadKey = '';

function getReadNotificationIds() {
  if (!notificationReadKey) notificationReadKey = `bd_notifications_read_${myEmail() || 'guest'}`;
  try { return JSON.parse(localStorage.getItem(notificationReadKey) || '[]'); }
  catch { return []; }
}

function setReadNotificationIds(ids) {
  if (!notificationReadKey) notificationReadKey = `bd_notifications_read_${myEmail() || 'guest'}`;
  localStorage.setItem(notificationReadKey, JSON.stringify([...new Set(ids)]));
}

function buildNotificationId(type, id, extra='') {
  return `${type}:${id || '0'}:${extra || ''}`;
}

function isToday(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr); if (isNaN(d)) return false;
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

function daysDiffFromToday(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(dateStr); if (isNaN(d)) return null;
  d.setHours(0,0,0,0);
  return Math.round((d - today) / (1000*60*60*24));
}

function makeNotification({id,type='info',icon='🔔',title,meta,time,click}) {
  return { id, type, icon, title, meta, time, click };
}

function buildSystemNotifications() {
  const list = [];
  const tasks = Array.isArray(allTasks) ? allTasks : [];
  const meets = Array.isArray(allMeets) ? allMeets : [];
  const docs  = Array.isArray(allDocs) ? allDocs : [];
  const email = myEmail();

  // 1) Overdue + due soon tasks
  tasks.filter(t => t.status !== 'done').forEach(t => {
    const diff = daysDiffFromToday(t.due_date);
    if (diff === null) return;
    const assignedToMe = !email || matchesMe(t.owner) || isSuperior();
    if (!assignedToMe) return;

    if (diff < 0) {
      list.push(makeNotification({
        id: buildNotificationId('task-overdue', t.id, t.due_date),
        type: 'danger', icon: '⏰',
        title: `ວຽກຊ້າ ${Math.abs(diff)} ວັນ`,
        meta: t.name || 'Untitled task',
        time: `Due: ${t.due_date}`,
        click: () => { showPageById('tasks'); }
      }));
    } else if (diff === 0) {
      list.push(makeNotification({
        id: buildNotificationId('task-today', t.id, t.due_date),
        type: 'warn', icon: '🔥',
        title: 'ວຽກຄົບກຳນົດມື້ນີ້',
        meta: t.name || 'Untitled task',
        time: `Due: ${t.due_date}`,
        click: () => { showPageById('tasks'); }
      }));
    } else if (diff <= 2) {
      list.push(makeNotification({
        id: buildNotificationId('task-soon', t.id, t.due_date),
        type: 'warn', icon: '📌',
        title: `ວຽກໃກ້ຄົບກຳນົດ ອີກ ${diff} ວັນ`,
        meta: t.name || 'Untitled task',
        time: `Due: ${t.due_date}`,
        click: () => { showPageById('tasks'); }
      }));
    }
  });

  // 2) Meeting reminders today/tomorrow
  meets.filter(m => !m.meet_status || m.meet_status === 'scheduled').forEach(m => {
    const diff = daysDiffFromToday(m.meet_date);
    if (diff === null || diff > 1 || diff < 0) return;
    const attendees = normalizeAttendees(m.attendees || m.participants || m.attendee || '');
    const involved = isSuperior() || !email || attendees.includes(email) || matchesMe(m.created_by);
    if (!involved) return;
    list.push(makeNotification({
      id: buildNotificationId(diff === 0 ? 'meeting-today' : 'meeting-tomorrow', m.id, `${m.meet_date}-${m.meet_time || ''}`),
      type: diff === 0 ? 'info' : 'success', icon: diff === 0 ? '📅' : '🗓️',
      title: diff === 0 ? 'ນັດໝາຍມື້ນີ້' : 'ນັດໝາຍມື້ອື່ນ',
      meta: m.title || 'Untitled meeting',
      time: `${m.meet_date || ''} ${m.meet_time || ''}`.trim(),
      click: () => { showPageById('meet'); }
    }));
  });

  // 3) Pending documents
  docs.filter(d => isDocInProgress(d)).slice(0, 8).forEach(d => {
    const mineOrSuperior = isSuperior() || matchesMe(d.created_by);
    if (!mineOrSuperior) return;
    const currentStep = (d.steps || [])[d.current_step] || 'ກຳລັງດຳເນີນ';
    list.push(makeNotification({
      id: buildNotificationId('doc-pending', d.id, `${d.current_step || 0}-${d.doc_status || ''}`),
      type: 'info', icon: '📄',
      title: 'ເອກະສານກຳລັງດຳເນີນ',
      meta: d.name || 'Untitled document',
      time: `ຂັ້ນ: ${currentStep}`,
      click: () => { showPageById('docs'); }
    }));
  });

  // Sort by severity then date/order
  const weight = { danger: 1, warn: 2, info: 3, success: 4 };
  list.sort((a,b) => (weight[a.type] || 9) - (weight[b.type] || 9));
  return list.slice(0, 30);
}

function refreshNotifications({silent=false} = {}) {
  notificationItems = buildSystemNotifications();
  renderNotifications();
  const unread = getUnreadNotifications().length;
  if (!silent && unread > 0) {
    const dangerCount = notificationItems.filter(n => n.type === 'danger' && !getReadNotificationIds().includes(n.id)).length;
    if (dangerCount > 0) showToast(`ມີວຽກຊ້າ ${dangerCount} ລາຍການ`, 'warning');
  }
}

function getUnreadNotifications() {
  const read = getReadNotificationIds();
  return notificationItems.filter(n => !read.includes(n.id));
}

function renderNotifications() {
  const badge = document.getElementById('notifBadge');
  const listEl = document.getElementById('notificationList');
  const sub = document.getElementById('notifSub');
  const unread = getUnreadNotifications();
  if (badge) {
    badge.textContent = unread.length > 99 ? '99+' : String(unread.length);
    badge.style.display = unread.length ? 'flex' : 'none';
  }
  if (sub) sub.textContent = unread.length ? `${unread.length} ລາຍການຍັງບໍ່ອ່ານ` : 'ບໍ່ມີລາຍການໃໝ່';
  if (!listEl) return;
  if (!notificationItems.length) {
    listEl.innerHTML = '<div class="empty">✅ ບໍ່ມີການແຈ້ງເຕືອນ</div>';
    return;
  }
  const read = getReadNotificationIds();
  listEl.innerHTML = notificationItems.map((n, idx) => `
    <div class="notif-item" onclick="openNotificationItem(${idx})" style="${read.includes(n.id) ? 'opacity:.62' : ''}">
      <div class="notif-icon ${h(n.type)}">${h(n.icon)}</div>
      <div class="notif-content">
        <div class="notif-title">${h(n.title)}</div>
        <div class="notif-meta">${h(n.meta || '')}</div>
        <div class="notif-time">${h(n.time || '')}</div>
      </div>
    </div>`).join('');
}

function openNotificationItem(idx) {
  const n = notificationItems[idx];
  if (!n) return;
  setReadNotificationIds([...getReadNotificationIds(), n.id]);
  renderNotifications();
  if (typeof n.click === 'function') n.click();
  const panel = document.getElementById('notificationPanel');
  if (panel) panel.style.display = 'none';
}

function markNotificationsRead() {
  setReadNotificationIds(notificationItems.map(n => n.id));
  renderNotifications();
  showToast('ອ່ານການແຈ້ງເຕືອນໝົດແລ້ວ', 'success');
}

function toggleNotifications() {
  const panel = document.getElementById('notificationPanel');
  if (!panel) return;
  refreshNotifications({silent:true});
  panel.style.display = panel.style.display === 'none' || !panel.style.display ? 'block' : 'none';
}

function showPageById(page) {
  const btn = document.querySelector(`.nav button[onclick*="'${page}'"], .nav button[onclick*='"${page}"']`);
  if (typeof showPage === 'function') showPage(page, btn || undefined);
}

// Improved toast used by the whole app after this file loads.
function ensureToastStackV22(){
  let stack = document.querySelector('.toast-stack-v22');
  if(!stack){ stack = document.createElement('div'); stack.className = 'toast-stack-v22'; document.body.appendChild(stack); }
  return stack;
}

window.showToast = function(message, type='info'){
  const stack = ensureToastStackV22();
  const el = document.createElement('div');
  el.className = `toast-v22 ${type || 'info'}`;
  el.textContent = String(message || 'ດຳເນີນການແລ້ວ');
  stack.appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translateY(8px)'; }, 2800);
  setTimeout(()=>{ el.remove(); }, 3300);
};

window.toast = function(message, type='info') {
  const text = String(message || '');
  let finalType = type;
  if (text.includes('✅')) finalType = 'success';
  else if (text.includes('❌') || text.includes('⛔')) finalType = 'error';
  else if (text.includes('⚠️') || text.includes('🚫')) finalType = 'warning';
  window.showToast(text, finalType);
};

// Close notification panel on outside click.
document.addEventListener('click', (e) => {
  const panel = document.getElementById('notificationPanel');
  const btn = document.getElementById('notifBtn');
  if (!panel || !btn || panel.style.display === 'none') return;
  if (!panel.contains(e.target) && !btn.contains(e.target)) panel.style.display = 'none';
});
