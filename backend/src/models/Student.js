import mongoose from "mongoose";

const studentSchema = new mongoose.Schema(
  {
    studentNumber: {
      type: String,
      required: true,
      unique: true,
    },
    firstName: {
      type: String,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
    },
    middleName: {
      type: String,
      trim: true,
    },
    section: {
      type: String,
      trim: true,
    },
    semester: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      default: "Enrolled",
    },
    year: {
      type: String,
      trim: true,
    },
    irregularSection: {
      type: [String],
      default: [],
    },
    irregularYear: {
      type: [String],
      default: [],
    },
    // personal information fields
    birthDate: {
      type: String,
      trim: true,
    },
    contactNumber: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
    },
    gender: {
      type: String,
      trim: true,
    },
    civilStatus: {
      type: String,
      trim: true,
    },
    placeOfBirth: {
      type: String,
      trim: true,
    },
    suffix: {
      type: String,
      trim: true,
    },
    spouseName: {
      type: String,
      trim: true,
    },
    // address fields (permanent)
    permanentHouse: { type: String, trim: true },
    permanentStreet: { type: String, trim: true },
    permanentBarangay: { type: String, trim: true },
    permanentCity: { type: String, trim: true },
    permanentProvince: { type: String, trim: true },
    permanentZip: { type: String, trim: true },
    // address fields (present)
    presentHouse: { type: String, trim: true },
    presentStreet: { type: String, trim: true },
    presentBarangay: { type: String, trim: true },
    presentCity: { type: String, trim: true },
    presentProvince: { type: String, trim: true },
    presentZip: { type: String, trim: true },
    // family information fields
    fatherName: {
      type: String,
      trim: true,
    },
    fatherContact: {
      type: String,
      trim: true,
    },
    motherName: {
      type: String,
      trim: true,
    },
    motherContact: {
      type: String,
      trim: true,
    },
    // school information fields
    schoolYear: {
      type: String,
      trim: true,
    },
    course: {
      type: String,
      trim: true,
    },
    applicantType: {
      type: String,
      trim: true,
    },
    elementarySchool: {
      type: String,
      trim: true,
    },
    elementaryAddress: {
      type: String,
      trim: true,
    },
    elementaryYear: {
      type: String,
      trim: true,
    },
    juniorHighSchool: {
      type: String,
      trim: true,
    },
    juniorHighAddress: {
      type: String,
      trim: true,
    },
    juniorHighYear: {
      type: String,
      trim: true,
    },
    seniorHighSchool: {
      type: String,
      trim: true,
    },
    seniorHighAddress: {
      type: String,
      trim: true,
    },
    seniorHighYear: {
      type: String,
      trim: true,
    },
    seniorHighGwa: {
      type: String,
      trim: true,
    },
    collegeSchool: {
      type: String,
      trim: true,
    },
    collegeAddress: {
      type: String,
      trim: true,
    },
    collegeYear: {
      type: String,
      trim: true,
    },
    password: {
      type: String,
      trim: true,
    },
    // flags
    disability: {
      type: Boolean,
      default: false,
    },
    indigenous: {
      type: Boolean,
      default: false,
    },
    soloParent: {
      type: Boolean,
      default: false,
    },
    fourPs: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const Student = mongoose.model("Student", studentSchema);

export default Student;