# Event Bus Consumers

Every module that reacts to stream events registers as a consumer of the central event bus. Alerts, Screen Effects, Timers and Video shoutouts do so today. Custom data overlay rules (BL-061, building on BL-055) use the same contract. The [central event bus design](../../openspec/changes/add-central-event-bus/design.md) explains why the bus exists. This page covers what a consumer must do.

## Registration

A consumer is an `EventBusConsumerRegistration` from `@stream-jams/core`. Runtime composition (`apps/server/src/runtime/runtime-composition.ts`) passes it to the `EventBus`.

| Field | Meaning |
| --- | --- |
| `id` | Stable name of the consumer's persisted cursor. Renaming it loses the consumer's position. IDs must be unique. |
| `maxAttempts` | Total delivery attempts before the event is recorded in `event_bus_delivery_failures` and skipped. Defaults to 3. Use 1 when a retry could apply a non-idempotent change twice. |
| `externalPayloads` | Exact external identities (`providerKind`, `sourceKey`, `eventType`) whose payload the consumer needs. See below. |
| `handle(event, context)` | Handles one `BusEvent`. A thrown error is retried, then recorded and skipped. One failing consumer never delays or fails another consumer or intake. |

## Delivery

- Each consumer reads the journal after its own cursor, one event at a time, in journal order. There is no ordering guarantee across consumers.
- Delivery is at least once. A consumer that does not checkpoint must be idempotent by `busId`.
- A canonical event (`kind: "canonical"`) carries the validated `NormalizedStreamEvent`. An external event (`kind: "external"`) carries its identity in `effectTriggers` and, when declared, its payload.
- `sourceKind` and `sourceRegistrationId` name the source that delivered the event. When Twitch and Streamer.bot both deliver the same occurrence, the copies are merged and the consumer sees it once, from the first source to deliver it.
- Match events with the shared selector (`matchSelector` and `EventTriggerSelector` in `@stream-jams/core`) rather than custom matching. External identities match exactly; payload content never selects anything.

## Transactional checkpoints

A consumer that changes its own SQLite state can make each event apply exactly once. To do that, call `context.checkpoint()` inside its own transaction on the bus database connection:

```ts
async handle(event, { checkpoint }) {
  runInTransaction(connection, () => {
    applyChange(event);
    checkpoint();
  });
}
```

The state change and the cursor commit or roll back together. When `handle` throws after the checkpoint committed, the bus does not deliver that event to the consumer again.

## External payloads

The bus journals an external event's payload only when some registered consumer declared that event's identity in `externalPayloads`. Source keys compare case-insensitively and event types exactly. Payloads of undeclared identities are dropped at intake. Declaring an identity also makes the Streamer.bot connection subscribe to it while Streamer.bot advertises it, whatever the user's configured subscriptions.

A payload is an untrusted JSON object of at most 16 KiB. The consumer must validate it with its own schema before use and must never use it to choose media, routes, files or commands. Video shoutouts are the reference: `apps/server/src/modules/video-shoutout/video-shoutout-bus-consumer.ts` declares `General` / `Custom`, ignores payloads without its marker, and validates the rest with `parseVideoShoutoutCommand`.

Diagnostics and logs never include raw payloads. Log only bounded identifiers and field names.

## Outputs

The bus has no overlay output. A consumer keeps its module's own outputs: the desktop overlay, the OBS browser source and the management UI. Its queue shows the delivering source to the operator (`OperationRow.source`).
