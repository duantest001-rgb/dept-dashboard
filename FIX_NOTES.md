# Dept Dashboard Fix Notes

Patched files:
- js/config.js: prevents white screen if Supabase CDN does not load.
- js/auth.js: shows config warning instead of crashing when Supabase client is unavailable.
- js/ui.js: guards missing page IDs and missing toast element.
- supabase_minimal_schema_and_rls.sql: schema/RLS compatibility baseline for the current JavaScript code.

Important:
- js/app.js is a legacy monolithic file and is not loaded by index.html. Do not add it to index.html unless you remove the modular files first.
- The JavaScript expects columns like tasks.name, documents.doc_status, meetings.meet_date/meet_status, leaves.leave_type/half_day/days_count.
- If your Supabase tables were created from README names like title/status/meeting_date, the app will fail until the schema is aligned.
