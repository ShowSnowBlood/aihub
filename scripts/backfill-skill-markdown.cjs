"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var import_client = require("@prisma/client");
var import_node_fs = require("node:fs");
var import_node_path = __toESM(require("node:path"));
const prisma = new import_client.PrismaClient();
loadLocalEnv();
const DEFAULT_LIMIT = 500;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_TIMEOUT_MS = 15e3;
const USER_AGENT = "AIHub-Skill-Markdown-Backfill/1.0";
function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  return process.argv[index + 1] || fallback;
}
function hasFlag(name) {
  return process.argv.includes(name);
}
function toInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}
function parseEnvValue(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') || trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
function loadLocalEnv() {
  for (const fileName of [".env.local", ".env"]) {
    const filePath = import_node_path.default.join(process.cwd(), fileName);
    if (!(0, import_node_fs.existsSync)(filePath)) continue;
    const content = (0, import_node_fs.readFileSync)(filePath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = parseEnvValue(match[2]);
    }
  }
}
function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}
function parseJson(value) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}
function cleanText(value) {
  return String(value || "").replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}
function slugToken(value) {
  return cleanText(value).toLowerCase().replace(/\bc\+\+\b/g, "cpp").replace(/\bc#\b/g, "csharp").replace(/&/g, " and ").replace(/[^a-z0-9_:-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}
function normalizeGithubRepo(value) {
  const repo = String(value || "").trim().replace(/^https?:\/\/github\.com\//i, "").replace(/^git@github\.com:/i, "").replace(/^github\.com\//i, "").split(/[?#]/)[0].split("/").slice(0, 2).join("/").replace(/\.git$/i, "");
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) ? repo : "";
}
function githubRepoFromUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (!/^github\.com$/i.test(url.hostname)) return "";
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return "";
    return normalizeGithubRepo(`${parts[0]}/${parts[1]}`);
  } catch {
    return normalizeGithubRepo(value);
  }
}
function isGithubRepoHomeUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (!/^github\.com$/i.test(url.hostname)) return false;
    const parts = url.pathname.split("/").filter(Boolean);
    return parts.length === 2 && !url.hash;
  } catch {
    return false;
  }
}
function githubTargetFromUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (/^raw\.githubusercontent\.com$/i.test(url.hostname)) {
      const parts2 = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
      if (parts2.length < 4) return null;
      const sourcePath = parts2.slice(3).join("/");
      return {
        owner: parts2[0],
        repo: parts2[1],
        ref: parts2[2],
        filePath: skillMarkdownPathFromSourcePath(sourcePath)
      };
    }
    if (!/^github\.com$/i.test(url.hostname)) return null;
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const marker = parts.findIndex((part) => part === "blob" || part === "tree");
    if (marker < 0 || parts.length <= marker + 2) return null;
    const sourcePath = parts.slice(marker + 2).join("/");
    return {
      owner: parts[0],
      repo: parts[1],
      ref: parts[marker + 1],
      filePath: skillMarkdownPathFromSourcePath(sourcePath)
    };
  } catch {
    return null;
  }
}
function isSkillMarkdownPath(value) {
  return /(^|\/)skill\.md([?#].*)?$/i.test(String(value || "").trim());
}
function skillMarkdownPathFromSourcePath(value) {
  const sourcePath = String(value || "").split(/[?#]/)[0].replace(/\/+$/g, "");
  if (!sourcePath) return "SKILL.md";
  if (isSkillMarkdownPath(sourcePath)) return sourcePath;
  if (/\.md$/i.test(sourcePath)) {
    const dir = sourcePath.split("/").slice(0, -1).join("/");
    return dir ? `${dir}/SKILL.md` : "SKILL.md";
  }
  return `${sourcePath}/SKILL.md`;
}
function githubBlobUrl(repo, ref, filePath) {
  return `https://github.com/${repo}/blob/${encodeURIComponent(ref)}/${filePath.split("/").map(encodeURIComponent).join("/")}`;
}
function githubRawUrl(repo, ref, filePath) {
  return `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(ref)}/${filePath.split("/").map(encodeURIComponent).join("/")}`;
}
function contentsApiUrl(repo, ref, filePath) {
  return `https://api.github.com/repos/${repo}/contents/${filePath.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`;
}
function candidateTargets(row, raw) {
  const github = raw.github && typeof raw.github === "object" ? raw.github : {};
  const repo = normalizeGithubRepo(firstString(
    raw.originalRepo,
    github.originalRepo,
    raw.installRepo,
    github.installRepo,
    github.repo,
    raw.repo,
    raw.sourceRepo,
    raw.source,
    githubRepoFromUrl(row.downloadUrl),
    githubRepoFromUrl(row.homepageUrl),
    githubRepoFromUrl(row.githubUrl),
    githubRepoFromUrl(row.sourceUrl),
    githubRepoFromUrl(raw.githubUrl),
    githubRepoFromUrl(raw.repoUrl),
    githubRepoFromUrl(github.repoUrl)
  ));
  const defaultBranch = firstString(raw.branch, raw.defaultBranch, github.defaultBranch, "main");
  const skillPath = firstString(raw.skillMdPath, github.skillMdPath, github.skillPath, raw.file);
  const urls = [
    raw.skillMdUrl,
    raw.skillUrl,
    raw.githubUrl,
    github.skillMdUrl,
    github.url,
    row.sourceUrl && row.sourceUrl.includes("github.com") && !isGithubRepoHomeUrl(row.sourceUrl) ? row.sourceUrl : "",
    row.githubUrl && row.githubUrl.includes("github.com") && !isGithubRepoHomeUrl(row.githubUrl) ? row.githubUrl : ""
  ];
  const targets = [];
  for (const url of urls) {
    const target = githubTargetFromUrl(firstString(url));
    if (target) targets.push(target);
  }
  if (repo && skillPath) {
    const [owner, repoName] = repo.split("/");
    targets.push({
      owner,
      repo: repoName,
      ref: defaultBranch,
      filePath: skillMarkdownPathFromSourcePath(skillPath)
    });
  }
  const expanded = [];
  for (const target of targets) {
    const normalizedRepo = normalizeGithubRepo(`${target.owner}/${target.repo}`);
    if (!normalizedRepo || !target.filePath) continue;
    const refs = Array.from(new Set([target.ref, defaultBranch, "main", "master"].filter(Boolean)));
    const paths = /* @__PURE__ */ new Set([
      target.filePath,
      target.filePath.replace(/\/skill\.md$/i, "/SKILL.md")
    ]);
    const directoryMatch = target.filePath.match(/^(.*\/)([^/]+)\/SKILL\.md$/i);
    if (directoryMatch) {
      const base = directoryMatch[1];
      const dir = directoryMatch[2];
      const ownerPrefix = target.owner.split("-")[0];
      const repoPrefix = target.repo.replace(/^agent-/i, "").replace(/^ai-/i, "").replace(/-(agent-)?skills?$/i, "");
      for (const prefix of [ownerPrefix, repoPrefix].filter(Boolean)) {
        const stripped = dir.replace(new RegExp(`^${escapeRegExp(prefix)}-`, "i"), "");
        if (stripped && stripped !== dir) paths.add(`${base}${stripped}/SKILL.md`);
      }
    }
    for (const ref of refs) {
      for (const filePath of Array.from(paths)) {
        expanded.push({ owner: target.owner, repo: target.repo, ref, filePath });
      }
    }
  }
  const seen = /* @__PURE__ */ new Set();
  return expanded.filter((target) => {
    const key = `${target.owner}/${target.repo}@${target.ref}:${target.filePath}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function isGeneratedFallbackMarkdown(value) {
  const head = value.slice(0, 1200);
  return /^---\s*[\s\S]{0,260}\bname:\s*external-/i.test(head) || /^---\s*[\s\S]{0,800}\bsource:\s*https:\/\/github\.com\//i.test(head) && /\u6765\u81ea\s+[\w.-]+\/[\w.-]+\s+\u7684\u516c\u5f00\s+Skill/i.test(head);
}
function parseFrontMatterFields(markdown) {
  const match = markdown.match(/^---\s*\n([\s\S]*?)\n---/);
  const fields = {};
  if (!match) return fields;
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.+)$/);
    if (!field) continue;
    fields[field[1]] = field[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return fields;
}
function markdownToPlainText(markdown) {
  return markdown.replace(/^---[\s\S]*?\n---/, " ").replace(/```[\s\S]*?```/g, " ").replace(/~~~[\s\S]*?~~~/g, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, " ").replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/^#{1,6}\s+/gm, "").replace(/^[>*+-]\s+/gm, "");
}
function isUsefulParagraph(value) {
  const text = cleanText(value);
  const lower = text.toLowerCase();
  if (text.length < 20) return false;
  if (/^(installation|install|usage|quick start|getting started|license|contributing|table of contents|features?)$/i.test(text)) return false;
  if (lower.includes("shields.io") || lower.includes("badge") || lower.includes("sponsor")) return false;
  if (/^(npm|pnpm|yarn|pip|uv|git clone|docker|curl|wget)\s/i.test(text)) return false;
  if ((text.match(/\|/g) || []).length >= 4) return false;
  return true;
}
function extractSkillSummary(markdown) {
  const frontMatter = parseFrontMatterFields(markdown);
  const frontMatterDescription = cleanText(frontMatter.description).slice(0, 520);
  if (frontMatterDescription) return frontMatterDescription;
  const plain = markdownToPlainText(markdown);
  const firstParagraph = plain.split(/\n{2,}/).map((item) => cleanText(item)).find(isUsefulParagraph);
  return cleanText(firstParagraph).slice(0, 520);
}
function isMostlyChinese(value) {
  const chinese = value.match(/[\u4e00-\u9fff]/g)?.length || 0;
  const latin = value.match(/[A-Za-z]/g)?.length || 0;
  return chinese >= 12 && chinese >= latin * 0.18;
}
function isValidSkillMarkdown(markdown, summary) {
  if (!markdown || markdown.length < 40) return false;
  if (isGeneratedFallbackMarkdown(markdown)) return false;
  if (!summary || summary.length < 8) return false;
  const frontMatter = parseFrontMatterFields(markdown);
  if (frontMatter.name && frontMatter.description) return true;
  return /^#\s+.+/m.test(markdown) && /skill/i.test(markdown.slice(0, 2500));
}
function hasValidStoredMarkdown(raw) {
  const github = raw.github && typeof raw.github === "object" ? raw.github : {};
  const storedUrl = firstString(
    raw.skillMdUrl,
    raw.skillUrl,
    github.skillMdUrl,
    github.url
  );
  if (storedUrl && !isSkillMarkdownPath(storedUrl)) return false;
  const markdown = firstString(
    raw.skillMarkdown,
    raw.skill_markdown,
    raw.skillMdMarkdown,
    raw.markdown,
    github.skillMarkdown,
    github.skill_markdown,
    github.skillMdMarkdown
  );
  if (!markdown) return false;
  return isValidSkillMarkdown(markdown, extractSkillSummary(markdown));
}
function githubHeaders(accept = "application/vnd.github.raw") {
  const headers = {
    Accept: accept,
    "User-Agent": USER_AGENT,
    "X-GitHub-Api-Version": "2022-11-28"
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}
async function fetchText(url, accept, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: githubHeaders(accept),
      signal: controller.signal,
      cache: "no-store"
    });
    if (!response.ok) return "";
    const text = await response.text();
    if (accept.includes("github.raw")) return text.trim();
    const data = parseJson(text);
    const content = firstString(data.content);
    if (content && String(data.encoding || "").toLowerCase() === "base64") {
      return Buffer.from(content.replace(/\s+/g, ""), "base64").toString("utf8").trim();
    }
    return content || text.trim();
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}
async function fetchMarkdownForRow(row, raw, timeoutMs) {
  for (const target of candidateTargets(row, raw)) {
    if (!isSkillMarkdownPath(target.filePath)) continue;
    const repo = `${target.owner}/${target.repo}`;
    const apiUrl = contentsApiUrl(repo, target.ref, target.filePath);
    const apiText = await fetchText(apiUrl, "application/vnd.github.raw", timeoutMs);
    const summary = extractSkillSummary(apiText);
    if (isValidSkillMarkdown(apiText, summary)) {
      return {
        markdown: apiText,
        url: githubBlobUrl(repo, target.ref, target.filePath),
        rawUrl: githubRawUrl(repo, target.ref, target.filePath)
      };
    }
    const rawUrl = githubRawUrl(repo, target.ref, target.filePath);
    const directText = await fetchText(rawUrl, "text/plain, text/markdown, */*", timeoutMs);
    const directSummary = extractSkillSummary(directText);
    if (isValidSkillMarkdown(directText, directSummary)) {
      return {
        markdown: directText,
        url: githubBlobUrl(repo, target.ref, target.filePath),
        rawUrl
      };
    }
  }
  return null;
}
async function runWithConcurrency(items, concurrency, worker) {
  let index = 0;
  async function run() {
    while (index < items.length) {
      const current = index;
      index += 1;
      await worker(items[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
}
async function updateRow(row, result) {
  const raw = parseJson(row.rawData);
  const github = raw.github && typeof raw.github === "object" ? raw.github : {};
  const summary = extractSkillSummary(result.markdown);
  const frontMatter = parseFrontMatterFields(result.markdown);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const nameFromMarkdown = cleanText(frontMatter.name);
  const currentDescription = cleanText(row.description);
  const weakDescription = !currentDescription || slugToken(currentDescription) === slugToken(row.name) || /^external-/i.test(currentDescription) || /\u81ea\u52a8\u6c49\u5316\u6458\u8981|\u516c\u5f00\s+Skill|skills\.sh/i.test(currentDescription);
  await prisma.externalSkill.update({
    where: { id: row.id },
    data: {
      name: nameFromMarkdown || row.name,
      description: weakDescription ? summary : row.description,
      descriptionZh: isMostlyChinese(summary) ? summary : row.descriptionZh,
      sourceUrl: result.url,
      rawData: JSON.stringify({
        ...raw,
        name: nameFromMarkdown || raw.name,
        skillMdUrl: result.url,
        skillMdRawUrl: result.rawUrl,
        skillMdDescription: summary,
        skillMarkdown: result.markdown,
        skillMarkdownFetchedAt: now,
        frontMatter: Object.keys(frontMatter).length ? frontMatter : raw.frontMatter,
        github: {
          ...github,
          skillMdUrl: result.url,
          skillMdRawUrl: result.rawUrl,
          skillMdDescription: summary,
          skillMarkdownFetchedAt: now
        }
      })
    }
  });
}
async function main() {
  const limit = Math.max(1, toInt(arg("--limit"), DEFAULT_LIMIT));
  const concurrency = Math.max(1, Math.min(toInt(arg("--concurrency"), DEFAULT_CONCURRENCY), 12));
  const timeoutMs = Math.max(3e3, toInt(arg("--timeout-ms"), DEFAULT_TIMEOUT_MS));
  const sourceSlug = arg("--source");
  const minStars = Math.max(0, toInt(arg("--min-stars"), 0));
  const offset = Math.max(0, toInt(arg("--offset"), 0));
  const order = String(arg("--order", "priority") || "priority").toLowerCase();
  const refresh = hasFlag("--refresh");
  const where = {
    status: {
      notIn: ["ignored", "low_quality", "out_of_scope", "needs_source", "aggregated_source"]
    }
  };
  if (sourceSlug) where.sourceSlug = sourceSlug;
  if (minStars > 0) where.stars = { gte: minStars };
  const rows = await prisma.externalSkill.findMany({
    where,
    orderBy: order === "id" ? [{ id: "asc" }] : [{ stars: "desc" }, { downloads: "desc" }, { id: "asc" }],
    skip: offset,
    take: Math.min(Math.max(limit * 8, limit), 1e5),
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      descriptionZh: true,
      sourceSlug: true,
      sourceUrl: true,
      githubUrl: true,
      homepageUrl: true,
      downloadUrl: true,
      stars: true,
      downloads: true,
      rawData: true
    }
  });
  const queue = rows.filter((row) => refresh || !hasValidStoredMarkdown(parseJson(row.rawData))).slice(0, limit);
  let scanned = rows.length;
  let attempted = 0;
  let updated = 0;
  let failed = 0;
  const samples = [];
  await runWithConcurrency(queue, concurrency, async (row) => {
    attempted += 1;
    const raw = parseJson(row.rawData);
    try {
      const result = await fetchMarkdownForRow(row, raw, timeoutMs);
      if (!result) {
        failed += 1;
        if (samples.length < 20) samples.push({ id: row.id, name: row.name, sourceUrl: row.sourceUrl, error: "SKILL.md not found" });
        return;
      }
      await updateRow(row, result);
      updated += 1;
      if (samples.length < 20) {
        samples.push({
          id: row.id,
          name: row.name,
          sourceUrl: result.url,
          summary: extractSkillSummary(result.markdown).slice(0, 120)
        });
      }
      if (updated % 25 === 0) {
        console.log(JSON.stringify({ stage: "backfill-skill-markdown", attempted, updated, failed }));
      }
    } catch (error) {
      failed += 1;
      if (samples.length < 20) {
        samples.push({
          id: row.id,
          name: row.name,
          sourceUrl: row.sourceUrl,
          error: error instanceof Error ? error.message : "unknown error"
        });
      }
    }
  });
  const ready = await prisma.externalSkill.count({
    where: {
      ...where,
      rawData: {
        contains: "skillMarkdown"
      }
    }
  });
  console.log(JSON.stringify({
    ok: true,
    tokenUsed: Boolean(process.env.GITHUB_TOKEN),
    order,
    offset,
    scanned,
    queued: queue.length,
    attempted,
    updated,
    failed,
    readyWithStoredMarkdown: ready,
    samples
  }, null, 2));
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
