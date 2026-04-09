# Workflow Generation Prompt

Convert user's process description into two tables: Elements and Connections. Use semantic analysis to interpret what the user expects the flow to contain. Extend where required but always maintain the structure described.

## Table 1: Elements

| Column | Values | Required | Notes |
|--------|--------|----------|-------|
| element_id | Unique string | YES | E.g., START_001, PROC_001, DEC_001, ACT_001, END_001 |
| element_name | Any text | YES | Display name |
| element_type | start, end, user_action_process, system_decision, system_action | YES | Box type |
| lock_keyword | lock_noterasable, lock_noteditable | For user_action_process only | lock_noterasable = cannot delete; lock_noteditable = fully locked |
| user_assigned | Role/user name | For user_action_process only | Who performs this |
| comment_text | Any text | NO | System background actions for this stage (auto-fill, calculations, notifications, etc.) |
| text_below | Any text | NO | Optional label |

**Element types:**
- start: Workflow beginning. No lock/user.
- end: Workflow completion. After the e.g. closed form state. Terminal point — not a form state but after one
- user_action_process: ONLY when a human User actively performs an action on a form (fills, reviews, approves, submits). Requires lock_keyword + user_assigned. A finalized/closed form is itself a user_action_process with an outbound connection to end — never model it as end directly.
- system_decision: Diamond shape. System evaluates a condition and routes to ONE OF MULTIPLE paths. MUST have at least 2 outgoing conditional connections with different condition values. No lock/user.
- system_action: Parallelogram shape. System performs a single background action (auto-assign, auto-fill, send notification, add record). Has exactly ONE outgoing connection with connection_type: normal. Action description goes in comment_text. No lock/user.

## Table 2: Connections

Each row = one arrow between elements.

| Column | Values | Required | Notes |
|--------|--------|----------|-------|
| connection_id | Unique string | YES | E.g., CONN_001 |
| source_element_id | element_id | YES | Arrow starts here |
| target_element_id | element_id | YES | Arrow points here |
| condition | Text | For system_decision paths | E.g., "Tak", "Approved", "Senior Manager" |
| connection_type | normal, conditional | YES | "conditional" for system_decision outgoing paths |
| button | Text | NO | Button label triggering transition |
| validation | Text | NO | Validation rule checked before transition |
| trigger | time, button, await | YES | How transition happens |

**Triggers:**
- button: User clicks a button (button text required)
- time: Automatic after time period
- await: System/external trigger, no user action

## Rules

- user_action_process elements need lock_keyword + user_assigned
- start / end / system_decision / system_action elements do NOT need lock_keyword or user_assigned
- All IDs must be unique
- system_decision: MINIMUM 2 outgoing connections, all conditional, each with a different condition value
- system_action: exactly 1 outgoing connection, connection_type: normal
- **element_type must be exactly one of: start, end, user_action_process, system_decision, system_action. No other values exist.**
- **Returning to an existing stage is NEVER a new element — draw a direct arrow back to the existing element.**
- **Last action like closing form is User_action_process because reflects the last state of form; is followed by end marker**
- system_decision and system_action elements that sit on the transition path between two user_action_process stages belong in the main diagram — they are not internal to a stage.
- **system_decision is system action, not User action. User performs its decision by clicking buttons, does not require decision box**
- A closed/finalized form is a user_action_process (a form state), not an end — it has its own outbound connection to a blank end element that marks only the termination of the workflow.
- Actions that happen entirely within one form state and do not lead to any other element are internal subprocesses — they must not appear as elements or connections in the diagram.

## Ignore

Ignore form fields, notifications, data structures, UI details, integrations. Focus only on: stages, users, connections, transitions.

## Format example only

**Input:** "Operator fills invoice form, selects approver, clicks 'Send for approval' (validates approver selected). System checks if approver is Senior Ma(...)"

**Elements:**

```elements.csv
element_id,element_name,element_type,lock_keyword,user_assigned,comment_text,text_below
START_001,Start,start,,,,
PROC_001,Wprowadzenie danych faktury,user_action_process,lock_noterasable,Operator,,
```

**Connections:**

```connections.csv
connection_id,source_element_id,target_element_id,condition,connection_type,button,validation,trigger
CONN_001,START_001,PROC_001,,normal,,,await
CONN_002,PROC_001,DEC_001,,normal,Wyślij do akceptacji,Approver wskazany,button
```

## OUTPUT FORMAT — MANDATORY

Respond with exactly two sections:

**1. Markdown tables for review** — print both tables in readable markdown format.

**2. Downloadable CSV files** — output as two raw CSV code blocks labeled `elements.csv` and `connections.csv`:

```elements.csv
element_id,element_name,element_type,lock_keyword,user_assigned,comment_text,text_below
...
```

```connections.csv
connection_id,source_element_id,target_element_id,condition,connection_type,button,validation,trigger
...
```

Values containing commas must be wrapped in double quotes.
