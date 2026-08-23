import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import PageHeader from "../components/ui/PageHeader";
import Panel from "../components/ui/Panel";
import SearchInput from "../components/ui/SearchInput";
import SelectField from "../components/ui/SelectField";
import ActionButton from "../components/ui/ActionButton";
import ScheduleSummaryCard from "../components/ui/ScheduleSummaryCard";
import ScheduleTable from "../components/ScheduleTable";
import { fetchSchedulePageData, fetchScheduleConflicts, saveScheduleTableChanges } from "../lib/scheduleRepository";

const EDITABLE_ROW_FIELDS = [
  "days",
  "timeStart",
  "timeEnd",
  "room",
  "instructor",
];

function pickEditableRowFields(row) {
  return EDITABLE_ROW_FIELDS.reduce((accumulator, field) => {
    accumulator[field] = row?.[field];
    return accumulator;
  }, {});
}

function areFieldValuesEqual(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) {
    return JSON.stringify(Array.isArray(left) ? left : []) === JSON.stringify(Array.isArray(right) ? right : []);
  }
  return left === right;
}

function getRowChanges(original, current) {
  if (!original || !current) return {};

  return EDITABLE_ROW_FIELDS.reduce((changes, field) => {
    const previousValue = original[field];
    const currentValue = current[field];
    if (!areFieldValuesEqual(previousValue, currentValue)) {
      changes[field] = currentValue;
    }
    return changes;
  }, {});
}

function buildBaselineFromRows(rows) {
  return (Array.isArray(rows) ? rows : []).reduce((accumulator, row) => {
    accumulator[row.id] = pickEditableRowFields(row);
    return accumulator;
  }, {});
}

