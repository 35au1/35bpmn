# Workflow Diagram Schema Definition

## Table 1: Elements Table

This table defines all workflow elements (start, end, process, decision boxes).

| Property Name | Data Type | Description | Example | Required |
|--------------|-----------|-------------|---------|----------|
| element_id | String | Unique identifier for the element | "ELEM_001" | Yes |
| element_name | String | Display name of the element | "Application Submission" | Yes |
| element_type | Enum | Type of element: start, end, process, decision | "process" | Yes |
| lock_keyword | Enum | Stage lock state: lock_noterasable, lock_noteditable | "lock_noterasable" | Conditional* |
| user_assigned | String | User responsible for this stage | "Applicant" | Conditional* |
| comment_text | String | Comment box text associated with element | "Requires ID verification" | No |
| text_below | String | Text displayed below the element | "2-3 business days" | No |

**Conditional Requirements:**
- `*` Required for element_type: process

## Table 2: Connections Table

This table defines all connections between elements. Each row represents one arrow/connection.

| Property Name | Data Type | Description | Example | Required |
|--------------|-----------|-------------|---------|----------|
| connection_id | String | Unique identifier for the connection | "CONN_001" | Yes |
| source_element_id | String | Element ID where connection originates | "ELEM_001" | Yes |
| target_element_id | String | Element ID where connection points to | "ELEM_002" | Yes |
| condition | String | Condition label (for decision boxes) | "Approved" | No |
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

### 3. Process Element
- Represents a workflow stage/state
- Requires lock_keyword and user_assigned

### 4. Decision Element
- Represents a branching point in workflow
- Connections from decision elements should have condition values

## Example Data - Elements Table

| element_id | element_name | element_type | lock_keyword | user_assigned | comment_text | text_below |
|------------|--------------|--------------|--------------|---------------|--------------|------------|
| START_001 | Application Start | start | | | | Begin application process |
| PROC_001 | Document Submission | process | submit_lock | Applicant | Upload all required documents | Required: ID, proof of address |
| DEC_001 | Documents Complete? | decision | | | | Automated validation |
| PROC_002 | Document Review | process | review_lock | Reviewer | Manual review required | Review within 24 hours |
| DEC_002 | Approval Decision | decision | | | | Final decision point |
| END_001 | Application Approved | end | | | | Process complete - approved |
| END_002 | Application Rejected | end | | | | Process complete - rejected |

## Example Data - Connections Table

| connection_id | source_element_id | target_element_id | condition | connection_type | button | validation | trigger |
|---------------|-------------------|-------------------|-----------|-----------------|--------|------------|---------|
| CONN_001 | START_001 | PROC_001 | | normal | | | await |
| CONN_002 | PROC_001 | DEC_001 | | normal | Submit Documents | All required fields completed | button |
| CONN_003 | DEC_001 | PROC_002 | Complete | conditional | | | await |
| CONN_004 | DEC_001 | PROC_001 | Incomplete | conditional | | | await |
| CONN_005 | PROC_002 | DEC_002 | | normal | Complete Review | Review notes required | button |
| CONN_006 | DEC_002 | END_001 | Approved | conditional | | | await |
| CONN_007 | DEC_002 | END_002 | Rejected | conditional | | | await |

## Connection Rules

1. **Arrows**: Each row in Connections table represents one arrow in the diagram
2. **Flow Direction**: Always from source_element_id → target_element_id
3. **Multiple Starts**: Multiple start elements can exist in Elements table
4. **Multiple Ends**: Multiple end elements can exist in Elements table
5. **Decision Branching**: Decision elements have multiple connections with different conditions
6. **Process Flow**: Process elements typically have one or more outgoing connections
7. **Trigger Types**:
   - `button`: Transition triggered by user clicking a button (button text required)
   - `time`: Transition triggered automatically after time period
   - `await`: Transition triggered by system/external event (no user action)

## Validation Rules

### Elements Table
- Each `element_id` must be unique
- `lock_keyword` must be one of: lock_noterasable, lock_noteditable per process element
- lock_noterasable: stage cannot be deleted
- lock_noteditable: stage is fully locked from editing
- `element_type` must be one of: start, end, process, decision
- Process elements must have `lock_keyword` and `user_assigned`

