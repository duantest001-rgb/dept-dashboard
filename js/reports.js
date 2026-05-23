function _analyticsDateOnly(value){
  if(!value) return null;
  const d = new Date(value);
  if(Number.isNaN(d.getTime())) return null;
  d.setHours(0,0,0,0);
  return d;
}
function _daysBetween(a,b){ return Math.ceil((a-b)/(1000*60*60*24)); }
function _docSteps(doc){
  if(Array.isArray(doc.steps)) return doc.steps;
  if(typeof doc.steps === 'string'){
    try { const p=JSON.parse(doc.steps); if(Array.isArray(p)) return p; } catch(e) {}
    return doc.steps.split(',').map(x=>x.trim()).filter(Boolean);
  }
  return [];
}
function _docStatus(doc){ return doc.doc_status || doc.status || 'inprogress'; }
function _isDocPending(doc){ return !['done','cancelled'].includes(_docStatus(doc)); }
function _ownerLabel(email){ return (email||'—').replace('@bd.com',''); }
function _setHtml(id, html){ const el=document.getElementById(id); if(el) el.innerHTML=html; }
function _analyticsEmpty(text){ return `<div class="empty">${text}</div>`; }
function _bar(label, value, max, color){
  const height = Math.max((value/(max||1))*110, value>0?8:4);
  return `<div class="analytics-mini-bar"><div class="analytics-mini-val">${value}</div><div class="analytics-mini-fill" style="height:${height}px;background:${color}"></div><div class="analytics-mini-label">${h(label)}</div></div>`;
}