function ScheduleStatusBar({ hasConflicts, message, description }) {
  return (
    <div className={`rounded-2xl border px-4 py-4 shadow-sm ${hasConflicts ? "border-rose-200 bg-rose-50" : "border-emerald-200 bg-emerald-50"}`}>
      <div className="flex items-start gap-3">
        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${hasConflicts ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-800"}`}>
          <i className={`fa-solid ${hasConflicts ? "fa-triangle-exclamation" : "fa-circle-check"}`} />
        </div>
        <div>
          <h3 className={`text-base font-extrabold ${hasConflicts ? "text-rose-800" : "text-emerald-900"}`}>{message}</h3>
          <p className={`mt-1 text-sm ${hasConflicts ? "text-rose-700/80" : "text-emerald-800/80"}`}>{description}</p>
        </div>
      </div>
    </div>
  );
}

function Schedules() {
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ sections: [], semesters: [], schoolYears: [] });
  const [status, setStatus] = useState({ hasConflicts: false, message: "Loading schedules...", description: "Please wait while the schedule data is prepared." });
  const [conflicts, setConflicts] = useState([]);
  const [preview, setPreview] = useState({ section: "", semester: "", schoolYear: "", lastGenerated: "", lastPublished: "" });
  const [selectedSection, setSelectedSection] = useState("");
  const [selectedSemester, setSelectedSemester] = useState("");
  const [selectedSchoolYear, setSelectedSchoolYear] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingEnabled, setEditingEnabled] = useState(false);
  const [publishedAt, setPublishedAt] = useState(null);
  const [tableOriginals, setTableOriginals] = useState({});
  const [rowDraftChanges, setRowDraftChanges] = useState({});
  const [savingChanges, setSavingChanges] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      const data = await fetchSchedulePageData();
      if (!isMounted) return;

      setRows(Array.isArray(data.rows) ? data.rows : []);
      setFilters(data.filters ?? { sections: [], semesters: [], schoolYears: [] });
      setStatus(data.status ?? { hasConflicts: false, message: "No Schedule Conflicts Detected", description: "All assigned schedules passed validation." });
      setConflicts(data.conflicts ?? []);
      setPreview(data.preview ?? { section: "", semester: "", schoolYear: "", lastGenerated: "", lastPublished: "" });

      const firstRow = data.rows?.[0];
      const initialSection = firstRow?.section ?? data.filters?.sections?.[0] ?? "";
      const initialSemester = firstRow?.semester ?? data.filters?.semesters?.[0] ?? "";
      const initialSchoolYear = firstRow?.schoolYear ?? data.filters?.schoolYears?.[0] ?? "";

      setSelectedSection(initialSection);
      setSelectedSemester(initialSemester);
      setSelectedSchoolYear(initialSchoolYear);
    };

    loadData().catch((error) => {
      console.error("Failed to load schedule page data", error);
      toast.error("Failed to load schedules");
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    document.title = "Schedules - IITI Enrollment System";
  }, []);

  const visibleRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((row) => {
      const sectionMatches = !selectedSection || String(row.section ?? "").trim() === selectedSection;
      const semesterMatches = !selectedSemester || String(row.semester ?? "").trim() === selectedSemester;
      const schoolYearMatches = !selectedSchoolYear || String(row.schoolYear ?? "").trim() === selectedSchoolYear;
      const text = [row.subjectCode, row.subjectTitle, row.room, row.instructor, ...(Array.isArray(row.days) ? row.days : [])]
        .join(" ")
        .toLowerCase();
      return sectionMatches && semesterMatches && schoolYearMatches && (!q || text.includes(q));
    });
  }, [rows, searchQuery, selectedSection, selectedSemester, selectedSchoolYear, preview]);

  const filteredRowCount = visibleRows.length;
  const totalUnits = visibleRows.reduce((sum, row) => sum + Number(row.units ?? 0), 0);
  const totalWeeklyHours = visibleRows.reduce((sum, row) => sum + Math.max(1, Number(row.units ?? 0)) * (Array.isArray(row.days) ? row.days.length || 1 : 1), 0);
  const hasPendingChanges = Object.keys(rowDraftChanges).length > 0;

  const activeStatus = useMemo(() => {
    if (!Array.isArray(conflicts) || conflicts.length === 0) {
      return status;
    }

    const filteredConflicts = conflicts.filter((c) => {
      const sectionMatches = !selectedSection || String(c.section ?? "").toLowerCase() === selectedSection.toLowerCase();
      const semesterMatches = !selectedSemester || String(c.semester ?? "").toLowerCase() === selectedSemester.toLowerCase();
      const schoolYearMatches = !selectedSchoolYear || String(c.schoolYear ?? "").toLowerCase() === selectedSchoolYear.toLowerCase();
      return sectionMatches && semesterMatches && schoolYearMatches;
    });

    if (filteredConflicts.length > 0) {
      const sectionLabel = selectedSection ? ` in Section ${selectedSection}` : "";
      return {
        hasConflicts: true,
        message: `${filteredConflicts.length} Schedule Conflict${filteredConflicts.length > 1 ? "s" : ""} Detected${sectionLabel}`,
        description: filteredConflicts.map((c) => c.message).join(" "),
      };
    }

    if (selectedSection) {
      return {
        hasConflicts: false,
        message: `No Schedule Conflicts Detected in Section ${selectedSection}`,
        description: `All assigned schedules for Section ${selectedSection} passed validation.`,
      };
    }

    return status;
  }, [conflicts, selectedSection, selectedSemester, selectedSchoolYear, status]);

  const pendingRowPayload = useMemo(
    () =>
      Object.entries(rowDraftChanges)
        .map(([rowId, changes]) => {
          const row = rows.find((entry) => entry.id === rowId);
          if (!row) return null;

          return {
            scheduleId: row.scheduleId,
            classIndex: row.classIndex,
            changes,
          };
        })
        .filter(Boolean),
    [rowDraftChanges, rows]
  );

  const clearEditingSession = () => {
    setEditingEnabled(false);
    setTableOriginals({});
    setRowDraftChanges({});
  };

  const updateRow = (rowId, field, value) => {
    if (!editingEnabled) return;

    setRows((currentRows) => {
      const targetRow = currentRows.find((row) => row.id === rowId);
      const nextRow = targetRow ? { ...targetRow, [field]: value } : null;

      if (nextRow) {
        setRowDraftChanges((currentDrafts) => {
          const original = tableOriginals[rowId] ?? pickEditableRowFields(targetRow);

          const nextChanges = getRowChanges(original, nextRow);
          if (Object.keys(nextChanges).length === 0) {
            const { [rowId]: _ignored, ...rest } = currentDrafts;
            return rest;
          }

          return {
            ...currentDrafts,
            [rowId]: nextChanges,
          };
        });
      }

      return currentRows.map((row) => {
        if (row.id !== rowId) return row;
        return { ...row, [field]: value };
      });
    });
  };

  const isRowDirty = (rowId) => Object.keys(rowDraftChanges[rowId] ?? {}).length > 0;

  const handleStartEdit = () => {
    setTableOriginals(buildBaselineFromRows(visibleRows));
    setRowDraftChanges({});
    setEditingEnabled(true);
    toast("Table editing enabled");
  };

  const handleSaveChanges = async () => {
    if (pendingRowPayload.length === 0) {
      return;
    }

    const uniqueScheduleIds = [...new Set(pendingRowPayload.map((entry) => entry.scheduleId).filter(Boolean))];
    if (uniqueScheduleIds.length !== 1) {
      toast.error("Changes span multiple schedules. Narrow your filters and save one schedule at a time.");
      return;
    }

    try {
      setSavingChanges(true);
      await saveScheduleTableChanges({
        scheduleId: uniqueScheduleIds[0],
        rowChanges: pendingRowPayload,
      });

      const updatedReport = await fetchScheduleConflicts().catch(() => null);
      if (updatedReport) {
        setConflicts(updatedReport.conflicts ?? []);
        if (updatedReport.status) {
          setStatus(updatedReport.status);
        }
      }

      clearEditingSession();
      toast.success("Schedule changes saved");
    } catch (error) {
      console.error("Failed to save schedule changes", error);
      toast.error("Failed to save schedule changes");
    } finally {
      setSavingChanges(false);
    }
  };

  const handleCancelEdit = () => {
    setRows((currentRows) =>
      currentRows.map((row) => {
        const original = tableOriginals[row.id];
        return original ? { ...row, ...original } : row;
      })
    );
    clearEditingSession();
    toast("Edit cancelled");
  };

  const handleEditAction = () => {
    if (!editingEnabled) {
      handleStartEdit();
      return;
    }

    if (!hasPendingChanges) {
      toast("Make changes in the table first.");
      return;
    }

    handleSaveChanges();
  };

  const handlePublish = () => {
    setPublishedAt(new Date().toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }));
    setStatus({
      hasConflicts: false,
      message: "Schedule Published",
      description: "The current schedule state has been marked as published in the UI shell.",
    });
    toast.success("Schedule published");
  };

  return (
    <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="IITI Enrollment System"
        title="Schedules"
        description="Generate, review, edit, and publish section schedules for each semester and school year."
      />

      <Panel className="overflow-hidden">
        <div className="grid gap-4 border-b border-slate-100 bg-white p-5 lg:grid-cols-[1.2fr_1fr_1fr_1fr]">
          <SelectField
            label="Section"
            value={selectedSection}
            onChange={(event) => setSelectedSection(event.target.value)}
            options={filters.sections}
          />
          <SelectField
            label="Semester"
            value={selectedSemester}
            onChange={(event) => setSelectedSemester(event.target.value)}
            options={filters.semesters.length ? filters.semesters : ["1st Semester"]}
          />
          <SelectField
            label="School Year"
            value={selectedSchoolYear}
            onChange={(event) => setSelectedSchoolYear(event.target.value)}
            options={filters.schoolYears.length ? filters.schoolYears : ["2024 - 2025"]}
          />
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Search</label>
            <SearchInput
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onClear={() => setSearchQuery("")}
              placeholder="Search section..."
            />
          </div>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Section {selectedSection || preview.section || "1A"}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {selectedSemester || preview.semester || "First Semester"} • {selectedSchoolYear || preview.schoolYear || "AY 2024 - 2025"}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Last Generated</p>
                <p className="mt-1 font-semibold text-slate-800">{preview.lastGenerated || "Jul 20, 2025 2:31 PM"}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Last Published</p>
                <p className="mt-1 font-semibold text-slate-800">{publishedAt || preview.lastPublished || "Jul 18, 2025 9:14 AM"}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 py-5 sm:px-6">
          <ScheduleTable
            rows={visibleRows}
            onRowChange={updateRow}
            isEditingEnabled={editingEnabled}
            isRowDirty={isRowDirty}
          />
        </div>

        <div className="grid gap-3 border-t border-slate-100 bg-[#f4fbf3] px-5 py-4 sm:grid-cols-3 sm:px-6">
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-white px-4 py-3 shadow-sm">
            <i className="fa-solid fa-book-open text-emerald-800" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Total Subjects</p>
              <p className="text-xl font-extrabold text-slate-900">{filteredRowCount}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-white px-4 py-3 shadow-sm">
            <i className="fa-solid fa-layer-group text-emerald-800" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Total Units</p>
              <p className="text-xl font-extrabold text-slate-900">{totalUnits}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-white px-4 py-3 shadow-sm">
            <i className="fa-regular fa-clock text-emerald-800" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Total Weekly Hours</p>
              <p className="text-xl font-extrabold text-slate-900">{totalWeeklyHours}</p>
            </div>
          </div>
        </div>
      </Panel>

      <ScheduleStatusBar hasConflicts={activeStatus.hasConflicts} message={activeStatus.message} description={activeStatus.description} />

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <ActionButton tone="outline" onClick={handleEditAction} disabled={savingChanges}>
          <i className="fa-regular fa-pen-to-square" />
          {editingEnabled && hasPendingChanges ? "Save Changes" : "Edit Schedule"}
        </ActionButton>
        {editingEnabled ? (
          <ActionButton tone="outline" onClick={handleCancelEdit} disabled={savingChanges}>
            <i className="fa-solid fa-xmark" />
            Cancel Edit
          </ActionButton>
        ) : null}
        <ActionButton tone="solid" onClick={handlePublish}>
          <i className="fa-solid fa-paper-plane" />
          Publish Schedule
        </ActionButton>
      </div>
    </section>
  );
}

export default Schedules;