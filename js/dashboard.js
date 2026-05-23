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
