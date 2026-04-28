import type { EstimateV2ResourceLine, ResourceLineType } from "@/types/estimate-v2";

const DEFAULT_RESOURCE_LINE_PREFIX: Record<ResourceLineType, string> = {
  material: "Material",
  tool: "Tool",
  labor: "Labor",
  subcontractor: "Subcontractor",
  overhead: "Overhead",
  other: "Other",
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function getDefaultResourceLinePrefix(type: ResourceLineType): string {
  return DEFAULT_RESOURCE_LINE_PREFIX[type];
}

/**
 * Build the default auto-name for a new resource line.
 *
 * @param lines       All sibling resource lines.
 * @param type        Resource type.
 * @param options.prefix
 *   Display prefix to use when generating the new name (e.g. locale-specific
 *   "Материал"). Defaults to the English canonical prefix.
 * @param options.detectPrefixes
 *   Additional prefixes to consider "already counted" when scanning existing
 *   lines. Used to keep numbering coherent when the user switches language —
 *   a project with "Material 1" + "Материал 1" still increments to 2 rather
 *   than colliding. Defaults to `[prefix]`.
 */
export function buildDefaultResourceLineName(
  lines: ReadonlyArray<Pick<EstimateV2ResourceLine, "title" | "type">>,
  type: ResourceLineType,
  options?: { prefix?: string; detectPrefixes?: readonly string[] },
): string {
  const prefix = options?.prefix ?? getDefaultResourceLinePrefix(type);
  const detectPrefixes =
    options?.detectPrefixes && options.detectPrefixes.length > 0
      ? options.detectPrefixes
      : [prefix];
  const patterns = detectPrefixes.map(
    (p) => new RegExp(`^${escapeRegex(p)} ([1-9]\\d*)$`),
  );

  let maxSuffix = 0;
  lines.forEach((line) => {
    if (line.type !== type) return;
    const trimmed = line.title.trim();
    for (const pattern of patterns) {
      const match = pattern.exec(trimmed);
      if (!match) continue;
      const suffix = Number.parseInt(match[1] ?? "", 10);
      if (Number.isFinite(suffix)) {
        maxSuffix = Math.max(maxSuffix, suffix);
      }
      break;
    }
  });

  return `${prefix} ${maxSuffix + 1}`;
}
