import { useMemo, useState } from "react";

function ScheduleTable({
  rows = [],
  onRowChange,
  isEditingEnabled,
  isRowDirty,
}) {
  const [activeCell, setActiveCell] = useState(null);

  const scheduleRows = useMemo(() => (Array.isArray(rows) ? rows : []), [rows]);

  const handleChange = (rowId, field, value) => {
    onRowChange?.(rowId, field, value);
  };

  const handleDayChange = (rowId, day, checked) => {
    const row = scheduleRows.find((entry) => entry.id === rowId);
    const nextDays = Array.isArray(row?.days) ? [...row.days] : [];
    if (checked) {
      if (!nextDays.includes(day)) nextDays.push(day);
    } else {
      const index = nextDays.indexOf(day);
      if (index >= 0) nextDays.splice(index, 1);
    }
    handleChange(rowId, "days", nextDays);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-[#eaf6e7] text-[#2f5b42]">
            <tr>
              <th className="px-4 py-4 text-xs font-bold uppercase tracking-[0.15em]">Subject Code</th>
              <th className="px-4 py-4 text-xs font-bold uppercase tracking-[0.15em]">Subject Title</th>
              <th className="px-4 py-4 text-xs font-bold uppercase tracking-[0.15em]">Units</th>
              <th className="px-4 py-4 text-xs font-bold uppercase tracking-[0.15em]">Days</th>
              <th className="px-4 py-4 text-xs font-bold uppercase tracking-[0.15em]">Time</th>
              <th className="px-4 py-4 text-xs font-bold uppercase tracking-[0.15em]">Room</th>
              <th className="px-4 py-4 text-xs font-bold uppercase tracking-[0.15em]">Instructor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {scheduleRows.length > 0 ? (
              scheduleRows.map((row) => {
                const rowDays = Array.isArray(row.days) ? row.days : [];
                const timeValue = `${row.timeStart ?? ""} - ${row.timeEnd ?? ""}`.trim();
                const hasChanges = Boolean(isRowDirty?.(row.id));

                return (
                  <tr
                    key={row.id}
                    className={`align-top transition hover:bg-emerald-50/50 ${hasChanges ? "bg-emerald-50/70" : ""}`}
                  >
                    <td className="px-4 py-4 font-semibold text-slate-900">
                      <div className="min-h-11 rounded-lg bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-900">
                        {row.subjectCode ?? ""}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-slate-700">
                      <div className="min-h-11 rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-700">
                        {row.subjectTitle ?? ""}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="inline-flex min-h-11 w-20 items-center justify-start rounded-lg bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-900">
                        {row.units ?? 0}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      {isEditingEnabled ? (
                        <div className="flex flex-wrap gap-2">
                          {[
                            "Monday",
                            "Tuesday",
                            "Wednesday",
                            "Thursday",
                            "Friday",
                            "Saturday",
                            "Sunday",
                          ].map((day) => (
                            <label key={day} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm">
                              <input
                                type="checkbox"
                                checked={rowDays.includes(day)}
                                onChange={(event) => handleDayChange(row.id, day, event.target.checked)}
                                className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-800 focus:ring-emerald-500/15"
                              />
                              {day.slice(0, 3)}
                            </label>
                          ))}
                        </div>
                      ) : (
                        <div className="flex min-h-11 flex-wrap gap-2">
                          {rowDays.length > 0 ? rowDays.map((day) => (
                            <span key={day} className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
                              {day.slice(0, 3)}
                            </span>
                          )) : (
                            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500 shadow-sm">
                              None
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 text-slate-700">
                      {isEditingEnabled ? (
                        <input
                          value={timeValue}
                          onChange={(event) => {
                            const [startTime = "", endTime = ""] = String(event.target.value).split("-").map((part) => part.trim());
                            handleChange(row.id, "timeStart", startTime);
                            handleChange(row.id, "timeEnd", endTime);
                          }}
                          onFocus={() => setActiveCell(`${row.id}-time`)}
                          className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition ${activeCell === `${row.id}-time` ? "border-emerald-500 ring-4 ring-emerald-500/10" : "border-transparent bg-slate-50 hover:border-slate-200"}`}
                        />
                      ) : (
                        <div className="min-h-11 rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-700">
                          {timeValue}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 text-slate-700">
                      {isEditingEnabled ? (
                        <input
                          value={row.room ?? ""}
                          onChange={(event) => handleChange(row.id, "room", event.target.value)}
                          onFocus={() => setActiveCell(`${row.id}-room`)}
                          className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition ${activeCell === `${row.id}-room` ? "border-emerald-500 ring-4 ring-emerald-500/10" : "border-transparent bg-slate-50 hover:border-slate-200"}`}
                        />
                      ) : (
                        <div className="min-h-11 rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-700">
                          {row.room ?? ""}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 text-slate-700">
                      {isEditingEnabled ? (
                        <>
                          <input
                            value={row.instructor ?? ""}
                            onChange={(event) => handleChange(row.id, "instructor", event.target.value)}
                            onFocus={() => setActiveCell(`${row.id}-instructor`)}
                            className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition ${activeCell === `${row.id}-instructor` ? "border-emerald-500 ring-4 ring-emerald-500/10" : "border-transparent bg-slate-50 hover:border-slate-200"}`}
                          />
                          <p className="mt-1 text-xs text-slate-500">{row.instructorRole ?? "Instructor"}</p>
                        </>
                      ) : (
                        <div className="rounded-lg bg-slate-50 px-3 py-3">
                          <p className="text-sm text-slate-700">{row.instructor ?? ""}</p>
                          <p className="mt-1 text-xs text-slate-500">{row.instructorRole ?? "Instructor"}</p>
                        </div>
                      )}
                    </td>

                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={7} className="px-6 py-16 text-center text-slate-500">
                  <div className="flex flex-col items-center gap-2">
                    <i className="fa-regular fa-calendar-days text-3xl opacity-50" />
                    <p>No schedule rows found.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ScheduleTable;