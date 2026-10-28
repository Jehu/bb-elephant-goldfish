/** Classify the persisted engine reasons, including runs created before this UI. */
export function reviewLimitLabel(reason: string | null | undefined): string {
  if (/^round limit\b/i.test(reason ?? "")) return "Round limit reached";
  if (/output limit/i.test(reason ?? "")) return "Output limit reached";
  if (/rate-limited|HTTP 429/i.test(reason ?? "")) return "Reviewer rate limit reached";
  if (/no answer within/i.test(reason ?? "")) return "Reviewer timed out";
  return "Review stopped at a limit";
}