async function loadReport() {
  let tasks = [], docs = [], profiles = [];
  try {
    const [tRes, dRes, pRes] = await Promise.all([
      db.from('tasks').select('*').order('created_at', { ascending:false }),
      db.from('documents').select('*').order('created_at', { ascending:false }),
      db.from('profiles').select('email,role,full_name').order('email')
    ]);
    if (tRes.error) throw tRes.error;
    if (dRes.error) throw dRes.error;
    if (pRes.error) throw pRes.error;
    tasks = tRes.data || [];
    docs = dRes.data || [];
    profiles = pRes.data || [];
  } catch (error) {
    logDbError('loadReport.analytics', error);
    ['analyticsKpiCards','analyticsOverdueTasks','analyticsStaffWorkload','analyticsApprovalBottleneck','analyticsDepartmentProductivity','analyticsTaskStatus','analyticsDocumentStatus']
      .forEach(id => _setHtml(id, `<div class="empty">ໂຫຼດ Analytics ບໍ່ສຳເລັດ</div>`));
    return;
  }

  const today = new Date(); today.setHours(0,0,0,0);
  const doneTasks = tasks.filter(x=>x.status==='done');
  const activeTasks = tasks.filter(x=>x.status!=='done');
  const blockedTasks = tasks.filter(x=>x.status==='blocked');
  const inProgressTasks = tasks.filter(x=>x.status==='inprogress');
  const overdueTasks = activeTasks.filter(x => {
    const due = _analyticsDateOnly(x.due_date);
    return due && due < today;
  }).sort((a,b)=>new Date(a.due_date)-new Date(b.due_date));

  const pendingDocs = docs.filter(_isDocPending);
  const doneDocs = docs.filter(x=>_docStatus(x)==='done');
  const cancelledDocs = docs.filter(x=>_docStatus(x)==='cancelled');

  // Approval bottleneck: group pending documents by current workflow step
  const stepMap = {};
  pendingDocs.forEach(doc => {
    const steps = _docSteps(doc);
    const idx = Number(doc.current_step || 0);
    const step = steps[idx] || 'ບໍ່ລະບຸຂັ້ນຕອນ';
    if(!stepMap[step]) stepMap[step] = { count:0, docs:[] };
    stepMap[step].count++;
    stepMap[step].docs.push(doc);
  });
  const bottlenecks = Object.entries(stepMap).sort((a,b)=>b[1].count-a[1].count);

  // Staff workload and productivity
  const staffMap = {};
  profiles.forEach(p => { staffMap[p.email] = { email:p.email, name:p.full_name || _ownerLabel(p.email), role:p.role, total:0, active:0, done:0, overdue:0, blocked:0, urgent:0, progressSum:0 }; });
  tasks.forEach(t => {
    const email = t.owner || 'unassigned';
    if(!staffMap[email]) staffMap[email] = { email, name:_ownerLabel(email), role:'', total:0, active:0, done:0, overdue:0, blocked:0, urgent:0, progressSum:0 };
    const s = staffMap[email];
    s.total++;
    s.progressSum += Number(t.progress || 0);
    if(t.status==='done') s.done++; else s.active++;
    if(t.status==='blocked') s.blocked++;
    if(t.priority==='urgent') s.urgent++;
    if(overdueTasks.some(o=>o.id===t.id)) s.overdue++;
  });
  const staff = Object.values(staffMap).filter(s=>s.total>0).sort((a,b)=>b.active-a.active || b.overdue-a.overdue);
  const completionRate = tasks.length ? Math.round(doneTasks.length/tasks.length*100) : 0;
  const docDoneRate = docs.length ? Math.round(doneDocs.length/docs.length*100) : 0;
  const avgProgress = tasks.length ? Math.round(tasks.reduce((sum,t)=>sum+Number(t.progress||0),0)/tasks.length) : 0;

  _setHtml('analyticsKpiCards', `
    <div class="analytics-kpi"><div class="kpi-label">Overdue Tasks</div><div class="kpi-num" style="color:var(--c4)">${overdueTasks.length}</div><div class="kpi-note">ວຽກທີ່ເກີນ deadline</div></div>
    <div class="analytics-kpi"><div class="kpi-label">Productivity</div><div class="kpi-num" style="color:var(--c1)">${completionRate}%</div><div class="kpi-note">ອັດຕາວຽກສຳເລັດ</div></div>
    <div class="analytics-kpi"><div class="kpi-label">Approval Bottleneck</div><div class="kpi-num" style="color:var(--c3)">${pendingDocs.length}</div><div class="kpi-note">ເອກະສານຍັງຄ້າງ workflow</div></div>
    <div class="analytics-kpi"><div class="kpi-label">Staff Workload</div><div class="kpi-num" style="color:var(--c2)">${activeTasks.length}</div><div class="kpi-note">ວຽກ active ທັງໝົດ</div></div>
  `);

  _setHtml('analyticsOverdueTasks', overdueTasks.length ? overdueTasks.slice(0,8).map(t=>{
    const days = _daysBetween(today, _analyticsDateOnly(t.due_date));
    return `<div class="analytics-row">
      <div class="analytics-row-main"><div class="analytics-row-title">${h(t.name)}</div><div class="analytics-row-sub">${h(_ownerLabel(t.owner))} · Due ${h(t.due_date)} · ${h(t.status||'')}</div></div>
      <span class="analytics-badge danger">ຊ້າ ${days} ວັນ</span>
    </div>`;
  }).join('') : _analyticsEmpty('✅ ບໍ່ມີວຽກຊ້າ deadline'));

  const maxActive = Math.max(...staff.map(s=>s.active), 1);
  _setHtml('analyticsStaffWorkload', staff.length ? staff.slice(0,8).map(s=>{
    const pct = Math.round((s.active/maxActive)*100);
    return `<div class="analytics-row">
      <div class="analytics-row-main"><div class="analytics-row-title">${h(s.name)} <span style="font-size:11px;color:var(--muted);font-weight:600">${h(s.email)}</span></div>
      <div class="analytics-row-sub">Active ${s.active} · Done ${s.done} · Blocked ${s.blocked} · Urgent ${s.urgent}</div>
      <div class="analytics-progress"><span style="width:${pct}%"></span></div></div>
      <span class="analytics-badge ${s.overdue?'danger':'good'}">${s.overdue} overdue</span>
    </div>`;
  }).join('') : _analyticsEmpty('ບໍ່ມີວຽກທີ່ມີ owner'));

  _setHtml('analyticsApprovalBottleneck', bottlenecks.length ? bottlenecks.slice(0,8).map(([step, stat], i)=>{
    const firstDocs = stat.docs.slice(0,2).map(d=>h(d.name)).join(' · ');
    return `<div class="analytics-row">
      <div style="width:28px;font-size:16px">${i===0?'🔥':'⏳'}</div>
      <div class="analytics-row-main"><div class="analytics-row-title">${h(step)}</div><div class="analytics-row-sub">${firstDocs || '—'}</div></div>
      <span class="analytics-badge warn">${stat.count} docs</span>
    </div>`;
  }).join('') : _analyticsEmpty('✅ ບໍ່ມີ approval bottleneck'));

  const topProductive = [...staff].sort((a,b)=>b.done-a.done || b.total-a.total).slice(0,6);
  _setHtml('analyticsDepartmentProductivity', topProductive.length ? topProductive.map(s=>{
    const rate = s.total ? Math.round(s.done/s.total*100) : 0;
    return `<div class="analytics-row">
      <div class="analytics-row-main"><div class="analytics-row-title">${h(s.name)}</div><div class="analytics-row-sub">Completion ${rate}% · Avg progress ${s.total?Math.round(s.progressSum/s.total):0}%</div>
      <div class="analytics-progress"><span style="width:${rate}%;background:linear-gradient(90deg,var(--c1),#16a34a)"></span></div></div>
      <span class="analytics-badge good">${s.done}/${s.total}</span>
    </div>`;
  }).join('') : _analyticsEmpty('ບໍ່ມີຂໍ້ມູນ productivity'));

  const taskMax = Math.max(doneTasks.length, inProgressTasks.length, blockedTasks.length, overdueTasks.length, 1);
  _setHtml('analyticsTaskStatus', [
    _bar('Done', doneTasks.length, taskMax, 'linear-gradient(180deg,var(--c1),#16a34a)'),
    _bar('In progress', inProgressTasks.length, taskMax, 'linear-gradient(180deg,var(--c2),#2563eb)'),
    _bar('Blocked', blockedTasks.length, taskMax, 'linear-gradient(180deg,var(--c4),#dc2626)'),
    _bar('Overdue', overdueTasks.length, taskMax, 'linear-gradient(180deg,#f97316,#b45309)')
  ].join(''));

  const docMax = Math.max(doneDocs.length, pendingDocs.length, cancelledDocs.length, 1);
  _setHtml('analyticsDocumentStatus', [
    _bar('Done', doneDocs.length, docMax, 'linear-gradient(180deg,var(--c1),#16a34a)'),
    _bar('Pending', pendingDocs.length, docMax, 'linear-gradient(180deg,var(--c3),#d97706)'),
    _bar('Cancelled', cancelledDocs.length, docMax, 'linear-gradient(180deg,var(--c4),#dc2626)')
  ].join(''));
}
