import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";

const SOURCE_EXTENSIONS = new Set([".cjs", ".go", ".java", ".js", ".jsx", ".mjs", ".php", ".py", ".rb", ".ts", ".tsx"]);
const IGNORED_DIRS = new Set([
  ".git", ".next", ".nuxt", ".turbo", ".venv", "__pycache__", "build", "coverage",
  "dist", "node_modules", "out", "vendor",
]);
const MAX_FILES = 400;
const MAX_FILE_BYTES = 750_000;
const MAX_DEPTH = 9;
const PAYMENT_HINT = /paypal|payment|payments|webhook|checkout|capture|refund|stripe|invoice/i;

const CHECKS = [
  {
    id: "provider-signature",
    title: "Provider signature verification",
    patterns: [
      /\bverify-webhook-signature\b/i,
      /\bverifyWebhookSignature\b/i,
      /\bverifyWebhook\b/i,
      /\bconstructEvent\b/i,
      /\bpaypal-auth-algo\b/i,
    ],
  },
  {
    id: "idempotency",
    title: "Idempotency and duplicate delivery",
    patterns: [
      /\bidempotenc(?:y|e|t)\b/i,
      /\bprocessedEvents?\b/i,
      /\bwebhookEvents?\b/i,
      /\beventId\b.{0,80}\b(has|includes|contains|insert|unique)\b/i,
      /\bunique\b.{0,60}\b(event|webhook|payment)\b/i,
    ],
  },
  {
    id: "amount-reconciliation",
    title: "Amount and currency reconciliation",
    patterns: [
      /\bamount\b.{0,100}\b(compare|match|equal|===|!==|reconcil|expected|order)\b/i,
      /\b(compare|match|reconcil|expected)\b.{0,100}\bamount\b/i,
      /\bcurrency(_code)?\b.{0,100}\b(compare|match|equal|===|reconcil|expected)\b/i,
    ],
  },
  {
    id: "replay-window",
    title: "Replay and timestamp window",
    patterns: [
      /\breplayWindow\b/i,
      /\b(timestamp|transmission_time|created_at)\b.{0,100}\b(Date\.now|Date\(|time|window|older|stale|expiry|expires)\b/i,
      /\b(stale|replay|expired|expiration)\b.{0,100}\b(timestamp|event|webhook|window)\b/i,
    ],
  },
  {
    id: "payment-state",
    title: "Payment status validation",
    patterns: [
      /\bstatus\b.{0,100}\b(COMPLETED|CAPTURED|APPROVED|SUCCESS)\b/i,
      /\b(COMPLETED|CAPTURED|APPROVED|SUCCESS)\b.{0,100}\bstatus\b/i,
      /\b(payment|capture|order)\b.{0,100}\b(status|state)\b/i,
    ],
  },
];

function inside(root, candidate) {
  const rel = relative(root, candidate);
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(".." + sep));
}

export function resolveWorkspacePath(subpath = ".") {
  const configuredRoot = process.env.REDTEAM_PAY_WORKSPACE || process.cwd();
  const workspaceRoot = realpathSync(resolve(configuredRoot));
  if (typeof subpath !== "string" || subpath.length > 500 || isAbsolute(subpath)) {
    throw new Error("Choose a relative folder inside the IDE workspace.");
  }
  const requestedPath = resolve(workspaceRoot, subpath || ".");
  const targetPath = realpathSync(requestedPath);
  if (!inside(workspaceRoot, targetPath)) {
    throw new Error("The requested folder is outside the IDE workspace.");
  }
  if (!statSync(targetPath).isDirectory()) {
    throw new Error("The requested workspace path is not a folder.");
  }
  return { workspaceRoot, targetPath };
}

export function scanProject(subpath = ".") {
  const { workspaceRoot, targetPath } = resolveWorkspacePath(subpath);
  const candidatePaths = [];
  const scannedFiles = [];
  const paymentFiles = [];
  const checks = CHECKS.map((check) => ({ ...check, evidence: [] }));
  const limited = { files: false, depth: false };

  function walk(directory, depth = 0) {
    if (depth > MAX_DEPTH) {
      limited.depth = true;
      return;
    }
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) walk(join(directory, entry.name), depth + 1);
        continue;
      }
      if (!entry.isFile() || !SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
      if (candidatePaths.length >= MAX_FILES) {
        limited.files = true;
        return;
      }
      candidatePaths.push(join(directory, entry.name));
    }
  }

  walk(targetPath);
  for (const filePath of candidatePaths) {
    let content;
    try {
      if (statSync(filePath).size > MAX_FILE_BYTES) continue;
      content = readFileSync(filePath, "utf8");
    } catch {
      continue;
    }
    scannedFiles.push(filePath);
    if (!PAYMENT_HINT.test(content)) continue;

    const rootRelative = relative(workspaceRoot, filePath);
    const fileRelative = relative(targetPath, filePath);
    const displayPath = subpath && subpath !== "."
      ? join(subpath, fileRelative)
      : rootRelative;
    paymentFiles.push(displayPath);
    const lines = content.split(/\r?\n/);

    for (const check of checks) {
      for (let index = 0; index < lines.length; index += 1) {
        if (!check.patterns.some((pattern) => pattern.test(lines[index]))) continue;
        check.evidence.push({ file: displayPath, line: index + 1 });
        if (check.evidence.length >= 12) break;
      }
    }
  }

  return {
    workspace: subpath || ".",
    scannedSourceFiles: scannedFiles.length,
    paymentRelatedFiles: paymentFiles.length,
    paymentFiles: paymentFiles.slice(0, 30),
    limits: {
      maxSourceFiles: MAX_FILES,
      maxFileBytes: MAX_FILE_BYTES,
      maxDepth: MAX_DEPTH,
      fileLimitReached: limited.files,
      depthLimitReached: limited.depth,
    },
    checks: checks.map(({ id, title, evidence }) => ({
      id,
      control: title,
      status: evidence.length ? "possible-indicator-found" : "not-detected",
      evidence,
      note: "Heuristic only; inspect the cited code before deciding whether the control is effective.",
    })),
    note: "This read-only scan reports code indicators, not a security certification. It does not execute or modify the project.",
  };
}
