import {
  schedulePreviewTag,
  scheduleStatistics,
  scheduleStatus,
} from "../data/scheduleMockData";
import api from "./axios";

function formatSectionOption(section) {
  const year = String(section?.year ?? "").trim();
  const sectionName = String(section?.section ?? "").trim();
  return year && sectionName ? `${year}${sectionName}` : "";
}

function sortSectionOptions(left, right) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function formatSemester(value) {
  const semester = String(value ?? "").trim();
  if (!semester) return "";
  return semester.toLowerCase().includes("semester") ? semester : `${semester} Semester`;
}

function formatAcademicYear(value) {
  const academicYear = String(value ?? "").trim();
  return academicYear.replace(/\s*-\s*/g, " - ");
}

function formatTime(minutes) {
  const numericMinutes = Number(minutes);
  if (!Number.isFinite(numericMinutes)) return "";

  const hours = Math.floor(numericMinutes / 60) % 24;
  const minuteValue = numericMinutes % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${String(minuteValue).padStart(2, "0")} ${suffix}`;
}

function getScheduleSection(schedule, classEntry) {
  const sectionName = String(schedule?.section ?? "").trim() || String(classEntry?.sectionName ?? "").match(/[0-9]+[A-Za-z]+$/)?.[0] || "";
  const year = String(schedule?.year ?? "").trim();
  if (year && sectionName && !sectionName.startsWith(year)) return `${year}${sectionName}`;
  return sectionName;
}

function normalizeSubjectCode(value) {
  return String(value ?? "").trim().toUpperCase();
}

function buildSubjectCatalog(curricula) {
  const catalog = new Map();

  (Array.isArray(curricula) ? curricula : []).forEach((curriculum) => {
    const subjects = Array.isArray(curriculum?.subjects)
      ? curriculum.subjects
      : Array.isArray(curriculum?.semesters)
        ? curriculum.semesters.flatMap((semester) => (Array.isArray(semester?.subjects) ? semester.subjects : []))
        : [];

    subjects.forEach((subject) => {
      const code = normalizeSubjectCode(subject?.subject_code ?? subject?.subjectCode ?? subject?.code);
      if (!code) return;

      if (!catalog.has(code)) {
        catalog.set(code, {
          title: String(subject?.title ?? subject?.subject_title ?? "").trim(),
          units: Number(subject?.units ?? 0),
        });
      }
    });
  });

  return catalog;
}

function normalizeScheduleRows(schedules, subjectCatalog = new Map()) {
  return schedules.flatMap((schedule) =>
    (Array.isArray(schedule?.classes) ? schedule.classes : []).map((classEntry, index) => {
      const subjectCode = String(classEntry?.subjectCode ?? classEntry?.subject_code ?? "").trim();
      const catalogEntry = subjectCatalog.get(normalizeSubjectCode(subjectCode));

      return {
        id: `${schedule._id ?? "schedule"}-${index}`,
        scheduleId: String(schedule._id ?? ""),
        classIndex: index,
        section: getScheduleSection(schedule, classEntry),
        semester: formatSemester(schedule.semester),
        schoolYear: formatAcademicYear(schedule.academicYear ?? schedule.academic_year),
        subjectCode,
        subjectTitle: classEntry.subjectTitle ?? classEntry.subjectName ?? catalogEntry?.title ?? "",
        units: Number(classEntry.units ?? catalogEntry?.units ?? 0),
        days: Array.isArray(classEntry.days)
          ? classEntry.days.filter(Boolean)
          : classEntry.day
            ? [classEntry.day]
            : [],
        timeStart: formatTime(classEntry.startTime),
        timeEnd: formatTime(classEntry.endTime),
        room: classEntry.roomName ?? classEntry.roomId ?? "",
        instructor: classEntry.profName ?? classEntry.profId ?? "",
        instructorRole: "Instructor",
      };
    })
  );
}

export async function fetchScheduleConflicts() {
  const response = await api.get("/schedules/conflicts");
  return response.data;
}

export async function fetchSchedulePageData() {
  const [sectionsResponse, schedulesResponse, conflictsResponse, curriculaResponse] = await Promise.all([
    api.get("/sections"),
    api.get("/schedules"),
    api.get("/schedules/conflicts").catch((err) => {
      console.warn("Failed to fetch conflicts:", err);
      return { data: null };
    }),
    api.get("/curriculum").catch((err) => {
      console.warn("Failed to fetch curriculum:", err);
      return { data: [] };
    }),
  ]);
  const sections = Array.isArray(sectionsResponse.data) ? sectionsResponse.data : [];
  const schedules = Array.isArray(schedulesResponse.data) ? schedulesResponse.data : [];
  const curricula = Array.isArray(curriculaResponse?.data) ? curriculaResponse.data : [];
  const sectionOptions = [...new Set(sections.map(formatSectionOption).filter(Boolean))].sort(sortSectionOptions);
  const subjectCatalog = buildSubjectCatalog(curricula);
  const rows = normalizeScheduleRows(schedules, subjectCatalog);
  const scheduleSemesters = [...new Set(rows.map((row) => row.semester).filter(Boolean))];
  const scheduleSchoolYears = [...new Set(rows.map((row) => row.schoolYear).filter(Boolean))];
  const conflictReport = conflictsResponse?.data ?? null;

  return {
    rows,
    filters: {
      sections: sectionOptions,
      semesters: scheduleSemesters,
      schoolYears: scheduleSchoolYears,
    },
    statistics: scheduleStatistics,
    status: conflictReport?.status ?? scheduleStatus,
    conflicts: conflictReport?.conflicts ?? [],
    hasConflicts: Boolean(conflictReport?.hasConflicts),
    preview: schedulePreviewTag,
  };
}

function parseMeridiemTimeToMinutes(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const match = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes) || hours < 1 || hours > 12 || minutes < 0 || minutes > 59) {
    return null;
  }

  const meridiem = match[3].toUpperCase();
  const normalizedHours = hours % 12;
  const twentyFourHour = meridiem === "PM" ? normalizedHours + 12 : normalizedHours;
  return twentyFourHour * 60 + minutes;
}

function normalizeDayList(days) {
  return Array.isArray(days)
    ? [...new Set(days.map((day) => String(day ?? "").trim()).filter(Boolean))]
    : [];
}

function mapRowChangesToApiFields(changes) {
  const payload = {};

  if (Object.prototype.hasOwnProperty.call(changes, "days")) {
    const normalizedDays = normalizeDayList(changes.days);
    payload.days = normalizedDays;
    payload.day = normalizedDays[0] ?? "";
  }

  if (Object.prototype.hasOwnProperty.call(changes, "timeStart")) {
    const minutes = parseMeridiemTimeToMinutes(changes.timeStart);
    if (minutes !== null) payload.startTime = minutes;
  }

  if (Object.prototype.hasOwnProperty.call(changes, "timeEnd")) {
    const minutes = parseMeridiemTimeToMinutes(changes.timeEnd);
    if (minutes !== null) payload.endTime = minutes;
  }

  if (Object.prototype.hasOwnProperty.call(changes, "room")) {
    payload.roomName = String(changes.room ?? "").trim();
  }

  if (Object.prototype.hasOwnProperty.call(changes, "instructor")) {
    payload.profName = String(changes.instructor ?? "").trim();
  }

  return payload;
}


export async function saveScheduleTableChanges({ scheduleId, rowChanges }) {
  if (!scheduleId) {
    throw new Error("Missing schedule id for table save.");
  }

  const updates = (Array.isArray(rowChanges) ? rowChanges : [])
    .map((entry) => {
      const mappedChanges = mapRowChangesToApiFields(entry?.changes ?? {});
      return {
        classIndex: entry?.classIndex,
        changes: mappedChanges,
      };
    })
    .filter((entry) => Number.isInteger(entry.classIndex) && entry.classIndex >= 0 && Object.keys(entry.changes).length > 0);

  if (updates.length === 0) {
    return { skipped: true };
  }

  const response = await api.patch(`/schedules/${scheduleId}/classes`, {
    updates,
  });
  return response.data;
}
