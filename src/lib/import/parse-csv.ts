/**
 * Pure RFC-4180 subset CSV parser.
 * Handles quoted fields, commas inside quotes, escaped quotes (""),
 * CRLF and LF line breaks, and UTF-8 Byte Order Marks (BOM).
 * Zero dependencies.
 */

export function parseCSV(text: string): string[][] {
  if (!text) return [];

  // Strip UTF-8 Byte Order Mark (BOM) if present
  let cleanText = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let insideQuotes = false;
  let i = 0;
  const len = cleanText.length;

  while (i < len) {
    const char = cleanText[i];

    if (insideQuotes) {
      if (char === '"') {
        // Check for escaped quote: ""
        if (i + 1 < len && cleanText[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else {
          insideQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
        i++;
        continue;
      } else if (char === ",") {
        currentRow.push(currentField);
        currentField = "";
        i++;
        continue;
      } else if (char === "\r") {
        if (i + 1 < len && cleanText[i + 1] === "\n") {
          i++; // Skip \r in \r\n
        }
        currentRow.push(currentField);
        currentField = "";
        rows.push(currentRow);
        currentRow = [];
        i++;
        continue;
      } else if (char === "\n") {
        currentRow.push(currentField);
        currentField = "";
        rows.push(currentRow);
        currentRow = [];
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  // Push final field & row if anything remaining
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  // Filter out any trailing empty row
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0].trim() !== ""));
}
