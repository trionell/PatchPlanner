## ADDED Requirements

### Requirement: A surface never destroys what it cannot author

Where the only way to bring a kind of object into being is a gesture a surface does not
offer, that surface SHALL NOT offer to destroy one either. The system SHALL withhold the
delete control itself, not merely confirm harder.

This is the companion to the confirmation requirements: those govern how a destructive act is
asked about, this one governs whether it is offered at all. The reason is that the repair is
asymmetric — a mis-tap costs a trip to a surface the user may not be near, and a confirmation
answered by the same thumb that raised it is not protection.

A surface withholding a delete SHALL still show the object and SHALL still allow the fields
that are not the withheld gesture to be edited.

#### Scenario: A measurement on a phone

- **GIVEN** a phone cannot draw a measurement on a stage plot
- **WHEN** a measurement is selected on a phone
- **THEN** no control to delete it is present
- **AND** its value and endpoints are stated, and its note can still be edited

#### Scenario: A plot element on a phone

- **GIVEN** a phone cannot place an element on a stage plot
- **WHEN** an element is selected on a phone
- **THEN** no control to delete it is present
- **AND** the element's own fields can still be edited

#### Scenario: The same object at a desk

- **WHEN** the same object is selected on a surface that can author it
- **THEN** the delete control is present, and behaves by the confirmation requirements above
