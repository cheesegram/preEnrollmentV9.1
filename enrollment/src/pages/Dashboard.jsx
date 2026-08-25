import React, { useMemo, useEffect, useState, useRef } from 'react';
import Modal from '../components/Modal';
import StudentsTable from '../components/StudentsTable';
import api from "../lib/axios";
import toast from "react-hot-toast";
import PageHeader from "../components/ui/PageHeader";
import StatCard from "../components/ui/StatCard";
import QuickActionCard from "../components/ui/QuickActionCard";
import LoadingState from "../components/ui/LoadingState";
import Panel from "../components/ui/Panel";
import { buildScheduleMap } from "../lib/scheduleUtils";
import { pushImportNotification } from "../lib/notificationUtils";
import {
    exportStudentsAsCsv,
    exportStudentsAsXlsx,
    parseBlockApplicantFile,
    sanitizeFileName,
} from "../utils/studentFiles";
import { getStudentSectionDisplay, getStudentYearDisplay } from "../utils/studentDisplay";

function Dashboard() {
    const [modalOpen, setModalOpen] = useState(false);
    const [modalTitle, setModalTitle] = useState("");
    const [students, setStudents] = useState([]);
    const [sections, setSections] = useState([]);
    const [scheduleMap, setScheduleMap] = useState(new Map());
    const [pendingApplicants, setPendingApplicants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modalQuery, setModalQuery] = useState("");
    const [yearFilter, setYearFilter] = useState("All Year");
    const [isImporting, setIsImporting] = useState(false);
    const [isEnrolling, setIsEnrolling] = useState(false);
    const [isBatchEnrolling, setIsBatchEnrolling] = useState(false);
    const [blockEnrollOpen, setBlockEnrollOpen] = useState(false);
    const [blockPreviewData, setBlockPreviewData] = useState(null);
    const [blockImportRows, setBlockImportRows] = useState([]);
    const [isBlockEnrolling, setIsBlockEnrolling] = useState(false);
    const [selectedSectionGroup, setSelectedSectionGroup] = useState(null);
    const [previewData, setPreviewData] = useState(null);
    const [showEnrollmentPreview, setShowEnrollmentPreview] = useState(false);
    const [showBlockedList, setShowBlockedList] = useState(false);
    const [exportTypeOpen, setExportTypeOpen] = useState(false);
    const [studentExportOpen, setStudentExportOpen] = useState(false);
    const [sectionExportOpen, setSectionExportOpen] = useState(false);
    const [exportFormatOpen, setExportFormatOpen] = useState(false);
    const [exportTarget, setExportTarget] = useState(null);
    const [studentExportQuery, setStudentExportQuery] = useState("");
    const [sectionExportQuery, setSectionExportQuery] = useState("");
    const [atPageBottom, setAtPageBottom] = useState(false);
    const [bottomSheetDismissed, setBottomSheetDismissed] = useState(false);
    const importInputRef = useRef(null);

    const isNewStudent = (student) => String(student.year) === "1" && String(student.semester) === "1st" && student.status !== "Pending";

    const newStudentsCount = students.filter(isNewStudent).length;
    const blockCount = students.filter(s => s.status === "Block").length;
    const pendingCount = pendingApplicants.length;
    const irregularCount = students.filter(s => s.status === "Irregular").length;
    const totalCount = students.filter(s => s.status !== "Pending").length;

    useMemo(() => {
        document.title = "Dashboard - IITI Enrollment System";
    }, []);

    const recentNonPending = React.useMemo(() => {
        return students
            .filter(s => s.status !== 'Pending')
            .slice(0, 100);
    }, [students]);

    const openModal = (title) => {
        setBottomSheetDismissed(true);
        setModalTitle(title);
        setModalQuery("");
        setYearFilter("All Year");
        setSelectedSectionGroup(null);
        setShowEnrollmentPreview(false);
        setPreviewData(null);
        setModalOpen(true);
    };

    const fetchStudents = async () => {
        try {
            const [studentsRes, pendingRes] = await Promise.all([
                api.get("/students", { params: { t: Date.now() } }),
                api.get("/students/applicants", { params: { t: Date.now() } }),
            ]);

            setStudents(Array.isArray(studentsRes.data) ? studentsRes.data : []);
            setPendingApplicants(Array.isArray(pendingRes.data) ? pendingRes.data : []);
        } catch (error) {
            console.error("Error fetching students", error.response);
            if (error.response?.status === 429) {
                toast.error("Too many requests. Please try again shortly.");
            } else {
                toast.error("Failed to load students");
            }
        } finally {
            setLoading(false);
        }
    };

    const fetchSections = async () => {
        try {
            const sectionsRes = await api.get("/sections", { params: { t: Date.now() } });
            setSections(Array.isArray(sectionsRes.data) ? sectionsRes.data : []);
        } catch (error) {
            console.error("Error fetching sections", error);
        }
    };

    const fetchMasterSchedule = async () => {
        try {
            const schedulesRes = await api.get("/schedules");
            const availableSchedules = Array.isArray(schedulesRes.data) ? schedulesRes.data : [];

            if (availableSchedules.length === 0) {
                setScheduleMap(new Map());
                return;
            }

            const scheduleDetailResults = await Promise.allSettled(
                availableSchedules.map(async (schedule) => {
                    if (!schedule?._id) return null;

                    const detailsRes = await api.get(`/schedules/${schedule._id}`);
                    return detailsRes.data;
                })
            );

            const scheduleDetails = scheduleDetailResults
                .map((result) => (result.status === "fulfilled" ? result.value : null))
                .filter(Boolean);

            setScheduleMap(buildScheduleMap(scheduleDetails));
        } catch (error) {
            console.error("Error fetching master schedule", error);
            setScheduleMap(new Map());
        }
    };

    useEffect(() => {
        fetchStudents();
        fetchSections();
        fetchMasterSchedule();
    }, []);

    useEffect(() => {
        let animationFrame = null;

        const updateBottomState = () => {
            if (animationFrame) window.cancelAnimationFrame(animationFrame);
            animationFrame = window.requestAnimationFrame(() => {
                const documentHeight = document.documentElement.scrollHeight;
                const viewportBottom = window.scrollY + window.innerHeight;
                const reachedBottom = window.scrollY > 160 && viewportBottom >= documentHeight - 24;

                setAtPageBottom((previous) => previous === reachedBottom ? previous : reachedBottom);
                if (!reachedBottom) setBottomSheetDismissed(false);
            });
        };

        updateBottomState();
        window.addEventListener("scroll", updateBottomState, { passive: true });
        window.addEventListener("resize", updateBottomState);

        return () => {
            if (animationFrame) window.cancelAnimationFrame(animationFrame);
            window.removeEventListener("scroll", updateBottomState);
            window.removeEventListener("resize", updateBottomState);
        };
    }, []);

    const pendingModalApplicants = useMemo(() => {
        let result = pendingApplicants;

        if (modalQuery) {
            const q = modalQuery.trim().toLowerCase();
            result = result.filter((item) => {
                const applicantID = String(item.applicantID ?? "").toLowerCase();
                const applicantName = String(item.applicant_name ?? "").toLowerCase();
                const status = String(item.status ?? "").toLowerCase();
                return applicantID.includes(q) || applicantName.includes(q) || status.includes(q);
            });
        }

        return [...result].sort((left, right) => {
            const leftId = String(left.applicantID ?? "");
            const rightId = String(right.applicantID ?? "");
            return leftId.localeCompare(rightId, undefined, { numeric: true, sensitivity: "base" });
        });
    }, [pendingApplicants, modalQuery]);

    const modalStudents = useMemo(() => {
        let result = students;

        if (modalTitle === "New Students") {
            result = result.filter(isNewStudent);
        } else if (modalTitle === "Block Students") {
            result = result.filter(s => s.status === "Block");
        } else if (modalTitle === "Irregular Students") {
            result = result.filter(s => s.status === "Irregular");
        } else if (modalTitle === "All Students") {
            result = result.filter(s => s.status !== "Pending");
        }

        if (modalQuery) {
            const q = modalQuery.trim().toLowerCase();
            result = result.filter(s => {
                const firstName = String(s.firstName ?? "").trim().toLowerCase();
                const lastName = String(s.lastName ?? "").trim().toLowerCase();
                const num = String(s.studentNumber ?? "").toLowerCase();
                const name = `${firstName} ${lastName}`.trim().toLowerCase();
                const reverseName = `${lastName} ${firstName}`.trim().toLowerCase();

                if (/^[a-z]/i.test(q)) return firstName.includes(q) || lastName.includes(q) || name.includes(q) || reverseName.includes(q);
                return num.includes(q);
            });
        }
        return result;
    }, [students, modalTitle, modalQuery]);

    const exportableStudents = useMemo(() => {
        const q = studentExportQuery.trim().toLowerCase();
        const list = students.filter((s) => s.status !== "Pending");
        if (!q) return list;

        return list.filter((s) => {
            const studentNumber = String(s.studentNumber ?? "").toLowerCase();
            const fullName = `${String(s.firstName ?? "")} ${String(s.lastName ?? "")}`.trim().toLowerCase();
            const section = String(s.section ?? "").toLowerCase();
            const year = String(s.year ?? "").toLowerCase();
            return studentNumber.includes(q) || fullName.includes(q) || section.includes(q) || year.includes(q);
        });
    }, [students, studentExportQuery]);

    const exportableSections = useMemo(() => {
        const totalsBySectionKey = new Map();
        students
            .filter((s) => s.status !== "Pending")
            .forEach((s) => {
                const year = String(s.year ?? "").trim();
                const section = String(s.section ?? "").trim();
                const semester = String(s.semester ?? "").trim() || "N/A";
                if (!year || !section) return;
                const key = `${year}-${section}-${semester}`;
                totalsBySectionKey.set(key, Number(totalsBySectionKey.get(key) || 0) + 1);
            });

        let list = (sections || []).map((sec) => {
            const year = String(sec.year ?? "").trim();
            const section = String(sec.section ?? "").trim();
            const semester = String(sec.semester ?? "").trim() || "N/A";
            const key = `${year}-${section}-${semester}`;
            return {
                key,
                year,
                section,
                semester,
                total: Number(totalsBySectionKey.get(key) || 0),
            };
        }).sort((a, b) => {
            const yearCompare = String(a.year).localeCompare(String(b.year), undefined, { numeric: true, sensitivity: "base" });
            if (yearCompare !== 0) return yearCompare;
            const sectionCompare = String(a.section).localeCompare(String(b.section), undefined, { numeric: true, sensitivity: "base" });
            if (sectionCompare !== 0) return sectionCompare;
            return String(a.semester).localeCompare(String(b.semester), undefined, { numeric: true, sensitivity: "base" });
        });

        const q = sectionExportQuery.trim().toLowerCase();
        if (!q) return list;

        list = list.filter((section) =>
            section.year.toLowerCase().includes(q) ||
            section.section.toLowerCase().includes(q) ||
            section.semester.toLowerCase().includes(q)
        );
        return list;
    }, [students, sections, sectionExportQuery]);

    const openExportFormat = (target) => {
        setExportTarget(target);
        setExportFormatOpen(true);
    };

    const handleQuickImport = () => {
        if (isImporting) return;
        importInputRef.current?.click();
    };

    const handleEnrollApplicant = async (applicant) => {
        if (isEnrolling) return;
        try {
            setIsEnrolling(true);
            const response = await api.post("/students/enroll", {
                applicantID: applicant.applicantID,
            });
            const successMsg = `Enrolled ${applicant.applicant_name} (${applicant.applicantID}) successfully`;
            toast.success(successMsg);
            pushImportNotification(successMsg, "success");
            await fetchStudents();
            await fetchSections();
            const pendingRes = await api.get("/students/applicants", { params: { t: Date.now() } });
            setPendingApplicants(Array.isArray(pendingRes.data) ? pendingRes.data : []);
        } catch (error) {
            console.error("Enroll failed", error);
            const responseStatus = error?.response?.status;
            const blockReason = error?.response?.data?.blockReason;
            const message = error?.response?.data?.message;
            const errorMsg = message || "Failed to enroll applicant";

            toast.error(errorMsg);
            pushImportNotification(
                `${applicant.applicant_name} (${applicant.applicantID}) : ${errorMsg}`,
                "error"
            );

            // Log blocked enrollment details if available
            if (responseStatus === 409 && blockReason === "student_exists") {
                const studentNumber = error?.response?.data?.studentNumber;
                const detailMsg = `${applicant.applicant_name} (${applicant.applicantID}) : Enrollment blocked - Student number ${studentNumber} already exists in the database`;
                pushImportNotification(detailMsg, "error");
            }
        } finally {
            setIsEnrolling(false);
        }
    };

    const handleImportFile = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            setIsImporting(true);
            const parsedApplicants = await parseBlockApplicantFile(file);

            console.log(`[Frontend] Previewing block enrollment for ${parsedApplicants.length} applicant(s) from ${file.name}`);

            const response = await api.post("/students/block-import-preview", {
                students: parsedApplicants,
            });

            setBlockImportRows(parsedApplicants);
            setBlockPreviewData({
                fileName: file.name,
                placements: Array.isArray(response.data?.placements) ? response.data.placements : [],
                blocked: Array.isArray(response.data?.blocked) ? response.data.blocked : [],
            });
            setBlockEnrollOpen(true);
        } catch (error) {
            console.error("[Frontend] Block applicant import failed", error);

            const message = error?.response?.data?.message || error?.message || "Failed to read the applicant file";
            toast.error(message);
            pushImportNotification(message, "error");
        } finally {
            setIsImporting(false);
            event.target.value = "";
        }
    };

    const handleConfirmBlockEnroll = async () => {
        if (!blockPreviewData || isBlockEnrolling) return;

        try {
            setIsBlockEnrolling(true);
            const response = await api.post("/students/import", {
                students: blockImportRows,
                importType: "block",
            });

            try {
                await api.post("/sections/sync");
            } catch (syncError) {
                console.warn("[Frontend] Section sync after block import failed", syncError);
            }

            const imported = response?.data?.imported ?? 0;
            const blocked = Array.isArray(response?.data?.blocked) ? response.data.blocked : [];

            blocked.forEach((student) => {
                const studentNumber = String(student.studentNumber ?? "").trim();
                const name = `${String(student.firstName ?? "").trim()} ${String(student.lastName ?? "").trim()}`.trim();
                const msg = `${studentNumber} - ${name} : Student number already exist in the database`;
                toast.error(msg);
                pushImportNotification(msg, "error");
            });

            const blockedNumbers = new Set(
                blocked.map((student) => String(student.studentNumber ?? "").trim())
            );

            blockPreviewData.placements
                .filter((placement) => !blockedNumbers.has(String(placement.studentNumber ?? "").trim()))
                .forEach((placement) => {
                    const detailMsg = `${placement.applicantID} - ${placement.applicant_name} : Enrolled to Section ${placement.assigned_section}`;
                    pushImportNotification(detailMsg, "success");
                });

            if (imported > 0) {
                const msg = `Enrolled ${imported} block applicant(s) from ${blockPreviewData.fileName}`;
                toast.success(msg);
                pushImportNotification(msg, "success");

                await fetchStudents();
                await fetchSections();
            } else {
                toast.error("No block applicants were enrolled");
            }

            setBlockEnrollOpen(false);
            setBlockPreviewData(null);
            setBlockImportRows([]);
        } catch (error) {
            console.error("Block enroll failed", error);
            toast.error(error?.response?.data?.message || "Failed to enroll block applicants");
        } finally {
            setIsBlockEnrolling(false);
        }
    };

    // Year filter mapping: display labels -> numeric values used in data
    const yearFilterOptions = [
        { label: "All Year", value: null },
        { label: "First Year", value: "1" },
        { label: "Second Year", value: "2" },
        { label: "Third Year", value: "3" },
        { label: "Fourth Year", value: "4" },
    ];

    // Group pending applicants by year, semester, section for the "To Be Admitted" UI
    const applicantSectionGroups = useMemo(() => {
        const groups = {};
        pendingModalApplicants.forEach((applicant) => {
            const year = String(applicant.year ?? "N/A").trim();
            const semester = String(applicant.semester ?? "N/A").trim();
            const section = String(applicant.section ?? "N/A").trim();
            const key = `${year}::${semester}::${section}`;
            if (!groups[key]) {
                groups[key] = {
                    key,
                    year,
                    semester,
                    section,
                    applicants: [],
                };
            }
            groups[key].applicants.push(applicant);
        });
        return Object.values(groups).filter((group) => {
            if (yearFilter === "All Year") return true;
            return group.year === yearFilter;
        }).sort((a, b) => {
            const yearCmp = a.year.localeCompare(b.year, undefined, { numeric: true, sensitivity: "base" });
            if (yearCmp !== 0) return yearCmp;
            const semesterCmp = a.semester.localeCompare(b.semester, undefined, { numeric: true, sensitivity: "base" });
            if (semesterCmp !== 0) return semesterCmp;
            return a.section.localeCompare(b.section, undefined, { numeric: true, sensitivity: "base" });
        });
    }, [pendingModalApplicants, yearFilter]);

    const handlePreviewBatchEnroll = async () => {
        if (!selectedSectionGroup || isBatchEnrolling) return;
        const applicantIDs = selectedSectionGroup.applicants.map((a) => a.applicantID).filter(Boolean);
        if (applicantIDs.length === 0) return;

        try {
            setIsBatchEnrolling(true);
            const response = await api.post("/students/batch-enroll-preview", { applicantIDs });
            const { placements, blocked, notFound } = response.data;
            setPreviewData({ placements, blocked, notFound });
            setShowEnrollmentPreview(true);
        } catch (error) {
            console.error("Preview failed", error);
            toast.error(error?.response?.data?.message || "Failed to preview enrollment");
        } finally {
            setIsBatchEnrolling(false);
        }
    };

    const handleConfirmBatchEnroll = async () => {
        if (!previewData || isBatchEnrolling) return;
        const applicantIDs = previewData.placements.map((p) => p.applicantID).filter(Boolean);
        if (applicantIDs.length === 0) {
            setShowEnrollmentPreview(false);
            return;
        }

        try {
            setIsBatchEnrolling(true);
            const response = await api.post("/students/batch-enroll", { applicantIDs });
            const { enrolled, blocked, notFound } = response.data;

            enrolled.forEach((item) => {
                const msg = `Enrolled ${item.applicant_name} (${item.applicantID}) successfully`;
                pushImportNotification(msg, "success");
            });
            blocked.forEach((item) => {
                let blockReason = "Enrollment blocked";
                if (item.reason === "student_exists") {
                    blockReason = `Student number ${item.studentNumber ?? ""} already exists`;
                } else if (item.reason === "internal_error") {
                    blockReason = item.error || "Internal server error";
                } else if (item.reason) {
                    blockReason = String(item.reason);
                }
                const msg = `${item.applicant_name} (${item.applicantID}) : ${blockReason}`;
                pushImportNotification(msg, "error");
            });
            notFound.forEach((item) => {
                pushImportNotification(`Applicant (${item.applicantID}) not found`, "error");
            });

            if (enrolled.length > 0) {
                toast.success(`Enrolled ${enrolled.length} applicant(s) from ${selectedSectionGroup.year}-${selectedSectionGroup.section}`);
            }
            if (blocked.length > 0) {
                toast.error(`${blocked.length} applicant(s) blocked`);
            }

            await fetchStudents();
            await fetchSections();
            const pendingRes = await api.get("/students/applicants", { params: { t: Date.now() } });
            setPendingApplicants(Array.isArray(pendingRes.data) ? pendingRes.data : []);
            setSelectedSectionGroup(null);
            setShowEnrollmentPreview(false);
            setPreviewData(null);
            setShowBlockedList(false);
        } catch (error) {
            console.error("Batch enroll failed", error);
            toast.error(error?.response?.data?.message || "Failed to batch enroll");
        } finally {
            setIsBatchEnrolling(false);
        }
    };

    const handleExportAs = (format) => {
        if (!exportTarget) return;

        if (exportTarget.kind === "student") {
            const student = exportTarget.student;
            const name = `${String(student.firstName ?? "").trim()} ${String(student.lastName ?? "").trim()}`.trim();
            const base = sanitizeFileName(`${student.studentNumber}_${name}`);
            const rows = [student];
            if (format === "xlsx") {
                exportStudentsAsXlsx(rows, base || String(student.studentNumber));
            } else {
                exportStudentsAsCsv(rows, base || String(student.studentNumber));
            }
        }

        if (exportTarget.kind === "section") {
            const section = exportTarget.section;
            const rows = students.filter(
                (student) =>
                    String(student.status ?? "") !== "Pending" &&
                    String(student.year ?? "") === String(section.year) &&
                    String(student.section ?? "") === String(section.section) &&
                    (String(student.semester ?? "").trim() || "N/A") === String(section.semester)
            );

            const semesterSuffix = section.semester && section.semester !== "N/A" ? `-${section.semester}` : "";
            const base = sanitizeFileName(`${section.year}-${section.section}${semesterSuffix}`);
            if (format === "xlsx") {
                exportStudentsAsXlsx(rows, base || "section");
            } else {
                exportStudentsAsCsv(rows, base || "section");
            }
        }

        setExportFormatOpen(false);
        setExportTarget(null);
        toast.success("Export completed");
    };

    const bottomSheetVisible =
        atPageBottom &&
        !bottomSheetDismissed &&
        !loading &&
        recentNonPending.length > 0 &&
        !modalOpen &&
        !exportTypeOpen &&
        !studentExportOpen &&
        !sectionExportOpen &&
        !exportFormatOpen;

    const getAssignedSectionsForPreview = (placement) => {
        const sectionsList = [];
        const seen = new Map();
        const fallbackYear = String(placement?.assigned_year ?? selectedSectionGroup?.year ?? "").trim();

        const pushSection = (yearValue, sectionValue, isMain = false) => {
            const section = String(sectionValue ?? "").trim();
            if (!section) return;
            const year = String(yearValue ?? "").trim() || fallbackYear;
            const key = `${year}::${section.toUpperCase()}`;

            if (seen.has(key)) {
                const existingIndex = seen.get(key);
                if (isMain) sectionsList[existingIndex].isMain = true;
                return;
            }

            seen.set(key, sectionsList.length);
            sectionsList.push({ year, section, isMain });
        };

        const explicitAssignedSections = Array.isArray(placement?.assigned_sections)
            ? placement.assigned_sections
            : [];

        if (explicitAssignedSections.length > 0) {
            explicitAssignedSections.forEach((entry, index) => {
                pushSection(
                    entry?.year,
                    entry?.section,
                    Boolean(entry?.isMain) || index === 0
                );
            });
        } else {
            pushSection(placement?.assigned_year, placement?.assigned_section, true);

            const irregularSections = Array.isArray(placement?.irregularSection)
                ? placement.irregularSection
                : [];
            const irregularYears = Array.isArray(placement?.irregularYear)
                ? placement.irregularYear
                : [];

            irregularSections.forEach((sectionName, index) => {
                const indexedYear = irregularYears[index];
                const sharedYear = irregularYears.length === 1 ? irregularYears[0] : undefined;
                pushSection(indexedYear ?? sharedYear, sectionName, false);
            });
        }

        if (sectionsList.length > 0 && sectionsList.every((entry) => !entry.isMain)) {
            sectionsList[0].isMain = true;
        }

        return sectionsList;
    };

    return (
        <>
            <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 p-4 sm:p-6 lg:p-8">
                <PageHeader
                    title="Enrollment Dashboard"
                    description="Monitor student registration, admission, and enrollment activity from one place."
                />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard
                        label="New Students"
                        value={newStudentsCount}
                        caption="First-year registrations"
                        icon="fa-solid fa-user-check"
                        tone="slate"
                        onClick={() => openModal("New Students")}
                    />
                    <StatCard
                        label="Block"
                        value={blockCount}
                        caption="Block students"
                        icon="fa-solid fa-ban"
                        tone="blue"
                        onClick={() => openModal("Block Students")}
                    />
                    <StatCard
                        label="Irregular"
                        value={irregularCount}
                        caption="Irregular students"
                        icon="fa-solid fa-shuffle"
                        tone="red"
                        onClick={() => openModal("Irregular Students")}
                    />
                    <StatCard
                        label="Enrolled"
                        value={totalCount}
                        caption="Enrolled students"
                        icon="fa-solid fa-users"
                        tone="green"
                        featured
                        onClick={() => openModal("All Students")}
                    />
                </div>

                <div>
                    <h3 className="text-lg font-extrabold tracking-tight text-slate-900">Quick actions</h3>
                    <p className="mt-1 text-sm text-slate-500">Complete common enrollment tasks without leaving the dashboard.</p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <QuickActionCard
                        icon="fa-solid fa-user-plus"
                        title={`To be admitted (${pendingCount})`}
                        description="Review approved applicants and enroll them."
                        onClick={() => openModal("To Be Admitted")}
                    />
                    <QuickActionCard
                        icon="fa-solid fa-file-arrow-up"
                        title={isImporting ? "Importing records..." : "Import student file"}
                        description="Upload student records using CSV or XLSX."
                        onClick={handleQuickImport}
                        disabled={isImporting}
                    />
                    <QuickActionCard
                        icon="fa-solid fa-file-arrow-down"
                        title="Export records"
                        description="Download individual or section records."
                        onClick={() => setExportTypeOpen(true)}
                    />
                </div>

                <div className="flex flex-col gap-4">
                    <div className="flex items-start justify-between gap-3 sm:items-end">
                        <div className="min-w-0 flex-1">
                            <h3 className="truncate text-base font-extrabold tracking-tight text-slate-900 sm:text-lg">Recently registered students</h3>
                            <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">The latest non-pending student records.</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => openModal("All Students")}
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-1.5 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100 hover:text-emerald-900 active:scale-95 sm:px-3.5 sm:py-2 sm:text-sm"
                        >
                            <span>View all</span>
                            <i className="fa-solid fa-arrow-right text-xs" />
                        </button>
                    </div>

                    <Panel className="min-h-[420px] overflow-hidden">
                        {loading ? (
                            <LoadingState label="Loading student records..." />
                        ) : (
                            <StudentsTable
                                students={recentNonPending}
                                scheduleMap={scheduleMap}
                                className="w-full border-0 shadow-none"
                                initialPageSize={10}
                                pageSizeOptions={[10, 20, 50]}
                            />
                        )}
                    </Panel>
                </div>
            </section>

            <div
                className={`fixed inset-0 z-[80] flex items-center justify-center p-3 transition-opacity duration-700 sm:p-6 md:left-[18rem] ${bottomSheetVisible
                        ? "pointer-events-auto opacity-100"
                        : "pointer-events-none opacity-0"
                    }`} 
                aria-hidden={!bottomSheetVisible}
                inert={!bottomSheetVisible}
            >
                <div className="absolute inset-0 bg-slate-950/20" aria-hidden="true" />

                <section
                    role="dialog"
                    aria-modal="false"
                    aria-label="Student records preview"
                    className={`relative flex max-h-[84vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-white/60 bg-white shadow-2xl shadow-slate-950/25 transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${bottomSheetVisible ? "translate-y-0 scale-100 opacity-100" : "translate-y-20 scale-[0.98] opacity-0"
                        }`}
                >
                    <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 bg-white px-4 py-4 sm:px-6">
                        <div className="min-w-0">
                            <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-emerald-700">End of dashboard</p>
                            <h3 className="mt-1 text-lg font-extrabold tracking-tight text-slate-900 sm:text-xl">Student records preview</h3>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setBottomSheetDismissed(true);
                                    openModal("All Students");
                                }}
                                className="hidden rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100 sm:inline-flex"
                            >
                                View all students
                            </button>
                            <button
                                type="button"
                                onClick={() => setBottomSheetDismissed(true)}
                                className="grid h-10 w-10 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-800"
                                aria-label="Close student records preview"
                            >
                                <i className="fa-solid fa-xmark" />
                            </button>
                        </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-hidden bg-slate-50/50 p-2 sm:p-4">
                        <StudentsTable
                            students={recentNonPending}
                            scheduleMap={scheduleMap}
                            className="w-full border-0 shadow-none"
                            initialPageSize={5}
                            pageSizeOptions={[5, 10, 20]}
                            tableHeightClass="h-[42vh] min-h-[260px]"
                        />
                    </div>
                </section>
            </div>

            <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={modalTitle}>
                <div className={`flex flex-col gap-4 p-4 md:p-6 overflow-hidden ${modalTitle === "To Be Admitted" ? "h-[70vh]" : "max-h-[80vh] h-full"}`}>
                    <div className="relative flex w-full shrink-0">
                        {modalTitle === "To Be Admitted" && !selectedSectionGroup ? (
                            <div className="flex flex-wrap gap-2 w-full">
                                {yearFilterOptions.map((opt) => {
                                    const isActive = yearFilter === (opt.value ?? "All Year");
                                    return (
                                        <button
                                            key={opt.label}
                                            type="button"
                                            onClick={() => setYearFilter(opt.value ?? "All Year")}
                                            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[#2E522A] focus:ring-offset-1 ${
                                                isActive
                                                    ? "bg-[#2E522A] text-white shadow-sm"
                                                    : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                                            }`}
                                        >
                                            {opt.label}
                                        </button>
                                    );
                                })}
                            </div>
                        ) : modalTitle === "To Be Admitted" && selectedSectionGroup ? null : (
                            <>
                                <input
                                    type="text"
                                    inputMode="search"
                                    placeholder="Search by Student Name or Number..."
                                    value={modalQuery}
                                    onChange={e => setModalQuery(e.target.value)}
                                    className="rounded-xl border border-gray-300 p-3 pl-11 pr-10 w-full focus:ring-2 focus:ring-[#2E522A] focus:border-transparent outline-none transition-shadow"
                                />
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <i className="fa-solid fa-magnifying-glass text-gray-400"></i>
                                </div>
                                {modalQuery && (
                                    <button
                                        type="button"
                                        onClick={() => setModalQuery("")}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none p-1"
                                        aria-label="Clear search"
                                    >
                                        ✕
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                    <div className="rounded-xl border border-gray-200 flex-1 bg-white min-h-0 overflow-hidden flex flex-col">
                        {modalTitle === "To Be Admitted" ? (
                            selectedSectionGroup && showEnrollmentPreview && previewData ? (
                                // Show enrollment preview (Confirm Enrollment view)
                                <div className="flex flex-col flex-1 min-h-0">
                                    <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => { setShowEnrollmentPreview(false); setPreviewData(null); }}
                                            className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:text-emerald-800 transition-colors"
                                        >
                                            <i className="fa-solid fa-arrow-left text-xs" />
                                            Back to applicants
                                        </button>
                                        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                                            Confirm Enrollment
                                        </span>
                                    </div>
                                    <div className="flex flex-col flex-1 min-h-0">
                                        <div className="px-4 pt-4 pb-2 shrink-0">
                                            {previewData.blocked.length > 0 && (
                                                <div
                                                    className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 cursor-pointer transition hover:bg-red-100"
                                                    onClick={() => setShowBlockedList(!showBlockedList)}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <p className="text-sm font-semibold text-red-700">
                                                            {previewData.blocked.length} applicant(s) blocked (student number already exists)
                                                        </p>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => { e.stopPropagation(); setShowBlockedList(!showBlockedList); }}
                                                            className="grid h-8 w-8 place-items-center rounded-lg text-red-600 transition hover:bg-red-100"
                                                            aria-label="Show blocked applicants"
                                                            title="Show blocked applicants"
                                                        >
                                                            <i className={`fa-solid ${showBlockedList ? 'fa-eye-slash' : 'fa-eye'} text-sm`} />
                                                        </button>
                                                    </div>
                                                    {showBlockedList && (
                                                        <div className="mt-3 overflow-y-auto max-h-[30vh] rounded-lg border border-red-200 bg-red-50/50">
                                                            <table className="min-w-full text-sm">
                                                                <thead className="sticky top-0 z-10 bg-red-100 border-b border-red-200 text-red-800 uppercase text-xs">
                                                                    <tr>
                                                                        <th className="px-4 py-2.5 text-left font-semibold">Applicant ID</th>
                                                                        <th className="px-4 py-2.5 text-left font-semibold">Name</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-red-100">
                                                                    {previewData.blocked.map((item, idx) => (
                                                                        <tr key={item.applicantID || idx} className="hover:bg-red-100/50">
                                                                            <td className="px-4 py-2.5 font-medium text-red-900">{item.applicantID}</td>
                                                                            <td className="px-4 py-2.5 text-red-800">{item.applicant_name}</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            {previewData.notFound.length > 0 && (
                                                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                                                    <p className="text-sm font-semibold text-amber-700">
                                                        {previewData.notFound.length} applicant(s) not found
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-h-0 overflow-y-auto px-4">
                                            <div className="rounded-xl border border-gray-200 bg-white h-full">
                                                <table className="min-w-full text-sm">
                                                    <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 text-gray-600 uppercase text-xs">
                                                        <tr>
                                                            <th className="px-4 py-3 text-left">Applicant ID</th>
                                                            <th className="px-4 py-3 text-left">Name</th>
                                                            <th className="px-4 py-3 text-center">Assigned Section</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-100">
                                                        {previewData.placements.map((p, idx) => (
                                                            <tr key={p.applicantID || idx} className="hover:bg-gray-50/80">
                                                                <td className="px-4 py-3 font-medium text-gray-900">{p.applicantID}</td>
                                                                <td className="px-4 py-3 text-gray-800">{p.applicant_name}</td>
                                                                <td className="px-4 py-3 text-center">
                                                                    <div className="flex flex-wrap items-center justify-center gap-1.5">
                                                                        {getAssignedSectionsForPreview(p).map((sectionEntry, sectionIndex, allSections) => (
                                                                            <React.Fragment key={`${p.applicantID || idx}-${sectionEntry.year}-${sectionEntry.section}-${sectionIndex}`}>
                                                                                <span
                                                                                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold border ${
                                                                                        sectionEntry.isMain
                                                                                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                                                            : "bg-red-50 text-red-700 border-red-200"
                                                                                    }`}
                                                                                >
                                                                                    <i className="fa-solid fa-layer-group text-[0.6rem]" />
                                                                                    Section {sectionEntry.year || p.assigned_year || selectedSectionGroup.year}-{sectionEntry.section}
                                                                                </span>
                                                                                {sectionIndex < allSections.length - 1 && (
                                                                                    <span className="px-0.5 text-xs font-bold text-gray-400">|</span>
                                                                                )}
                                                                            </React.Fragment>
                                                                        ))}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                        <div className="border-t border-gray-200 bg-white px-4 py-3 flex items-center justify-end gap-3 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => { setShowEnrollmentPreview(false); setPreviewData(null); }}
                                                className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-100"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleConfirmBatchEnroll}
                                                disabled={isBatchEnrolling || previewData.placements.length === 0}
                                                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {isBatchEnrolling ? (
                                                    <>
                                                        <i className="fa-solid fa-spinner fa-spin" />
                                                        Enrolling...
                                                    </>
                                                ) : (
                                                    <>
                                                        <i className="fa-solid fa-check" />
                                                        Confirm Enroll {previewData.placements.length > 0 && `(${previewData.placements.length})`}
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : selectedSectionGroup ? (
                                // Show applicants within the selected section group
                                <div className="flex flex-col flex-1 min-h-0">
                                    <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => setSelectedSectionGroup(null)}
                                            className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:text-emerald-800 transition-colors"
                                        >
                                            <i className="fa-solid fa-arrow-left text-xs" />
                                            Back to groups
                                        </button>
                                        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                                            {selectedSectionGroup.year} - {selectedSectionGroup.section} ({selectedSectionGroup.semester})
                                        </span>
                                    </div>
                                    <div className="overflow-y-auto flex-1 min-h-0">
                                        <table className="min-w-full border-collapse text-left text-sm md:text-base whitespace-nowrap">
                                            <thead className="sticky top-0 z-10 bg-gray-50 text-gray-700">
                                                <tr>
                                                    <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200">Applicant ID</th>
                                                    <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200">Applicant Name</th>
                                                    <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-gray-500 text-center border-b border-gray-200">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {selectedSectionGroup.applicants.map((applicant, index) => (
                                                    <tr key={`${applicant.applicantID || 'applicant'}-${index}`} className="hover:bg-gray-50/80 transition-colors">
                                                        <td className="px-6 py-4 font-medium text-gray-900">{applicant.applicantID || '-'}</td>
                                                        <td className="px-6 py-4 text-gray-800">{applicant.applicant_name || '-'}</td>
                                                        <td className="px-6 py-4 text-center text-gray-700">{applicant.isIrregular === true ? "Confirmed | Irregular" : (applicant.status || '-')}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="border-t border-gray-200 bg-white px-4 py-3 flex justify-end shrink-0">
                                        <button
                                            type="button"
                                            onClick={handlePreviewBatchEnroll}
                                            disabled={isBatchEnrolling}
                                            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isBatchEnrolling ? (
                                                <>
                                                    <i className="fa-solid fa-spinner fa-spin mr-2" />
                                                    Loading...
                                                </>
                                            ) : (
                                                <>
                                                    <i className="fa-solid fa-user-plus mr-2" />
                                                    Enroll All ({selectedSectionGroup.applicants.length})
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                // Show section groups
                                <div className="flex-1 min-h-0 overflow-y-auto">
                                    {applicantSectionGroups.length > 0 ? (
                                        <div className="divide-y divide-gray-100">
                                            {applicantSectionGroups.map((group) => (
                                                <button
                                                    key={group.key}
                                                    type="button"
                                                    onClick={() => setSelectedSectionGroup(group)}
                                                    className="w-full flex items-center justify-between px-3 py-4 text-left hover:bg-gray-50/80 transition-colors"
                                                >
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
                                                            <i className="fa-solid fa-layer-group text-xs" />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-semibold text-gray-900 truncate">
                                                                Year {group.year} - Section {group.section}
                                                            </p>
                                                            <p className="text-xs text-gray-500">
                                                                {group.semester} Semester &middot; {group.applicants.length} applicant(s)
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        <span className="inline-flex items-center justify-center min-w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 text-[0.65rem] font-bold">
                                                            {group.applicants.length}
                                                        </span>
                                                        <i className="fa-solid fa-chevron-right text-[0.6rem] text-gray-400" />
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center text-gray-500">
                                            <i className="fa-regular fa-folder-open text-3xl opacity-50"></i>
                                            <p>No applicants found.</p>
                                        </div>
                                    )}
                                </div>
                            )
                        ) : (
                            <StudentsTable students={modalStudents} scheduleMap={scheduleMap} isPendingView={false} />
                        )}
                    </div>
                </div>
            </Modal>

            <Modal open={exportTypeOpen} onClose={() => setExportTypeOpen(false)} title="Export Options" size="sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button
                        type="button"
                        onClick={() => {
                            setExportTypeOpen(false);
                            setStudentExportOpen(true);
                        }}
                        className="px-6 py-4 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-800 font-semibold"
                    >
                        Export Student
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setExportTypeOpen(false);
                            setSectionExportOpen(true);
                        }}
                        className="px-6 py-4 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-800 font-semibold"
                    >
                        Export Section
                    </button>
                </div>
            </Modal>

            <Modal open={studentExportOpen} onClose={() => setStudentExportOpen(false)} title="Export Student" size="lg">
                <div className="flex flex-col gap-4 max-h-[75vh]">
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search Student Name or Number..."
                            value={studentExportQuery}
                            onChange={(e) => setStudentExportQuery(e.target.value)}
                            className="block w-full h-11 rounded-xl border border-gray-300 bg-white py-3 pl-11 pr-10 text-gray-900 focus:ring-2 focus:ring-[#2E522A] focus:border-transparent outline-none transition-all text-sm shadow-sm"
                        />
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <i className="fa-solid fa-magnifying-glass text-gray-400"></i>
                        </div>
                    </div>
                    <div className="overflow-y-auto rounded-xl border border-gray-200 bg-white">
                        <table className="min-w-full text-sm">
                            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 text-gray-600 uppercase text-xs">
                                <tr>
                                    <th className="px-4 py-3 text-left">Student Number</th>
                                    <th className="px-4 py-3 text-left">Student Name</th>
                                    <th className="px-4 py-3 text-left">Section</th>
                                    <th className="px-4 py-3 text-left">Year</th>
                                    <th className="px-4 py-3 text-center">Export</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {exportableStudents.map((student) => (
                                    <tr key={student._id || student.studentNumber}>
                                        <td className="px-4 py-3">{student.studentNumber}</td>
                                        <td className="px-4 py-3">{`${student.firstName ?? ""} ${student.lastName ?? ""}${student.suffix ? " " + String(student.suffix).trim() : ""}`.trim()}</td>
                                        <td className="px-4 py-3">{getStudentSectionDisplay(student)}</td>
                                        <td className="px-4 py-3">{getStudentYearDisplay(student)}</td>
                                        <td className="px-4 py-3 text-center">
                                            <button
                                                type="button"
                                                onClick={() => openExportFormat({ kind: "student", student })}
                                                className="px-3 py-1.5 rounded-lg bg-[#2E522A] text-white text-xs font-semibold"
                                            >
                                                Export
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </Modal>

            <Modal open={sectionExportOpen} onClose={() => setSectionExportOpen(false)} title="Export Section" size="lg">
                <div className="flex flex-col gap-4 max-h-[75vh]">
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search Year, Section, or Semester..."
                            value={sectionExportQuery}
                            onChange={(e) => setSectionExportQuery(e.target.value)}
                            className="block w-full h-11 rounded-xl border border-gray-300 bg-white py-3 pl-11 pr-10 text-gray-900 focus:ring-2 focus:ring-[#2E522A] focus:border-transparent outline-none transition-all text-sm shadow-sm"
                        />
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <i className="fa-solid fa-magnifying-glass text-gray-400"></i>
                        </div>
                    </div>
                    <div className="overflow-y-auto rounded-xl border border-gray-200 bg-white">
                        <table className="min-w-full text-sm">
                            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 text-gray-600 uppercase text-xs">
                                <tr>
                                    <th className="px-4 py-3 text-left">Year</th>
                                    <th className="px-4 py-3 text-left">Section</th>
                                    <th className="px-4 py-3 text-left">Semester</th>
                                    <th className="px-4 py-3 text-left">Students</th>
                                    <th className="px-4 py-3 text-center">Export</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {exportableSections.map((section) => (
                                    <tr key={section.key}>
                                        <td className="px-4 py-3">{section.year}</td>
                                        <td className="px-4 py-3">{section.section}</td>
                                        <td className="px-4 py-3">{section.semester}</td>
                                        <td className="px-4 py-3">{section.total}</td>
                                        <td className="px-4 py-3 text-center">
                                            <button
                                                type="button"
                                                onClick={() => openExportFormat({ kind: "section", section })}
                                                className="px-3 py-1.5 rounded-lg bg-[#2E522A] text-white text-xs font-semibold"
                                            >
                                                Export
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </Modal>

            <Modal open={exportFormatOpen} onClose={() => setExportFormatOpen(false)} title="Export as" size="sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button
                        type="button"
                        onClick={() => handleExportAs("xlsx")}
                        className="px-6 py-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                    >
                        XLSX
                    </button>
                    <button
                        type="button"
                        onClick={() => handleExportAs("csv")}
                        className="px-6 py-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                    >
                        CSV
                    </button>
                </div>
            </Modal>

            <Modal open={blockEnrollOpen} onClose={() => { if (!isBlockEnrolling) setBlockEnrollOpen(false); }} title="Confirm Enrollment">
                <div className="flex flex-col gap-4 max-h-[70vh]">
                    <div className="shrink-0">
                        <p className="text-sm text-gray-500">
                            Review the block applicants from <span className="font-semibold text-gray-700">{blockPreviewData?.fileName}</span> and the section each applicant will be assigned to by the auto sectioning.
                        </p>
                        {blockPreviewData?.blocked?.length > 0 && (
                            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                                <p className="text-sm font-semibold text-red-700">
                                    {blockPreviewData.blocked.length} applicant(s) blocked (student number already exists) and will be skipped
                                </p>
                            </div>
                        )}
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-gray-200 bg-white">
                        <table className="min-w-full text-sm">
                            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 text-gray-600 uppercase text-xs">
                                <tr>
                                    <th className="px-4 py-3 text-left">Applicant ID</th>
                                    <th className="px-4 py-3 text-left">Applicant Name</th>
                                    <th className="px-4 py-3 text-center">Assigned Section</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {(blockPreviewData?.placements ?? []).length > 0 ? (
                                    blockPreviewData.placements.map((placement, index) => (
                                        <tr key={placement.applicantID || placement.studentNumber || index} className="hover:bg-gray-50/80">
                                            <td className="px-4 py-3 font-medium text-gray-900">{placement.applicantID || "-"}</td>
                                            <td className="px-4 py-3 text-gray-800">{placement.applicant_name || "-"}</td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold border bg-emerald-50 text-emerald-700 border-emerald-200">
                                                    <i className="fa-solid fa-layer-group text-[0.6rem]" />
                                                    Section {placement.assigned_year}-{placement.assigned_section}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={3} className="px-4 py-8 text-center text-gray-500">No enrollable applicants found in this file.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="border-t border-gray-200 pt-3 flex items-center justify-end gap-3 shrink-0">
                        <button
                            type="button"
                            onClick={() => setBlockEnrollOpen(false)}
                            disabled={isBlockEnrolling}
                            className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirmBlockEnroll}
                            disabled={isBlockEnrolling || (blockPreviewData?.placements ?? []).length === 0}
                            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isBlockEnrolling ? (
                                <>
                                    <i className="fa-solid fa-spinner fa-spin" />
                                    Enrolling...
                                </>
                            ) : (
                                <>
                                    <i className="fa-solid fa-check" />
                                    Confirm Enroll {(blockPreviewData?.placements ?? []).length > 0 && `(${blockPreviewData.placements.length})`}
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </Modal>

            <input
                ref={importInputRef}
                type="file"
                accept=".csv,.xlsx"
                className="hidden"
                onChange={handleImportFile}
            />
        </>
    );
}

export default Dashboard;