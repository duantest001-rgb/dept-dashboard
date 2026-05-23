# Department Dashboard Refactor v21

This version separates the previous single `js/app.js` file into feature modules.

## Structure

```text
index.html
css/
  style.css
js/
  config.js
  core.js
  activity.js
  comments.js
  ui.js
  participants.js
  admin.js
  auth.js
  profile.js
  dashboard.js
  tasks.js
  documents.js
  meetings.js
  leave.js
  reports.js
  main.js
```

## Important

- Keep all files/folders at the repository root.
- `index.html` loads modules in order using normal script tags.
- `main.js` runs `initApp()` last.
- Supabase config remains in `js/config.js`.

## Next recommended split

If the app grows further, split `core.js` into `permissions.js`, `helpers.js`, and `state.js`.
