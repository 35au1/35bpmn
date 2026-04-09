# Workflow Generation Prompt

Convert user's process description into two tables: Elements and Connections. Enable semantic analysis what User expects from flow to contain and interpret it. Extend if required by maintain the structure described (a must)

## Table 1: Elements

| Column | Values | Required | Notes |
|--------|--------|----------|-------|
| element_id | Unique string | YES | E.g., START_001, PROC_001, DEC_001, END_001 |
| element_name | Any text | YES | Display name |
| element_type | start, end, user_action_process, system_decision, system_action | YES | Box type |
| lock_keyword | lock_noterasable, lock_noteditable | For user_action_process only | lock_noterasable = cannot delete; lock_noteditable = fully locked |
| user_assigned | Role/user name | For user_action_process only | Who performs this |
| comment_text | Any text | NO | System background actions for this stage (auto-fill, calculations, notifications, etc.) |
| text_below | Any text | NO | Optional label |

**Element types:**
- start: Workflow beginning (no lock/user)
- end: Workflow completion (no lock/user)
- user_action_process: ONLY when a human User actively performs an action on a form (fills, reviews, approves, submits). Requires lock_keyword + user_assigned. Routing ("return to", "send back") is NEVER a new box - use a direct arrow instead.
- system_decision: Diamond shape. System evaluates a condition and routes to ONE OF MULTIPLE different paths. MUST have at least 2 outgoing conditional connections with different condition values. No lock/user. Use when the flow splits based on system-evaluated data (e.g. "is approver a senior manager?", "is amount above threshold?").
- system_action: Parallelogram shape. System performs a single background action (auto-assign, auto-fill, send notification, add record). Has exactly ONE outgoing connection. No lock/user. The action description goes in comment_text. Use when system does something on only one path before continuing.

## Table 2: Connections

Each row = one arrow between elements.

| Column | Values | Required | Notes |
|--------|--------|----------|-------|
| connection_id | Unique string | YES | E.g., CONN_001 |
| source_element_id | element_id | YES | Arrow starts here |
| target_element_id | element_id | YES | Arrow points here |
| condition | Text | For process_selection_by_system paths | E.g., "Yes", "Approved", "Senior Manager" |
| connection_type | normal, conditional | YES | "conditional" for process_selection_by_system paths |
| button | Text | NO | Button label |
| validation | Text | NO | Validation rule |
| trigger | time, button, await | YES | How transition happens |

**Triggers:**
- button: User clicks button
- time: Automatic after time
- await: System/external trigger

## Example

**Input:** "Invoice User creates draft, selects approver, clicks 'Send to Approver' (validates approver selected). Invoice Approver reviews, clicks 'Approve', process ends."

**Elements:**

```
element_id,element_name,element_type,lock_keyword,user_assigned,comment_text,text_below
START_INV,Start,start,,,,
PROC_DRAFT,Invoice Draft,user_action_process,lock_noterasable,Invoice User,,
PROC_REVIEW,Review,user_action_process,lock_noteditable,Invoice Approver,,
END_CLOSED,Closed,end,,,,
```

**Connections:**

```
connection_id,source_element_id,target_element_id,condition,connection_type,button,validation,trigger
CONN_001,START_INV,PROC_DRAFT,,normal,,,await
CONN_002,PROC_DRAFT,PROC_REVIEW,,normal,Send to Approver,Approver selected,button
CONN_003,PROC_REVIEW,END_CLOSED,,normal,Approve,,button
```

## Rules

- user_action_process elements need lock_keyword + user_assigned
- start/end/system_decision/system_action elements don't need lock_keyword or user_assigned
- All IDs must be unique
- system_decision connections need condition + connection_type: conditional, MINIMUM 2 outgoing
- system_action has exactly 1 outgoing connection, connection_type: normal
- **element_type must be exactly one of: start, end, user_action_process, system_decision, system_action. No other values exist.**
- **A "return", "send back", "go back" step is NEVER a new box - draw a direct arrow back to the existing element instead.**

## Ignore

Ignore form fields, notifications, data structures, UI details, integrations. Focus only on: stages, users, connections, transitions.

## OUTPUT FORMAT — MANDATORY

Respond with exactly two sections:

**1. Markdown tables for review** — print both tables in readable markdown format.

**2. Downloadable CSV files** — provide as file attachments if the interface supports it. Otherwise output as two raw CSV code blocks labeled `elements.csv` and `connections.csv` with no extra text outside them:

```elements.csv
element_id,element_name,element_type,lock_keyword,user_assigned,comment_text,text_below
START_001,Start,start,,,,
PROC_001,Submit Form,user_action_process,lock_noterasable,Applicant,,
END_001,Done,end,,,,
```

```connections.csv
connection_id,source_element_id,target_element_id,condition,connection_type,button,validation,trigger
CONN_001,START_001,PROC_001,,normal,,,await
CONN_002,PROC_001,END_001,,normal,Submit,,button
```

Values containing commas must be wrapped in double quotes.
