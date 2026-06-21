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
const handnoteCards = cards.filter((card) => card.tags.includes("source:b1-handnotes"));
const xlsxCards = cards.filter((card) => card.tags.includes("source:xlsx"));
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
if (!cards.every((card) => card.direction === "en-fr")) {
  throw new Error("Seed cards must use English front/French back direction");
}
if (cards[0].front !== "airplane" || cards[0].back !== "un avion") {
  throw new Error("First seed card is not English front/French back");
}
if (extractionReport) {
  if (extractionReport.xlsx.cards_created !== xlsxCards.length) {
    throw new Error("XLSX seed count does not match extraction report");
  }
  if (extractionReport.b1_handnotes.cards_created !== handnoteCards.length) {
    throw new Error("B1 handnotes seed count does not match extraction report");
  }
  if (extractionReport.total_cards_created !== cards.length) {
    throw new Error("Total seed count does not match extraction report");
  }
}

console.log(JSON.stringify({
  seedFileCards: cards.length,
  rawCards: parsed.cards.length,
  uniqueIds: ids.size,
  invalidCards: invalid.length,
  xlsxCards: xlsxCards.length,
  b1HandnoteCards: handnoteCards.length,
  levelCounts,
  pdfStatus: extractionReport ? extractionReport.pdf.status : "missing report",
  pdfExtractableChars: extractionReport ? extractionReport.pdf.total_extractable_chars : null,
  skippedSpreadsheetRows: extractionReport ? extractionReport.xlsx.skipped_rows.length : null,
  handnotesNeedReview: extractionReport ? extractionReport.b1_handnotes.needs_review : null,
  direction: "en-fr",
  firstCard: { front: cards[0].front, back: cards[0].back }
}, null, 2));
