const DEFAULT_OWNER = "david-eskoundos";
const DEFAULT_REPO = "FrenchFlashCards";
const DEFAULT_BRANCH = "main";
const DEFAULT_PATH = "progress/david-progress.json";

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
}

function jsonResponse(body, status, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(env) }
  });
}

function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function decodeBase64(text) {
  const binary = atob(String(text || "").replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function githubHeaders(env) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "FrenchFlashCards-progress-sync"
  };
}

function progressUrl(env) {
  const owner = env.GITHUB_OWNER || DEFAULT_OWNER;
  const repo = env.GITHUB_REPO || DEFAULT_REPO;
  const filePath = env.PROGRESS_FILE_PATH || DEFAULT_PATH;
  return `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
}

async function readProgress(env) {
  const branch = env.GITHUB_BRANCH || DEFAULT_BRANCH;
  const response = await fetch(`${progressUrl(env)}?ref=${branch}`, { headers: githubHeaders(env) });
  if (!response.ok) return jsonResponse({ error: "GitHub read failed", status: response.status, detail: await response.text() }, response.status, env);
  const file = await response.json();
  return jsonResponse(JSON.parse(decodeBase64(file.content || "")), 200, env);
}

async function writeProgress(request, env) {
  const branch = env.GITHUB_BRANCH || DEFAULT_BRANCH;
  const payload = await request.json();
  const current = await fetch(`${progressUrl(env)}?ref=${branch}`, { headers: githubHeaders(env) });
  let sha = "";
  if (current.ok) sha = (await current.json()).sha || "";
  if (!current.ok && current.status !== 404) return jsonResponse({ error: "GitHub lookup failed", status: current.status, detail: await current.text() }, current.status, env);

  const body = {
    message: "chore: update david learning progress",
    branch,
    content: encodeBase64(JSON.stringify(payload, null, 2))
  };
  if (sha) body.sha = sha;

  const response = await fetch(progressUrl(env), {
    method: "PUT",
    headers: { ...githubHeaders(env), "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) return jsonResponse({ error: "GitHub write failed", status: response.status, detail: await response.text() }, response.status, env);
  return jsonResponse({ ok: true }, 200, env);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(env) });
    if (!env.GITHUB_TOKEN) return jsonResponse({ error: "Missing GITHUB_TOKEN secret" }, 500, env);

    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") return jsonResponse({ ok: true }, 200, env);
    if (url.pathname === "/progress" && request.method === "GET") return readProgress(env);
    if (url.pathname === "/progress" && request.method === "PUT") return writeProgress(request, env);
    return jsonResponse({ error: "Not found" }, 404, env);
  }
};
