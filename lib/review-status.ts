import type { RunState } from "../server/contract.ts";
import { reviewLimitLabel } from "./review-limit.ts";

const LABEL: Record<RunState, string> = {
  running: "Running",
  awaiting_decisions: "Waiting for your decisions",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  limit_reached: "Review stopped at a limit",
  stale: "Review outdated",
  unknown: "Unknown",
};

export function reviewStatusLabel(state: RunState, reason?: string | null): string {
  if (state === "limit_reached") return reviewLimitLabel(reason);
  if (state === "stale") {
    switch (reason) {
      case "Checkout assigned after migration; start a fresh review.":
        return "Review outdated: checkout assigned";
      case "superseded by a new review":
        return "Superseded by a new review";
      case "the document changed during the review":
      case "the document changed during the review; the remaining stages did not run":
      case "the document changed before the next round; start a fresh review":
        return "Stopped: document changed";
      case "document changed by an ad hoc proposal; a fresh review is scheduled":
        return "Document changed: new review scheduled";
    }
  }
  return LABEL[state];
}
