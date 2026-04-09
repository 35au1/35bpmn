# Workflow Diagram Schema Definition — v2 (Subprocess-Aware)

## Core Concept: Form States and Subprocesses

A `user_action_process` element represents a **form state** — a stage in which the form exists in a specific state and a human User can perform a set of actions within it. The form remains in this state until the User triggers a transition that moves it to another form state.

**Subprocesses** are actions that take place *within* a form state. They do not move the form to another state. Examples: filling fields, selecting values, uploading attachments, running internal lookups, saving a draft. These are defined in Table 3 and are never represented as elements in the main diagram.

**Only transitions that move the form to another `user_action_process` or to an `end` element belong in the main diagram (Tables 1 and 2).**

### Closed Form State Rule

A finalized or closed form is itself a form state (`user_action_process`), not just an `end` node. It must be modelled as a `user_action_process` element with:
- Its own `element_id`, `element_name`, `lock_keyword`, `user_assigned`
- An outbound connection to an `end` element (trigger: await)
- Optionally its own subprocesses (e.g. archiving, document generation)

The `end` element only marks the absolute termination of the workflow process — it is not a form state.

---

## Table 1: Elements Table

| Property Name | Data Type | Description | Example | Required |
|--------------|-----------|-------------|---------|----------|
| element_id | String | Unique identifier | "PROC_001" | Yes |
| element_name | String | Display name | "Invoice Draft" | Yes |
| element_type | Enum | start, end, user_action_process, system_decision, system_action | "user_action_process" | Yes |
| lock_keyword | Enum | lock_noterasable, lock_noteditable | "lock_noterasable" | For user_action_process only |
| user_assigned | String | User role responsible for this state | "Invoice User" | For user_action_process only |
| comment_text | String | Background description of the stage | "User fills invoice data" | No |
| text_below | String | Optional label below element | "2-3 business days" | No |

**Element types:**
- `start`: Workflow entry point. No lock/user.
- `end`: Absolute workflow termination. No lock/user. Not a form state.
- `user_action_process`: A form state. Human User performs actions here. Requires lock_keyword + user_assigned.
- `system_decision`: System evaluates a condition and routes to multiple paths. No lock/user.
- `system_action`: System performs a single background action. No lock/user.

---

## Table 2: Connections Table

| Property Name | Data Type | Description | Example | Required |
|--------------|-----------|-------------|---------|----------|
| connection_id | String | Unique identifier | "CONN_001" | Yes |
| source_element_id | String | Arrow origin | "PROC_001" | Yes |
| target_element_id | String | Arrow destination | "PROC_002" | Yes |
| condition | String | Condition label for system_decision paths | "Approved" | No |
| connection_type | Enum | normal, conditional | "conditional" | Yes |
| button | String | Button label triggering this transition | "Send to Approver" | No |
| validation | String | Validation rule checked before transition | "Approver must be selected" | No |
| trigger | Enum | button, time, await | "button" | Yes |

**Trigger types:**
- `button`: User clicks a button to trigger the transition. `button` field required.
- `time`: Transition fires automatically after a time period.
- `await`: Transition triggered by system or external event. No user action.

**Only connections that move the form between states (user_action_process → user_action_process, or user_action_process → end) belong here.**

---

## Table 3: Subprocesses Table

Defines the chain of actions a user can perform **within** a form state before triggering a transition. These actions do not move the form to another state.

| Property Name | Data Type | Description | Example | Required |
|--------------|-----------|-------------|---------|----------|
| subprocess_id | String | Unique identifier | "SUB_001" | Yes |
| element_id | String | The user_action_process this subprocess belongs to | "PROC_001" | Yes |
| sequence | Integer | Order of this action within the form state (1, 2, 3…) | 1 | Yes |
| action_name | String | Short name of the action | "Select approver" | Yes |
| action_description | String | Full description of what the user does | "User selects an approver from the dropdown field" | Yes |
| action_type | Enum | fill, select, upload, lookup, calculate, view, other | "select" | Yes |
| required | Boolean | Whether this action must be completed before transition | true | No |
| depends_on | String | subprocess_id this action depends on (optional chain) | "SUB_001" | No |

**Action types:**
- `fill`: User types data into a field
- `select`: User selects a value from a list or dropdown
- `upload`: User attaches a file or document
- `lookup`: System fetches data based on user input (e.g. auto-fill from external source)
- `calculate`: System computes a value based on form data
- `view`: User reads or reviews data (no input)
- `other`: Any other internal action

