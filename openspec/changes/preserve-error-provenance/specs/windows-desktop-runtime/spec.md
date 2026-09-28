## ADDED Requirements

### Requirement: Desktop Process Boundaries Preserve Failure Evidence Locally
The desktop application SHALL preserve bounded structured failures across main, renderer, preload, worker and IPC boundaries and SHALL record platform termination reasons and exit codes when no JavaScript exception is available. Native crash collection SHALL remain local with automatic upload disabled.

#### Scenario: Worker command fails
- **WHEN** the owned service worker rejects a desktop command
- **THEN** the validated response retains the stable reference and serialized exception
- **AND** the main process does not invent a replacement remote stack

#### Scenario: Renderer or child process terminates
- **WHEN** Electron reports preload failure, renderer loss or child-process loss
- **THEN** diagnostics records the process identity, platform reason and exit code where supplied
- **AND** management and overlay renderers do not display a raw stack

#### Scenario: Native crash evidence exists on next launch
- **WHEN** Electron exposes a prior local crash dump after abnormal termination
- **THEN** the next viable process records a redacted bounded dump reference and timestamp
- **AND** no dump content is read or uploaded automatically

#### Scenario: Fatal JavaScript exception reaches a process entry point
- **WHEN** an uncaught exception or unhandled rejection reaches the final process boundary
- **THEN** the process writes bounded emergency evidence and follows a failing termination path
- **AND** it does not resume normal application work
