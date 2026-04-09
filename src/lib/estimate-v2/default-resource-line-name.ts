import type { EstimateV2ResourceLine, ResourceLineType } from "@/types/estimate-v2";

const DEFAULT_RESOURCE_LINE_PREFIX: Record<ResourceLineType, string> = {
  material: "Material",
  tool: "Tool",
  labor: "Labor",
  subcontractor: "Subcontractor",
  other: "Overhead",
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function getDefaultResourceLinePrefix(type: ResourceLineType): string {
  return DEFAULT_RESOURCE_LINE_PREFIX[type];
}

export function buildDefaultResourceLineName(
  lines: ReadonlyArray<Pick<EstimateV2ResourceLine, "title" | "type">>,
  type: ResourceLineType,
): string {
  const prefix = getDefaultResourceLinePrefix(type);
  const pattern = new RegExp(`^${escapeRegex(prefix)} ([1-9]\\d*)$`);

  let maxSuffix = 0;
  lines.forEach((line) => {
    if (line.type !== type) return;
    const match = pattern.exec(line.title.trim());
    if (!match) return;
    const suffix = Number.parseInt(match[1] ?? "", 10);
    if (Number.isFinite(suffix)) {
      maxSuffix = Math.max(maxSuffix, suffix);
    }
  });

  return `${prefix} ${maxSuffix + 1}`;
}