---

## Validation Rules

### Elements Table
- `element_id` must be unique
- `element_type` must be one of: start, end, user_action_process, system_decision, system_action
- `user_action_process` elements must have `lock_keyword` and `user_assigned`
- A closed/finalized form state must be `user_action_process`, not `end`
- `end` elements must have at least one incoming connection from a `user_action_process`

### Connections Table
- Only transitions between form states or to `end` belong here
- Internal form actions (subprocesses) must NOT appear as connections
- `trigger: button` requires a non-empty `button` field
- `system_decision` outgoing connections must be `conditional` with a `condition` value
- `system_action` has exactly one outgoing connection

### Subprocesses Table
- `element_id` must reference a valid `user_action_process` in the Elements table
- `sequence` values within the same `element_id` must be unique and ordered
- `depends_on` must reference a valid `subprocess_id` within the same `element_id`

---

## Demo Example: Invoice Approval Process (v2)

### Process Description
"Invoice User fills the invoice form, selects an approver, and sends it for approval. The approver reviews and either approves or rejects. If approved, the form moves to a Closed state. The closed form is archived and the process ends."

### Elements Table

| element_id | element_name | element_type | lock_keyword | user_assigned | comment_text | text_below |
|------------|--------------|--------------|--------------|---------------|--------------|------------|
| START_INV | Start | start | | | | |
| PROC_DRAFT | Invoice Draft | user_action_process | lock_noterasable | Invoice User | User fills and submits invoice | |
| DEC_001 | Is approver Senior Manager? | system_decision | | | Checks approver role | |
| ACT_001 | Add Senior Manager approver | system_action | | | Adds additional approver | |
| PROC_REVIEW | Invoice Review | user_action_process | lock_noteditable | Approver | Approver reviews and decides | |
| PROC_CLOSED | Closed Invoice | user_action_process | lock_noteditable | System | Archived closed invoice | |
| END_001 | End | end | | | | |

### Connections Table

| connection_id | source_element_id | target_element_id | condition | connection_type | button | validation | trigger |
|---------------|-------------------|-------------------|-----------|-----------------|--------|------------|---------|
| CONN_001 | START_INV | PROC_DRAFT | | normal | | | await |
| CONN_002 | PROC_DRAFT | DEC_001 | | normal | Send to Approver | Approver must be selected | button |
| CONN_003 | DEC_001 | ACT_001 | Senior Manager | conditional | | | await |
| CONN_004 | DEC_001 | PROC_REVIEW | Not Senior Manager | conditional | | | await |
| CONN_005 | ACT_001 | PROC_REVIEW | | normal | | | await |
| CONN_006 | PROC_REVIEW | PROC_DRAFT | Reject | conditional | Reject | | button |
| CONN_007 | PROC_REVIEW | PROC_CLOSED | Approve | conditional | Approve | | button |
| CONN_008 | PROC_CLOSED | END_001 | | normal | | | await |

### Subprocesses Table

| subprocess_id | element_id | sequence | action_name | action_description | action_type | required | depends_on |
|---------------|------------|----------|-------------|-------------------|-------------|----------|------------|
| SUB_001 | PROC_DRAFT | 1 | Fill invoice data | User enters invoice number, date, amount, and description into the form fields | fill | true | |
| SUB_002 | PROC_DRAFT | 2 | Select cost centre | User selects the cost centre from a dropdown list | select | true | SUB_001 |
| SUB_003 | PROC_DRAFT | 3 | Select approver | User selects the approving person from the approver field | select | true | SUB_001 |
| SUB_004 | PROC_DRAFT | 4 | Upload attachment | User optionally attaches supporting documents | upload | false | SUB_001 |
| SUB_005 | PROC_REVIEW | 1 | Review invoice data | Approver reads all fields of the submitted invoice form | view | true | |
| SUB_006 | PROC_REVIEW | 2 | Add review comment | Approver optionally adds a comment explaining the decision | fill | false | SUB_005 |
| SUB_007 | PROC_CLOSED | 1 | Archive invoice | System archives the approved invoice record | calculate | true | |
| SUB_008 | PROC_CLOSED | 2 | Generate confirmation | System generates a PDF confirmation of the closed invoice | calculate | false | SUB_007 |
