const mongoose = require("mongoose");

const leaveRequestSchema = new mongoose.Schema(
    {
        employee: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Employee ID is required"],
        },
        fromDate: {
            type: Date,
            required: [true, "From Date is required"],
        },
        toDate: {
            type: Date,
            required: [true, "To Date is required"],
            // -> We moved the validation directly into the field <-
            validate: {
                validator: function (value) {
                    // 'this' refers to the current document being saved
                    if (!this.fromDate || !value) return true; // Let the 'required' flags handle missing dates

                    // Returns true if valid, false if invalid
                    return value >= this.fromDate;
                },
                message: "The 'To Date' must be greater than or equal to the 'From Date'."
            }
        },
        reason: {
            type: String,
            required: [true, "Reason for leave is required"],
            trim: true,
            maxlength: [500, "Reason cannot exceed 500 characters"],
        },
        status: {
            type: String,
            enum: ["pending", "approved", "rejected"],
            default: "pending",
        },
        adminRemarks: {
            type: String,
            trim: true,
            default: "",
        },
    },
    {
        timestamps: true,
    }
);

// Notice we completely removed the leaveRequestSchema.pre("validate", ...) block!

module.exports = mongoose.model("LeaveRequest", leaveRequestSchema);