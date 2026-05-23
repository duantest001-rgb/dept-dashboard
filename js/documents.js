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
          ${workflowBadge(d)}
          <div class="flow-steps">${stepsHtml}</div>
          <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
            <button onclick="openDocHistory(${d.id})" style="border:1px solid var(--border);background:var(--bg2);border-radius:6px;padding:3px 8px;cursor:pointer;font-size:11px;color:var(--muted)"><i class="ti ti-history"></i> History</button>
            ${!isDone && !isCancelled && canActOnDoc(d) ? `<button class="btn-outline" style="font-size:11px;padding:4px 10px" onclick="openWorkflowRoute(${d.id})">📨 ສົ່ງຕໍ່</button>` : ''}
            ${!isDone && !isCancelled && canActOnDoc(d) ? `<button class="btn-outline" style="font-size:11px;padding:4px 10px" onclick="signCurrentDocStep(${d.id},'signed')">✍️ ເຊັນ</button>` : ''}
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


// ════ WORKFLOW AUTOMATION v23: approval, routing, signatures, forwarding ════
function docWorkflowMeta(doc) {
  const sc = doc?.step_comments || {};
  const wf = sc._workflow || {};
  return {
    assigned_to: (wf.assigned_to || doc?.created_by || '').toLowerCase(),
    assigned_by: wf.assigned_by || '',
    assigned_at: wf.assigned_at || '',
    status: wf.status || doc?.doc_status || 'inprogress',
    signature_log: Array.isArray(wf.signature_log) ? wf.signature_log : [],
    routing_history: Array.isArray(wf.routing_history) ? wf.routing_history : []
  };
}

function canActOnDoc(doc) {
  const wf = docWorkflowMeta(doc);
  return isSuperior() || matchesMe(doc?.created_by) || matchesMe(wf.assigned_to);
}

function workflowUserLabel(email) {
  const e = String(email || '').toLowerCase();
  return participantLabel ? participantLabel(e) : e;
}

async function updateDocWorkflowMeta(docId, updater, logDetail = '') {
  const doc = allDocs.find(d => d.id === docId);
  if (!doc) return false;
  const sc = doc.step_comments || {};
  const oldWf = docWorkflowMeta(doc);
  const newWf = updater({...oldWf}) || oldWf;
  sc._workflow = newWf;
  const { error } = await db.from('documents').update({ step_comments: sc }).eq('id', docId);
  if (error) { toast('❌ ' + error.message); return false; }
  if (logDetail) await logAction('updated','document', docId, doc?.name || '', logDetail);
  return true;
}

function workflowBadge(doc) {
  const wf = docWorkflowMeta(doc);
  const assigned = wf.assigned_to ? workflowUserLabel(wf.assigned_to) : '—';
  const sigs = wf.signature_log?.length || 0;
  return `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
    <span class="badge normal" title="ຜູ້ຮັບຜິດຊອບຂັ້ນປັດຈຸບັນ">👤 ${h(assigned)}</span>
    <span class="badge done-b" title="Signature log">✍️ ${sigs} ລາຍເຊັນ</span>
  </div>`;
}

function openWorkflowRoute(docId) {
  const doc = allDocs.find(d => d.id === docId);
  if (!doc) return;
  if (!canActOnDoc(doc)) return toast('⛔ ບໍ່ມີສິດສົ່ງຕໍ່ເອກະສານນີ້');
  const modal = document.getElementById('workflowRouteModal');
  if (!modal) return toast('⚠️ Workflow modal missing');
  document.getElementById('wfDocId').value = docId;
  document.getElementById('wfDocTitle').textContent = doc.name || '';
  document.getElementById('wfNote').value = '';
  populateUserSelect('wfRouteUser', docWorkflowMeta(doc).assigned_to || myEmail(), false);
  modal.style.display = 'flex';
}

function closeWorkflowRoute() {
  const modal = document.getElementById('workflowRouteModal');
  if (modal) modal.style.display = 'none';
}

async function saveWorkflowRoute() {
  const docId = parseInt(document.getElementById('wfDocId').value);
  const to = requireEmailRef(document.getElementById('wfRouteUser').value, '', 'ຜູ້ຮັບຕໍ່');
  if (!to) return;
  const note = document.getElementById('wfNote').value.trim();
  const ok = await updateDocWorkflowMeta(docId, wf => {
    wf.routing_history = wf.routing_history || [];
    wf.routing_history.push({
      from: myEmail(), to, note,
      at: new Date().toISOString(),
      step: (allDocs.find(d=>d.id===docId)?.current_step || 0)
    });
    wf.assigned_to = to;
    wf.assigned_by = myEmail();
    wf.assigned_at = new Date().toISOString();
    wf.status = 'forwarded';
    return wf;
  }, `forwarded → ${to}${note ? ' | '+note : ''}`);
  if (ok) { toast('📨 ສົ່ງຕໍ່ແລ້ວ'); closeWorkflowRoute(); await loadDocs(); }
}

