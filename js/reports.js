async function loadReport() {
  let t = [], d = [];
  try {
    const [tRes, dRes] = await Promise.all([
      db.from('tasks').select('*').order('created_at'),
      db.from('documents').select('*'),
    ]);
    if (tRes.error) throw tRes.error;
    if (dRes.error) throw dRes.error;
    t = tRes.data||[];
    d = dRes.data||[];
  } catch (error) {
    logDbError('loadReport', error);
    showMultiError(['kpiOverdue','kpiPendingDocs','kpiCompletion','statusChart','reportSummary'], 'ໂຫຼດລາຍງານບໍ່ສຳເລັດ', error);
    return;
  }

  // ── Base counts ──────────────────────────────────
  const done = t.filter(x=>x.status==='done').length;
  const inp  = t.filter(x=>x.status==='inprogress').length;
  const blk  = t.filter(x=>x.status==='blocked').length;
  const pct  = t.length ? Math.round(done/t.length*100) : 0;

  const today = new Date(); today.setHours(0,0,0,0);

  // ── Overdue tasks ─────────────────────────────────
  const overdue = t.filter(x => {
    if (x.status==='done' || !x.due_date || x.due_date==='—') return false;
    return new Date(x.due_date) < today;
  });

  // ── Pending docs ──────────────────────────────────
  const pendingDocs = d.filter(x => isDocInProgress(x));
  const approvedDocs = d.length - pendingDocs.length;

  // ── Weekly completed (last 4 weeks) ───────────────
  const weeks = [0,1,2,3].map(w => {
    const wStart = new Date(today); wStart.setDate(wStart.getDate() - (w+1)*7);
    const wEnd   = new Date(today); wEnd.setDate(wEnd.getDate() - w*7);
    const label  = `${wStart.getDate()}/${wStart.getMonth()+1}`;
    const count  = t.filter(x => {
      if (x.status !== 'done') return false;
      const d = new Date(x.updated_at || x.created_at);
      return d >= wStart && d < wEnd;
    }).length;
    return {label, count};
  }).reverse();

  // ── Workload per person ───────────────────────────
  const workMap = {};
  t.filter(x=>x.status!=='done').forEach(x => {
    const o = x.owner||'—';
    if (!workMap[o]) workMap[o] = {total:0, blocked:0, urgent:0};
    workMap[o].total++;
    if (x.status==='blocked') workMap[o].blocked++;
    if (x.priority==='urgent') workMap[o].urgent++;
  });
  const workload = Object.entries(workMap)
    .sort((a,b)=>b[1].total-a[1].total).slice(0,5);

  // ── KPI Cards ─────────────────────────────────────
  document.getElementById('kpiCards').innerHTML = `
    <div class="metric"><div class="num" style="color:var(--c1)">${pct}%</div><div class="lbl">ຄວາມຄືບໜ້າ</div></div>
    <div class="metric"><div class="num" style="color:var(--c1)">${done}</div><div class="lbl">ສຳເລັດ</div></div>
    <div class="metric"><div class="num" style="color:var(--c3)">${inp}</div><div class="lbl">ດຳເນີນຢູ່</div></div>
    <div class="metric"><div class="num" style="color:var(--c4)">${blk}</div><div class="lbl">ຕິດຂັດ</div></div>
    <div class="metric"><div class="num" style="color:var(--c4)">${overdue.length}</div><div class="lbl">ຊ້າ Deadline</div></div>
    <div class="metric"><div class="num" style="color:var(--c3)">${pendingDocs.length}</div><div class="lbl">ເອກະສານຄ້າງ</div></div>`;

  // ── Overdue list ──────────────────────────────────
  document.getElementById('kpiOverdue').innerHTML = overdue.length === 0
    ? '<div class="empty">✅ ບໍ່ມີວຽກຊ້າ</div>'
    : overdue.map(x => {
        const days = Math.ceil((today - new Date(x.due_date)) / (1000*60*60*24));
        return `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border)">
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h(x.name)}</div>
            <div style="font-size:11px;color:var(--muted)">${h(x.owner)} · Due: ${x.due_date}</div>
          </div>
          <span style="background:var(--c4l);color:var(--c4m);padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;white-space:nowrap">ຊ້າ ${days} ວັນ</span>
        </div>`;
      }).join('');

  // ── Pending docs list ─────────────────────────────
  document.getElementById('kpiPendingDocs').innerHTML = pendingDocs.length === 0
    ? '<div class="empty">✅ ບໍ່ມີເອກະສານຄ້າງ</div>'
    : pendingDocs.map(x => {
        const step = (x.steps||[])[x.current_step]||'—';
        return `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border)">
          <span style="font-size:18px">${x.doc_type}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h(x.name)}</div>
            <div style="font-size:11px;color:var(--muted)">ລໍຖ້າ: ${step}</div>
          </div>
        </div>`;
      }).join('');

  // ── Workload chart ────────────────────────────────
  const maxW = Math.max(...workload.map(w=>w[1].total), 1);
  document.getElementById('kpiWorkload').innerHTML = workload.length === 0
    ? '<div class="empty">ບໍ່ມີຂໍ້ມູນ</div>'
    : workload.map(([name, stat], i) => {
        const pct2 = Math.round(stat.total/maxW*100);
        const medal = i===0 ? '🥇' : i===1 ? '🥈' : i===2 ? '🥉' : '';
        return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
          <div style="min-width:28px;font-size:14px;text-align:center">${medal||`${i+1}.`}</div>
          <div style="min-width:90px;font-size:13px;color:var(--text);font-weight:${i===0?'600':'400'}">${h(name)}</div>
          <div style="flex:1;height:8px;background:var(--border);border-radius:4px;overflow:hidden">
            <div style="height:100%;width:${pct2}%;background:${i===0?'var(--c4)':'var(--c2)'};border-radius:4px;transition:width .4s"></div>
          </div>
          <div style="font-size:12px;min-width:60px;text-align:right;color:var(--muted)">
            ${stat.total} ວຽກ${stat.blocked>0?` · <span style="color:var(--c4m)">⛔${stat.blocked}</span>`:''}${stat.urgent>0?` · <span style="color:var(--c3m)">🔴${stat.urgent}</span>`:''}
          </div>
        </div>`;
      }).join('');

  // ── Weekly bar chart ──────────────────────────────
  const maxWk = Math.max(...weeks.map(w=>w.count), 1);
  document.getElementById('kpiWeeklyChart').innerHTML = weeks.map(w => `
    <div class="bar-col">
      <div class="bar-val">${w.count}</div>
      <div class="bar-fill" style="height:${Math.max(w.count/maxWk*80,4)}px;background:var(--c1)"></div>
      <div class="bar-lbl">${w.label}</div>
    </div>`).join('');

  // ── Task status bar chart ─────────────────────────
  const mx = Math.max(done,inp,blk,1);
  document.getElementById('taskBarChart').innerHTML = [
    {l:'ສຳເລັດ',v:done,c:'var(--c1)'},{l:'ດຳເນີນ',v:inp,c:'var(--c2)'},{l:'ຕິດຂັດ',v:blk,c:'var(--c4)'}
  ].map(b=>`<div class="bar-col"><div class="bar-val">${b.v}</div><div class="bar-fill" style="height:${Math.max(b.v/mx*70,4)}px;background:${b.c}"></div><div class="bar-lbl">${b.l}</div></div>`).join('');

  // ── Doc bar chart ─────────────────────────────────
  const mx2 = Math.max(approvedDocs, pendingDocs.length, 1);
  document.getElementById('docBarChart').innerHTML = [
    {l:'ອະນຸມັດ',v:approvedDocs,c:'var(--c1)'},{l:'ລໍຖ້າ',v:pendingDocs.length,c:'var(--c3)'}
  ].map(b=>`<div class="bar-col"><div class="bar-val">${b.v}</div><div class="bar-fill" style="height:${Math.max(b.v/mx2*70,4)}px;background:${b.c}"></div><div class="bar-lbl">${b.l}</div></div>`).join('');

  // ── Progress timeline ─────────────────────────────
  document.getElementById('reportProgress').innerHTML = t.map(x=>`
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
      <div style="width:130px;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h(x.name)}</div>
      <div style="width:70px;font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h(x.owner)}</div>
      <div style="flex:1;height:7px;background:var(--border);border-radius:4px;overflow:hidden">
        <div style="height:100%;width:${x.progress}%;background:${x.status==='blocked'?'var(--c4)':x.status==='done'?'var(--c1)':'var(--c2)'};border-radius:4px"></div>
      </div>
      <span style="font-size:12px;font-weight:600;min-width:32px;text-align:right;color:var(--muted)">${x.progress}%</span>
    </div>`).join('');
}
