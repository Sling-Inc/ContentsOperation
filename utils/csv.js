import fs from "fs";
import path from "path";
import csv from "csvtojson";

/**
 *
 * @param {string} filePath
 */
export async function readCSV(filePath) {
  const csvText = fs.readFileSync(filePath, "utf8");
  const json = await csv().fromString(
    csvText.normalize("NFC")
    //.replace(/\\\"/g, `\+\+\+\+\+\+`)
    //.replace(/\"\"\"\"/g, `\"\"`)
    //.replace(/\+\+\+\+\+\+/g, `\\\"`)
  );

  return json;
}

function csvEscape(v) {
  if (v === null || v === undefined) return "";
  return String(v).replace(/"/g, '""');
}

export class CSVWriter {
  constructor(filePath, headers) {
    this.filePath = filePath;
    this.headers = headers;
    this.isReady = false;

    // 디렉토리 생성
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 헤더 쓰기
    fs.writeFileSync(this.filePath, this.headers.join(",") + "\n", "utf8");
    this.isReady = true;
  }

  writeRow(row) {
    if (!this.isReady) throw new Error("CsvWriter not initialized");

    const line =
      this.headers.map((h) => `"${csvEscape(row[h])}"`).join(",") + "\n";
    fs.appendFileSync(this.filePath, line, "utf8");
  }
}
