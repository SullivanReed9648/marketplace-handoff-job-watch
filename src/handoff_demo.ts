import { recordScheduledResult } from "./marketplace_handoff.js";

const decision = await recordScheduledResult(
  {
    runId: "run-2026-09-29-042",
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
  async (_exception, requestId) => ({ accepted: true, requestId })
);

console.log(JSON.stringify(decision, null, 2));
