# Workflow Diagram Schema Definition

## Table 1: Elements Table

This table defines all workflow elements (start, end, user_action_process, system_decision, system_action).

| Property Name | Data Type | Description | Example | Required |
|--------------|-----------|-------------|---------|----------|
| element_id | String | Unique identifier for the element | "ELEM_001" | Yes |
| element_name | String | Display name of the element | "Application Submission" | Yes |
| element_type | Enum | Type of element: start, end, user_action_process, system_decision, system_action | "user_action_process" | Yes |
| lock_keyword | Enum | Stage lock state: lock_noterasable, lock_noteditable | "lock_noterasable" | Conditional* |
| user_assigned | String | User responsible for this stage | "Applicant" | Conditional* |
| comment_text | String | Comment box text associated with element | "Requires ID verification" | No |
| text_below | String | Text displayed below the element | "2-3 business days" | No |

**Conditional Requirements:**
- `*` Required for element_type: user_action_process

## Table 2: Connections Table

This table defines all connections between elements. Each row represents one arrow/connection.

| Property Name | Data Type | Description | Example | Required |
|--------------|-----------|-------------|---------|----------|
| connection_id | String | Unique identifier for the connection | "CONN_001" | Yes |
| source_element_id | String | Element ID where connection originates | "ELEM_001" | Yes |
| target_element_id | String | Element ID where connection points to | "ELEM_002" | Yes |
| condition | String | Condition label (for system_decision boxes) | "Approved" | No |
| connection_type | Enum | Type: normal, conditional | "conditional" | Yes |
| button | String | Button text/label for triggering transition | "Submit Application" | No |
| validation | String | Validation rule or requirement | "All fields must be filled" | No |
| trigger | Enum | Trigger type: time, button, await | "button" | Yes |

## Element Types

### 1. Start Element
- Marks the beginning of a workflow
- No lock_keyword or user_assigned required

### 2. End Element
- Marks the completion of a workflow
- No lock_keyword or user_assigned required
- Terminal point in the flow

### 3. user_action_process Element
- Represents a workflow stage/state where a human User actively performs an action
- Requires lock_keyword and user_assigned

### 4. system_decision Element
- Represents a branching point in workflow evaluated by the system
- Connections from system_decision elements should have condition values
- Must have at least 2 outgoing conditional connections

### 5. system_action Element
- Represents a single automated background action performed by the system
- Has exactly ONE outgoing connection
- Action description goes in comment_text
- No lock_keyword or user_assigned required

## Example Data - Elements Table

| element_id | element_name | element_type | lock_keyword | user_assigned | comment_text | text_below |
|------------|--------------|--------------|--------------|---------------|--------------|------------|
| START_001 | Application Start | start | | | | Begin application process |
| PROC_001 | Document Submission | user_action_process | lock_noterasable | Applicant | Upload all required documents | Required: ID, proof of address |
| DEC_001 | Documents Complete? | system_decision | | | | Automated validation |
| PROC_002 | Document Review | user_action_process | lock_noteditable | Reviewer | Manual review required | Review within 24 hours |
| ACT_001 | Notify Reviewer | system_action | | | Sends notification to assigned reviewer | |
| DEC_002 | Approval Decision | system_decision | | | | Final decision point |
| END_001 | Application Approved | end | | | | Process complete - approved |
| END_002 | Application Rejected | end | | | | Process complete - rejected |

## Example Data - Connections Table

| connection_id | source_element_id | target_element_id | condition | connection_type | button | validation | trigger |
|---------------|-------------------|-------------------|-----------|-----------------|--------|------------|---------|
| CONN_001 | START_001 | PROC_001 | | normal | | | await |
| CONN_002 | PROC_001 | DEC_001 | | normal | Submit Documents | All required fields completed | button |
| CONN_003 | DEC_001 | PROC_002 | Complete | conditional | | | await |
| CONN_004 | DEC_001 | PROC_001 | Incomplete | conditional | | | await |
| CONN_005 | PROC_002 | ACT_001 | | normal | Complete Review | Review notes required | button |
| CONN_006 | ACT_001 | DEC_002 | | normal | | | await |
| CONN_007 | DEC_002 | END_001 | Approved | conditional | | | await |
| CONN_008 | DEC_002 | END_002 | Rejected | conditional | | | await |

## Connection Rules

1. **Arrows**: Each row in Connections table represents one arrow in the diagram
2. **Flow Direction**: Always from source_element_id → target_element_id
3. **Multiple Starts**: Multiple start elements can exist in Elements table
4. **Multiple Ends**: Multiple end elements can exist in Elements table
5. **Decision Branching**: system_decision elements have multiple connections with different conditions
6. **Process Flow**: user_action_process elements typically have one or more outgoing connections; system_action has exactly one outgoing connection
7. **Trigger Types**:
   - `button`: Transition triggered by user clicking a button (button text required)
   - `time`: Transition triggered automatically after time period
   - `await`: Transition triggered by system/external event (no user action)

## Validation Rules

### Elements Table
- Each `element_id` must be unique
- `lock_keyword` must be one of: lock_noterasable, lock_noteditable per user_action_process element
- lock_noterasable: stage cannot be deleted
- lock_noteditable: stage is fully locked from editing
- `element_type` must be one of: start, end, user_action_process, system_decision, system_action
- user_action_process elements must have `lock_keyword` and `user_assigned`

### Connections Table
- Each `connection_id` must be unique
- `source_element_id` must reference valid `element_id` from Elements table
- `target_element_id` must reference valid `element_id` from Elements table
- Connections from system_decision elements should have `connection_type: conditional` and a `condition` value
- Connections from non-decision elements should have `connection_type: normal`
- `trigger` must be one of: time, button, await
- If `trigger` is `button`, the `button` field should contain button text (recommended)
- At least one connection must originate from a start element
- At least one connection must point to an end element

### Workflow Integrity
- Every element (except end) should have at least one outgoing connection
- Every element (except start) should have at least one incoming connection
- system_decision elements should have at least 2 outgoing connections


---

## Demo Example: Invoice Approval Process

### Process Description
"As Invoice User I engage stage called 'Invoice draft', I fill the form, select approver in form, next I press button 'send to approver' validation if approver was selected; after send it is received by Invoice Approver. The approver reads form, next press 'Approve form' button, the form changes state to 'Closed form' which ends the process"

### Elements Table - Invoice Approval

| element_id | element_name | element_type | lock_keyword | user_assigned | comment_text | text_below |
|------------|--------------|--------------|--------------|---------------|--------------|------------|
| START_INV | Invoice Process Start | start | | | | New invoice initiated |
| PROC_DRAFT | Invoice Draft | user_action_process | lock_noterasable | Invoice User | Fill form and select approver | |
| PROC_REVIEW | Invoice Review | user_action_process | lock_noteditable | Invoice Approver | Review and approve invoice | |
| END_CLOSED | Closed Form | end | | | | Invoice process complete |

### Connections Table - Invoice Approval

| connection_id | source_element_id | target_element_id | condition | connection_type | button | validation | trigger |
|---------------|-------------------|-------------------|-----------|-----------------|--------|------------|---------|
| CONN_INV_001 | START_INV | PROC_DRAFT | | normal | | | await |
| CONN_INV_002 | PROC_DRAFT | PROC_REVIEW | | normal | Send to Approver | Approver must be selected | button |
| CONN_INV_003 | PROC_REVIEW | END_CLOSED | | normal | Approve Form | | button |
