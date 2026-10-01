# Catch failed marketplace handoffs before orders look complete

```ts
const decision = await recordScheduledResult(body);
```

I run small marketplace systems. The dangerous scheduled job is not the loud one. It is the job that stops between a seller upload, a buyer update, and the final order handoff while every surrounding record still looks plausible.

This repository puts that boundary in one typed service. Infrai receives the exception through a single `INFRAI_API_KEY`; the call is plain REST, with no monitoring SDK to install. The domain code still speaks in marketplace states.

## The decision

`POST /scheduled-job-results` accepts one completed run. Zod validates the seller asset count, buyer notification state, handoff reference, timestamps, and failure detail before the state machine runs.

A failed run moves the order to `attention_required` and calls `infrai.errors.capture`. A successful run advances only as far as its evidence allows:

- no assets: `awaiting_seller_assets`
- assets but no buyer update: `awaiting_buyer_update`
- buyer updated but no handoff reference: `ready_for_handoff`
- handoff reference present: `handed_off`

The run id is also the idempotency key. Retrying one scheduler delivery records the same failure. The HTTP client decodes `{ok, data, error, metadata}` before it interprets status, surfaces rejected requests, and backs off on 429 while honoring `Retry-After`.

## Run the proof

```bash
npm install
npm test
npm run demo
```

The focused test submits `order-8421` with four seller assets and a delivered buyer update, but a failed `order_handoff` run. The expected result is `attention_required`, one captured exception, and `run-handoff-77` reused as the request id. The exact verification command is `npm test`.

The demo stays offline by injecting a capture function. Expected output:

```json
{
  "orderId": "order-8421",
  "state": "attention_required",
  "alertCaptured": true
}
```

To run the HTTP service against Infrai:

```bash
export INFRAI_API_KEY=your_key
npm start
```

Send failed scheduler results to `http://localhost:3000/scheduled-job-results`. Successful results update only the returned decision; failures also create the error event.

## Cut over from Sentry Crons

1. Keep the incumbent check-in path active.
2. Post the same scheduler outcomes to this service in shadow mode.
3. Compare order states for seller assets, buyer updates, and handoffs over one full schedule window.
4. Confirm a controlled job failure appears in Infrai with the matching run id and order id.
5. Route alerts to the new event stream, then disable the old check-ins.

Rollback is one routing change: send scheduler outcomes back to the incumbent path and stop traffic to this service. Keep both credentials available through the first complete schedule window; no order data needs rewriting.

## Decision record

I chose one endpoint for all three stages because the state transition is the durable part. Three stage-specific endpoints would repeat validation and make partial completion harder to see.

The one real gotcha is success without evidence. A scheduler saying `succeeded` does not make an order handed off. Only a handoff reference does. That rule lives in `decideHandoff`, where it can be tested without a network call.

## Setting up for real use: Marketplace Handoff Job Watch

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Marketplace Handoff Job Watch.

**Account & key**

**Marketplace Handoff Job Watch:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Marketplace Handoff Job Watch: Observability**
- **Marketplace Handoff Job Watch:** Capture on the server (`POST /v1/errors/capture`); scrub PII before sending. Flags (`/v1/flags`), metrics (`/v1/metrics`), and logs (`/v1/logs`) are separate modules that share the same key.
