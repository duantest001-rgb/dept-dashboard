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