async function signCurrentDocStep(docId, action = 'signed') {
  const doc = allDocs.find(d => d.id === docId);
  if (!doc) return;
  if (!canActOnDoc(doc)) return toast('⛔ ບໍ່ມີສິດເຊັນ/ອະນຸມັດຂັ້ນນີ້');
  const stepIdx = doc.current_step || 0;
  const stepName = (doc.steps || [])[stepIdx] || '';
  const ok = await updateDocWorkflowMeta(docId, wf => {
    wf.signature_log = wf.signature_log || [];
    const already = wf.signature_log.some(s => s.by === myEmail() && s.step === stepIdx && s.action === action);
    if (!already) wf.signature_log.push({
      by: myEmail(), action, step: stepIdx, step_name: stepName, at: new Date().toISOString()
    });
    wf.status = action;
    return wf;
  }, `${action} step ${stepIdx+1}: ${stepName}`);
  if (ok) { toast('✍️ ບັນທຶກລາຍເຊັນແລ້ວ'); await loadDocs(); }
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

  
  const wf = docWorkflowMeta(d);
  const sigHtml = (wf.signature_log||[]).length ? `<div style="margin-top:14px;padding:10px;border:1px solid var(--border);border-radius:10px;background:var(--bg2)"><div style="font-size:12px;font-weight:600;margin-bottom:6px">✍️ Signature log</div>${wf.signature_log.map(s=>`<div style="font-size:11px;color:var(--muted);margin:3px 0">${h(s.by)} · ${h(s.action)} · ${h(s.step_name||('Step '+((s.step||0)+1)))} · ${new Date(s.at).toLocaleString('lo-LA')}</div>`).join('')}</div>` : '';
  const routeHtml = (wf.routing_history||[]).length ? `<div style="margin-top:10px;padding:10px;border:1px solid var(--border);border-radius:10px;background:var(--bg2)"><div style="font-size:12px;font-weight:600;margin-bottom:6px">📨 Routing / Forwarding</div>${wf.routing_history.map(r=>`<div style="font-size:11px;color:var(--muted);margin:3px 0">${h(r.from)} → ${h(r.to)} ${r.note ? ' · '+h(r.note) : ''} · ${new Date(r.at).toLocaleString('lo-LA')}</div>`).join('')}</div>` : '';
  document.getElementById('dhTimeline').innerHTML = html + sigHtml + routeHtml;
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
  if (!canActOnDoc(doc)) return toast('⛔ ບໍ່ມີສິດອະນຸມັດ/ຜ່ານຂັ້ນນີ້');

  const lastIndex = Math.max((total || 1) - 1, 0);
  const stepIdx = cur || 0;
  const stepName = (doc.steps || [])[stepIdx] || '';
  await updateDocWorkflowMeta(id, wf => {
    wf.signature_log = wf.signature_log || [];
    wf.signature_log.push({
      by: myEmail(),
      action: cur >= lastIndex ? 'completed' : 'approved',
      step: stepIdx,
      step_name: stepName,
      at: new Date().toISOString()
    });
    wf.status = cur >= lastIndex ? 'done' : 'approved';
    return wf;
  });

  if (cur >= lastIndex) {
    const { error } = await db.from('documents')
      .update({ current_step: lastIndex, doc_status: 'done' })
      .eq('id', id);
    if (error) { toast('❌ ' + error.message); return; }
    await logAction('approved','document', id, doc?.name||'', 'final approval / completed');
    toast('✅ ອະນຸມັດປິດເອກະສານສຳເລັດ!');
    loadDocs();
    return;
  }

  const nextStepIndex = cur + 1;
  const nextStep = (doc?.steps||[])[nextStepIndex]||'';
  const { error } = await db.from('documents')
    .update({ current_step: nextStepIndex, doc_status: 'inprogress' })
    .eq('id', id);
  if (error) { toast('❌ ' + error.message); return; }

  await updateDocWorkflowMeta(id, wf => {
    wf.assigned_to = wf.assigned_to || doc.created_by || myEmail();
    wf.status = 'inprogress';
    return wf;
  });
  await logAction('approved','document', id, doc?.name||'', `approved → ${nextStep}`);
  toast(nextStepIndex >= lastIndex ? '📄 ເຖິງຂັ້ນສຸດທ້າຍແລ້ວ — ກົດປິດສຳເລັດເມື່ອສຳເລັດຈິງ' : '✅ ອະນຸມັດ ແລະ ຜ່ານຂັ້ນແລ້ວ');
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
    doc_number, doc_direction,
    step_comments: {_workflow:{assigned_to: created_by, assigned_by: myEmail(), assigned_at: new Date().toISOString(), status:'inprogress', signature_log:[], routing_history:[]}}
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
