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
  document.getElementById('editTaskForm').style.display='none';
  const pg = document.querySelector('.page.active');
  if (pg) pg.scrollTop = 0; else window.scrollTo({ top: 0, behavior: 'smooth' });
  await loadTasks();
  toast('✅ ແກ້ໄຂສຳເລັດ!');
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
