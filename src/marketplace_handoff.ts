import { z } from "zod";
import { infrai } from "./infrai_errors.js";

export const scheduledJobResultSchema = z.object({
  runId: z.string().min(1),
  shopId: z.string().min(1),
  orderId: z.string().min(1),
  stage: z.enum(["seller_assets", "buyer_update", "order_handoff"]),
  outcome: z.enum(["succeeded", "failed"]),
  assetCount: z.number().int().nonnegative(),
  buyerUpdateSent: z.boolean(),
  handoffReference: z.string().min(1).nullable(),
  finishedAt: z.string().datetime(),
  failureMessage: z.string().min(1).optional()
}).superRefine((result, context) => {
  if (result.outcome === "failed" && !result.failureMessage) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["failureMessage"],
      message: "failureMessage is required for a failed job"
    });
  }
});

export type ScheduledJobResult = z.infer<typeof scheduledJobResultSchema>;
export type HandoffDecision = {
  orderId: string;
  state: "awaiting_seller_assets" | "awaiting_buyer_update" | "ready_for_handoff" | "handed_off" | "attention_required";
  alertCaptured: boolean;
};

type CaptureFailure = (exception: unknown, requestId: string) => Promise<unknown>;

export function decideHandoff(result: ScheduledJobResult): HandoffDecision {
  if (result.outcome === "failed") {
    return { orderId: result.orderId, state: "attention_required", alertCaptured: false };
  }
  if (result.assetCount === 0) {
    return { orderId: result.orderId, state: "awaiting_seller_assets", alertCaptured: false };
  }
  if (!result.buyerUpdateSent) {
    return { orderId: result.orderId, state: "awaiting_buyer_update", alertCaptured: false };
  }
  if (!result.handoffReference) {
    return { orderId: result.orderId, state: "ready_for_handoff", alertCaptured: false };
  }
  return { orderId: result.orderId, state: "handed_off", alertCaptured: false };
}

export async function recordScheduledResult(
  body: unknown,
  captureFailure: CaptureFailure = infrai.errors.capture
): Promise<HandoffDecision> {
  const result = scheduledJobResultSchema.parse(body);
  const decision = decideHandoff(result);
  if (result.outcome !== "failed") return decision;

  await captureFailure(
    {
      name: "MarketplaceScheduledJobFailure",
      message: result.failureMessage,
      stage: result.stage,
      shopId: result.shopId,
      orderId: result.orderId,
      finishedAt: result.finishedAt
    },
    result.runId
  );
  return { ...decision, alertCaptured: true };
}