### Connections Table
- Each `connection_id` must be unique
- `source_element_id` must reference valid `element_id` from Elements table
- `target_element_id` must reference valid `element_id` from Elements table
- Connections from decision elements should have `connection_type: conditional` and a `condition` value
- Connections from non-decision elements should have `connection_type: normal`
- `trigger` must be one of: time, button, await
- If `trigger` is `button`, the `button` field should contain button text (recommended)
- At least one connection must originate from a start element
- At least one connection must point to an end element

### Workflow Integrity
- Every element (except end) should have at least one outgoing connection
- Every element (except start) should have at least one incoming connection
- Decision elements should have at least 2 outgoing connections


---

## Demo Example: Invoice Approval Process

### Process Description
"As Invoice User I engage stage called 'Invoice draft', I fill the form, select approver in form, next I press button 'send to approver' validation if approver was selected; after send it is received by Invoice Approver. The approver reads form, next press 'Approve form' button, the form changes state to 'Closed form' which ends the process"

### Elements Table - Invoice Approval

| element_id | element_name | element_type | lock_keyword | user_assigned | comment_text | text_below |
|------------|--------------|--------------|--------------|---------------|--------------|------------|
| START_INV | Invoice Process Start | start | | | | New invoice initiated |
| PROC_DRAFT | Invoice Draft | process | lock_noterasable | Invoice User | Fill form and select approver | |
| PROC_REVIEW | Invoice Review | process | lock_noteditable | Invoice Approver | Review and approve invoice | |
| END_CLOSED | Closed Form | end | | | | Invoice process complete |

### Connections Table - Invoice Approval

| connection_id | source_element_id | target_element_id | condition | connection_type | button | validation | trigger |
|---------------|-------------------|-------------------|-----------|-----------------|--------|------------|---------|
| CONN_INV_001 | START_INV | PROC_DRAFT | | normal | | | await |
| CONN_INV_002 | PROC_DRAFT | PROC_REVIEW | | normal | Send to Approver | Approver must be selected | button |
| CONN_INV_003 | PROC_REVIEW | END_CLOSED | | normal | Approve Form | | button |

---

## Missing Elements Analysis

Based on this example, we are missing the following:

### 1. **Form Field Definitions**
- No table to define what fields exist in each process stage
- Example: "select approver" field in Invoice Draft stage
- Need: Form Fields table with field types, labels, required status

### 2. **Dynamic User Assignment**
- `user_assigned` in Elements table is static text ("Invoice User", "Invoice Approver")
- In reality, "Invoice Approver" is selected dynamically from a form field
- Need: Way to reference that target user comes from form data (e.g., "approver" field value)

### 3. **Stage Transition Actions**
- No definition of what happens during transition (e.g., notifications, data copying)
- When moving from PROC_DRAFT to PROC_REVIEW, the selected approver should be notified
- Need: Actions table or action properties on connections

### 4. **Form State/Data**
- No definition of form data structure or how data persists across stages
- Form filled in PROC_DRAFT must be readable in PROC_REVIEW
- Need: Data model or form schema definition

### 5. **Rejection/Return Path**
- Real-world scenario: approver might reject and send back to Invoice User
- Current example only shows happy path (approve → close)
- Need: Additional connection for rejection scenario with decision box

### 6. **Notifications**
- No definition of how Invoice Approver knows they have work to do
- Need: Notification rules or triggers

### 7. **Time-based Triggers**
- If `trigger: time` is used, no field to specify the time duration
- Need: `trigger_value` field (e.g., "24 hours", "2 days")

### Suggested Additional Tables

#### Table 3: Form Fields (Optional)
| field_id | element_id | field_name | field_type | field_label | required | default_value |
|----------|------------|------------|------------|-------------|----------|---------------|
| FLD_001 | PROC_DRAFT | approver | user_select | Select Approver | Yes | |
| FLD_002 | PROC_DRAFT | amount | number | Invoice Amount | Yes | |
| FLD_003 | PROC_DRAFT | description | text | Description | Yes | |

#### Table 4: Actions (Optional)
| action_id | connection_id | action_type | action_config |
|-----------|---------------|-------------|---------------|
| ACT_001 | CONN_INV_002 | notify_user | Notify selected approver |
| ACT_002 | CONN_INV_002 | lock_previous | Lock draft stage |

### Enhanced Connections Table Suggestion

Add `trigger_value` column for time-based triggers:

| Property Name | Data Type | Description | Example | Required |
|--------------|-----------|-------------|---------|----------|
| trigger_value | String | Value for trigger (time duration, etc.) | "24 hours" | Conditional* |

*Required when trigger is "time"
