# Meeting Create Fix

Changes:
- index.html: removed data-manager-only from the New Meeting button.
- js/meetings.js: saveMeet() now allows any logged-in user to create a meeting.
- js/meetings.js: insert payload now includes created_by when supported.

Commit message suggestion:
fix: allow all users to create own meetings
