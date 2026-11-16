import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const CI_YML = readFileSync(resolve(__dirname, "../../.forgejo/workflows/ci.yml"), "utf8");

function extractShellFunction(source: string, name: string): string {
  const lines = source.split("\n");
  const start = lines.findIndex((line) => line.trim() === `${name}() {`);
  if (start === -1) throw new Error(`${name} is not defined in ci.yml`);
  const indent = lines[start].match(/^\s*/)?.[0] ?? "";
  const end = lines.findIndex((line, i) => i > start && line === `${indent}}`);
  if (end === -1) throw new Error(`${name} has no closing brace in ci.yml`);
  return lines
    .slice(start, end + 1)
    .map((line) => (line.startsWith(indent) ? line.slice(indent.length) : line))
    .join("\n");
}

let server: Server | undefined;

afterEach(async () => {
  await new Promise<void>((done) => (server ? server.close(() => done()) : done()));
  server = undefined;
});

async function serveLastModified(
  pick: (requestNumber: number) => string | null,
  respond: (requestNumber: number) => number | "drop" = () => 200,
): Promise<string> {
  let requests = 0;
  server = createServer((req, res) => {
    requests += 1;
    const answer = respond(requests);
    if (answer === "drop") {
      req.socket.destroy();
      return;
    }
    const lastModified = pick(requests);
    if (lastModified) res.setHeader("Last-Modified", lastModified);
    res.statusCode = answer;
    res.end("ok");
  });
  await new Promise<void>((done) => server!.listen(0, "127.0.0.1", () => done()));
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}/`;
}

function runAwait(url: string, startedAt: number): Promise<{ code: number; stderr: string }> {
  const script = `set -euo pipefail\n${extractShellFunction(CI_YML, "await_staging_flip")}\nawait_staging_flip\n`;
  return new Promise((done) => {
    execFile(
      "bash",
      ["-c", script],
      {
        env: {
          ...process.env,
          COMMIT_SHA: "0123456789abcdef0123456789abcdef01234567",
          TIMEWEB_APP_ID: "236591",
          STAGING_URL: url,
          DEPLOY_STARTED_AT: String(startedAt),
          STAGING_FLIP_TIMEOUT: "2",
          STAGING_FLIP_INTERVAL: "1",
        },
      },
      (error, _stdout, stderr) => done({ code: error ? Number(error.code ?? 1) : 0, stderr }),
    );
  });
}

const httpDate = (epochSeconds: number) => new Date(epochSeconds * 1000).toUTCString();

describe("deploy-staging job", () => {
  it("waits for staging to serve the new build before reporting success", () => {
    const acceptedBranch = CI_YML.split("\n").find((line) => line.trim().startsWith("2*)"));
    expect(acceptedBranch).toBeDefined();
    expect(acceptedBranch).toContain("await_staging_flip");
    expect(acceptedBranch).not.toMatch(/2\*\)[^;]*;\s*exit 0\s*;;/);
    expect(CI_YML).toMatch(/DEPLOY_STARTED_AT=\$\(date \+%s\)\n\s*code=\$\(curl [^\n]*\n[^\n]*-X POST/);
  });

  it("fails when staging keeps serving a build older than the deploy", async () => {
    const startedAt = Math.floor(Date.now() / 1000);
    const url = await serveLastModified(() => httpDate(startedAt - 86_400));
    const result = await runAwait(url, startedAt);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("не сменил сборку");
    expect(result.stderr).not.toContain("unbound variable");
  });

  it("fails when staging sends no Last-Modified at all", async () => {
    const startedAt = Math.floor(Date.now() / 1000);
    const url = await serveLastModified(() => null);
    const result = await runAwait(url, startedAt);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Last-Modified: 'нет'");
    expect(result.stderr).not.toMatch(/integer expression|unbound variable/);
  });

  it("says the site is unreachable instead of stale when curl cannot connect", async () => {
    const startedAt = Math.floor(Date.now() / 1000);
    const url = await serveLastModified(() => null);
    await new Promise<void>((done) => server!.close(() => done()));
    server = undefined;
    const result = await runAwait(url, startedAt);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("недоступен с раннера");
    expect(result.stderr).not.toContain("не сменил сборку");
  });

  it("reports a stale build, not an unreachable site, when only later polls fail", async () => {
    const startedAt = Math.floor(Date.now() / 1000);
    const url = await serveLastModified(
      () => httpDate(startedAt - 86_400),
      (n) => (n === 1 ? 200 : "drop"),
    );
    const result = await runAwait(url, startedAt);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("не сменил сборку");
    expect(result.stderr).not.toContain("недоступен с раннера");
  });

  it("reports a stale build when the first poll fails and later polls answer", async () => {
    const startedAt = Math.floor(Date.now() / 1000);
    const url = await serveLastModified(
      () => httpDate(startedAt - 86_400),
      (n) => (n === 1 ? "drop" : 200),
    );
    const result = await runAwait(url, startedAt);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("не сменил сборку");
    expect(result.stderr).not.toContain("недоступен с раннера");
  });

  it("names the HTTP status when the site answers with an error", async () => {
    const startedAt = Math.floor(Date.now() / 1000);
    const url = await serveLastModified(() => null, () => 503);
    const result = await runAwait(url, startedAt);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/последний ответ: 'HTTP\/1\.1 503/);
  });

  it("succeeds once Last-Modified reaches the deploy time", async () => {
    const startedAt = Math.floor(Date.now() / 1000);
    const url = await serveLastModified((n) => httpDate(n === 1 ? startedAt - 60 : startedAt));
    expect((await runAwait(url, startedAt)).code).toBe(0);
  });
});
