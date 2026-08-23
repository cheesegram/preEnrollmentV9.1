import Section from "../models/Section.js";
import Student from "../models/Student.js";
import {
  getSectionCapacities,
  getSectionStatus,
  rebalanceSections,
  resolveDefaultSectionCapacities,
  syncAllSectionsFromStudents,
} from "../services/sectionService.js";

export async function syncSectionsFromStudents(req, res) {
  try {
    const sections = await syncAllSectionsFromStudents();
    res.status(200).json({ message: "Sections synced successfully", sections });
  } catch (error) {
    console.error("Error in syncSectionsFromStudents controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getAllSections(req, res) {
  try {
    const sections = await Section.find({}).sort({ year: 1, section: 1, semester: 1 }).lean();
    res.status(200).json(sections);
  } catch (error) {
    console.error("Error in getAllSections controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function createSection(req, res) {
  try {
    const rawSectionName = String(req.body?.section ?? "").trim();
    const sectionName = rawSectionName.toUpperCase();
    const year = String(req.body?.year ?? "").trim();
    const semester = String(req.body?.semester ?? "").trim();

    if (!sectionName) {
      return res.status(400).json({ message: "Section name is required" });
    }

    if (!["1", "2", "3", "4"].includes(year)) {
      return res.status(400).json({ message: "Year must be 1, 2, 3, or 4" });
    }

    if (!["1st", "2nd"].includes(semester)) {
      return res.status(400).json({ message: "Semester must be 1st or 2nd" });
    }

    const existing = await Section.findOne({ year, section: sectionName, semester }).lean();
    if (existing) {
      return res.status(409).json({ message: "Section already exists" });
    }

    const capacities = await resolveDefaultSectionCapacities({ year, semester });

    const created = await Section.create({
      section: sectionName,
      year,
      semester,
      blockCount: 0,
      irregularCount: 0,
      ...capacities,
      status: getSectionStatus(0, 0, capacities.totalCapacity),
    });

    res.status(201).json(created);
  } catch (error) {
    console.error("Error in createSection controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function updateSectionById(req, res) {
  try {
    const payload = req.body || {};
    const update = {};

    if (payload.totalCapacity != null) {
      update.totalCapacity = Math.max(0, Number(payload.totalCapacity) || 0);
    }

    const current = await Section.findById(req.params.id);
    if (!current) {
      return res.status(404).json({ message: "Section not found" });
    }

    const capacities = getSectionCapacities(update.totalCapacity ?? current.totalCapacity);
    Object.assign(update, capacities);
    update.status = getSectionStatus(current.blockCount, current.irregularCount, capacities.totalCapacity);

    const updated = await Section.findByIdAndUpdate(req.params.id, update, { new: true });
    res.status(200).json(updated);
  } catch (error) {
    console.error("Error in updateSectionById controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getSectionsMeta(req, res) {
  try {
    const irregularTotal = await Student.countDocuments({ status: "Irregular" });
    res.status(200).json({ irregularTotal });
  } catch (error) {
    console.error("Error in getSectionsMeta controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function deleteSectionById(req, res) {
  try {
    const section = await Section.findById(req.params.id).lean();
    if (!section) {
      return res.status(404).json({ message: "Section not found" });
    }

    const enrolledExists = await Student.exists({
      year: String(section.year ?? "").trim(),
      section: String(section.section ?? "").trim(),
      semester: String(section.semester ?? "").trim(),
      status: { $in: ["Block", "Irregular"] },
    });

    if (enrolledExists) {
      return res.status(409).json({
        message: "Cannot delete section with enrolled students",
      });
    }

    await Section.findByIdAndDelete(req.params.id);
    return res.status(200).json({ message: "Section deleted successfully" });
  } catch (error) {
    console.error("Error in deleteSectionById controller", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function updateAllSectionsCapacity(req, res) {
  try {
    const totalCapacity = Math.max(0, Number(req.body?.totalCapacity) || 0);
    const blockCapacity = req.body?.blockCapacity;
    const irregularCapacity = req.body?.irregularCapacity;

    const hasManualValues =
      blockCapacity != null &&
      irregularCapacity != null &&
      String(blockCapacity).trim() !== "" &&
      String(irregularCapacity).trim() !== "";

    let capacities;
    if (hasManualValues) {
      const parsedBlock = Math.max(0, Number(blockCapacity) || 0);
      const parsedIrregular = Math.max(0, Number(irregularCapacity) || 0);
      capacities = {
        totalCapacity: parsedBlock + parsedIrregular,
        blockCapacity: parsedBlock,
        irregularCapacity: parsedIrregular,
      };
    } else {
      capacities = getSectionCapacities(totalCapacity);
    }

    const result = await Section.updateMany({}, {
      $set: {
        totalCapacity: capacities.totalCapacity,
        irregularCapacity: capacities.irregularCapacity,
        blockCapacity: capacities.blockCapacity,
        status: getSectionStatus(0, 0, capacities.totalCapacity),
      }
    });

    let rebalancedSections = [];
    const years = await Section.distinct("year");
    for (const year of years) {
      const semesters = await Section.distinct("semester", { year });
      for (const semester of semesters) {
        const rebalanced = await rebalanceSections(year, semester);
        rebalancedSections.push(...rebalanced);
      }
    }

    console.log("[DEBUG] Capacities sent:", capacities);
    console.log("[DEBUG] Rebalanced sections count:", rebalancedSections.length);

    res.status(200).json({
      message: "All sections capacity updated successfully",
      modified: result.modifiedCount,
      rebalanced: rebalancedSections.length,
      sections: rebalancedSections
    });
  } catch (error) {
    console.error("Error in updateAllSectionsCapacity controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}
