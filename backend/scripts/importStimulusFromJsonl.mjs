import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

function usage() {
  console.log(`
Usage:
  node backend/scripts/importStimulusFromJsonl.mjs --root "<local out dir>" [--table affect-exp-stimulus] [--version v1]

Example:
  node backend/scripts/importStimulusFromJsonl.mjs \\
    --root "/Users/bsutcliffe/Replication Dropbox/Bianca Sutcliffe/Mac/Documents/Code/year_1/7_the_experiment/text_generation/out" \\
    --table "affect-exp-stimulus" \\
    --version "v1"
`);
}

function parseArgs(argv) {
  const args = {
    root: "",
    table: process.env.STIMULUS_TABLE || "affect-exp-stimulus",
    version: "v1"
  };

  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    const n = argv[i + 1];
    if (a === "--root" && n) {
      args.root = n;
      i += 1;
      continue;
    }
    if (a === "--table" && n) {
      args.table = n;
      i += 1;
      continue;
    }
    if (a === "--version" && n) {
      args.version = n;
      i += 1;
      continue;
    }
    if (a === "--help" || a === "-h") {
      usage();
      process.exit(0);
    }
  }

  if (!args.root) {
    usage();
    throw new Error("Missing --root");
  }

  return args;
}

async function findAcceptedJsonlFiles(rootDir) {
  const out = [];

  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name === ".DS_Store") continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
        continue;
      }
      if (e.isFile() && e.name === "accepted.jsonl") out.push(full);
    }
  }

  await walk(rootDir);
  return out.sort();
}

function deriveCategory(filePath, rootDir, parsed) {
  const fromJson = parsed?.controls?.layer1_dimension
    && parsed?.controls?.layer1_direction
    && parsed?.controls?.layer3_relation
    ? `${parsed.controls.layer1_dimension}_${parsed.controls.layer1_direction}_${String(parsed.controls.layer3_relation).toLowerCase()}`
    : "";

  if (fromJson) return fromJson;

  const rel = path.relative(rootDir, filePath);
  const parts = rel.split(path.sep);
  return parts.length > 1 ? parts[0] : "uncategorized";
}

function toStimulusItem(filePath, rootDir, row, version) {
  const stimulus = row?.stimulus;
  if (!stimulus || typeof stimulus !== "object") return null;
  if (typeof stimulus.stim_id !== "string" || stimulus.stim_id.length === 0) return null;
  if (typeof stimulus.text !== "string" || stimulus.text.trim().length === 0) return null;

  const category = deriveCategory(filePath, rootDir, row);

  return {
    stimulus_id: stimulus.stim_id,
    text: stimulus.text.trim(),
    category,
    version,
    active: true,
    s3_key: null,
    source_path: path.relative(rootDir, filePath),
    created_at_utc: stimulus.created_at || new Date().toISOString()
  };
}

async function main() {
  const { root, table, version } = parseArgs(process.argv);
  const rootStats = await stat(root).catch(() => null);
  if (!rootStats || !rootStats.isDirectory()) {
    throw new Error(`--root is not a directory: ${root}`);
  }

  const files = await findAcceptedJsonlFiles(root);
  if (!files.length) {
    throw new Error(`No accepted.jsonl files found under: ${root}`);
  }

  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const seen = new Set();
  let inserted = 0;
  let skipped = 0;

  for (const file of files) {
    const raw = await readFile(file, "utf8");
    const lines = raw.split(/\r?\n/).filter(Boolean);

    for (const line of lines) {
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        skipped += 1;
        continue;
      }

      const item = toStimulusItem(file, root, parsed, version);
      if (!item) {
        skipped += 1;
        continue;
      }

      if (seen.has(item.stimulus_id)) {
        skipped += 1;
        continue;
      }
      seen.add(item.stimulus_id);

      await ddb.send(
        new PutCommand({
          TableName: table,
          Item: item
        })
      );
      inserted += 1;
    }
  }

  console.log(JSON.stringify({
    table,
    root,
    files_found: files.length,
    inserted,
    skipped
  }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

