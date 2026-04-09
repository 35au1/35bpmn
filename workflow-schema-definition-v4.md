# Workflow Diagram Schema Definition

## Table 1: Elements Table

| Property Name | Data Type | Description | Example | Required |
|--------------|-----------|-------------|---------|----------|
| element_id | String | Unique identifier | "ELEM_001" | Yes |
| element_name | String | Display name | "Application Submission" | Yes |
| element_type | Enum | start, end, user_action_process, system_decision, system_action | "user_action_process" | Yes |
| lock_keyword | Enum | lock_noterasable / lock_noteditable | "lock_noterasable" | user_action_process only* |
| user_assigned | String | User responsible for this stage | "Applicant" | user_action_process only* |
| comment_text | String | Comment box text | "Requires ID verification" | No |
| text_below | String | Text displayed below element | "2-3 business days" | No |

*Required for element_type: user_action_process

## Table 2: Connections Table

| Property Name | Data Type | Description | Example | Required |
|--------------|-----------|-------------|---------|----------|
| connection_id | String | Unique identifier | "CONN_001" | Yes |
| source_element_id | String | Arrow origin element | "ELEM_001" | Yes |
| target_element_id | String | Arrow destination element | "ELEM_002" | Yes |
| condition | String | Condition label for decision paths | "Approved" | No |
| connection_type | Enum | normal / conditional | "conditional" | Yes |
| button | String | Button label triggering transition | "Submit Application" | No |
| validation | String | Validation rule before transition | "All fields must be filled" | No |
| trigger | Enum | button / time / await | "button" | Yes |

## Element Types

### 1. Start — workflow entry point. No lock_keyword or user_assigned.

### 2. End — absolute workflow termination. Not a form state. No lock_keyword or user_assigned. Must always be preceded by a `user_action_process` element — never connected directly from a decision or system element.

### 3. user_action_process
- Represents a **form state**: the form exists here while the assigned user acts within it.
- Stays in this state until the user triggers a transition (button/time/await) moving it to another user_action_process or to end.
- Requires lock_keyword + user_assigned.
- **In the main diagram:** any `system_decision` or `system_action` on the transition path between two user_action_process states belongs in the diagram — if it executes as part of moving the form from one state to another, it must appear as an element with connections.
- **Not in the main diagram:** actions entirely within a form state that lead to no other element — these are internal subprocesses and must not appear as elements or connections.
- A finalized/closed form is a `user_action_process` element with its own outbound connection to `end`, never modelled as `end` itself.

### 4. system_decision — diamond shape. System evaluates a condition and routes to multiple paths. No lock/user. Must have at least 2 outgoing conditional connections with different condition values.

### 5. system_action — parallelogram shape. System performs a single background action (auto-assign, auto-fill, add record). No lock/user. Action description goes in comment_text. Has exactly ONE outgoing connection.

## Connection Rules

1. Each row = one arrow from source → target
2. Multiple start and end elements are allowed
3. system_decision elements have at least 2 outgoing conditional connections with different condition values
4. user_action_process elements have one or more outgoing connections; system_action has exactly one outgoing connection
5. Triggers: `button` = user clicks (button text required) · `time` = automatic after delay · `await` = system/external event

## Validation Rules

### Elements
- element_id must be unique
- lock_keyword: lock_noterasable (cannot delete stage) / lock_noteditable (fully locked)
- element_type must be one of: start, end, user_action_process, system_decision, system_action
- user_action_process elements must have lock_keyword and user_assigned
- A closed/finalized form state must be `user_action_process`, not `end`

### Connections
- connection_id, source_element_id, target_element_id must be valid and unique
- Decision outgoing connections: connection_type conditional + condition value required
- Non-decision outgoing connections: connection_type normal
- trigger must be: time, button, or await; if button then button field required
- At least one connection from a start element; at least one connection to an end element
- Only transitions moving the form to another process state or to end — internal form actions that lead nowhere are not connections

### Workflow Integrity
- Every element except end has at least one outgoing connection
- Every element except start has at least one incoming connection
- Decision elements have at least 2 outgoing connections

---

## Demo Example: Invoice Approval Process

### Process Description
"Invoice User fills the form, selects approver, clicks 'Send to Approver'. System checks if approver is Senior Manager — if yes, automatically adds an additional Senior Manager approver. Invoice Approver reviews and clicks 'Approve Form'. The form moves to Closed Invoice state — itself a form state — which then ends the process."

### Elements Table

| element_id | element_name | element_type | lock_keyword | user_assigned | comment_text | text_below |
|------------|--------------|--------------|--------------|---------------|--------------|------------|
| START_INV | Invoice Process Start | start | | | | New invoice initiated |
| PROC_DRAFT | Invoice Draft | user_action_process | lock_noterasable | Invoice User | Fill form and select approver | |
| DEC_SM | Is approver Senior Manager? | system_decision | | | Checks approver role | |
| ACT_SM | Add Senior Manager approver | system_action | | | Adds additional approver at Senior Manager level | |
| PROC_REVIEW | Invoice Review | user_action_process | lock_noteditable | Invoice Approver | Review and approve invoice | |
| PROC_CLOSED | Closed Invoice | user_action_process | lock_noteditable | System | Archived closed invoice | |
| END_INV | End | end | | | | Invoice process complete |

### Connections Table

| connection_id | source_element_id | target_element_id | condition | connection_type | button | validation | trigger |
|---------------|-------------------|-------------------|-----------|-----------------|--------|------------|---------|
| CONN_INV_001 | START_INV | PROC_DRAFT | | normal | | | await |
| CONN_INV_002 | PROC_DRAFT | DEC_SM | | normal | Send to Approver | Approver must be selected | button |
| CONN_INV_003 | DEC_SM | ACT_SM | Senior Manager | conditional | | | await |
| CONN_INV_004 | DEC_SM | PROC_REVIEW | Not Senior Manager | conditional | | | await |
| CONN_INV_005 | ACT_SM | PROC_REVIEW | | normal | | | await |
| CONN_INV_006 | PROC_REVIEW | PROC_CLOSED | | normal | Approve Form | | button |
| CONN_INV_007 | PROC_CLOSED | END_INV | | normal | | | await |
