# User Story Generation Prompt

You will receive two CSV tables defining an application workflow: an Elements table and a Connections table. Convert this workflow into structured User Stories - IN POLISH LANGUAGE

## Input Format

**Elements CSV columns:** element_id, element_name, element_type, lock_keyword, user_assigned, comment_text, text_below
**Connections CSV columns:** connection_id, source_element_id, target_element_id, condition, connection_type, button, validation, trigger

**Element types:**
- start / end: flow boundaries
- user_action_process: a stage where a human User performs an action (has user_assigned)
- system_decision: system evaluates a condition and routes to multiple paths (comment_text describes the logic)
- system_action: system performs a single background action (comment_text describes what it does)

## What is a User Story

Each `user_action_process` generates one row with three narrative fields. Each field is a flowing paragraph of full sentences — no bullet points, no lists.

## Output CSV Columns

| Column | Description |
|--------|-------------|
| element_id | The element_id of the user_action_process this row describes. |
| user_story | Happy path narrative: who the user is, what they do on the form, which button they click, and which stage the flow proceeds to next. Describe the journey from the user's perspective as if telling a story. Do not mention system internals here. End with exactly one concise sentence projecting the purpose of this stage — what the user is trying to achieve and why this step exists in the process. |
| technical_aspects | Technical narrative: all validations the system performs, all system_decision checks and their logic, all system_action steps executed in the background, and any dependencies or integrations implied by the flow. Written as a technical description for a developer or analyst. |
| alternative_paths | Alternative paths narrative: each non-happy-path outcome described as a full sentence stating the condition that triggers it and where it leads. If multiple alternatives exist, join them into one paragraph separated by semicolons. If none exist, write "Brak ścieżek alternatywnych." |

## Rules

- One row per user_action_process element
- system_decision and system_action elements belong to the story of the preceding user_action_process
- The `user_story` column focuses purely on the human actor and the happy path — no system internals
- The `technical_aspects` column covers everything the system does: validations, decisions, background actions, dependencies
- The `alternative_paths` column covers all non-happy-path routes: loops, rejections, conditional branches, and their destinations
- All values are full sentences — no bullet points, no dashes, no lists inside a cell
- Values containing commas must be wrapped in double quotes; inner quotes escaped as `""`
- **CRITICAL: element IDs (e.g. PROC_001, DEC_001, ACT_001) must NEVER appear anywhere in the text of user_story, technical_aspects, or alternative_paths. Always refer to elements by their element_name only. The element_id column exists solely as a reference key — it must not be mentioned or quoted in any narrative field.**

## Example

**Input elements (simplified):**
```
PROC_DRAFT, Invoice Draft, user_action_process, lock_noterasable, Invoice User
DEC_001, Is approver Senior Manager?, system_decision, , , Checks role of selected approver
ACT_001, Add Senior Manager approver, system_action, , , Adds additional approver at Senior Manager level
PROC_REVIEW, Review, user_action_process, lock_noteditable, Approver
END_001, Closed, end
```

**Input connections (simplified):**
```
CONN_002, PROC_DRAFT, DEC_001, , normal, Send to Approver, Approver selected, button
CONN_003, DEC_001, ACT_001, Senior Manager, conditional
CONN_004, DEC_001, PROC_REVIEW, Not Senior Manager, conditional
CONN_005, ACT_001, PROC_REVIEW, , normal
CONN_006, PROC_REVIEW, PROC_DRAFT, Reject, conditional, Reject
CONN_007, PROC_REVIEW, END_001, Approve, conditional, Approve
```

**Expected output CSV:**

```userstories.csv
element_id,user_story,technical_aspects,alternative_paths
PROC_DRAFT,"Użytkownik faktury otwiera etap Szkic faktury, wypełnia formularz oraz wybiera osobę zatwierdzającą, a następnie klika przycisk ""Wyślij do zatwierdzającego"", przekazując formularz do etapu Przegląd. Celem tego etapu jest przygotowanie faktury i skierowanie jej do właściwej osoby zatwierdzającej.","System weryfikuje, czy pole zatwierdzającego zostało wypełnione przed dopuszczeniem do przejścia. Następnie system sprawdza rolę wybranego zatwierdzającego: jeśli jest Starszym Menedżerem, automatycznie dodaje dodatkowego zatwierdzającego na poziomie Starszego Menedżera przed przekazaniem do etapu Przegląd; w przeciwnym razie formularz trafia bezpośrednio do Zatwierdzającego.","Brak ścieżek alternatywnych."
PROC_REVIEW,"Zatwierdzający otwiera etap Przegląd, zapoznaje się z treścią formularza faktury i klika przycisk ""Zatwierdź"", co kończy proces wynikiem Zamknięty. Celem tego etapu jest weryfikacja faktury przez uprawnioną osobę i podjęcie decyzji o jej zatwierdzeniu.","Brak walidacji ani działań systemowych na tym etapie.","W przypadku odrzucenia Zatwierdzający klika przycisk ""Odrzuć"", a formularz wraca do etapu Szkic faktury, gdzie Użytkownik faktury może wprowadzić poprawki i ponownie wysłać do zatwierdzenia."
```

## OUTPUT FORMAT — MANDATORY

Respond with exactly two sections:

**1. Markdown table for review** — print the user stories in readable markdown format.

**2. Downloadable CSV** — output as a raw CSV code block labeled `userstories.csv`:

```userstories.csv
element_id,user_story,technical_aspects,alternative_paths
...
```

Values containing commas must be wrapped in double quotes. Double quotes inside values must be escaped as `""`.
