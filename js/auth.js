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
  const warn = $('config-warn');
  const login = $('loginPage');
  const main = $('mainApp');

  const badConfig = !SUPABASE_URL || !SUPABASE_KEY ||
    SUPABASE_URL.includes('YOUR_PROJECT') || SUPABASE_KEY.includes('YOUR_ANON') ||
    !SUPABASE_URL.startsWith('https://') || SUPABASE_KEY.length < 20;

  if (!createClient) {
    if (warn) {
      warn.style.display = 'block';
      const strong = warn.querySelector('strong');
      if (strong) strong.textContent = 'Supabase library ໂຫຼດບໍ່ສຳເລັດ';
      const div = warn.querySelector('.config-banner div');
      if (div) div.insertAdjacentHTML('beforeend', '<br><small>ກວດ internet/CDN ຫຼື ໃຊ້ local supabase-js file ແທນ CDN.</small>');
    }
    if (login) login.style.display = 'none';
    if (main) main.style.display = 'none';
    return;
  }

  if (badConfig) {
    if (warn) warn.style.display = 'block';
    if (login) login.style.display = 'none';
    if (main) main.style.display = 'none';
    return;
  }

  try {
    db = createClient(SUPABASE_URL, SUPABASE_KEY);
    checkSession();
  } catch (err) {
    console.error('Supabase init failed:', err);
    if (warn) warn.style.display = 'block';
    if (login) login.style.display = 'none';
    if (main) main.style.display = 'none';
  }
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
  if (typeof refreshNotifications === 'function') refreshNotifications({ silent: true });
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

let __loggingOut = false;

async function doLogout() {
  if (__loggingOut) return;
  if (!confirm('ຢືນຢັນອອກຈາກລະບົບ?')) return;

  __loggingOut = true;

  const btn = document.querySelector('#logoutBtn, button[onclick="doLogout()"]');
  const oldHtml = btn ? btn.innerHTML : '';

  try {
    if (btn) {
      btn.disabled = true;
      btn.style.opacity = '.6';
      btn.innerHTML = '⏳ ກຳລັງອອກ...';
    }

    if (typeof stopRealtimeSync === 'function') {
      stopRealtimeSync();
    }

    const { error } = await db.auth.signOut();
    if (error) throw error;

    try {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('sb-')) localStorage.removeItem(key);
      });
      sessionStorage.clear();
    } catch (e) {
      console.warn('storage clear warning', e);
    }

    showLogin();
  } catch (err) {
    console.error('Logout failed:', err);
    if (typeof toast === 'function') toast('❌ Logout failed: ' + (err.message || err));
    else alert('Logout failed: ' + (err.message || err));
  } finally {
    __loggingOut = false;
    if (btn) {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.innerHTML = oldHtml || '<i class="ti ti-logout"></i> ອອກ';
    }
  }
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

