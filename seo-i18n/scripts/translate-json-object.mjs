import fs from "fs";
import path from "path";
import process from "process";
import { fileURLToPath } from "url";
import tencentcloud from "tencentcloud-sdk-nodejs-hunyuan";

const DEFAULT_MODEL = "hunyuan-translation-lite";
const DEFAULT_SOURCE_LANG = "en";
const SEP = "\n<<<SEP>>>\n";

const DEFAULT_INVARIANT_KEYS = new Set([
  "keyword",
  "route",
  "path",
  "href",
  "image_url",
  "url",
  "uri",
  "slug",
  "src",
]);

const SKIP_VALUE_PATTERNS = [
  /^https?:\/\//i,
  /^@\//,
  /^\//,
  /\.(webp|svg|png|jpg|jpeg|gif|mp4|webm)$/i,
];

function parseArgs(argv) {
  const out = {
    inputFile: "",
    outputDir: "",
    configPath: "",
    sourceLang: DEFAULT_SOURCE_LANG,
    model: DEFAULT_MODEL,
    langs: [],
    code: "",
    invariantKeys: [],
    force: false,
    audit: true,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input-file" && argv[i + 1]) out.inputFile = argv[++i];
    else if (a === "--output-dir" && argv[i + 1]) out.outputDir = argv[++i];
    else if (a === "--config" && argv[i + 1]) out.configPath = argv[++i];
    else if (a === "--source-lang" && argv[i + 1]) out.sourceLang = argv[++i].toLowerCase();
    else if (a === "--model" && argv[i + 1]) out.model = argv[++i];
    else if (a === "--langs" && argv[i + 1]) {
      out.langs = argv[++i]
        .split(",")
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean);
    } else if (a === "--code" && argv[i + 1]) {
      out.code = argv[++i].trim();
    } else if (a === "--invariant-keys" && argv[i + 1]) {
      out.invariantKeys = argv[++i]
        .split(",")
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean);
    } else if (a === "--force") {
      out.force = true;
    } else if (a === "--no-audit") {
      out.audit = false;
    }
  }

  out.langs = Array.from(new Set(out.langs));
  out.invariantKeys = Array.from(new Set(out.invariantKeys));
  return out;
}

function usage() {
  console.log(
    "Usage: node translate-json-object.mjs --input-file <file> --output-dir <dir> --langs <lang1,lang2,...> [--source-lang en] [--code scenario] [--invariant-keys key1,key2] [--config <path>] [--model hunyuan-translation-lite] [--force] [--no-audit]"
  );
}

function resolveDefaultConfigPath() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const localPath = path.resolve(scriptDir, "..", "config.json");
  if (fs.existsSync(localPath)) return localPath;
  return path.resolve(process.cwd(), "skills", "seo-i18n", "config.json");
}

function assertReadableFile(filePath, flagName) {
  if (!filePath) throw new Error(`Missing required argument: ${flagName}`);
  if (!fs.existsSync(filePath)) throw new Error(`File not found (${flagName}): ${filePath}`);
  if (!fs.statSync(filePath).isFile()) throw new Error(`Not a file (${flagName}): ${filePath}`);
}

function ensureDir(dir, flagName) {
  if (!dir) throw new Error(`Missing required argument: ${flagName}`);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.statSync(dir).isDirectory()) throw new Error(`Not a directory (${flagName}): ${dir}`);
}

function loadCredentials(configPathArg) {
  const configPath = configPathArg ? path.resolve(configPathArg) : resolveDefaultConfigPath();
  let secretId = "";
  let secretKey = "";

  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, "utf8").replace(/^\uFEFF/, "");
    const json = JSON.parse(raw);
    secretId = (json.TENCENT_SECRET_ID || "").trim();
    secretKey = (json.TENCENT_SECRET_KEY || "").trim();
  }

  if (!secretId) secretId = (process.env.TENCENT_SECRET_ID || "").trim();
  if (!secretKey) secretKey = (process.env.TENCENT_SECRET_KEY || "").trim();

  return { secretId, secretKey, configPath };
}

function isInvariantKey(key, invariantKeys) {
  if (!key) return false;
  const normalized = String(key).toLowerCase();
  if (invariantKeys.has(normalized)) return true;
  if (/(^|_)(url|uri|path|href|route|slug|src)$/.test(normalized)) return true;
  return false;
}

