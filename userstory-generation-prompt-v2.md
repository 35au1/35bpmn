# User Story Generation Prompt — v2 (Subprocess-Aware)

You will receive two CSV tables defining an application workflow: an Elements table and a Connections table. Convert this workflow into structured User Stories with subprocess chains — IN POLISH LANGUAGE.

## Core Concept

A `user_action_process` represents a **form state** — a stage where the form exists in a specific state and a human User can perform actions within it. The form stays in this state until the User triggers a transition that moves it to another form state.

Actions that happen **within** a form state (e.g. filling fields, selecting values, internal calculations) are **subprocesses** of that stage. They are NOT separate stages in the main diagram. Only actions that result in the form moving to a different `user_action_process` (or to an `end`) belong in the main flow.

A **closed/finalized form** is itself a form state (`user_action_process`), not just an `end` node. It has its own stage in the main flow with an outbound connection to the `end` node. It may also have subprocesses (e.g. archiving, generating a document).

**CRITICAL RULE — Main diagram only:** Never include in the main diagram any action, decision, or subprocess that does not result in a transition to another `user_action_process` or to an `end`. Internal form actions stay in the subprocess column only.

## Input Format

**Elements CSV columns:** element_id, element_name, element_type, lock_keyword, user_assigned, comment_text, text_below
**Connections CSV columns:** connection_id, source_element_id, target_element_id, condition, connection_type, button, validation, trigger

**Element types:**
- start / end: flow boundaries
- user_action_process: a form state where a human User performs actions
- system_decision: system evaluates a condition and routes to multiple paths
- system_action: system performs a single background action

## Output CSV Columns

| Column | Description |
|--------|-------------|
| element_id | The element_id of the user_action_process this row describes. |
| user_story | Happy path narrative: who the user is, what they do on the form in this state, which button they click to move forward, and which form state the flow proceeds to next. Written from the user's perspective as a story. No system internals. End with one concise sentence stating the purpose of this form state. |
| technical_aspects | Technical narrative: all validations, system_decision checks, system_action steps, and dependencies triggered by the user's action. Written for a developer or analyst. |
| alternative_paths | All non-happy-path outcomes: each as a full sentence stating the condition and destination. Multiple alternatives joined by semicolons. If none: "Brak ścieżek alternatywnych." |
| subprocesses | A flowing paragraph describing the chain of actions the user can perform **within** this form state before triggering a transition. These are internal actions that do not move the form to another state — e.g. filling fields, selecting values, uploading attachments, running internal lookups. If the form state has no meaningful internal actions beyond the main transition: "Brak podprocesów." |

## Rules

- One row per user_action_process element
- system_decision and system_action elements belong to the story of the preceding user_action_process
- The `user_story` column covers only the happy path and the main outbound transition
- The `subprocesses` column covers all internal actions within the form state that do NOT result in a transition to another state
- A finalized/closed form state is a user_action_process with its own row — its subprocess may include archiving or document generation; its outbound connection leads to the end node
- All values are full sentences — no bullet points, no dashes, no lists inside a cell
- Values containing commas must be wrapped in double quotes; inner quotes escaped as `""`
- **CRITICAL: element IDs must NEVER appear in narrative fields. Always use element_name.**

## Example

**Input elements (simplified):**
```
PROC_DRAFT, Invoice Draft, user_action_process, lock_noterasable, Invoice User
DEC_001, Is approver Senior Manager?, system_decision, , , Checks role of selected approver
ACT_001, Add Senior Manager approver, system_action, , , Adds additional approver at Senior Manager level
PROC_REVIEW, Review, user_action_process, lock_noteditable, Approver
PROC_CLOSED, Closed Invoice, user_action_process, lock_noteditable, System
END_001, End, end
```

**Input connections (simplified):**
```
CONN_002, PROC_DRAFT, DEC_001, , normal, Send to Approver, Approver selected, button
CONN_003, DEC_001, ACT_001, Senior Manager, conditional
CONN_004, DEC_001, PROC_REVIEW, Not Senior Manager, conditional
CONN_005, ACT_001, PROC_REVIEW, , normal
CONN_006, PROC_REVIEW, PROC_DRAFT, Reject, conditional, Reject, , button
CONN_007, PROC_REVIEW, PROC_CLOSED, Approve, conditional, Approve, , button
CONN_008, PROC_CLOSED, END_001, , normal, , , await
```

**Expected output CSV:**

```userstories.csv
element_id,user_story,technical_aspects,alternative_paths,subprocesses
PROC_DRAFT,"Użytkownik faktury otwiera etap Szkic faktury i wypełnia formularz, wybierając osobę zatwierdzającą, a następnie klika przycisk ""Wyślij do zatwierdzającego"", przekazując formularz do etapu Przegląd. Celem tego etapu jest przygotowanie faktury i wskazanie osoby odpowiedzialnej za jej zatwierdzenie.","System weryfikuje, czy pole zatwierdzającego zostało wypełnione. Następnie sprawdza rolę wybranego zatwierdzającego: jeśli jest Starszym Menedżerem, automatycznie dodaje dodatkowego zatwierdzającego przed przekazaniem do etapu Przegląd; w przeciwnym razie formularz trafia bezpośrednio do Zatwierdzającego.","Brak ścieżek alternatywnych.","W ramach tego etapu Użytkownik faktury może uzupełniać pola formularza, wprowadzać dane faktury, wybierać walutę i centrum kosztów oraz dołączać załączniki — wszystkie te działania odbywają się wewnątrz stanu formularza i nie powodują jego przejścia do kolejnego etapu."
PROC_REVIEW,"Zatwierdzający otwiera etap Przegląd, zapoznaje się z treścią formularza faktury i klika przycisk ""Zatwierdź"", co przenosi formularz do stanu Zamknięta faktura. Celem tego etapu jest podjęcie decyzji o zatwierdzeniu lub odrzuceniu faktury przez uprawnioną osobę.","Brak dodatkowych działań systemowych na tym etapie.","W przypadku odrzucenia Zatwierdzający klika przycisk ""Odrzuć"", a formularz wraca do etapu Szkic faktury, gdzie Użytkownik faktury może wprowadzić poprawki.","W ramach tego etapu Zatwierdzający może przeglądać wszystkie pola formularza, dodawać komentarze do decyzji oraz pobierać załączone dokumenty — działania te nie powodują zmiany stanu formularza."
PROC_CLOSED,"Formularz faktury przechodzi w stan Zamknięta faktura, a proces kończy się. Celem tego etapu jest utrwalenie zatwierdzonej faktury jako zamkniętego rekordu w systemie.","System archiwizuje formularz i generuje potwierdzenie zamknięcia.","Brak ścieżek alternatywnych.","W ramach tego stanu możliwe jest pobranie archiwalnej wersji dokumentu oraz wygenerowanie raportu — działania te są dostępne dla uprawnionych użytkowników i nie zmieniają stanu formularza."
```

## OUTPUT FORMAT — MANDATORY

Respond with exactly two sections:

**1. Markdown table for review** — print the user stories in readable markdown format.

**2. Downloadable CSV** — output as a raw CSV code block labeled `userstories.csv`:

```userstories.csv
element_id,user_story,technical_aspects,alternative_paths,subprocesses
...
```

Values containing commas must be wrapped in double quotes. Double quotes inside values must be escaped as `""`.
