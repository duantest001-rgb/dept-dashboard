// Application bootstrap + production toast adapter

/* ===== UX REFACTOR V18: non-blocking toast instead of popup alert ===== */
(function(){
  function ensureToastStack(){
    let stack = document.querySelector('.toast-stack-v18');
    if(!stack){
      stack = document.createElement('div');
      stack.className = 'toast-stack-v18';
      document.body.appendChild(stack);
    }
    return stack;
  }
  window.showToast = window.showToast || function(message, type='info'){
    const stack = ensureToastStack();
    const el = document.createElement('div');
    el.className = 'toast-v18 ' + (type || 'info');
    el.textContent = String(message || 'ດຳເນີນການແລ້ວ');
    stack.appendChild(el);
    setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translateY(8px)'; }, 2600);
    setTimeout(()=>{ el.remove(); }, 3100);
  };
  const nativeAlert = window.alert;
  window.alert = function(message){
    const text = String(message || '');
    const lower = text.toLowerCase();
    const type = lower.includes('error') || lower.includes('ຜິດ') || lower.includes('email') ? 'error' : 'info';
    window.showToast(text, type);
  };
  window.__nativeAlert = nativeAlert;
})();

initApp();
