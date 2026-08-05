## Purpose

What the application asks before it destroys something a user has planned, and how that
question behaves. It is the difference between an act that can be walked back and one
that cannot, so the question is the application's own — never the browser's — and it must
be answerable about the *specific* thing it was raised for.

## ADDED Requirements

### Requirement: A destructive act is confirmed by the application, not the browser

Every act that removes planned work — an element, a device, a channel, a plot, a catalog
item, a category, a piece of owned gear — SHALL be confirmed by the application's own
confirmation surface. The system SHALL NOT use a browser-native modal (`window.confirm`,
`window.prompt`, `window.alert`) for this.

A bulk act that relocates planned work between containers is confirmed the same way,
because its scale is what the user is being asked about.

#### Scenario: Deleting a stagebox

- **WHEN** the user activates the delete control on a stagebox
- **THEN** an in-application confirmation appears, styled as the rest of the application
- **AND** no browser-native dialog appears at any point
- **AND** the stagebox is not deleted until the user answers affirmatively

#### Scenario: Dismissing without confirming

- **WHEN** a confirmation is open and the user presses `Escape`, activates the scrim, the
  close control, or the cancel control
- **THEN** the confirmation closes and **nothing is destroyed**
- **AND** the surface that raised it is still open and unchanged

#### Scenario: A reversible act is not confirmed

- **WHEN** an act can be undone by the same control that performed it — detaching
  something that the same row's picker can re-attach
- **THEN** no confirmation is raised, because a confirmation on a reversible act teaches
  users to dismiss confirmations

### Requirement: The question names the subject, then the consequence

The confirmation SHALL state which thing is about to be destroyed, and then what else
goes with it. Where the consequence has a magnitude the user cannot see from the row —
how many cables are patched, how many events plan this gear, how many fixtures move —
that magnitude SHALL appear in the sentence.

The confirmation SHALL offer two answers. A confirmation with one answer is not a
question.

#### Scenario: A consequence with a count

- **WHEN** the user is asked to delete a stagebox that has cables patched to it
- **THEN** the sentence names the stagebox **and** states how many of its jacks are in use
- **AND** the number reflects that stagebox, not another

#### Scenario: A consequence reaching outside the event

- **WHEN** the user is asked to delete a piece of owned gear
- **THEN** the sentence states how many events currently plan it

### Requirement: A confirmation cannot re-aim at a different subject

An open confirmation SHALL remain bound to the exact row it was raised for. If the
underlying list re-orders, re-renders, or the user interacts elsewhere, the confirmation
SHALL NOT come to refer to a different row than the one the user asked about.

This matters most in lists of near-identical rows, which is where most destructive acts
in this application are raised from.

#### Scenario: The list changes under an open confirmation

- **GIVEN** a confirmation is open for the third of six near-identical rows
- **WHEN** the list re-renders or re-orders
- **THEN** the confirmation still names the third row's subject
- **AND** confirming destroys that row and no other

#### Scenario: Answering affirmatively destroys exactly one subject

- **WHEN** the user confirms
- **THEN** only the subject named in the sentence is destroyed
- **AND** the confirmation closes

### Requirement: A confirmation renders above the surface that raised it

When a destructive act is raised from within an overlay — a drawer, a sheet, an
inspector, an inline editor — the confirmation SHALL render **above** that overlay and
remain fully readable and operable, including on a phone.

#### Scenario: Raised from inside a drawer

- **WHEN** the user activates a delete control inside an open drawer
- **THEN** the confirmation appears above the drawer, not beneath or clipped by it
- **AND** both of its answers are reachable

#### Scenario: Raised from inside a sheet on a phone

- **WHEN** the same act is raised on a viewport at or below the phone breakpoint
- **THEN** the confirmation is fully visible above the sheet
- **AND** both of its answers meet the minimum tap target size
