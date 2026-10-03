/**
 * Release identifier baked into the bundle for Sentry release tagging
 * (`__APP_RELEASE__`, see ./sentry.ts). Runs at BUILD time from vite.config.ts;
 * kept free of Node imports so the decision is a pure function under test.
 */

/**
 * Env vars carrying a commit SHA, in precedence order. VITE_COMMIT_SHA is ours
 * (set it explicitly in a build environment without .git); the rest are names
 * build platforms commonly inject on their own.
 */
const COMMIT_SHA_ENV_VARS = [
  "VITE_COMMIT_SHA",
  "GITHUB_SHA",
  "CI_COMMIT_SHA",
  "SOURCE_COMMIT",
  "GIT_COMMIT",
] as const;

export interface AppReleaseSources {
  env: Record<string, string | undefined>;
  /** `git rev-parse --short HEAD`. May throw. */
  gitShortSha: () => string;
  warn: (message: string) => void;
}

/**
 * Normalizes a full 40-char SHA to the 7-char form `git rev-parse --short`
 * emits, so the same commit is one release whichever source named it.
 * Anything that is not a full SHA is passed through untouched.
 */
function shortenSha(value: string): string {
  return /^[0-9a-f]{40}$/i.test(value) ? value.slice(0, 7) : value;
}

/**
 * Never throws: a missing SHA must not fail the build. It is loud instead,
 * so the build log says why no commit could be read.
 *
 * The fallback stays the constant "unknown": this value is compiled into the
 * bundle, so it must not differ between two builds of the same commit. The
 * per-build label goes into index.html instead, see `releaseLabel`.
 */
export function resolveAppRelease({ env, gitShortSha, warn }: AppReleaseSources): string {
  for (const name of COMMIT_SHA_ENV_VARS) {
    const fromEnv = env[name]?.trim();
    if (fromEnv) return shortenSha(fromEnv);
  }
  let reason: string;
  try {
    const sha = gitShortSha().trim();
    if (sha) return sha;
    reason = "`git rev-parse` returned an empty string";
  } catch (error) {
    reason = error instanceof Error ? error.message : String(error);
  }
  warn(
    `[build] release SHA unresolved — this build is labelled by its build time instead of a commit. ` +
      `Set VITE_COMMIT_SHA in the build environment. Reason: ${reason}`,
  );
  return "unknown";
}

/** Name of the `<meta>` the build writes into index.html. */
export const RELEASE_META_NAME = "rovno-release";

/**
 * What the build writes into index.html: the release itself, or the minute of
 * the build when no SHA could be resolved, so that two deploys are still two
 * releases. index.html is the one build output without a content hash in its
 * name, which is why a per-build value can live there.
 */
export function releaseLabel(release: string, builtAt: Date): string {
  if (release !== "unknown") return release;
  const stamp = builtAt.toISOString().slice(0, 16).replace(/[-:]/g, "");
  return `build-${stamp}Z`;
}

/** The slice of `Document` read below; this file is also compiled without DOM types. */
interface MetaLookup {
  querySelector(selector: string): { getAttribute(name: string): string | null } | null;
}

/** Runtime side: the document's label, else the value baked into the bundle. */
export function releaseFromDocument(
  doc: MetaLookup | undefined,
  baked: string,
): string {
  const label = doc
    ?.querySelector(`meta[name="${RELEASE_META_NAME}"]`)
    ?.getAttribute("content")
    ?.trim();
  return label || baked;
}
