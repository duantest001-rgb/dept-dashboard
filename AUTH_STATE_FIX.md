# Auth State Fix

Fixes inconsistent state where sidebar/main app is visible but login card remains on screen.

Changed `js/auth.js`:
- `doLogin()` now calls `showApp()` immediately after successful sign-in.
- Auth state listener only skips duplicate boot when login page is already hidden.

Commit message:
`fix: force dashboard view after successful login`
