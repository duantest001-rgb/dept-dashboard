
// ════════════════════════════════════════════
//  ⚙️  CONFIG — ແກ້ຄ່ານີ້ກ່ອນ Deploy
// ════════════════════════════════════════════
const SUPABASE_URL  = 'https://uyvmrqblpttvxvbyvyfa.supabase.co';   // ← ໃສ່ URL ຂອງເຈົ້ານີ້
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5dm1ycWJscHR0dnh2Ynl2eWZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1NDkyNDYsImV4cCI6MjA5NDEyNTI0Nn0.Y4XmNdJt4LiiewbPtKJlsYjt7oCTEqZBNA9X5qrukms';                      // ← ໃສ່ anon/public key ຂອງເຈົ້ານີ້
// ════════════════════════════════════════════

const { createClient } = supabase;
let db;

// ── SAFE HELPERS ─────────────────────────────────
const $ = (id) => document.getElementById(id);
