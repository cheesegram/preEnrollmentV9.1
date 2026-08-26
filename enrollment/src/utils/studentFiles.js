import * as XLSX from "xlsx";

const normalizeHeader = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, " ");

export const sanitizeFileName = (value) =>
  String(value ?? "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ");

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(anchor);
}

const STUDENT_KEY_ORDER = [
  "studentNumber",
  "firstName",
  "middleName",
  "lastName",
  "suffix",
  "year",
  "section",
  "semester",
  "status",
];

function formatExportValue(value) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return value;
}

/**
 * Build the column list for an export as the union of every attribute found
 * on any of the student records, so exported files contain ALL attributes and
 * values stored in the database.  Core identity fields are placed first in a
 * stable order; every other attribute follows in first-seen order.
 */
function buildStudentColumns(students) {
  const columns = [];
  const seen = new Set();

  for (const key of STUDENT_KEY_ORDER) {
    if (students.some((student) => student?.[key] != null)) {
      columns.push(key);
      seen.add(key);
    }
  }

  for (const student of students) {
    for (const key of Object.keys(student ?? {})) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }

  return columns;
}

function getStudentRows(students) {
  const list = Array.isArray(students) ? students : [];
  const columns = buildStudentColumns(list);

  return [
    columns,
    ...list.map((student) => columns.map((column) => formatExportValue(student?.[column]))),
  ];
}

export function exportStudentsAsCsv(students, filenameBase) {
  const worksheet = XLSX.utils.aoa_to_sheet(getStudentRows(students));
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${filenameBase}.csv`);
}

export function exportStudentsAsXlsx(students, filenameBase) {
  const worksheet = XLSX.utils.aoa_to_sheet(getStudentRows(students));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Students");
  const array = XLSX.write(workbook, { bookType: "xlsx", type: "array" });

  downloadBlob(
    new Blob([array], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${filenameBase}.xlsx`
  );
}

export async function parseStudentTemplateFile(file) {
  const filename = file.name.toLowerCase();
  let workbook;

  if (filename.endsWith(".xlsx")) {
    workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  } else if (filename.endsWith(".csv")) {
    workbook = XLSX.read(await file.text(), { type: "string" });
  } else {
    throw new Error("Only CSV and XLSX files are supported");
  }

  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) throw new Error("The selected file is empty");

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], {
    header: 1,
    defval: "",
    blankrows: false,
  });

  if (!rows.length) throw new Error("The selected file has no data");

  const headerMap = new Map();
  (rows[0] || []).forEach((header, index) => {
    headerMap.set(normalizeHeader(header), index);
  });

  const requiredHeaders = ["student number", "first name", "last name", "year", "semester", "status"];
  if (!requiredHeaders.every((header) => headerMap.has(header))) {
    throw new Error("Invalid student template headers");
  }

  const getCell = (row, header) => row[headerMap.get(header)] ?? "";
  const parsedStudents = rows
    .slice(1)
    .map((row) => ({
      studentNumber: String(getCell(row, "student number")).trim(),
      firstName: String(getCell(row, "first name")).trim(),
      lastName: String(getCell(row, "last name")).trim(),
      year: String(getCell(row, "year")).trim(),
      semester: String(getCell(row, "semester")).trim(),
      status: String(getCell(row, "status")).trim() || "Enrolled",
    }))
    .filter((student) => student.studentNumber);

  if (!parsedStudents.length) throw new Error("No student rows found in file");
  return parsedStudents;
}

const BLOCK_APPLICANT_REQUIRED_HEADERS = [
  "applicantid",
  "firstname",
  "lastname",
  "year",
  "semester",
];

/**
 * Parse an uploaded block-applicant file (CSV or XLSX) that follows the
 * blockApplicantTemplate column layout. The first row is treated as the
 * header row and every following row becomes an object keyed by the exact
 * header names (e.g. applicantID, firstName, lastName, ...).
 */
export async function parseBlockApplicantFile(file) {
  const filename = String(file.name ?? "").toLowerCase();
  let workbook;

  if (filename.endsWith(".xlsx")) {
    workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  } else if (filename.endsWith(".csv")) {
    workbook = XLSX.read(await file.text(), { type: "string", cellDates: true });
  } else {
    throw new Error("Only CSV and XLSX files are supported");
  }

  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) throw new Error("The selected file is empty");

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], {
    header: 1,
    defval: "",
    blankrows: false,
  });

  if (!rows.length) throw new Error("The selected file has no data");

  const headers = (rows[0] || []).map((header, index) => ({
    key: String(header ?? "").trim(),
    normalized: normalizeHeader(header),
    index,
  }));

  if (!BLOCK_APPLICANT_REQUIRED_HEADERS.every((header) =>
    headers.some((entry) => entry.normalized === header)
  )) {
    throw new Error("Invalid block applicant template headers");
  }

  const toCellString = (value) => {
    if (value == null) return "";
    if (value instanceof Date) {
      return `${value.getMonth() + 1}/${value.getDate()}/${value.getFullYear()}`;
    }
    return String(value).trim();
  };

  const parsedApplicants = rows
    .slice(1)
    .map((row) => {
      const applicant = {};
      headers.forEach(({ key, index }) => {
        if (!key) return;
        applicant[key] = toCellString(row[index]);
      });
      return applicant;
    })
    .filter((applicant) => String(applicant.applicantID ?? "").trim());

  if (!parsedApplicants.length) throw new Error("No applicant rows found in file");
  return parsedApplicants;
}
