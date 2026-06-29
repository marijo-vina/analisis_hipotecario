# Observations Editor Specification

## Purpose

Compact editable observations block below the case summary. Provides explicit save/cancel controls, a 1000-character limit, and a character counter visible only during editing.

## Requirements

### Requirement: Editable Textarea

The system MUST render the case notes as an editable textarea when the user clicks an "Editar" button or the notes area. In read mode, notes display as plain text with a placeholder if empty.

#### Scenario: Read mode displays notes

- GIVEN case has notes "Cliente pendiente de comprobante de ingresos"
- WHEN page loads
- THEN notes display as plain text below the case summary

#### Scenario: Empty notes show placeholder

- GIVEN case has no notes (null or empty string)
- WHEN page loads
- THEN displays placeholder text "Agregar observaciones..."

#### Scenario: Enter edit mode

- GIVEN notes are in read mode
- WHEN user clicks "Editar"
- THEN notes become an editable textarea with current text pre-filled

### Requirement: Save and Cancel Buttons

The system MUST display "Guardar" and "Cancelar" buttons when there are unsaved changes. The system MUST NOT auto-save on blur or any other implicit trigger.

#### Scenario: Buttons appear when editing

- GIVEN user is in edit mode
- WHEN textarea has focus
- THEN "Guardar" and "Cancelar" buttons are visible below the textarea

#### Scenario: Save persists notes

- GIVEN user edited notes to "Nuevo texto"
- WHEN user clicks "Guardar"
- THEN notes are persisted via PATCH /mortgage-cases/{id}
- AND textarea returns to read mode showing "Nuevo texto"
- AND save/cancel buttons disappear

#### Scenario: Cancel discards changes

- GIVEN user edited notes to "Nuevo texto" but original was "Texto original"
- WHEN user clicks "Cancelar"
- THEN textarea returns to read mode showing "Texto original"
- AND no API call is made

#### Scenario: No auto-save on blur

- GIVEN user is editing notes
- WHEN user clicks outside the textarea (blur)
- THEN edit mode remains active, no save occurs

### Requirement: Character Limit

The system MUST enforce a maximum of 1000 characters. The character counter MUST be visible only during editing, displayed discreetly (small text, muted color).

#### Scenario: Counter visible during edit

- GIVEN user is in edit mode
- WHEN textarea has 50 characters
- THEN counter shows "50/1000" in small muted text

#### Scenario: Limit enforcement

- GIVEN user has typed 1000 characters
- WHEN user tries to type more
- THEN no additional characters are accepted (textarea is capped at 1000)

#### Scenario: Counter hidden in read mode

- GIVEN notes are in read mode
- WHEN viewing notes
- THEN no character counter is visible

### Requirement: Save Error Handling

The system MUST display an inline error message if the save API call fails. The textarea MUST remain in edit mode so the user can retry.

#### Scenario: Save failure keeps edit mode

- GIVEN user clicks "Guardar"
- WHEN API returns 500 error
- THEN error message "Error al guardar observaciones. Intente nuevamente." displays
- AND textarea remains editable with user's text intact
