import { z } from "zod";

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
export const targetSchema = z.object({
  projectId: id,
  specId: id,
  findingId: id.optional(),
  proposalId: id.optional(),
}).refine((target) => !(target.findingId && target.proposalId));
export type EgmTarget = z.infer<typeof targetSchema>;

export function targetPath(target: EgmTarget): string {
  const base = `${target.projectId}/${target.specId}`;
  return target.findingId ? `${base}/finding/${target.findingId}`
    : target.proposalId ? `${base}/proposal/${target.proposalId}` : base;
}

export function parseTargetPath(subPath: string): EgmTarget | null {
  const [projectId, specId, kind, itemId, ...extra] = subPath.split("/");
  if (extra.length || (kind !== undefined && !["finding", "proposal"].includes(kind)) || (kind && !itemId)) return null;
  const result = targetSchema.safeParse({ projectId, specId, ...(kind === "finding" ? { findingId: itemId } : {}), ...(kind === "proposal" ? { proposalId: itemId } : {}) });
  return result.success ? result.data : null;
}

export function egmLink(pluginId: string, target: EgmTarget) {
  const parsed = targetSchema.parse(target);
  const attributes = Object.entries(parsed).map(([key, value]) => `${key}="${value}"`).join(" ");
  return {
    url: `/plugins/${encodeURIComponent(pluginId)}/specs/${targetPath(parsed)}`,
    directive: `::egm-open{${attributes}}`,
  };
}
