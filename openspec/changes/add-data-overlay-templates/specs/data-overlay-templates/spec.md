## ADDED Requirements

### Requirement: Bundled starters
The system SHALL provide Counter badge, Goal bar, Latest supporter and Combined goals panel starters, each with a preview and typed binding slots.

#### Scenario: Start from Goal bar
- **WHEN** the user creates a canvas from the Goal bar starter and maps its slot to an existing goal
- **THEN** a new canvas shows that goal's progress

### Requirement: Saved user templates
A user SHALL be able to save a canvas or a selection of elements as a template. Templates SHALL contain layout, styling, registered asset references and typed slots, and SHALL NOT contain live values, applied-event records or credentials.

#### Scenario: Save a canvas as a template
- **WHEN** the user saves a canvas bound to a counter at 37 as a template
- **THEN** the template has a typed integer slot and no stored count

### Requirement: Independent copies
Instantiation SHALL create elements with new IDs that are independent of the template. Later template edits SHALL NOT change existing canvases.

#### Scenario: Edit the template later
- **WHEN** the user changes a template after creating a canvas from it
- **THEN** the existing canvas is unchanged

### Requirement: Compatible slot mapping
Instantiation SHALL require every slot to be mapped to a compatible existing value or goal, or to a new custom value created in the same step. Incompatible mappings SHALL be rejected. All references SHALL be rewritten atomically.

#### Scenario: Reuse an existing goal
- **WHEN** a goal slot is mapped to an existing goal
- **THEN** the new elements show that goal and no new value is created

#### Scenario: Incompatible mapping
- **WHEN** a goal slot is mapped to a text value
- **THEN** instantiation is rejected and nothing is created

### Requirement: Provider slots need a source
A slot that requires a provider source, such as a Twitch goal, SHALL be mappable only to a configured source of that kind.

#### Scenario: No Twitch connection
- **WHEN** the user instantiates a template with a Twitch goal slot and Twitch is not connected
- **THEN** the slot cannot be mapped and Management explains what to connect

### Requirement: Missing assets
A template whose image asset is missing SHALL instantiate with that element flagged in Management and hidden on live outputs.

#### Scenario: Asset deleted
- **WHEN** a template references an image that was removed from the library
- **THEN** the new canvas flags the element and hides it live

### Requirement: Flattened group insertion
Inserting a group template into a canvas SHALL add ordinary independent elements without a persistent group.

#### Scenario: Insert a badge group
- **WHEN** the user inserts a three-element badge group into a canvas
- **THEN** the canvas gains three ordinary elements that can be edited one by one
