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
    toastOnce(`invalid-email-${fieldLabel}`, `⚠️ ${fieldLabel} ຕ້ອງເປັນ email ເຊັ່ນ pou@bd.com`, 'warning');
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
