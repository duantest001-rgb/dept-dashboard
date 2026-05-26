// ==========================================
// GLOBAL REALTIME + AUTO REFRESH
// file: js/realtime.js
// Purpose: auto-refresh UI when Supabase tables change
// ==========================================

let __refreshTimer = null;
let __realtimeStarted = false;
let __autoRefreshStarted = false;
let __realtimeChannels = [];

const TABLE_REFRESH_MAP = {
  tasks: ['loadTasks', 'loadDash', 'loadReport', 'refreshNotifications'],
  documents: ['loadDocs', 'loadDash', 'loadReport', 'refreshNotifications'],
  meetings: ['loadMeet', 'loadDash', 'refreshNotifications'],
  leaves: ['loadLeave', 'loadDash', 'loadReport', 'refreshNotifications'],
  leave_balance: ['loadLeave', 'loadProfileDashboard'],
  profiles: ['loadUserOptions', 'loadAdmin', 'loadDash', 'loadProfileDashboard'],
  announcements: ['loadDash', 'refreshNotifications'],
  activity_log: ['loadLog']
};

function safeCallFunction(fnName) {
  const fn = window[fnName];

  if (typeof fn !== 'function') {
    return Promise.resolve(null);
  }

  // refreshNotifications accepts options; silent avoids noisy UI refresh
  if (fnName === 'refreshNotifications') {
    return fn({ silent: true });
  }

  // loadUserOptions can accept forceRefresh=true
  if (fnName === 'loadUserOptions') {
    return fn(true);
  }

  return fn();
}

function uniqueFunctions(fnNames) {
  return [...new Set((fnNames || []).filter(Boolean))];
}

function refreshFunctions(fnNames, delay = 300) {
  const fns = uniqueFunctions(fnNames);

  clearTimeout(__refreshTimer);

  __refreshTimer = setTimeout(async () => {
    for (const fnName of fns) {
      try {
        await safeCallFunction(fnName);
      } catch (err) {
        console.error('[Realtime] Refresh failed:', fnName, err);
      }
    }
  }, delay);
}

function refreshByTable(tableName) {
  refreshFunctions(TABLE_REFRESH_MAP[tableName] || []);
}

function refreshCurrentPage() {
  const activePage = document.querySelector('.page.active, .tab-page.active, [data-page].active');
  const id = activePage?.id || '';

  if (id.includes('dash')) return refreshFunctions(['loadDash', 'refreshNotifications']);
  if (id.includes('task')) return refreshFunctions(['loadTasks', 'loadDash', 'refreshNotifications']);
  if (id.includes('doc')) return refreshFunctions(['loadDocs', 'loadDash', 'refreshNotifications']);
  if (id.includes('meet')) return refreshFunctions(['loadMeet', 'loadDash', 'refreshNotifications']);
  if (id.includes('leave')) return refreshFunctions(['loadLeave', 'loadDash', 'loadReport']);
  if (id.includes('report')) return refreshFunctions(['loadReport']);
  if (id.includes('log')) return refreshFunctions(['loadLog']);
  if (id.includes('admin')) return refreshFunctions(['loadAdmin', 'loadUserOptions']);
  if (id.includes('profile')) return refreshFunctions(['loadProfileDashboard']);

  // fallback when active page class/id is not available
  refreshFunctions(['loadDash', 'refreshNotifications']);
}

function startRealtimeSync() {
  if (__realtimeStarted) return;
  if (typeof db === 'undefined' || !db || typeof db.channel !== 'function') {
    console.warn('[Realtime] Supabase client is not ready');
    return;
  }

  __realtimeStarted = true;

  Object.keys(TABLE_REFRESH_MAP).forEach(tableName => {
    const channel = db.channel(`rt-${tableName}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: tableName
        },
        payload => {
          console.log('[Realtime] Changed:', tableName, payload?.eventType || 'change');
          refreshByTable(tableName);
        }
      )
      .subscribe(status => {
        if (status === 'SUBSCRIBED') {
          console.log('[Realtime] Subscribed:', tableName);
        }
      });

    __realtimeChannels.push(channel);
  });

  console.log('[Realtime] Sync started');
}

function stopRealtimeSync() {
  if (typeof db !== 'undefined' && db && typeof db.removeChannel === 'function') {
    __realtimeChannels.forEach(ch => db.removeChannel(ch));
  }

  __realtimeChannels = [];
  __realtimeStarted = false;
}

function startAutoRefreshFallback() {
  if (__autoRefreshStarted) return;

  __autoRefreshStarted = true;

  setInterval(() => {
    if (document.hidden) return;
    refreshCurrentPage();
  }, 30000);

  // When user returns to the tab, refresh visible data once
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshCurrentPage();
  });

  console.log('[Realtime] Auto refresh fallback started');
}

// Expose for other files
window.startRealtimeSync = startRealtimeSync;
window.stopRealtimeSync = stopRealtimeSync;
window.startAutoRefreshFallback = startAutoRefreshFallback;
window.refreshByTable = refreshByTable;
window.refreshCurrentPage = refreshCurrentPage;
