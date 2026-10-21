## ADDED Requirements

### Requirement: The phone exports the document, never the page

Every audio surface the phone shows that offers an export (the input patch, the output
patch and the signal flow) SHALL offer it as **Export PDF**, and SHALL deliver the
audio document this capability defines.

No audio surface, on any screen width, SHALL offer an action that opens the browser's
print dialog, because no audio surface has a printable form.

#### Scenario: Exporting from the input patch on a phone

- **WHEN** a user on a phone opens the ⋯ menu of Audio Inputs
- **THEN** it offers Export PDF and no print action
- **AND** choosing it downloads the event's audio document

#### Scenario: Exporting from the output patch on a phone

- **WHEN** a user on a phone opens the ⋯ menu of Audio Outputs
- **THEN** it offers Export PDF and no print action
- **AND** choosing it downloads the event's audio document

#### Scenario: A viewer on a phone

- **WHEN** a user with read-only access opens either menu on a phone
- **THEN** Export PDF is offered, as it is to every role
