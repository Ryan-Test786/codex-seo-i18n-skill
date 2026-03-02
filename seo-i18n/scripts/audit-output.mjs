import fs from "fs";
import path from "path";
import process from "process";

const DEFAULT_SOURCE_LANG = "en";
const INVARIANT_KEYS = new Set(["keyword", "path", "route", "href", "image_url"]);

function parseArgs(argv) {
  const out = {
    sourceDir: "",
    targetDir: "",
    sourceLang: DEFAULT_SOURCE_LANG,
    langs: [],
    codes: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--source-dir" && argv[i + 1]) out.sourceDir = argv[++i];
    else if (a === "--target-dir" && argv[i + 1]) out.targetDir = argv[++i];
    else if (a === "--source-lang" && argv[i + 1]) out.sourceLang = argv[++i].toLowerCase();
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
    }
  }
  return out;
}

function usage() {
  console.log(
    "Usage: node audit-output.mjs --source-dir <dir> --target-dir <dir> --langs <lang1,lang2,...> [--codes <code1,code2,...>] [--source-lang en]"
  );
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getStemFromFilename(filename, sourceLang) {
  const pattern = new RegExp(`^(.+)-${escapeRegex(sourceLang)}\\.json$`);
  const m = filename.match(pattern);
  return m ? m[1].toLowerCase() : null;
}

function getCodeFromFilename(filename, sourceLang) {
  const stem = getStemFromFilename(filename, sourceLang);
  if (!stem) return null;
  return stem;
}

function listSourceFiles(dir, sourceLang) {
  const suffix = `-${sourceLang}.json`;
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(suffix))
    .map((f) => path.join(dir, f));
}

function replaceLangSuffix(filename, fromLang, toLang) {
  return filename.replace(
    new RegExp(`-${escapeRegex(fromLang)}\\.json$`),
    `-${toLang}.json`
  );
}

function readUtf8File(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return raw.replace(/^\uFEFF/, "");
}

function assertReadableDir(dir, flagName) {
  if (!dir) {
    throw new Error(`Missing required argument: ${flagName}`);
  }
  if (!fs.existsSync(dir)) {
    throw new Error(`Directory not found (${flagName}): ${dir}`);
  }
  const stat = fs.statSync(dir);
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory (${flagName}): ${dir}`);
  }
}

function compareInvariantValues(source, target, pointer = "$", issues = []) {
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
      compareInvariantValues(source[i], target[i], `${pointer}[${i}]`, issues);
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
      if (INVARIANT_KEYS.has(k) && typeof v === "string") {
        if (target[k] !== v) {
          issues.push(`${next}: invariant mismatch`);
        }
        continue;
      }
      compareInvariantValues(v, target[k], next, issues);
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.sourceDir || !args.targetDir || args.langs.length === 0) {
    usage();
    process.exit(1);
  }
  if (args.langs.includes(args.sourceLang)) {
    console.error(`Target langs cannot include source lang '${args.sourceLang}'.`);
    process.exit(1);
  }
  assertReadableDir(args.sourceDir, "--source-dir");
  assertReadableDir(args.targetDir, "--target-dir");

  const sourceFiles = listSourceFiles(args.sourceDir, args.sourceLang).filter((file) => {
    if (args.codes.length === 0) return true;
    const code = getCodeFromFilename(path.basename(file), args.sourceLang);
    return code && args.codes.includes(code);
  });
  if (sourceFiles.length === 0) {
    console.error(`No source files found in ${args.sourceDir} with suffix -${args.sourceLang}.json`);
    process.exit(1);
  }

  const issues = [];
  let expected = 0;
  let existing = 0;

  for (const srcPath of sourceFiles) {
    const srcName = path.basename(srcPath);
    const srcRaw = readUtf8File(srcPath);
    let srcJson;

    try {
      srcJson = JSON.parse(srcRaw);
    } catch (e) {
      issues.push(`[source-json] ${srcName}: ${e.message}`);
      continue;
    }

    for (const lang of args.langs) {
      expected += 1;
      const outName = replaceLangSuffix(srcName, args.sourceLang, lang);
      const outPath = path.join(args.targetDir, outName);

      if (!fs.existsSync(outPath)) {
        issues.push(`[missing] ${outName}`);
        continue;
      }
      existing += 1;

      const raw = readUtf8File(outPath);
      if (raw.trim().length === 0) {
        issues.push(`[empty] ${outName}`);
        continue;
      }
      if (raw.includes("\uFFFD")) {
        issues.push(`[encoding] ${outName}: replacement character detected`);
      }

      let outJson;
      try {
        outJson = JSON.parse(raw);
      } catch (e) {
        issues.push(`[json] ${outName}: ${e.message}`);
        continue;
      }

      const diff = compareInvariantValues(srcJson, outJson);
      for (const line of diff) {
        issues.push(`[invariant] ${outName}: ${line}`);
      }
    }
  }

  console.log(`source files: ${sourceFiles.length}`);
  console.log(`expected translated files: ${expected}`);
  console.log(`existing translated files: ${existing}`);
  console.log(`issues: ${issues.length}`);

  if (issues.length > 0) {
    for (const issue of issues) console.log(issue);
    process.exit(1);
  }

  console.log("audit passed");
}

main();