function shouldSkipValue(v) {
  return SKIP_VALUE_PATTERNS.some((re) => re.test(v));
}

function shouldTranslateString(value, key, invariantKeys) {
  if (typeof value !== "string") return false;
  if (!value.trim()) return false;
  if (isInvariantKey(key, invariantKeys)) return false;
  if (shouldSkipValue(value)) return false;
  return true;
}

function collectTranslatables(node, key = null, invariantKeys, out = []) {
  if (typeof node === "string") {
    if (shouldTranslateString(node, key, invariantKeys)) out.push(node);
    return out;
  }

  if (Array.isArray(node)) {
    for (const item of node) collectTranslatables(item, key, invariantKeys, out);
    return out;
  }

  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      collectTranslatables(v, k, invariantKeys, out);
    }
  }

  return out;
}

function applyTranslations(node, translatedMap, key = null, invariantKeys) {
  if (typeof node === "string") {
    if (shouldTranslateString(node, key, invariantKeys)) {
      return translatedMap.get(node) ?? node;
    }
    return node;
  }

  if (Array.isArray(node)) {
    return node.map((item) => applyTranslations(item, translatedMap, key, invariantKeys));
  }

  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      out[k] = applyTranslations(v, translatedMap, k, invariantKeys);
    }
    return out;
  }

  return node;
}

function isRetryableError(err) {
  const code = err?.code || "";
  const message = err?.message || "";
  return code === "InternalError" || /internal error/i.test(message) || /内部错误/.test(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callWithRetry(fn, label, maxAttempts = 4) {
  let attempt = 0;
  while (attempt < maxAttempts) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      if (attempt >= maxAttempts || !isRetryableError(err)) throw err;
      const wait = 1000 * Math.pow(2, attempt - 1);
      console.warn(`[retry] ${label}: attempt ${attempt}/${maxAttempts}, wait ${wait}ms`);
      await sleep(wait);
    }
  }
  throw new Error(`Unexpected retry exit: ${label}`);
}

async function translateBatch(client, texts, source, target, model) {
  const uniq = Array.from(new Set(texts));
  const out = new Map();
  const chunkSize = 20;

  for (let i = 0; i < uniq.length; i += chunkSize) {
    const chunk = uniq.slice(i, i + chunkSize);
    const payload = chunk.join(SEP);
    const params = {
      Model: model,
      Stream: false,
      Text: payload,
      Source: source,
      Target: target,
    };

    const resp = await callWithRetry(() => client.ChatTranslations(params), `batch-${target}`);
    const content = resp?.Choices?.[0]?.Message?.Content ?? "";
    const parts = content.split(SEP);

    if (parts.length !== chunk.length) {
      for (const one of chunk) {
        const singleResp = await callWithRetry(
          () =>
            client.ChatTranslations({
              Model: model,
              Stream: false,
              Text: one,
              Source: source,
              Target: target,
            }),
          `single-${target}`
        );
        out.set(one, singleResp?.Choices?.[0]?.Message?.Content ?? one);
      }
      continue;
    }

    for (let j = 0; j < chunk.length; j++) {
      out.set(chunk[j], parts[j]);
    }
  }

  return out;
}

function deriveCode(inputPath, sourceLang, overrideCode) {
  if (overrideCode) return overrideCode;
  const file = path.basename(inputPath, ".json");
  const suffix = `-${sourceLang}`;
  if (file.toLowerCase().endsWith(suffix.toLowerCase())) {
    return file.slice(0, file.length - suffix.length);
  }
  return file;
}

