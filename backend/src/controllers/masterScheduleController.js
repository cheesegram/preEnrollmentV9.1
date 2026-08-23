// after sched generated, and saved to db

import Schedule from '../models/Schedule.js';
import { isTimeOverlap } from '../utils/timeConstants.js';

function normalizeSemester(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    return raw.toLowerCase().includes('semester') ? raw : `${raw} Semester`;
}

function normalizeAcademicYear(value) {
    return String(value ?? '').trim().replace(/\s*-\s*/g, ' - ');
}

function normalizeDays(classEntry) {
    if (Array.isArray(classEntry?.days)) {
        return [...new Set(classEntry.days.map((day) => String(day ?? '').trim()).filter(Boolean))];
    }

    const singleDay = String(classEntry?.day ?? '').trim();
    return singleDay ? [singleDay] : [];
}

function toNumberOrNull(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
}

function toDisplayTime(totalMinutes) {
    const minutes = toNumberOrNull(totalMinutes);
    if (minutes == null) return 'Unknown Time';

    const hour24 = Math.floor(minutes / 60) % 24;
    const minutePart = minutes % 60;
    const suffix = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = hour24 % 12 || 12;
    return `${hour12}:${String(minutePart).padStart(2, '0')} ${suffix}`;
}

function getSectionLabel(schedule, classEntry) {
    const rawSection = String(schedule?.section ?? classEntry?.sectionName ?? '').trim();
    const rawYear = String(schedule?.year ?? '').trim();

    if (!rawSection) return '';
    if (!rawYear) return rawSection;
    return rawSection.startsWith(rawYear) ? rawSection : `${rawYear}${rawSection}`;
}

function buildScheduleConflicts(schedules) {
    const conflicts = [];

    for (const schedule of schedules) {
        const classes = Array.isArray(schedule?.classes) ? schedule.classes : [];
        for (let i = 0; i < classes.length; i += 1) {
            for (let j = i + 1; j < classes.length; j += 1) {
                const left = classes[i];
                const right = classes[j];

                const leftStart = toNumberOrNull(left?.startTime);
                const leftEnd = toNumberOrNull(left?.endTime);
                const rightStart = toNumberOrNull(right?.startTime);
                const rightEnd = toNumberOrNull(right?.endTime);

                if (leftStart == null || leftEnd == null || rightStart == null || rightEnd == null) continue;

                const leftDays = normalizeDays(left);
                const rightDays = normalizeDays(right);
                const overlappingDays = leftDays.filter((day) => rightDays.includes(day));
                if (overlappingDays.length === 0) continue;

                if (!isTimeOverlap(leftStart, leftEnd, rightStart, rightEnd)) continue;

                const leftRoom = String(left?.roomName ?? left?.roomId ?? '').trim();
                const rightRoom = String(right?.roomName ?? right?.roomId ?? '').trim();
                const leftProf = String(left?.profName ?? left?.profId ?? '').trim();
                const rightProf = String(right?.profName ?? right?.profId ?? '').trim();
                const leftSection = String(left?.sectionName ?? '').trim();
                const rightSection = String(right?.sectionName ?? '').trim();

                const slot = `${overlappingDays.join('/')} ${toDisplayTime(Math.max(leftStart, rightStart))} - ${toDisplayTime(Math.min(leftEnd, rightEnd))}`;
                const semester = normalizeSemester(schedule?.semester);
                const schoolYear = normalizeAcademicYear(schedule?.academic_year ?? schedule?.academicYear);
                const section = getSectionLabel(schedule, left);

                if (leftRoom && rightRoom && leftRoom === rightRoom) {
                    conflicts.push({
                        scheduleId: String(schedule?._id ?? ''),
                        section,
                        semester,
                        schoolYear,
                        message: `Room conflict: ${leftRoom} is double-booked on ${slot}.`,
                    });
                }

                if (leftProf && rightProf && leftProf === rightProf) {
                    conflicts.push({
                        scheduleId: String(schedule?._id ?? ''),
                        section,
                        semester,
                        schoolYear,
                        message: `Instructor conflict: ${leftProf} is assigned to overlapping classes on ${slot}.`,
                    });
                }

                if (leftSection && rightSection && leftSection === rightSection) {
                    conflicts.push({
                        scheduleId: String(schedule?._id ?? ''),
                        section,
                        semester,
                        schoolYear,
                        message: `Section conflict: ${leftSection} has overlapping classes on ${slot}.`,
                    });
                }
            }
        }
    }

    return conflicts;
}

