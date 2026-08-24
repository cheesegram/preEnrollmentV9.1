import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import SectionTable from "../components/SectionTable";
import LoadingState from "../components/ui/LoadingState";
import PageHeader from "../components/ui/PageHeader";
import Panel from "../components/ui/Panel";
import SearchInput from "../components/ui/SearchInput";
import api from "../lib/axios";

const STATUS_OPTIONS = ["All", "Available", "Full", "Overloaded"];
const YEAR_OPTIONS = ["All Year", "1", "2", "3", "4"];

function SectionList() {
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [selectedYear, setSelectedYear] = useState("All Year");
  const [sections, setSections] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [showCapacityModal, setShowCapacityModal] = useState(false);
  const [capacityValue, setCapacityValue] = useState(0);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualBlockCapacity, setManualBlockCapacity] = useState("");
  const [manualIrregularCapacity, setManualIrregularCapacity] = useState("");
  const [manualError, setManualError] = useState("");

  const displayedSections = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    let result = [...sections];

    if (normalizedQuery) {
      const combinedMatch = normalizedQuery.match(/^(\d+)\s*([a-z]+)$/i);
      const reverseCombinedMatch = normalizedQuery.match(/^([a-z]+)\s*(\d+)$/i);

      if (combinedMatch) {
        const [, year, section] = combinedMatch;
        result = result.filter(
          (item) => String(item.year) === year && String(item.section).toLowerCase() === section.toLowerCase()
        );
      } else if (reverseCombinedMatch) {
        const [, section, year] = reverseCombinedMatch;
        result = result.filter(
          (item) => String(item.year) === year && String(item.section).toLowerCase() === section.toLowerCase()
        );
      } else {
        result = result.filter((item) =>
          [item.year, item.section, item.semester, item.status]
            .map((value) => String(value ?? "").toLowerCase())
            .some((value) => value.includes(normalizedQuery))
        );
      }
    }

    if (selectedStatus !== "All") {
      result = result.filter((item) => item.status === selectedStatus);
    }

    if (selectedYear !== "All Year") {
      result = result.filter((item) => String(item.year) === selectedYear);
    }

    return result.sort((left, right) => {
      const yearDifference = Number(left.year) - Number(right.year);
      if (yearDifference !== 0) return yearDifference;

      const semesterOrder = { "1st": 1, "2nd": 2 };
      const semesterDifference =
        (semesterOrder[String(left.semester ?? "").trim()] ?? 99) -
        (semesterOrder[String(right.semester ?? "").trim()] ?? 99);
      if (semesterDifference !== 0) return semesterDifference;

      return String(left.section ?? "").localeCompare(String(right.section ?? ""), undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });
  }, [sections, query, selectedStatus, selectedYear]);

  useEffect(() => {
    document.title = "Sections - IITI Enrollment System";

    const refreshSections = async () => {
      try {
        setLoading(true);
        await api.post("/sections/sync");
        const response = await api.get("/sections", { params: { t: Date.now() } });
        const rawSections = Array.isArray(response.data) ? response.data : [];

        const uniqueSections = new Map();
        rawSections.forEach((section) => {
          const key = `${String(section.year ?? "")}::${String(section.section ?? "")}::${String(
            section.semester ?? ""
          )}`;
          const existing = uniqueSections.get(key);
          if (!existing || Number(section.blockCount ?? section.regular ?? 0) > Number(existing.blockCount ?? existing.regular ?? 0)) {
            uniqueSections.set(key, section);
          }
        });

        const normalized = Array.from(uniqueSections.values())
          .map((section) => ({
            ...section,
            blockCount: Number(section.blockCount ?? section.regular ?? 0),
            irregularCount: Number(section.irregularCount ?? section.irregular ?? 0),
            blockCapacity: Number(section.blockCapacity ?? section.regularCapacity ?? 45),
            irregularCapacity: Number(section.irregularCapacity ?? 5),
            totalCapacity: Number(section.totalCapacity ?? 50),
            total: Number(section.blockCount ?? section.regular ?? 0) + Number(section.irregularCount ?? section.irregular ?? 0),
          }))
          .filter((section) => section.blockCount > 0 || section.irregularCount > 0);

        setSections(normalized);

        try {
          const studentsResponse = await api.get("/students", { params: { t: Date.now() } });
          setStudents(Array.isArray(studentsResponse.data) ? studentsResponse.data : []);
        } catch (studentsError) {
          console.error("Failed to load students for section view", studentsError);
          setStudents([]);
        }
      } catch (error) {
        console.error("Failed to load sections", error);
        toast.error("Failed to load section data");
        setSections([]);
      } finally {
        setLoading(false);
      }
    };

    refreshSections();
  }, []);

  const getCurrentTotalCapacity = () => {
    if (sections.length > 0 && sections[0].totalCapacity) {
      return Number(sections[0].totalCapacity);
    }
    return 50;
  };

  const handleConfirmCapacityUpdate = async () => {
    if (!previewData || isUpdating) return;

    try {
      setIsUpdating(true);
      const updatePayload = {
        totalCapacity: previewData.totalCapacity,
        blockCapacity: previewData.blockCapacity,
        irregularCapacity: previewData.irregularCapacity,
      };
      const response = await api.patch("/sections/capacity/all", updatePayload);
      toast.success("All section capacities updated successfully");
      setShowConfirmation(false);
      setPreviewData(null);
      setCapacityValue(0);
      
      if (response.data?.sections && response.data.sections.length > 0) {
        const normalized = response.data.sections.map((section) => ({
          ...section,
          blockCount: Number(section.blockCount ?? section.regular ?? 0),
          irregularCount: Number(section.irregularCount ?? section.irregular ?? 0),
          blockCapacity: Number(section.blockCapacity ?? section.regularCapacity ?? 45),
          irregularCapacity: Number(section.irregularCapacity ?? 5),
          totalCapacity: Number(section.totalCapacity ?? 50),
          total: Number(section.blockCount ?? section.regular ?? 0) + Number(section.irregularCount ?? section.irregular ?? 0),
        })).filter((section) => section.blockCount > 0 || section.irregularCount > 0);
        setSections(normalized);
      } else {
        const sectionsResponse = await api.get("/sections", { params: { t: Date.now() } });
        const rawSections = Array.isArray(sectionsResponse.data) ? sectionsResponse.data : [];
        const uniqueSections = new Map();
        rawSections.forEach((section) => {
          const key = `${String(section.year ?? "")}::${String(section.section ?? "")}::${String(section.semester ?? "")}`;
          const existing = uniqueSections.get(key);
          if (!existing || Number(section.blockCount ?? section.regular ?? 0) > Number(existing.blockCount ?? existing.regular ?? 0)) {
            uniqueSections.set(key, section);
          }
        });
        const normalized = Array.from(uniqueSections.values()).map((section) => ({
          ...section,
          blockCount: Number(section.blockCount ?? section.regular ?? 0),
          irregularCount: Number(section.irregularCount ?? section.irregular ?? 0),
          blockCapacity: Number(section.blockCapacity ?? section.regularCapacity ?? 45),
          irregularCapacity: Number(section.irregularCapacity ?? 5),
          totalCapacity: Number(section.totalCapacity ?? 50),
          total: Number(section.blockCount ?? section.regular ?? 0) + Number(section.irregularCount ?? section.irregular ?? 0),
        })).filter((section) => section.blockCount > 0 || section.irregularCount > 0);
        setSections(normalized);
      }
    } catch (error) {
      console.error("Failed to update capacities", error);
      toast.error(error?.response?.data?.message || "Failed to update section capacities");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSetCapacity = () => {
    const capacities = {
      totalCapacity: capacityValue,
      blockCapacity: capacityValue * 0.9,
      irregularCapacity: capacityValue * 0.1,
    };

    setPreviewData(capacities);
    setShowConfirmation(true);
    setShowCapacityModal(false);
  };

  const openCapacityModal = () => {
    setCapacityValue(50);
    setManualBlockCapacity("");
    setManualIrregularCapacity("");
    setManualMode(false);
    setManualError("");
    setShowCapacityModal(true);
  };

  const incrementCapacity = () => {
    setCapacityValue(prev => prev + 10);
  };

  const decrementCapacity = () => {
    setCapacityValue(prev => Math.max(10, prev - 10));
  };

  const handleManualBlockChange = (e) => {
    const raw = e.target.value;
    setManualBlockCapacity(raw);
  };

  const handleManualIrregularChange = (e) => {
    const raw = e.target.value;
    setManualIrregularCapacity(raw);
  };

  const handleManualConfirm = () => {
    const block = manualBlockCapacity === "" ? 0 : parseInt(manualBlockCapacity, 10);
    const irregular = manualIrregularCapacity === "" ? 0 : parseInt(manualIrregularCapacity, 10);

    if (isNaN(block) || isNaN(irregular) || block <= 0 || irregular <= 0) {
      setManualError("Both values must be greater than 0");
      return;
    }

    setManualError("");
    const total = block + irregular;
    setCapacityValue(total);
    setPreviewData({
      totalCapacity: total,
      blockCapacity: block,
      irregularCapacity: irregular,
    });
    setShowConfirmation(true);
    setShowCapacityModal(false);
  };

  return (
    <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Capacity"
        title="Section Management"
        description="Monitor section enrollment, available capacity, and overloaded classes."
        actions={
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={openCapacityModal}
              className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
            >
              <i className="fa-solid fa-gear mr-2" />
              Set Capacity
            </button>
            <div className="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 shadow-sm">
              {displayedSections.length} section{displayedSections.length === 1 ? "" : "s"}
            </div>
          </div>
        }
      />

      <Panel className="p-4 sm:p-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <SearchInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onClear={() => setQuery("")}
              placeholder="Search year, section, semester, or status..."
              className="w-full sm:w-80"
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-500">Status</span>
              {STATUS_OPTIONS.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setSelectedStatus(status)}
                  className={`rounded-xl border px-3.5 py-2 text-sm font-semibold transition ${
                    selectedStatus === status
                      ? "border-emerald-700 bg-emerald-700 text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800"
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-500">Year</span>
            {YEAR_OPTIONS.map((year) => (
              <button
                key={year}
                type="button"
                onClick={() => setSelectedYear(year)}
                className={`rounded-xl border px-3.5 py-2 text-sm font-semibold transition ${
                  selectedYear === year
                    ? "border-emerald-700 bg-emerald-700 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800"
                }`}
              >
                {year}
              </button>
            ))}
          </div>
        </div>
      </Panel>

      <Panel className="min-h-[420px] overflow-hidden">
        {loading ? (
          <LoadingState label="Loading section data..." />
        ) : (
          <SectionTable sections={displayedSections} students={students} />
        )}
      </Panel>

      {showCapacityModal &&
        <div className="fixed inset-0 z-[240] flex items-center justify-center p-3 sm:p-6">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
            onClick={() => setShowCapacityModal(false)}
          />
          <div className="relative w-full max-w-lg rounded-2xl border border-white/30 bg-white p-6 shadow-2xl">
            <div className="mb-6">
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-emerald-700">Capacity</p>
              <h3 className="mt-1 text-lg font-extrabold tracking-tight text-slate-900">Set Total Section Capacity</h3>
            </div>
            {!manualMode ? (
              <>
                <div className="mb-6">
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">New Total Capacity</label>
                  <div className="flex items-center gap-3 rounded-xl border border-gray-300 bg-white p-2">
                    <button
                      type="button"
                      onClick={decrementCapacity}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-600 text-lg font-bold text-white transition hover:bg-red-700 active:scale-95"
                      aria-label="Decrease capacity"
                    >
                      -
                    </button>
                    <div className="flex-1 text-center">
                      <span className="text-2xl font-bold text-gray-900">{capacityValue}</span>
                    </div>
                    <button
                      type="button"
                      onClick={incrementCapacity}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-lg font-bold text-white transition hover:bg-blue-700 active:scale-95"
                      aria-label="Increase capacity"
                    >
                      +
                    </button>
                  </div>
                  <p className="mt-1.5 text-xs text-gray-500">Values are in increments of 10 only</p>
                </div>
              </>
            ) : (
              <>
                <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-700">Block Capacity</label>
                    <input
                      type="number"
                      min="0"
                      value={manualBlockCapacity}
                      onChange={handleManualBlockChange}
                      placeholder="Enter whole number"
                      className="block w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:ring-2 focus:ring-[#2E522A] focus:border-transparent outline-none transition-all text-sm shadow-sm [appearance:none]"
                    />
                    <p className="mt-1 text-xs text-gray-500">Directly edit blockCapacity</p>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-700">Irregular Capacity</label>
                    <input
                      type="number"
                      min="0"
                      value={manualIrregularCapacity}
                      onChange={handleManualIrregularChange}
                      placeholder="Enter whole number"
                      className="block w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:ring-2 focus:ring-[#2E522A] focus:border-transparent outline-none transition-all text-sm shadow-sm [appearance:none]"
                    />
                    <p className="mt-1 text-xs text-gray-500">Directly edit irregularCapacity</p>
                  </div>
                </div>
              </>
            )}
            {manualError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm font-semibold text-red-700">{manualError}</p>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-gray-200 pt-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={manualMode}
                  onChange={(e) => {
                    setManualMode(e.target.checked);
                    setManualError("");
                  }}
                  className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-sm font-semibold text-gray-700">Set Manually</span>
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowCapacityModal(false)}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!manualMode) {
                      handleSetCapacity();
                    } else {
                      handleManualConfirm();
                    }
                  }}
                  className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white ${
                    manualMode && manualError
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-emerald-600 hover:bg-emerald-700"
                  }`}
                  disabled={manualMode && !!manualError}
                >
                  {manualMode && manualError ? (
                    <>
                      Invalid Value(s)
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-arrow-right text-xs" />
                      Confirm
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      }

      {showConfirmation && previewData &&
        <div className="fixed inset-0 z-[240] flex items-center justify-center p-3 sm:p-6">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
            onClick={() => { setShowConfirmation(false); setPreviewData(null); }}
          />
          <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/30 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-emerald-700">Confirmation</p>
                <h3 className="mt-1 text-lg font-extrabold tracking-tight text-slate-900 sm:text-xl">Confirm Changes</h3>
                <p className="mt-1 text-sm text-slate-500">Review the updated capacities before applying changes to all sections.</p>
              </div>
              <button
                type="button"
                onClick={() => { setShowConfirmation(false); setPreviewData(null); }}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-800"
                aria-label="Close confirmation"
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <div className="overflow-y-auto bg-slate-50/60 p-4 sm:p-6">
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <dt className="text-[0.65rem] font-bold uppercase tracking-[0.15em] text-slate-500">Total Capacity</dt>
                  <dd className="mt-2 whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-slate-800">{previewData.totalCapacity}</dd>
                </div>
                <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <dt className="text-[0.65rem] font-bold uppercase tracking-[0.15em] text-slate-500">Block Capacity</dt>
                  <dd className="mt-2 whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-slate-800">{previewData.blockCapacity}</dd>
                </div>
                <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <dt className="text-[0.65rem] font-bold uppercase tracking-[0.15em] text-slate-500">Irregular Capacity</dt>
                  <dd className="mt-2 whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-slate-800">{previewData.irregularCapacity}</dd>
                </div>
              </dl>
            </div>
            <div className="border-t border-gray-200 bg-white px-4 py-3 flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => { setShowConfirmation(false); setPreviewData(null); setCapacityValue(0); }}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmCapacityUpdate}
                disabled={isUpdating}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUpdating ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-check" />
                    Confirm Changes
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      }
    </section>
  );
}

export default SectionList;