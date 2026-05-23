# README — Dept Dashboard System

## Project Overview
Dept Dashboard ແມ່ນລະບົບ Internal Workflow Platform ສຳລັບພະແນກພັດທະນາທຸລະກິດ ແລະ ອົງກອນທີ່ຕ້ອງການຈັດການວຽກ, ເອກະສານ, ນັດໝາຍ, ການຂໍລາ, Activity Timeline ແລະ Workflow Approval.

## Current Status
- Version: v25 planning / refactor stage
- Backend: Supabase
- Frontend: HTML, CSS, JavaScript
- Hosting: GitHub Pages
- Database: PostgreSQL on Supabase

## Main Features

### 1. Authentication and Roles
- Login / Logout
- Supabase Auth
- Profile sync with auth.users
- Role-based access:
  - admin
  - manager
  - employee
  - viewer

### 2. Security
- Row Level Security enabled
- Role-based policies
- Email-based owner standardization
- Auth users linked with profiles

### 3. Tasks
- Create tasks
- Assign owner
- Track status
- Track progress
- Due date
- Overdue detection
- Comments
- Activity logging

Task statuses:
- pending
- inprogress
- done
- cancelled

### 4. Documents
- Document tracking
- Step workflow
- Forward / route documents
- Approval flow
- Signature log
- Workflow history
- Status separation between inprogress and done

Document statuses:
- inprogress
- done
- cancelled

### 5. Meetings
- Create meetings
- Multiple participants
- Participants saved as email array
- Meeting reminders
- Meeting activity log

### 6. Leave Management
- Leave requests
- Leave approval
- Leave history
- Leave balance
- Remaining leave calculated from:
  total_days - used_days

### 7. My Profile Dashboard
- User profile summary
- My tasks
- My documents
- My meetings
- Leave summary
- Activity timeline

### 8. Activity Timeline
- Tracks task updates
- Tracks document workflow
- Tracks meeting changes
- Tracks leave actions
- Uses user_email and user_id

### 9. Notification System
- Toast notifications
- Unread badge
- Overdue alerts
- Meeting reminders
- Pending document reminders
- Mark as read

### 10. Analytics Dashboard
- Overdue tasks
- Staff workload
- Department productivity
- Approval bottleneck
- KPI cards
- Charts

### 11. Multi Department Support
Planned / prototype support:
- department_id
- branch support
- organization structure
- department switcher
- scoped filtering

## Suggested Project Structure

```text
index.html

css/
  style.css

js/
  config.js
  core.js
  auth.js
  ui.js
  dashboard.js
  tasks.js
  documents.js
  meetings.js
  leave.js
  profile.js
  activity.js
  reports.js
  admin.js
  main.js
```

## Main Database Tables

### profiles
```text
id
email
full_name
role
department_id
branch_id
created_at
```

### tasks
```text
id
title
description
owner
status
progress
due_date
created_at
updated_at
```

### documents
```text
id
title
created_by
status
steps
step_comments
created_at
updated_at
```

### meetings
```text
id
title
description
meeting_date
meeting_time
participants
status
created_by
created_at
updated_at
```

### leaves
```text
id
owner
date_from
date_to
days_count
status
reason
created_at
updated_at
```

### leave_balance
```text
id
owner
total_days
used_days
year
created_at
updated_at
```

### activity_log
```text
id
user_id
user_email
action
target_type
target_id
target_name
detail
created_at
```

## UI/UX Direction
Current direction:
- Modern enterprise workspace
- Red and white theme
- Fixed sidebar for desktop
- Sticky header
- Modern cards
- Better typography
- Responsive layout
- Single main scroll
- Internal scroll only for long activity/table sections

## Deployment
Recommended deployment:
1. Upload files to GitHub repository.
2. Use GitHub Pages.
3. Keep Supabase URL and anon key in `js/config.js`.
4. Make sure RLS policies are enabled and tested.

## Current Limitations
Still needs future improvement:
- Real file storage
- PDF/image preview
- Digital signature verification
- Telegram or email notifications
- n8n automation
- Executive dashboard
- Full SaaS tenant separation

## Recommended Next Steps
1. Restore from the latest stable working version, not placeholder scaffold.
2. Continue modular refactor from real codebase.
3. Improve UI layout without losing logic.
4. Add file storage and document attachments.
5. Add automation via n8n / Telegram / Email.
6. Prepare executive dashboard and multi-department rollout.

## Long-Term Vision
This system can grow from a single department tool into:
- Organization-wide workflow platform
- LaoDocFlow prototype
- Internal document approval system
- SaaS workflow product for Lao organizations
