const fs = require("node:fs");
const path = require("node:path");
const { parseImportedDeck } = require("../app.js");

const seedPath = path.join(__dirname, "..", "data", "seed-cards.json");
const reportPath = path.join(__dirname, "..", "data", "flashcard-extraction-report.json");
const raw = fs.readFileSync(seedPath, "utf8");
const parsed = JSON.parse(raw);
const cards = parseImportedDeck(raw);
const ids = new Set(cards.map((card) => card.id));
const invalid = cards.filter((card) => !card.front || !card.back || !card.tags);
const levelCounts = cards.reduce((acc, card) => {
  const level = ["A1", "A2", "B1"].find((candidate) => card.tags.includes(candidate)) || "unlabeled";
  acc[level] = (acc[level] || 0) + 1;
  return acc;
}, {});
const extractionReport = fs.existsSync(reportPath)
  ? JSON.parse(fs.readFileSync(reportPath, "utf8"))
  : null;

if (ids.size !== cards.length) {
  throw new Error(`Duplicate ids found: ${cards.length - ids.size}`);
}
if (invalid.length > 0) {
  throw new Error(`Invalid cards found: ${invalid.length}`);
}
if (extractionReport && extractionReport.xlsx.cards_created !== cards.length) {
  throw new Error("Seed count does not match extraction report");
}

console.log(JSON.stringify({
  seedFileCards: cards.length,
  rawCards: parsed.cards.length,
  uniqueIds: ids.size,
  invalidCards: invalid.length,
  levelCounts,
  pdfStatus: extractionReport ? extractionReport.pdf.status : "missing report",
  pdfExtractableChars: extractionReport ? extractionReport.pdf.total_extractable_chars : null,
  skippedSpreadsheetRows: extractionReport ? extractionReport.xlsx.skipped_rows.length : null
}, null, 2));

