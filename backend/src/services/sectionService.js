import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Section from "../models/Section.js";
import Student from "../models/Student.js";

const SECTION_TEMPLATE_PATH = fileURLToPath(
  new URL("../../../fileTemplates/sectionTemplates/sectionTemplate(JSON).json", import.meta.url)
);

function loadSectionTemplate() {
  const parsed = JSON.parse(readFileSync(SECTION_TEMPLATE_PATH, "utf8"));
  const template = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!template || typeof template !== "object") {
    throw new Error("Section template must contain a section object");
  }
  return template;
}

const SECTION_TEMPLATE = loadSectionTemplate();
export const DEFAULT_TOTAL_CAPACITY = Number(SECTION_TEMPLATE.totalCapacity) || 50;

const TEMPLATE_CAPACITIES = (() => {
  const parsedBlock = Number(SECTION_TEMPLATE.blockCapacity);
  const parsedIrregular = Number(SECTION_TEMPLATE.irregularCapacity);
  if (Number.isFinite(parsedBlock) && parsedBlock >= 0 && Number.isFinite(parsedIrregular) && parsedIrregular >= 0) {
    return {
      totalCapacity: parsedBlock + parsedIrregular,
      blockCapacity: parsedBlock,
      irregularCapacity: parsedIrregular,
    };
  }
  return getSectionCapacities(SECTION_TEMPLATE.totalCapacity);
})();

export const DEFAULT_SECTION_CAPACITIES = TEMPLATE_CAPACITIES;

export function normalizeSectionValue(value) {
  return String(value ?? "").trim();
}

export function normalizeSectionName(value) {
  return normalizeSectionValue(value).toUpperCase();
}

export function normalizeSemester(value) {
  return normalizeSectionValue(value) || "N/A";
}

export function getSectionCapacities(totalCapacity = DEFAULT_TOTAL_CAPACITY) {
  const parsedCapacity = Number(totalCapacity);
  const safeTotalCapacity = Number.isFinite(parsedCapacity) && parsedCapacity >= 0
    ? parsedCapacity
    : DEFAULT_TOTAL_CAPACITY;
  const irregularCapacity = safeTotalCapacity * 0.1;

  return {
    totalCapacity: safeTotalCapacity,
    irregularCapacity,
    blockCapacity: safeTotalCapacity - irregularCapacity,
  };
}

function capacitiesFromSection(section) {
  if (!section || typeof section !== "object") return null;

  const parsedBlock = Number(section.blockCapacity);
  const parsedIrregular = Number(section.irregularCapacity);
  if (Number.isFinite(parsedBlock) && parsedBlock >= 0 && Number.isFinite(parsedIrregular) && parsedIrregular >= 0) {
    return {
      totalCapacity: parsedBlock + parsedIrregular,
      blockCapacity: parsedBlock,
      irregularCapacity: parsedIrregular,
    };
  }

  const parsedTotal = Number(section.totalCapacity);
  if (Number.isFinite(parsedTotal) && parsedTotal >= 0) {
    return getSectionCapacities(parsedTotal);
  }

  return null;
}

