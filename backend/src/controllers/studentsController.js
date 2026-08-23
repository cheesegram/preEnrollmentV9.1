import Student from "../models/Student.js";
import Section from "../models/Section.js";
import mongoose from "mongoose";
import {
  DEFAULT_TOTAL_CAPACITY,
  addStudentToSectionState,
  createSectionState,
  getSectionStatus,
  normalizeSectionName,
  normalizeSemester,
  syncSectionFromStudents,
} from "../services/sectionService.js";

const flexibleSchema = new mongoose.Schema({}, { strict: false });

/**
 * Get a Mongoose model connected to the default iiti_db using a flexible schema.
 */
function getDbModel(modelName, collectionName) {
  const db = mongoose.connection;
  return db.models[modelName] || db.model(modelName, flexibleSchema, collectionName);
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeStatus(value) {
  const status = normalizeText(value);
  if (!status) return "Enrolled";
  const lowered = status.toLowerCase();
  if (lowered === "regular") return "Enrolled";
  if (lowered === "irregular") return "Irregular";
  return status;
}

function isIrregularStatus(status) {
  return normalizeText(status).toLowerCase() === "irregular";
}

function sectionNameToIndex(sectionName) {
  const normalized = normalizeSectionName(sectionName);
  if (!/^[A-Z]+$/.test(normalized)) return Number.MAX_SAFE_INTEGER;
  let index = 0;
  for (const character of normalized) {
    index = index * 26 + (character.charCodeAt(0) - 64);
  }
  return index;
}

function indexToSectionName(index) {
  let current = index;
  let name = "";
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function getNextSectionName(usedNames) {
  let index = 1;
  while (index < 1000) {
    const candidate = indexToSectionName(index);
    if (!usedNames.has(candidate)) return candidate;
    index += 1;
  }
  throw new Error("Unable to allocate a new section name");
}

function sectionHasCapacityForStudent(section, student) {
  if (isIrregularStatus(student.status)) {
    return Number(section?.irregularCount ?? 0) < Number(section?.irregularCapacity ?? DEFAULT_TOTAL_CAPACITY * 0.1);
  }
  return Number(section?.blockCount ?? 0) < Number(section?.blockCapacity ?? DEFAULT_TOTAL_CAPACITY * 0.9);
}

function sortSectionsByAge(left, right) {
  const leftCreatedAt = new Date(left?.createdAt ?? 0).getTime();
  const rightCreatedAt = new Date(right?.createdAt ?? 0).getTime();
  if (leftCreatedAt !== rightCreatedAt) return leftCreatedAt - rightCreatedAt;
  const leftIndex = sectionNameToIndex(left?.section);
  const rightIndex = sectionNameToIndex(right?.section);
  if (leftIndex !== rightIndex) return leftIndex - rightIndex;
  return normalizeSectionName(left?.section).localeCompare(normalizeSectionName(right?.section), undefined, {
    numeric: true, sensitivity: "base",
  });
}

function chooseSectionForStudent(sectionGroups, student) {
  const year = normalizeText(student.year);
  const semester = normalizeSemester(student.semester);
  const groupKey = `${year}::${semester}`;
  let groupSections = sectionGroups.get(groupKey);
  if (!groupSections) {
    groupSections = [];
    sectionGroups.set(groupKey, groupSections);
  }
  const orderedSections = [...groupSections].sort(sortSectionsByAge);
  const availableSection = orderedSections.find((section) => sectionHasCapacityForStudent(section, student));
  if (availableSection) return availableSection;
  const usedNames = new Set(groupSections.map((section) => normalizeSectionName(section.section)).filter(Boolean));
  const sourceSection = orderedSections[0] ?? null;
  const nextSection = createSectionState({ year, semester, section: getNextSectionName(usedNames), sourceSection });
  groupSections.push(nextSection);
  return nextSection;
}

/**
 * Build section groups map from existing section records.
 */
async function buildSectionGroups() {
  const existingSections = await Section.find({}).lean();
  const sectionGroups = new Map();
  for (const section of existingSections) {
    const year = normalizeText(section.year);
    const semester = normalizeSemester(section.semester);
    const sectionName = normalizeSectionName(section.section);
    if (!year || !sectionName) continue;
    const key = `${year}::${semester}`;
    const group = sectionGroups.get(key) || [];
    group.push({
      year,
      semester,
      section: sectionName,
      blockCount: Number(section.blockCount ?? section.regular ?? 0),
      irregularCount: Number(section.irregularCount ?? section.irregular ?? 0),
      blockCapacity: Number(section.blockCapacity ?? section.regularCapacity ?? DEFAULT_TOTAL_CAPACITY * 0.9),
      irregularCapacity: Number(section.irregularCapacity ?? DEFAULT_TOTAL_CAPACITY * 0.1),
      totalCapacity: Number(section.totalCapacity ?? DEFAULT_TOTAL_CAPACITY),
    });
    sectionGroups.set(key, group);
  }
  return sectionGroups;
}

// ─── API Endpoints ───────────────────────────────────────────────────────────

export async function getAllStudents(req, res) {
  try {
    const { status, year, section, semester } = req.query;
    const query = {};
    if (status && status !== 'All students') query.status = status;
    if (year && year !== 'All') {
      const num = Number(year);
      if (!Number.isNaN(num)) {
        query.$or = [{ year: num }, { year }];
      } else {
        query.year = year;
      }
    }
    if (section && section !== 'All') query.section = section;
    if (semester && semester !== 'All') query.semester = semester;
    const students = await Student.find(query).sort({ createdAt: -1 });
    res.status(200).json(students);
  } catch (error) {
    console.error("Error in getAllStudents controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getPendingApplicants(req, res) {
  try {
    const Applicant = getDbModel("Applicant", "applicants");
    const Validation = getDbModel("Validation", "validation");
    const [applicants, validations] = await Promise.all([
      Applicant.find(
        { applicantId: { $exists: true, $ne: null } },
        { _id: 0, applicantId: 1, firstName: 1, lastName: 1 }
      ).lean(),
      Validation.find(
        { applicant_number: { $exists: true, $ne: null } },
        { _id: 0, applicant_number: 1, status: 1 }
      ).lean(),
    ]);
    const statusByApplicantNumber = new Map(validations.map((item) => [String(item.applicant_number), item.status]));
    const pendingApplicants = applicants
      .map((applicant) => {
        const applicantNumber = String(applicant.applicantId ?? "");
        const firstName = String(applicant.firstName ?? "").trim();
        const lastName = String(applicant.lastName ?? "").trim();
        const status = statusByApplicantNumber.get(applicantNumber) ?? "Pending";
        return { applicant_number: applicantNumber, applicant_name: `${firstName} ${lastName}`.trim(), status };
      })
      .filter((item) => {
        const normalizedStatus = String(item.status ?? "").toLowerCase();
        return !normalizedStatus || normalizedStatus.includes("pending");
      });
    res.status(200).json(pendingApplicants);
  } catch (error) {
    console.error("Error in getPendingApplicants controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getApplicantsForEnrollment(req, res) {
  try {
    const Applicant = getDbModel("Applicant", "applicants");
    // Only fetch applicants that have section, year, semester AND status === "Confirmed"
    const applicants = await Applicant.find(
       {
         $and: [
           { section: { $exists: true, $ne: null, $ne: "" } },
           { year: { $exists: true, $ne: null, $ne: "" } },
           { semester: { $exists: true, $ne: null, $ne: "" } },
           { status: "Confirmed" },
         ],
       },
       {
         _id: 0,
         applicantId: 1,
         firstName: 1,
         lastName: 1,
         status: 1,
         year: 1,
         section: 1,
         semester: 1,
         isIrregular: 1,
       }
     ).lean();

    const formattedApplicants = applicants.map((applicant) => ({
      applicantID: String(applicant.applicantId ?? "").trim(),
      applicant_name: `${String(applicant.firstName ?? "").trim()} ${String(applicant.lastName ?? "").trim()}`.trim(),
      status: String(applicant.status ?? "Pending").trim() || "Pending",
      year: String(applicant.year ?? "").trim(),
      section: String(applicant.section ?? "").trim(),
      semester: String(applicant.semester ?? "").trim(),
      isIrregular: Boolean(applicant.isIrregular),
    })).filter((a) => a.applicantID || a.applicant_name || a.status);

    res.status(200).json(formattedApplicants);
  } catch (error) {
    console.error("Error in getApplicantsForEnrollment controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getStudentSections(req, res) {
  try {
    const sections = await Student.distinct("section", { section: { $exists: true, $ne: null } });
    const normalizedSections = sections
      .map((s) => s?.trim())
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }));
    res.status(200).json(normalizedSections);
  } catch (error) {
    console.error("Error in getStudentSections controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getStudentById(req, res) {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ message: "Student not found!" });
    res.json(student);
  } catch (error) {
    console.error("Error in getStudentById controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getStudentBySection(req, res) {
  try {
    const student = await Student.findBySection(req.params.section);
    if (!student) return res.status(404).json({ message: "Student not found!" });
    res.json(student);
  } catch (error) {
    console.error("Error in getStudentBySection controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function createStudent(req, res) {
  try {
    const student = new Student(req.body);
    const savedStudent = await student.save();
    res.status(201).json(savedStudent);
  } catch (error) {
    console.error("Error in createStudent controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function updateStudent(req, res) {
  try {
    const updatedStudent = await Student.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updatedStudent) return res.status(404).json({ message: "Student not found" });
    res.status(200).json(updatedStudent);
  } catch (error) {
    console.error("Error in updateStudent controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function deleteStudent(req, res) {
  try {
    const deletedStudent = await Student.findByIdAndDelete(req.params.id);
    if (!deletedStudent) return res.status(404).json({ message: "Student not found" });
    res.status(200).json({ message: "Student deleted successfully!" });
  } catch (error) {
    console.error("Error in deleteStudent controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

// ─── Enrollment Logic ────────────────────────────────────────────────────────

export async function enrollFromApplicant(req, res) {
  try {
    const { applicantID } = req.body;
    if (!applicantID) return res.status(400).json({ message: "applicantID is required" });

    const Applicant = getDbModel("Applicant", "applicants");
    const searchConditions = [
      { applicantId: applicantID },
      { applicantId: Number(applicantID) },
      { applicantID },
      { applicant_id: applicantID },
      { applicant_number: applicantID },
      { applicant_number: Number(applicantID) },
    ];
    if (mongoose.Types.ObjectId.isValid(applicantID)) {
      searchConditions.push({ _id: new mongoose.Types.ObjectId(applicantID) });
    }

    const applicant = await Applicant.findOne({ $or: searchConditions }).lean();
    if (!applicant) return res.status(404).json({ message: "Applicant not found" });

    // Generate studentNumber from applicantId (strip "A-" prefix)
    const rawId = String(
      applicant.applicantId ?? applicant.applicantID ?? applicant.applicant_id ?? applicant.applicant_number ?? ""
    ).trim();
    const studentNumber = rawId.replace(/^A-?/i, "");

    // Check for duplicate studentNumber
    const existingStudent = await Student.findOne({ studentNumber }).lean();
    if (existingStudent) {
      return res.status(409).json({
        message: "Enrollment blocked: Student number already exists",
        blockReason: "student_exists",
        studentNumber,
      });
    }

    // Build section groups for auto-sectioning
    const sectionGroups = await buildSectionGroups();
    const enrollmentYear = normalizeText(applicant.year);
    const enrollmentSemester = normalizeSemester(applicant.semester);
    const tempStudent = { ...applicant, year: enrollmentYear, semester: enrollmentSemester, status: "Block" };
    const chosenSection = chooseSectionForStudent(sectionGroups, tempStudent);

    // Build the student object — normalize all fields from applicant to camelCase
    const normalizedApplicant = normalizeImportedStudent(applicant);
    const now = new Date();
    const student = {
      ...normalizedApplicant,
      studentNumber,
      status: "Block",
      year: enrollmentYear,
      semester: enrollmentSemester,
      section: chosenSection.section,
      createdAt: now,
      updatedAt: now,
    };

    // Insert the student
    await Student.create(student);

    // Update the applicant's status to "Enrolled" (keep in applicants collection)
    await Applicant.updateOne(
      { _id: applicant._id },
      { $set: { status: "Enrolled" } }
    );

    addStudentToSectionState(chosenSection, student.status);
    
    // Persist section with correct capacities before syncing
    await Section.findOneAndUpdate(
      { year: chosenSection.year, section: chosenSection.section, semester: chosenSection.semester },
      {
        $set: {
          blockCapacity: chosenSection.blockCapacity,
          irregularCapacity: chosenSection.irregularCapacity,
          totalCapacity: chosenSection.totalCapacity,
        }
      },
      { new: true, upsert: true }
    );
    
    await syncSectionFromStudents(student);

    res.status(200).json({ message: "Student enrolled successfully", student });
  } catch (error) {
    console.error("Error in enrollFromApplicant controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * Helper: find an applicant by ID from the applicants collection.
 */
async function findApplicantForEnrollment(applicantID) {
  const searchConditions = [
    { applicantId: applicantID },
    { applicantId: Number(applicantID) },
    { applicantID },
    { applicant_id: applicantID },
    { applicant_number: applicantID },
    { applicant_number: Number(applicantID) },
  ];
  if (mongoose.Types.ObjectId.isValid(applicantID)) {
    searchConditions.push({ _id: new mongoose.Types.ObjectId(applicantID) });
  }
  const Applicant = getDbModel("Applicant", "applicants");
  const applicant = await Applicant.findOne({ $or: searchConditions }).lean();
  if (!applicant) return null;
  const rawId = String(
    applicant.applicantId ?? applicant.applicantID ?? applicant.applicant_id ?? applicant.applicant_number ?? ""
  ).trim();
  const studentNumber = rawId.replace(/^A-?/i, "");
  return { applicant, studentNumber };
}

export async function batchEnrollPreview(req, res) {
  try {
    const { applicantIDs } = req.body;
    if (!Array.isArray(applicantIDs) || applicantIDs.length === 0) {
      return res.status(400).json({ message: "applicantIDs array is required" });
    }
    const sectionGroups = await buildSectionGroups();
    const preview = { placements: [], blocked: [], notFound: [] };

    for (const applicantID of applicantIDs) {
      const found = await findApplicantForEnrollment(applicantID);
      if (!found) {
        preview.notFound.push({ applicantID });
        continue;
      }
      const { applicant, studentNumber } = found;

      const existingStudent = await Student.findOne({ studentNumber }).lean();
      if (existingStudent) {
        preview.blocked.push({
          applicantID,
          applicant_name: `${String(applicant.firstName ?? "").trim()} ${String(applicant.lastName ?? "").trim()}`.trim() || "Unknown",
          studentNumber,
          reason: "student_exists",
        });
        continue;
      }

      const enrollmentYear = normalizeText(applicant.year);
      const enrollmentSemester = normalizeSemester(applicant.semester);
      const tempStudent = { ...applicant, year: enrollmentYear, semester: enrollmentSemester, status: "Block" };
      const chosenSection = chooseSectionForStudent(sectionGroups, tempStudent);
      addStudentToSectionState(chosenSection, tempStudent.status);

      preview.placements.push({
        applicantID,
        applicant_name: `${String(applicant.firstName ?? "").trim()} ${String(applicant.lastName ?? "").trim()}`.trim() || "Unknown",
        studentNumber,
        assigned_section: chosenSection.section,
        assigned_year: chosenSection.year,
        assigned_semester: chosenSection.semester,
      });
    }

    res.status(200).json(preview);
  } catch (error) {
    console.error("Error in batchEnrollPreview controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function batchEnrollFromApplicants(req, res) {
  try {
    const { applicantIDs } = req.body;
    if (!Array.isArray(applicantIDs) || applicantIDs.length === 0) {
      return res.status(400).json({ message: "applicantIDs array is required" });
    }

    const sectionGroups = await buildSectionGroups();
    const results = { enrolled: [], blocked: [], notFound: [] };

    for (const applicantID of applicantIDs) {
      try {
        const found = await findApplicantForEnrollment(applicantID);
        if (!found) {
          results.notFound.push({ applicantID });
          continue;
        }

        const { applicant, studentNumber } = found;

        const existingStudent = await Student.findOne({ studentNumber }).lean();
        if (existingStudent) {
          results.blocked.push({
            applicantID,
            applicant_name: `${String(applicant.firstName ?? "").trim()} ${String(applicant.lastName ?? "").trim()}`.trim() || "Unknown",
            studentNumber,
            reason: "student_exists",
          });
          continue;
        }

        const enrollmentYear = normalizeText(applicant.year);
        const enrollmentSemester = normalizeSemester(applicant.semester);
        const tempStudent = { ...applicant, year: enrollmentYear, semester: enrollmentSemester, status: "Block" };
        const chosenSection = chooseSectionForStudent(sectionGroups, tempStudent);

        // Build the student object — normalize all fields from applicant to camelCase
        const normalizedApplicant = normalizeImportedStudent(applicant);
        const now = new Date();
        const student = {
          ...normalizedApplicant,
          studentNumber,
          status: "Block",
          year: enrollmentYear,
          semester: enrollmentSemester,
          section: chosenSection.section,
          createdAt: now,
          updatedAt: now,
        };

        await Student.create(student);

        // Update applicant status to "Enrolled" (keep in applicants collection)
        const Applicant = getDbModel("Applicant", "applicants");
        await Applicant.updateOne(
          { _id: applicant._id },
          { $set: { status: "Enrolled" } }
        );

        addStudentToSectionState(chosenSection, student.status);
        
        // Persist section with correct capacities before syncing
        await Section.findOneAndUpdate(
          { year: chosenSection.year, section: chosenSection.section, semester: chosenSection.semester },
          {
            $set: {
              blockCapacity: chosenSection.blockCapacity,
              irregularCapacity: chosenSection.irregularCapacity,
              totalCapacity: chosenSection.totalCapacity,
            }
          },
          { new: true, upsert: true }
        );
        
        await syncSectionFromStudents(student);

        results.enrolled.push({
          applicantID,
          applicant_name: `${String(applicant.firstName ?? "").trim()} ${String(applicant.lastName ?? "").trim()}`.trim() || "Unknown",
          studentNumber,
          assigned_section: chosenSection.section,
        });
      } catch (err) {
        console.error(`[BatchEnroll] Error enrolling applicant ${applicantID}:`, err);
        results.blocked.push({
          applicantID,
          applicant_name: "Unknown",
          reason: "internal_error",
          error: err instanceof Error ? err.message : String(err ?? "Unknown error"),
        });
      }
    }

    res.status(200).json({
      message: `Batch enrollment completed: ${results.enrolled.length} enrolled, ${results.blocked.length} blocked, ${results.notFound.length} not found`,
      ...results,
    });
  } catch (error) {
    console.error("Error in batchEnrollFromApplicants controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

// ─── Import Logic ────────────────────────────────────────────────────────────

function normalizeImportedStudent(raw = {}) {
  const firstName = String(raw.firstName ?? raw.first_name ?? "").trim();
  const lastName = String(raw.lastName ?? raw.last_name ?? "").trim();
  const middleName = String(raw.middleName ?? raw.middle_name ?? "").trim();
  const name = String(raw.name ?? `${firstName} ${lastName}`.trim()).trim();

  return {
    studentNumber: String(raw.studentNumber ?? raw.student_number ?? "").trim(),
    firstName,
    lastName,
    middleName,
    name,
    year: raw.year != null && raw.year !== "" ? String(raw.year).trim() : "",
    semester: normalizeSemester(raw.semester),
    status: normalizeStatus(raw.status),
    section: String(raw.section ?? "").trim(),
    email: String(raw.email ?? "").trim(),
    password: String(raw.password ?? "").trim(),
    schoolYear: String(raw.schoolYear ?? raw.school_year ?? "").trim(),
    birthDate: String(raw.birthDate ?? raw.birth_date ?? "").trim(),
    contactNumber: String(raw.contactNumber ?? raw.contact_number ?? "").trim(),
    gender: String(raw.gender ?? "").trim(),
    civilStatus: String(raw.civilStatus ?? "").trim(),
    placeOfBirth: String(raw.placeOfBirth ?? "").trim(),
    suffix: String(raw.suffix ?? "").trim(),
    spouseName: String(raw.spouseName ?? "").trim(),
    fatherName: String(raw.fatherName ?? raw.father_name ?? "").trim(),
    fatherContact: String(raw.fatherContact ?? raw.father_contact ?? "").trim(),
    motherName: String(raw.motherName ?? raw.mother_name ?? "").trim(),
    motherContact: String(raw.motherContact ?? raw.mother_contact ?? "").trim(),
    course: String(raw.course ?? "").trim(),
    applicantType: String(raw.applicantType ?? "").trim(),
    permanentHouse: String(raw.permanentHouse ?? "").trim(),
    permanentStreet: String(raw.permanentStreet ?? "").trim(),
    permanentBarangay: String(raw.permanentBarangay ?? "").trim(),
    permanentCity: String(raw.permanentCity ?? "").trim(),
    permanentProvince: String(raw.permanentProvince ?? "").trim(),
    permanentZip: String(raw.permanentZip ?? "").trim(),
    presentHouse: String(raw.presentHouse ?? "").trim(),
    presentStreet: String(raw.presentStreet ?? "").trim(),
    presentBarangay: String(raw.presentBarangay ?? "").trim(),
    presentCity: String(raw.presentCity ?? "").trim(),
    presentProvince: String(raw.presentProvince ?? "").trim(),
    presentZip: String(raw.presentZip ?? "").trim(),
    elementarySchool: String(raw.elementarySchool ?? raw.elementary_school ?? "").trim(),
    elementaryAddress: String(raw.elementaryAddress ?? raw.elementary_address ?? "").trim(),
    elementaryYear: String(raw.elementaryYear ?? "").trim(),
    juniorHighSchool: String(raw.juniorHighSchool ?? raw.junior_high_school ?? "").trim(),
    juniorHighAddress: String(raw.juniorHighAddress ?? raw.junior_high_address ?? "").trim(),
    juniorHighYear: String(raw.juniorHighYear ?? "").trim(),
    seniorHighSchool: String(raw.seniorHighSchool ?? raw.senior_high_school ?? "").trim(),
    seniorHighAddress: String(raw.seniorHighAddress ?? raw.senior_high_address ?? "").trim(),
    seniorHighYear: String(raw.seniorHighYear ?? "").trim(),
    collegeSchool: String(raw.collegeSchool ?? raw.college_school ?? "").trim(),
    collegeAddress: String(raw.collegeAddress ?? raw.college_address ?? "").trim(),
    collegeYear: String(raw.collegeYear ?? "").trim(),
    disability: raw.disability === true || raw.disability === "true",
    indigenous: raw.indigenous === true || raw.indigenous === "true",
    soloParent: raw.soloParent === true || raw.soloParent === "true",
    fourPs: raw.fourPs === true || raw.fourPs === "true",
  };
}

export async function importStudents(req, res) {
  try {
    const rows = Array.isArray(req.body?.students) ? req.body.students : [];
    const importType = String(req.body?.importType ?? "student").toLowerCase();

    console.log(`[Import] Starting ${importType} import with ${rows.length} rows`);

    if (!rows.length) return res.status(400).json({ message: "students array is required" });

    const normalized = rows.map(normalizeImportedStudent).filter((s) => s.studentNumber);
    if (!normalized.length) return res.status(400).json({ message: "No valid student rows found" });

    const existingSections = await Section.find({}).lean();
    const sectionGroups = new Map();
    for (const section of existingSections) {
      const year = normalizeText(section.year);
      const semester = normalizeSemester(section.semester);
      const sectionName = normalizeSectionName(section.section);
      if (!year || !sectionName) continue;
      const key = `${year}::${semester}`;
      const group = sectionGroups.get(key) || [];
      group.push({
        year, semester, section: sectionName,
        blockCount: Number(section.blockCount ?? section.regular ?? 0),
        irregularCount: Number(section.irregularCount ?? section.irregular ?? 0),
        blockCapacity: Number(section.blockCapacity ?? section.regularCapacity ?? DEFAULT_TOTAL_CAPACITY * 0.9),
        irregularCapacity: Number(section.irregularCapacity ?? DEFAULT_TOTAL_CAPACITY * 0.1),
        totalCapacity: Number(section.totalCapacity ?? DEFAULT_TOTAL_CAPACITY),
      });
      sectionGroups.set(key, group);
    }

    const existingStudents = await Student.find(
      { studentNumber: { $in: normalized.map((s) => String(s.studentNumber).trim()) } },
      { studentNumber: 1, firstName: 1, lastName: 1 }
    ).lean();

    const existingStudentNumbers = new Set(existingStudents.map((s) => String(s.studentNumber).trim()));

    if (importType === "student") {
      const duplicates = normalized.filter((s) => existingStudentNumbers.has(String(s.studentNumber).trim()));
      if (duplicates.length > 0) {
        return res.status(409).json({
          message: "Import Blocked: Student Number Already Exist",
          blockReason: "student_exists",
          duplicates: duplicates.map((s) => ({ studentNumber: s.studentNumber, firstName: s.firstName, lastName: s.lastName })),
        });
      }
    }

    const missingYearStudent = normalized.find((s) => !normalizeText(s.year));
    if (missingYearStudent) {
      return res.status(400).json({ message: `Student ${missingYearStudent.studentNumber} is missing a year value` });
    }

    const toImport = normalized
      .filter((s) => !existingStudentNumbers.has(String(s.studentNumber).trim()))
      .map((student) => {
        const chosenSection = chooseSectionForStudent(sectionGroups, student);
        addStudentToSectionState(chosenSection, student.status);
        return { ...student, section: chosenSection.section };
      });

    const blocked = normalized.filter((s) => existingStudentNumbers.has(String(s.studentNumber).trim()));

    if (importType === "section" && blocked.length > 0 && toImport.length === 0) {
      return res.status(409).json({
        message: "Import Blocked: All students in this section already exist",
        blockReason: "all_students_exist",
        blocked: blocked.map((s) => ({ studentNumber: s.studentNumber, firstName: s.firstName, lastName: s.lastName })),
      });
    }

    const operations = toImport.map((student) => ({
      updateOne: {
        filter: { studentNumber: student.studentNumber },
        update: { $set: student },
        upsert: true,
      },
    }));

    let result = { upsertedCount: 0, modifiedCount: 0, matchedCount: 0 };
    if (operations.length > 0) {
      result = await Student.bulkWrite(operations, { ordered: false });
    }

    if (toImport.length > 0) {
      const sectionOps = [];
      for (const sections of sectionGroups.values()) {
        for (const section of sections) {
          sectionOps.push({
            updateOne: {
              filter: { year: section.year, section: section.section, semester: section.semester },
              update: {
                $set: {
                  year: section.year, section: section.section, semester: section.semester,
                  blockCount: section.blockCount, irregularCount: section.irregularCount,
                  blockCapacity: section.blockCapacity, irregularCapacity: section.irregularCapacity,
                  totalCapacity: section.totalCapacity,
                  status: getSectionStatus(section.blockCount, section.irregularCount, section.totalCapacity),
                },
              },
              upsert: true,
            },
          });
        }
      }
      if (sectionOps.length > 0) await Section.bulkWrite(sectionOps, { ordered: false });
    }

    res.status(200).json({
      message: "Students imported successfully",
      received: rows.length,
      imported: toImport.length,
      blocked: blocked.map((s) => ({ studentNumber: s.studentNumber, firstName: s.firstName, lastName: s.lastName })),
      upserted: result.upsertedCount ?? 0,
      modified: result.modifiedCount ?? 0,
      matched: result.matchedCount ?? 0,
    });
  } catch (error) {
    console.error("Error in importStudents controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}