export async function getScheduleConflicts(req, res) {
    try {
        const schedules = await Schedule.find({}).lean();
        const conflicts = buildScheduleConflicts(schedules);
        const hasConflicts = conflicts.length > 0;

        res.status(200).json({
            hasConflicts,
            status: hasConflicts
                ? {
                    hasConflicts: true,
                    message: `${conflicts.length} Schedule Conflict${conflicts.length > 1 ? 's' : ''} Detected`,
                    description: 'Review overlapping section, instructor, or room assignments.',
                }
                : {
                    hasConflicts: false,
                    message: 'No Schedule Conflicts Detected',
                    description: 'All assigned schedules passed validation.',
                },
            conflicts,
        });
    } catch (error) {
        console.error('Error fetching schedule conflicts:', error);
        res.status(500).json({ message: 'Internal server error while fetching schedule conflicts.' });
    }
}

export async function updateScheduleClasses(req, res) {
    try {
        const { id } = req.params;
        const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];

        if (updates.length === 0) {
            return res.status(400).json({ message: 'No class updates were provided.' });
        }

        const schedule = await Schedule.findById(id).lean();
        if (!schedule) {
            return res.status(404).json({ message: 'Schedule not found with the provided ID.' });
        }

        const classes = Array.isArray(schedule.classes) ? [...schedule.classes] : [];
        let updatedCount = 0;

        for (const update of updates) {
            const classIndex = Number(update?.classIndex);
            if (!Number.isInteger(classIndex) || classIndex < 0 || classIndex >= classes.length) {
                continue;
            }

            const changes = update?.changes && typeof update.changes === 'object' ? { ...update.changes } : {};

            if (Object.prototype.hasOwnProperty.call(changes, 'days')) {
                const normalizedDays = Array.isArray(changes.days)
                    ? [...new Set(changes.days.map((day) => String(day ?? '').trim()).filter(Boolean))]
                    : [];
                changes.days = normalizedDays;
                changes.day = normalizedDays[0] ?? '';
            }

            if (Object.prototype.hasOwnProperty.call(changes, 'startTime')) {
                const numericStart = toNumberOrNull(changes.startTime);
                if (numericStart == null) {
                    delete changes.startTime;
                } else {
                    changes.startTime = numericStart;
                }
            }

            if (Object.prototype.hasOwnProperty.call(changes, 'endTime')) {
                const numericEnd = toNumberOrNull(changes.endTime);
                if (numericEnd == null) {
                    delete changes.endTime;
                } else {
                    changes.endTime = numericEnd;
                }
            }

            if (
                Object.prototype.hasOwnProperty.call(changes, 'startTime') &&
                Object.prototype.hasOwnProperty.call(changes, 'endTime') &&
                changes.startTime >= changes.endTime
            ) {
                return res.status(400).json({ message: `Invalid time range for classIndex ${classIndex}.` });
            }

            classes[classIndex] = {
                ...(classes[classIndex] ?? {}),
                ...changes,
            };

            updatedCount += 1;
        }

        if (updatedCount === 0) {
            return res.status(400).json({ message: 'No valid class updates were provided.' });
        }

        await Schedule.updateOne(
            { _id: id },
            { $set: { classes } }
        );

        res.status(200).json({
            success: true,
            scheduleId: String(schedule._id ?? id),
            updatedCount,
        });
    } catch (error) {
        console.error(`Error updating schedule classes (${req.params.id}):`, error);
        res.status(500).json({ message: 'Internal server error while updating schedule classes.' });
    }
}

export async function getAllSchedules(req, res) {
    try {
        const schedules = await Schedule.find({}).sort({ generated_at: -1 }).lean();
        res.status(200).json(schedules);
    } catch (error) {
        console.error("Error fetching all schedules:", error);
        res.status(500).json({ message: "Internal server error while fetching schedules." });
    }
}

export async function getScheduleById(req, res) {
    try {
        const { id } = req.params;
        const schedule = await Schedule.findById(id).lean();

        if (!schedule) {
            return res.status(404).json({ message: 'Schedule not found with the provided ID.' });
        }

        res.status(200).json(schedule);
    } catch (error) {
        console.error(`Error fetching schedule by ID (${req.params.id}):`, error);
        res.status(500).json({ message: 'Internal server error while fetching schedule details.' });
    }
}

