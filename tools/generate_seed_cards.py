import json
import math
import re
from collections import Counter
from pathlib import Path

import pandas as pd
from pypdf import PdfReader

ROOT = Path.cwd()
XLSX = ROOT / "French_Vocab_Grouped_A1_A2_B1 (1).xlsx"
PDF = ROOT / "B1 handnotes.pdf"
HANDNOTES = ROOT / "data" / "b1-handnotes-source.json"
DATA_DIR = ROOT / "data"
REPORT_DIR = ROOT / "tmp" / "reports"
DATA_DIR.mkdir(exist_ok=True)
REPORT_DIR.mkdir(parents=True, exist_ok=True)

LEVELS = {"A1", "A2", "B1"}


def clean(value):
    if value is None:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    text = str(value).strip()
    text = re.sub(r"\s+", " ", text)
    text = text.replace(" **", "").replace("**", "")
    return text.strip()


def slug(text):
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = re.sub(r"-+", "-", text).strip("-")
    return text or "card"


def xlsx_card_id(french, english, index):
    return f"seed-xlsx-{index:04d}-{slug(french)[:36]}-{slug(english)[:24]}"


def handnote_card_id(front, back, page, index):
    return f"seed-b1-handnotes-p{page:02d}-{index:04d}-{slug(front)[:32]}-{slug(back)[:20]}"


def extract_xlsx_cards():
    df = pd.read_excel(XLSX, sheet_name="Grouped Vocab", header=None)
    cards = []
    level = ""
    category = "General"
    skipped = []

    for row_index, row in df.iterrows():
        cells = [clean(row.get(i)) for i in range(5)]
        left, left_back, spacer, right, right_back = cells

        non_empty = [c for c in cells if c]
        if not non_empty:
            continue

        if left in LEVELS and len(non_empty) == 1:
            level = left
            continue

        if left and not left_back and not right and not right_back:
            category = left
            continue

        pairs = []
        if left or left_back:
            if left and left_back:
                pairs.append((left, left_back))
            else:
                skipped.append({"row": row_index + 1, "cells": cells, "reason": "incomplete left pair"})
        if right or right_back:
            if right and right_back:
                pairs.append((right, right_back))
            else:
                skipped.append({"row": row_index + 1, "cells": cells, "reason": "incomplete right pair"})

        for french, english in pairs:
            number = len(cards) + 1
            tags = ", ".join(filter(None, ["source:xlsx", level, category]))
            cards.append({
                "id": xlsx_card_id(french, english, number),
                "front": english,
                "back": french,
                "notes": f"{category} - {level}" if level else category,
                "tags": tags,
                "direction": "en-fr",
                "source": {
                    "file": XLSX.name,
                    "sheet": "Grouped Vocab",
                    "row": row_index + 1,
                    "level": level,
                    "category": category
                }
            })

    return cards, skipped


def extract_handnote_cards():
    if not HANDNOTES.exists():
        return []

    data = json.loads(HANDNOTES.read_text(encoding="utf-8"))
    cards = []
    for index, card in enumerate(data.get("cards", []), 1):
        front = clean(card.get("front"))
        back = clean(card.get("back"))
        if not front or not back:
            continue
        page = int(card.get("sourcePage") or 0)
        tags = clean(card.get("tags"))
        if "source:b1-handnotes" not in tags:
            tags = ", ".join(filter(None, ["source:b1-handnotes", tags]))
        cards.append({
            "id": handnote_card_id(front, back, page, index),
            "front": front,
            "back": back,
            "notes": clean(card.get("notes")),
            "tags": tags,
            "direction": "en-fr",
            "source": {
                "file": data.get("source", PDF.name),
                "page": page,
                "needs_review": bool(card.get("needs_review", False))
            }
        })
    return cards


def inspect_pdf():
    reader = PdfReader(str(PDF))
    pages = []
    total_chars = 0
    for i, page in enumerate(reader.pages, 1):
        text = page.extract_text() or ""
        total_chars += len(text.strip())
        pages.append({
            "page": i,
            "extractable_chars": len(text.strip()),
            "extractable_text": clean(text)[:300]
        })
    return {
        "file": PDF.name,
        "pages": len(reader.pages),
        "total_extractable_chars": total_chars,
        "status": "handnote_cards_imported_from_visual_transcription_json",
        "pages_detail": pages
    }


xlsx_cards, skipped = extract_xlsx_cards()
handnote_cards = extract_handnote_cards()
cards = xlsx_cards + handnote_cards
pdf_report = inspect_pdf()
levels = Counter(card["source"].get("level", "B1") if card["id"].startswith("seed-xlsx") else "B1" for card in cards)
categories = Counter(card["source"].get("category", "B1 handnotes") for card in xlsx_cards)
needs_review = sum(1 for card in handnote_cards if card["source"].get("needs_review"))

seed_payload = {
    "version": 1,
    "generatedAt": "2026-06-21T00:00:00.000Z",
    "displayDirection": "en-fr",
    "cards": cards
}
report = {
    "xlsx": {
        "file": XLSX.name,
        "cards_created": len(xlsx_cards),
        "level_counts": dict(sorted(Counter(card["source"]["level"] or "unlabeled" for card in xlsx_cards).items())),
        "top_categories": categories.most_common(20),
        "skipped_rows": skipped
    },
    "b1_handnotes": {
        "file": HANDNOTES.name if HANDNOTES.exists() else None,
        "cards_created": len(handnote_cards),
        "needs_review": needs_review
    },
    "pdf": pdf_report,
    "total_cards_created": len(cards)
}

(DATA_DIR / "seed-cards.json").write_text(json.dumps(seed_payload, ensure_ascii=False, indent=2), encoding="utf-8")
(REPORT_DIR / "flashcard-extraction-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(report, ensure_ascii=False, indent=2)[:5000])