function compareInvariantValues(source, target, pointer = "$", issues = [], invariantKeys) {
  if (Array.isArray(source)) {
    if (!Array.isArray(target)) {
      issues.push(`${pointer}: target type mismatch (expected array)`);
      return issues;
    }
    if (target.length !== source.length) {
      issues.push(`${pointer}: array length mismatch (expected ${source.length}, got ${target.length})`);
    }
    const len = Math.min(source.length, target.length);
    for (let i = 0; i < len; i++) {
      compareInvariantValues(source[i], target[i], `${pointer}[${i}]`, issues, invariantKeys);
    }
    return issues;
  }

  if (source && typeof source === "object") {
    if (!target || typeof target !== "object" || Array.isArray(target)) {
      issues.push(`${pointer}: target type mismatch (expected object)`);
      return issues;
    }

    for (const [k, v] of Object.entries(source)) {
      const next = `${pointer}.${k}`;
      if (!(k in target)) {
        issues.push(`${next}: missing key in target`);
        continue;
      }
      if (isInvariantKey(k, invariantKeys) && typeof v === "string") {
        if (target[k] !== v) {
          issues.push(`${next}: invariant mismatch`);
        }
        continue;
      }
      compareInvariantValues(v, target[k], next, issues, invariantKeys);
    }
    for (const k of Object.keys(target)) {
      if (!(k in source)) {
        issues.push(`${pointer}.${k}: unexpected key in target`);
      }
    }
    return issues;
  }

  const sourceType = source === null ? "null" : typeof source;
  const targetType = target === null ? "null" : typeof target;
  if (sourceType !== targetType) {
    issues.push(`${pointer}: target type mismatch (expected ${sourceType}, got ${targetType})`);
  }
  return issues;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.inputFile || !args.outputDir || args.langs.length === 0) {
    usage();
    process.exit(1);
  }
  if (args.langs.includes(args.sourceLang)) {
    console.error(`Target langs cannot include source lang '${args.sourceLang}'.`);
    process.exit(1);
  }

  assertReadableFile(args.inputFile, "--input-file");
  ensureDir(args.outputDir, "--output-dir");

  const { secretId, secretKey, configPath } = loadCredentials(args.configPath);
  if (!secretId || !secretKey) {
    console.error(
      `Missing credentials. Fill config file: ${configPath} or set TENCENT_SECRET_ID/TENCENT_SECRET_KEY`
    );
    process.exit(1);
  }

  const raw = fs.readFileSync(args.inputFile, "utf8").replace(/^\uFEFF/, "");
  let sourceJson;
  try {
    sourceJson = JSON.parse(raw);
  } catch (err) {
    console.error(`Invalid JSON in input file '${args.inputFile}': ${err.message}`);
    process.exit(1);
  }

  const invariantKeys = new Set([...DEFAULT_INVARIANT_KEYS, ...args.invariantKeys]);
  const code = deriveCode(args.inputFile, args.sourceLang, args.code);
  const strings = collectTranslatables(sourceJson, null, invariantKeys);
  if (strings.length === 0) {
    console.log("[warn] no translatable strings found; outputs will mirror source content");
  }

  const client = new tencentcloud.hunyuan.v20230901.Client({
    credential: { secretId, secretKey },
    region: "ap-guangzhou",
    profile: {
      httpProfile: { endpoint: "hunyuan.tencentcloudapi.com" },
    },
  });

  const cachesByLang = new Map();
  console.log(`source file: ${path.basename(args.inputFile)}`);
  console.log(`target langs: ${args.langs.join(", ")}`);

  for (const lang of args.langs) {
    const outName = `${code}-${lang}.json`;
    const outPath = path.join(args.outputDir, outName);

    if (!args.force && fs.existsSync(outPath)) {
      console.log(`[skip] ${outName}`);
      continue;
    }

    const langCache = cachesByLang.get(lang) || new Map();
    const missing = Array.from(new Set(strings)).filter((text) => !langCache.has(text));
    if (missing.length > 0) {
      const translatedMap = await translateBatch(
        client,
        missing,
        args.sourceLang,
        lang,
        args.model
      );
      for (const [k, v] of translatedMap.entries()) langCache.set(k, v);
    }
    cachesByLang.set(lang, langCache);

    const translated = applyTranslations(sourceJson, langCache, null, invariantKeys);
    if (args.audit) {
      const issues = compareInvariantValues(sourceJson, translated, "$", [], invariantKeys);
      if (issues.length > 0) {
        throw new Error(
          `Audit failed for ${outName}: ${issues.length} issue(s)\n${issues
            .slice(0, 20)
            .map((v) => `- ${v}`)
            .join("\n")}`
        );
      }
    }
    fs.writeFileSync(outPath, JSON.stringify(translated, null, 2) + "\n", "utf8");
    console.log(`[ok] ${outName}`);
  }

  if (args.audit) {
    console.log("audit passed");
  }
  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
