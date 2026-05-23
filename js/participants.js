function normalizeParticipants(value, { notify=false } = {}) {
  let arr = [];
  if (Array.isArray(value)) arr = value;
  else if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      arr = Array.isArray(parsed) ? parsed : value.split(',');
    } catch (_) {
      arr = value.split(',');
    }
  }

  const emails = [];
  arr.forEach(v => {
    const mapped = normalizeUserRef(v, '');
    const email = String(mapped || '').trim().toLowerCase();
    if (email && email.includes('@')) emails.push(email);
  });

  // Do not show toast while rendering/loading old records. Only save actions should warn.
  if (notify && arr.length && emails.length === 0) {
    toastOnce('participants-invalid', '⚠️ ກະລຸນາເລືອກຜູ້ເຂົ້າຮ່ວມເປັນ email ຈາກລາຍຊື່', 'warning');
  }

  return [...new Set(emails)];
}

function selectedParticipantEmails(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return [];
  return [...sel.selectedOptions]
    .map(o => String(o.value || '').trim().toLowerCase())
    .filter(v => v.includes('@'));
}

async function populateParticipantSelect(selectId, selected = []) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const opts = await loadUserOptions();
  const selectedEmails = new Set(normalizeParticipants(selected));
  if (selectedEmails.size === 0 && selectId === 'mAtt' && myEmail()) {
    selectedEmails.add(myEmail());
  }
  sel.innerHTML = opts.map(o => `<option value="${h(o.email)}" ${selectedEmails.has(o.email) ? 'selected' : ''}>${h(o.label)}</option>`).join('');
  renderParticipantPicker(selectId);
}

function renderParticipantPicker(selectId) {
  const sel = document.getElementById(selectId);
  const picker = document.getElementById(selectId + 'Picker');
  const summary = document.getElementById(selectId + 'Summary');
  if (!sel || !picker) return;
  const options = [...sel.options];
  const selected = new Set(selectedParticipantEmails(selectId));
  picker.innerHTML = options.map(o => {
    const email = String(o.value || '').trim().toLowerCase();
    const label = o.textContent || email;
    const name = label.split('(')[0].trim() || email;
    const checked = selected.has(email);
    return `<button type="button" class="participant-chip ${checked ? 'selected' : ''}" onclick="toggleParticipant('${selectId}','${h(email)}')" title="${h(label)}">
      <span class="p-avatar">${h(participantInitial(email))}</span>
      <span class="p-main"><span class="p-name">${h(name)}</span><span class="p-email">${h(email)}</span></span>
      <span class="p-check">${checked ? '✓' : ''}</span>
    </button>`;
  }).join('');
  if (summary) {
    summary.textContent = selected.size
      ? `ເລືອກແລ້ວ ${selected.size} ຄົນ: ${[...selected].map(participantLabel).join(', ')}`
      : 'ເລືອກຜູ້ເຂົ້າຮ່ວມຢ່າງໜ້ອຍ 1 ຄົນ';
  }
}

function toggleParticipant(selectId, email) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const target = String(email || '').trim().toLowerCase();
  [...sel.options].forEach(o => {
    if (String(o.value || '').trim().toLowerCase() === target) o.selected = !o.selected;
  });
  renderParticipantPicker(selectId);
}

function participantLabel(email) {
  const e = String(email || '').trim().toLowerCase();
  const found = (cachedUserOptions || []).find(u => u.email === e);
  return found?.label || e || '—';
}

function participantInitial(email) {
  const label = participantLabel(email).split('(')[0].trim();
  const key = String(email || label || '?').trim();
  if (key.includes('@')) return key.split('@')[0].slice(0, 2).toUpperCase();
  return key.slice(0, 2).toUpperCase();
}


// ════ ADMIN ════
let allUsers = [];

