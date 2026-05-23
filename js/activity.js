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
