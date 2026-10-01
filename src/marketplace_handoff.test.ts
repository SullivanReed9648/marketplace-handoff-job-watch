import assert from "node:assert/strict";
import test from "node:test";
import { infrai } from "./infrai_errors.js";
import { recordScheduledResult } from "./marketplace_handoff.js";

test("the Infrai request sends idempotency_key in the capability payload", async (context) => {
  const originalFetch = globalThis.fetch;
  let requestBody: unknown;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ ok: true, data: { accepted: true } }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  await infrai.errors.capture({ message: "failed" }, "run-handoff-77");

  assert.deepEqual(requestBody, {
    exception: { message: "failed" },
    idempotency_key: "run-handoff-77"
  });
});

test("a failed handoff becomes visible and blocks order completion", async () => {
  const captures: Array<{ exception: unknown; requestId: string }> = [];
  const decision = await recordScheduledResult(
    {
      runId: "run-handoff-77",
      shopId: "shop-17",
      orderId: "order-8421",
      stage: "order_handoff",
      outcome: "failed",
      assetCount: 4,
      buyerUpdateSent: true,
      handoffReference: null,
      finishedAt: "2026-09-29T02:15:00.000Z",
      failureMessage: "Carrier handoff reference was not produced"
    },
    async (exception, requestId) => {
      captures.push({ exception, requestId });
      return { accepted: true };
    }
  );

  assert.deepEqual(decision, {
    orderId: "order-8421",
    state: "attention_required",
    alertCaptured: true
  });
  assert.equal(captures.length, 1);
  assert.equal(captures[0]?.requestId, "run-handoff-77");
  assert.deepEqual(captures[0]?.exception, {
    name: "MarketplaceScheduledJobFailure",
    message: "Carrier handoff reference was not produced",
    stage: "order_handoff",
    shopId: "shop-17",
    orderId: "order-8421",
    finishedAt: "2026-09-29T02:15:00.000Z"
  });
});

test("a successful buyer update waits for the handoff reference", async () => {
  const decision = await recordScheduledResult({
    runId: "run-update-19",
    shopId: "shop-17",
    orderId: "order-8421",
    stage: "buyer_update",
    outcome: "succeeded",
    assetCount: 4,
    buyerUpdateSent: true,
    handoffReference: null,
    finishedAt: "2026-09-29T02:10:00.000Z"
  });

  assert.equal(decision.state, "ready_for_handoff");
  assert.equal(decision.alertCaptured, false);
});
