# Department Dashboard v23 — Workflow Automation

Adds document workflow automation on top of v22:

- Approval flow: approving a document step records a signature entry.
- Routing / forwarding: assign the current document step to another user.
- Signature log: records who signed/approved which step and when.
- Workflow history: stores forwarding events in `documents.step_comments._workflow`.

## Database requirement
No new table is required. Workflow metadata is stored in the existing `documents.step_comments` JSONB column.

## Upload to GitHub
Upload all files/folders to repo root:

- `index.html`
- `css/`
- `js/`
- `README.md`