export async function resolveDefaultSectionCapacities({ year = "", semester = "" } = {}) {
  const normalizedYear = normalizeSectionValue(year);
  const normalizedSemester = normalizeSemester(semester);

  if (normalizedYear && normalizedSemester) {
    const preferred = await Section.findOne({
      year: normalizedYear,
      semester: normalizedSemester,
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();

    const preferredCapacities = capacitiesFromSection(preferred);
    if (preferredCapacities) return preferredCapacities;
  }

  const latest = await Section.findOne({})
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();

  const latestCapacities = capacitiesFromSection(latest);
  if (latestCapacities) return latestCapacities;

  return DEFAULT_SECTION_CAPACITIES;
}

export function getSectionStatus(blockCount = 0, irregularCount = 0, totalCapacity = DEFAULT_TOTAL_CAPACITY) {
  const studentCount = Number(blockCount || 0) + Number(irregularCount || 0);
  const capacity = Number(totalCapacity || 0);
  if (studentCount < capacity) return "Available";
  if (studentCount === capacity) return "Full";
  return "Overloaded";
}

export function createSectionState({ year, semester, section, sourceSection = null }) {
  let capacities;
  if (sourceSection && sourceSection.blockCapacity != null && sourceSection.irregularCapacity != null) {
    const parsedBlock = Math.max(0, Number(sourceSection.blockCapacity) || 0);
    const parsedIrregular = Math.max(0, Number(sourceSection.irregularCapacity) || 0);
    capacities = {
      totalCapacity: parsedBlock + parsedIrregular,
      blockCapacity: parsedBlock,
      irregularCapacity: parsedIrregular,
    };
  } else {
    capacities = capacitiesFromSection(sourceSection) || DEFAULT_SECTION_CAPACITIES;
  }

  return {
    year: normalizeSectionValue(year),
    semester: normalizeSemester(semester),
    section: normalizeSectionName(section),
    createdAt: new Date().toISOString(),
    blockCount: 0,
    irregularCount: 0,
    ...capacities,
    status: getSectionStatus(0, 0, capacities.totalCapacity),
  };
}

export function addStudentToSectionState(section, status) {
  if (normalizeSectionValue(status).toLowerCase() === "irregular") {
    section.irregularCount = Number(section.irregularCount ?? 0) + 1;
  } else {
    section.blockCount = Number(section.blockCount ?? 0) + 1;
  }
  section.status = getSectionStatus(section.blockCount, section.irregularCount, section.totalCapacity);
  return section;
}

function sectionStudentFilter({ year, semester, section }) {
  return {
    year: normalizeSectionValue(year),
    semester: normalizeSemester(semester),
    section: normalizeSectionName(section),
  };
}

export async function syncSectionFromStudents(sectionIdentity) {
  const identity = sectionStudentFilter(sectionIdentity);
  if (!identity.year || !identity.section) {
    throw new Error("A year and section are required to sync a section");
  }

  // Irregular students occupy their main section (year + section + semester)
  // PLUS every section listed individually in their irregularSection /
  // irregularYear arrays, so both placements must be counted.
  const irregularOccupantQuery = {
    status: "Irregular",
    semester: identity.semester,
    $or: [
      { year: identity.year, section: identity.section },
      { irregularSection: identity.section, irregularYear: identity.year },
    ],
  };

  const current = await Section.findOne(identity).lean();
  const [blockCount, irregularCount] = await Promise.all([
    Student.countDocuments({ ...identity, status: "Block" }),
    Student.countDocuments(irregularOccupantQuery),
  ]);

  // Sections with no more students in them are removed automatically.
  if (blockCount === 0 && irregularCount === 0) {
    if (current) {
      await Section.findOneAndDelete(identity);
    }
    return null;
  }

  let blockCapacity, irregularCapacity, totalCapacity;
  if (current && current.blockCapacity != null && current.irregularCapacity != null) {
    blockCapacity = current.blockCapacity;
    irregularCapacity = current.irregularCapacity;
    totalCapacity = current.totalCapacity;
  } else {
    const capacities = getSectionCapacities(current?.totalCapacity ?? SECTION_TEMPLATE.totalCapacity);
    blockCapacity = capacities.blockCapacity;
    irregularCapacity = capacities.irregularCapacity;
    totalCapacity = capacities.totalCapacity;
  }

  const result = await Section.findOneAndUpdate(
    identity,
    {
      $set: {
        ...identity,
        blockCount,
        irregularCount,
        blockCapacity,
        irregularCapacity,
        totalCapacity,
        status: getSectionStatus(blockCount, irregularCount, totalCapacity),
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return result;
}

/**
 * Build the list of section identities a student occupies: their main
 * placement (year + section + semester) plus every entry inside their
 * irregularSection / irregularYear arrays.
 */
export function getStudentSectionIdentities(student = {}) {
  const identities = new Map();

  const pushIdentity = (year, semester, section) => {
    const normalizedYear = normalizeSectionValue(year);
    const normalizedSection = normalizeSectionName(section);
    if (!normalizedYear || !normalizedSection) return;
    const key = `${normalizedYear}::${normalizeSectionValue(semester)}::${normalizedSection}`;
    identities.set(key, {
      year: normalizedYear,
      semester: normalizeSemester(semester),
      section: normalizedSection,
    });
  };

  pushIdentity(student.year, student.semester, student.section);

  const rawSections = Array.isArray(student.irregularSection)
    ? student.irregularSection
    : student.irregularSection != null && student.irregularSection !== ""
      ? [student.irregularSection]
      : [];
  const rawYears = Array.isArray(student.irregularYear)
    ? student.irregularYear
    : student.irregularYear != null && student.irregularYear !== ""
      ? [student.irregularYear]
      : [];

  rawSections.forEach((section, index) => {
    pushIdentity(rawYears[index] ?? rawYears[0], student.semester, section);
  });
  if (rawSections.length === 1) {
    for (const year of rawYears.slice(1)) {
      pushIdentity(year, student.semester, rawSections[0]);
    }
  }

  return [...identities.values()];
}

export async function rebalanceSections(year, semester) {
  const filter = {
    year: String(year ?? "").trim(),
    semester: String(semester ?? "").trim() || "N/A",
  };

  const allSections = await Section.find(filter).sort({ section: 1 }).lean();
  if (allSections.length === 0) {
    const newSection = createSectionState({
      year: filter.year,
      semester: filter.semester,
      section: "A",
    });
    await Section.create(newSection);
    return [newSection];
  }

  const blockStudents = await Student.find({ ...filter, status: "Block" }).sort({ studentNumber: 1 }).lean();
  const irregularStudents = await Student.find({ ...filter, status: "Irregular" }).sort({ studentNumber: 1 }).lean();

  if (blockStudents.length === 0 && irregularStudents.length === 0) {
    for (const section of allSections) {
      await Section.findByIdAndDelete(section._id);
    }
    const newSection = createSectionState({
      year: filter.year,
      semester: filter.semester,
      section: "A",
    });
    await Section.create(newSection);
    return [newSection];
  }

  const sourceSection = allSections[0];

  // Calculate how many sections we need based on per-section capacity
  const blockPerSection = Number(sourceSection.blockCapacity || 1);
  const irregularPerSection = Number(sourceSection.irregularCapacity || 1);

  const neededBlockSections = Math.max(1, Math.ceil(blockStudents.length / Math.max(0.001, blockPerSection)));
  const neededIrregularSections = Math.max(1, Math.ceil(irregularStudents.length / Math.max(0.001, irregularPerSection)));
  const neededTotalSections = Math.max(neededBlockSections, neededIrregularSections);

  // Delete excess sections
  if (allSections.length > neededTotalSections) {
    const sectionsToDelete = allSections.slice(neededTotalSections);
    for (const section of sectionsToDelete) {
      await Section.findByIdAndDelete(section._id);
    }
  }

  // Create additional sections if needed (with correct capacity values)
  let workingSections = [...allSections.slice(0, neededTotalSections)];
  while (workingSections.length < neededTotalSections) {
    const newLetter = String.fromCharCode(65 + workingSections.length);
    const newSectionData = {
      year: sourceSection.year,
      semester: sourceSection.semester,
      section: newLetter,
      blockCapacity: sourceSection.blockCapacity,
      irregularCapacity: sourceSection.irregularCapacity,
      totalCapacity: sourceSection.totalCapacity,
      blockCount: 0,
      irregularCount: 0,
      status: "Available",
    };
    const created = await Section.create(newSectionData);
    workingSections.push(created);
  }

  // Track actual assignment counts as we assign students
  const sectionBlockCounts = {};
  const sectionIrregularCounts = {};
  for (const section of workingSections) {
    sectionBlockCounts[section.section] = 0;
    sectionIrregularCounts[section.section] = 0;
  }

  // Distribute block students across all sections
  for (const student of blockStudents) {
    let assigned = false;
    for (const section of workingSections) {
      if (sectionBlockCounts[section.section] < Number(section.blockCapacity || 0)) {
        await Student.findByIdAndUpdate(student._id, { $set: { section: section.section } });
        sectionBlockCounts[section.section]++;
        assigned = true;
        break;
      }
    }
    if (!assigned && workingSections.length > 0) {
      // All sections full - student stays in their current section
      // (shouldn't happen if we calculated sections correctly, but handle gracefully)
    }
  }

  // Distribute irregular students across all sections
  for (const student of irregularStudents) {
    let assigned = false;
    for (const section of workingSections) {
      if (sectionIrregularCounts[section.section] < Number(section.irregularCapacity || 0)) {
        await Student.findByIdAndUpdate(student._id, { $set: { section: section.section } });
        sectionIrregularCounts[section.section]++;
        assigned = true;
        break;
      }
    }
    if (!assigned && workingSections.length > 0) {
      // All sections full - student stays in their current section
    }
  }

  await Promise.all(
    workingSections.map(section =>
      syncSectionFromStudents({
        year: section.year,
        semester: section.semester,
        section: section.section,
      })
    )
  );

  return Section.find(filter).sort({ year: 1, section: 1, semester: 1 }).lean();
}

/**
 * Compute the TRUE number of students occupying every section straight from
 * the students collection, keyed by "year::semester::section".  Used to detect
 * sections whose stored counts have gone stale or that no longer have any
 * students in them.
 */
export async function computeActualSectionCounts() {
  const counts = new Map();

  const bumpCount = (year, semester, section, status) => {
    const normalizedYear = normalizeSectionValue(year);
    const normalizedSection = normalizeSectionName(section);
    if (!normalizedYear || !normalizedSection) return;
    const key = `${normalizedYear}::${normalizeSemester(semester)}::${normalizedSection}`;
    const entry = counts.get(key) ?? {
      identity: {
        year: normalizedYear,
        semester: normalizeSemester(semester),
        section: normalizedSection,
      },
      blockCount: 0,
      irregularCount: 0,
    };
    if (normalizeSectionValue(status).toLowerCase() === "irregular") {
      entry.irregularCount += 1;
    } else {
      entry.blockCount += 1;
    }
    counts.set(key, entry);
  };

  const occupants = await Student.find(
    { status: { $in: ["Block", "Irregular"] } },
    { year: 1, semester: 1, section: 1, status: 1, irregularSection: 1, irregularYear: 1 }
  ).lean();

  for (const student of occupants) {
    bumpCount(student.year, student.semester, student.section, student.status);

    if (normalizeSectionValue(student.status).toLowerCase() !== "irregular") continue;

    const rawSections = Array.isArray(student.irregularSection)
      ? student.irregularSection
      : student.irregularSection != null && student.irregularSection !== ""
        ? [student.irregularSection]
        : [];
    const rawYears = Array.isArray(student.irregularYear)
      ? student.irregularYear
      : student.irregularYear != null && student.irregularYear !== ""
        ? [student.irregularYear]
        : [];

    rawSections.forEach((section, index) => {
      bumpCount(rawYears[index] ?? rawYears[0], student.semester, section, "Irregular");
    });
    if (rawSections.length === 1) {
      for (const year of rawYears.slice(1)) {
        bumpCount(year, student.semester, rawSections[0], "Irregular");
      }
    }
  }

  return counts;
}

export async function syncAllSectionsFromStudents() {
  const groups = await Student.aggregate([
    {
      $match: {
        status: { $in: ["Block", "Irregular"] },
        year: { $nin: [null, ""] },
        section: { $nin: [null, ""] },
      },
    },
    {
      $group: {
        _id: {
          year: "$year",
          semester: "$semester",
          section: "$section",
        },
      },
    },
  ]);

  await Promise.all(
    groups.map(({ _id }) => syncSectionFromStudents(_id))
  );

  // Remove any sections that no longer have students in them (e.g. the last
  // student was deleted or moved elsewhere).  Uses TRUE counts recomputed
  // from the students collection so stale stored counts cannot keep an empty
  // section alive.
  const allSections = await Section.find({}).lean();
  const actualCounts = await computeActualSectionCounts();
  const emptySections = allSections.filter((section) => {
    const key = `${normalizeSectionValue(section.year)}::${normalizeSemester(section.semester)}::${normalizeSectionName(section.section)}`;
    const actual = actualCounts.get(key);
    return !actual || (actual.blockCount === 0 && actual.irregularCount === 0);
  });
  if (emptySections.length > 0) {
    await Section.deleteMany({
      _id: { $in: emptySections.map((section) => section._id) },
    });
  }

  return Section.find({}).sort({ year: 1, section: 1, semester: 1 }).lean();
}
