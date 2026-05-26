async function refreshCurrentProfileForAdmin() {
  const {
    data: { user },
    error: userError
  } = await db.auth.getUser();

  if (userError || !user) {
    console.error('Admin profile auth error:', userError);
    currentUser = null;
    currentProfile = null;
    currentRole = 'viewer';
    return null;
  }

  currentUser = user;

  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('id,email,full_name,role,created_at')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    console.error('Admin profile load error:', profileError);
    currentProfile = null;
    currentRole = 'viewer';
    return null;
  }

  currentProfile = profile || {
    id: user.id,
    email: user.email,
    full_name: '',
    role: 'viewer'
  };

  currentRole = normalizeRole(currentProfile.role);

  const userEmailEl = document.getElementById('userEmail');
  if (userEmailEl) {
    userEmailEl.textContent = `${currentProfile.email || user.email} (${formatRoleLabel(currentRole)})`;
    userEmailEl.dataset.role = currentRole;
  }

  applyPermissionUI();

  return currentProfile;
}

async function requireFreshAdmin() {
  const profile = await refreshCurrentProfileForAdmin();

  if (!profile || normalizeRole(profile.role) !== 'admin') {
    toast('⛔ ສິດທິ Admin ເທົ່ານັ້ນ');
    return false;
  }

  return true;
}

async function loadAdmin() {
  const ok = await requireFreshAdmin();
  if (!ok) return;

  const listEl = document.getElementById('adminUserList');
  if (!listEl) return;

  listEl.innerHTML = '<div class="spinner">ໂຫຼດ...</div>';

  const { data, error } = await db
    .from('profiles')
    .select('id,email,full_name,role,created_at')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('loadAdmin users error:', error);
    listEl.innerHTML = `<div class="empty">❌ ໂຫຼດ Users ບໍ່ສຳເລັດ: ${h(error.message)}</div>`;
    return;
  }

  allUsers = data || [];
  renderAdminUsers();
}

function renderAdminUsers() {
  const listEl = document.getElementById('adminUserList');
  if (!listEl) return;

  const roleBadge = {
    admin:    { bg: '#FAECE7', color: '#993C1D', label: 'Admin' },
    manager:  { bg: '#E6F1FB', color: '#185FA5', label: 'ຫົວໜ້າ' },
    employee: { bg: '#E1F5EE', color: '#0F6E56', label: 'ພະນັກງານ' },
    viewer:   { bg: '#F1EFE8', color: '#5F5E5A', label: 'Viewer' }
  };

  listEl.innerHTML = allUsers.length === 0
    ? '<div class="empty">ບໍ່ພົບ Users</div>'
    : allUsers.map(u => {
        const role = normalizeRole(u.role);
        const rb = roleBadge[role] || roleBadge.viewer;
        const isSelf = currentUser && u.id === currentUser.id;

        return `
          <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
            <div style="width:36px;height:36px;border-radius:50%;background:var(--c2l);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:500;color:var(--c2m);flex-shrink:0">
              ${(u.email || '?').substring(0,2).toUpperCase()}
            </div>

            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:500;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                ${h(u.email || '—')} ${isSelf ? '<span style="font-size:10px;color:var(--muted)">(ຕົວທ່ານ)</span>' : ''}
              </div>
              <div style="font-size:11px;color:var(--muted);margin-top:2px">
                ເຂົ້າໃຊ້ຄັ້ງທຳອິດ: ${u.created_at ? new Date(u.created_at).toLocaleDateString('lo-LA') : '—'}
              </div>
            </div>

            <span style="background:${rb.bg};color:${rb.color};padding:3px 10px;border-radius:10px;font-size:11px;font-weight:500;flex-shrink:0">
              ${h(rb.label)}
            </span>

            ${!isSelf ? `
              <button
                onclick="openEditRole('${safeAttr(u.id)}','${safeAttr(u.email)}','${safeAttr(role)}')"
                style="border:1px solid var(--border);background:var(--c2l);border-radius:6px;padding:3px 10px;cursor:pointer;font-size:11px;color:var(--c2m);flex-shrink:0">
                <i class="ti ti-pencil"></i> Role
              </button>
            ` : ''}
          </div>
        `;
      }).join('');
}

async function openEditRole(userId, email, currentRoleVal) {
  const ok = await requireFreshAdmin();
  if (!ok) return;

  document.getElementById('editRoleUserId').value = userId;
  document.getElementById('editRoleEmail').textContent = email;
  document.getElementById('editRoleSelect').value = normalizeRole(currentRoleVal);

  const form = document.getElementById('editRoleForm');
  form.style.display = 'block';
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function saveUserRole() {
  const ok = await requireFreshAdmin();
  if (!ok) return;

  const userId  = document.getElementById('editRoleUserId').value;
  const newRole = normalizeRole(document.getElementById('editRoleSelect').value);
  const email   = document.getElementById('editRoleEmail').textContent;

  if (!userId) {
    toast('⚠️ ບໍ່ພົບ user id');
    return;
  }

  if (currentUser && userId === currentUser.id) {
    toast('⚠️ ບໍ່ຄວນປ່ຽນ Role ຂອງ Admin ໂຕເອງ');
    return;
  }

  const { error } = await db
    .from('profiles')
    .update({ role: newRole })
    .eq('id', userId);

  if (error) {
    console.error('saveUserRole error:', error);
    toast('❌ ອັບເດດ Role ບໍ່ສຳເລັດ: ' + error.message);
    return;
  }

  try {
    await logAction('updated', 'user', 0, email, `role → ${newRole}`);
  } catch (e) {
    console.warn('logAction warning:', e);
  }

  toast('✅ ອັບເດດ Role ສຳເລັດ!');
  document.getElementById('editRoleForm').style.display = 'none';

  await loadAdmin();
}
