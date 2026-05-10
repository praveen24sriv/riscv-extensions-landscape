import fs from 'node:fs';
import path from 'node:path';

function die(message) {
  console.error(message);
  process.exit(1);
}

function buildExtensionIndex(extensionsCatalog) {
  const index = new Map();
  for (const [category, entries] of Object.entries(extensionsCatalog)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      const id = entry.id;
      if (!id) continue;
      const list = index.get(id) ?? [];
      list.push({ category, entry });
      index.set(id, list);
    }
  }
  return index;
}

function mnemonicToInstrDictKey(mnemonic) {
  return String(mnemonic).trim().toLowerCase().replaceAll('.', '_');
}

const workspaceRoot = process.cwd();
const instrDictPath = path.join(workspaceRoot, 'src', 'instr_dict.json');
const catalogPath = path.join(workspaceRoot, 'src', 'riscv_extensions.json');
const extensionInstructionsPath = path.join(workspaceRoot, 'src', 'data', 'extension_instructions.json');

if (!fs.existsSync(extensionInstructionsPath)) {
  die(`Missing: ${extensionInstructionsPath}\nRun the extraction step first.`);
}

const instrDict = JSON.parse(fs.readFileSync(instrDictPath, 'utf8'));
const extensionsCatalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const extensionInstructions = JSON.parse(fs.readFileSync(extensionInstructionsPath, 'utf8'));

const extIndex = buildExtensionIndex(extensionsCatalog);

const missingExtensions = new Set();
const missingInstructions = new Map();
let addedCount = 0;

for (const [extId, mnemonics] of Object.entries(extensionInstructions)) {
  const locations = extIndex.get(extId);
  if (!locations || locations.length === 0) {
    missingExtensions.add(extId);
    continue;
  }
  for (const { entry } of locations) {
    if (!entry.instructions || typeof entry.instructions !== 'object') entry.instructions = {};
    for (const mnemonic of mnemonics) {
      const key = mnemonicToInstrDictKey(mnemonic);
      const details = instrDict[key];
      if (!details) {
        const missing = missingInstructions.get(extId) ?? [];
        missing.push(mnemonic);
        missingInstructions.set(extId, missing);
        continue;
      }
      entry.instructions[mnemonic] = details;
      addedCount += 1;
    }
  }
}

fs.writeFileSync(catalogPath, `${JSON.stringify(extensionsCatalog, null, 2)}\n`);

console.log(`Updated ${path.relative(workspaceRoot, catalogPath)} with ${addedCount} instruction entries.`);
if (missingExtensions.size) {
  console.warn(`Extensions in data file but not in catalog: ${Array.from(missingExtensions).sort().join(', ')}`);
}
if (missingInstructions.size) {
  const sorted = Array.from(missingInstructions.entries()).sort(([a], [b]) => a.localeCompare(b));
  console.warn('Instructions missing from instr_dict.json (by extension):');
  for (const [extId, list] of sorted) {
    console.warn(`  - ${extId}: ${list.length} missing`);
  }
}
