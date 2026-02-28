import fs from "fs";
import path from "path";
import process from "process";
import { fileURLToPath } from "url";
import tencentcloud from "tencentcloud-sdk-nodejs-hunyuan";

const DEFAULT_MODEL = "hunyuan-translation-lite";
const DEFAULT_SOURCE_LANG = "en";
const SEP = "\n<<<SEP>>>\n";

const TRANSLATE_KEYS = new Set([
  "name",
  "title",
  "description",
  "subtitle",
  "heading",
  "detail",
  "text",
  "button_text",
  "image_alt",
  "alt",
]);

const TRANSLATE_ARRAY_KEYS = new Set(["list", "advantageList"]);
const SKIP_KEYS = new Set(["keyword", "path", "href", "image_url"]);
const SKIP_VALUE_PATTERNS = [/^https?:\/\//i, /^@\//, /^\//, /\.(webp|svg|png|jpg|jpeg)$/i];

function parseArgs(argv) {
  const out = {
    inputDir: "",
    outputDir: "",
    configPath: "",
    sourceLang: DEFAULT_SOURCE_LANG,
    model: DEFAULT_MODEL,
    langs: [],
    codes: [],
    force: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input-dir" && argv[i + 1]) out.inputDir = argv[++i];
    else if (a === "--output-dir" && argv[i + 1]) out.outputDir = argv[++i];
    else if (a === "--config" && argv[i + 1]) out.configPath = argv[++i];
    else if (a === "--source-lang" && argv[i + 1]) out.sourceLang = argv[++i].toLowerCase();
    else if (a === "--model" && argv[i + 1]) out.model = argv[++i];
    else if (a === "--langs" && argv[i + 1]) {
      out.langs = argv[++i]
        .split(",")
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean);
    } else if (a === "--codes" && argv[i + 1]) {
      out.codes = argv[++i]
        .split(",")
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean);
    } else if (a === "--force") out.force = true;
  }
  return out;
}

function usage() {
  console.log(
    "Usage: node translate-other-languages.mjs --input-dir <dir> --output-dir <dir> --langs <lang1,lang2,...> [--codes <code1,code2,...>] [--config <path>] [--source-lang en] [--model hunyuan-translation] [--force]"
  );
}

function resolveDefaultConfigPath() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const localPath = path.resolve(scriptDir, "..", "config.json");
  if (fs.existsSync(localPath)) return localPath;
  return path.resolve(process.cwd(), "skills", "seo-i18n", "config.json");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getStemFromFilename(filename, sourceLang) {
  const pattern = new RegExp(`^(.+)-${escapeRegex(sourceLang)}\\.json$`);
  const m = filename.match(pattern);
  return m ? m[1].toLowerCase() : null;
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

function shouldSkipValue(v) {
  return SKIP_VALUE_PATTERNS.some((re) => re.test(v));
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function listSourceFiles(inputDir, sourceLang) {
  const suffix = `-${sourceLang}.json`;
  return fs
    .readdirSync(inputDir)
    .filter((f) => f.endsWith(suffix))
    .map((f) => path.join(inputDir, f));
}

function collectTranslatables(obj, key = null, out = []) {
  if (typeof obj === "string") {
    if (key && TRANSLATE_KEYS.has(key) && !SKIP_KEYS.has(key) && !shouldSkipValue(obj)) {
      out.push(obj);
    }
    return out;
  }

  if (Array.isArray(obj)) {
    if (key && TRANSLATE_ARRAY_KEYS.has(key)) {
      for (const item of obj) {
        if (typeof item === "string" && !shouldSkipValue(item)) out.push(item);
      }
      return out;
    }
    for (const item of obj) collectTranslatables(item, null, out);
    return out;
  }

  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      collectTranslatables(v, k, out);
    }
  }
  return out;
}

function applyTranslations(obj, translatedMap, key = null) {
  if (typeof obj === "string") {
    if (key && TRANSLATE_KEYS.has(key) && !SKIP_KEYS.has(key) && !shouldSkipValue(obj)) {
      return translatedMap.get(obj) ?? obj;
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    if (key && TRANSLATE_ARRAY_KEYS.has(key)) {
      return obj.map((item) => {
        if (typeof item === "string" && !shouldSkipValue(item)) {
          return translatedMap.get(item) ?? item;
        }
        return item;
      });
    }
    return obj.map((item) => applyTranslations(item, translatedMap, null));
  }

  if (obj && typeof obj === "object") {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = applyTranslations(v, translatedMap, k);
    }
    return out;
  }

  return obj;
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

function getCodeFromFilename(filename, sourceLang) {
  const stem = getStemFromFilename(filename, sourceLang);
  if (!stem) return null;
  return stem;
}

function replaceLangSuffix(filename, fromLang, toLang) {
  return filename.replace(
    new RegExp(`-${escapeRegex(fromLang)}\\.json$`),
    `-${toLang}.json`
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.inputDir || !args.outputDir || args.langs.length === 0) {
    usage();
    process.exit(1);
  }

  const { secretId, secretKey, configPath } = loadCredentials(args.configPath);
  if (!secretId || !secretKey) {
    console.error(
      `Missing credentials. Fill config file: ${configPath} or set TENCENT_SECRET_ID/TENCENT_SECRET_KEY`
    );
    process.exit(1);
  }

  ensureDir(args.outputDir);

  const client = new tencentcloud.hunyuan.v20230901.Client({
    credential: { secretId, secretKey },
    region: "ap-guangzhou",
    profile: {
      httpProfile: { endpoint: "hunyuan.tencentcloudapi.com" },
    },
  });

  const sourceFiles = listSourceFiles(args.inputDir, args.sourceLang).filter((file) => {
    if (args.codes.length === 0) return true;
    const code = getCodeFromFilename(path.basename(file), args.sourceLang);
    return code && args.codes.includes(code);
  });

  console.log(`source files: ${sourceFiles.length}`);
  console.log(`target langs: ${args.langs.join(", ")}`);

  for (const file of sourceFiles) {
    const baseName = path.basename(file);
    const code = getCodeFromFilename(baseName, args.sourceLang);
    const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
    const json = JSON.parse(raw);
    const strings = collectTranslatables(json);

    for (const lang of args.langs) {
      const outName = replaceLangSuffix(baseName, args.sourceLang, lang);
      const outPath = path.join(args.outputDir, outName);

      if (!args.force && fs.existsSync(outPath)) {
        console.log(`[skip] ${outName}`);
        continue;
      }

      console.log(`[run] ${code} -> ${lang}`);
      const translatedMap = await translateBatch(
        client,
        strings,
        args.sourceLang,
        lang,
        args.model
      );
      const translated = applyTranslations(json, translatedMap);
      fs.writeFileSync(outPath, JSON.stringify(translated, null, 2) + "\n", "utf8");
      console.log(`[ok] ${outName}`);
    }
  }

  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
