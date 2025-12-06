const mongoose = require('mongoose');

// ===========================
// Loan Application Schema
// ===========================
const loanApplicationSchema = new mongoose.Schema({
    // Personal Information
    loanType: {
        type: String,
        required: true,
        enum: ['personal-loan', 'business-loan', 'instant-loan', 'car-loan', 'credit-card', 'emi-card', 'insurance', 'bank-account']
    },
    loanAmount: {
        type: Number,
        required: true
    },
    fullName: {
        type: String,
        required: true
    },
    mobileNumber: {
        type: String,
        required: true,
        match: /^[0-9]{10}$/
    },
    maritalStatus: {
        type: String,
        required: true,
        enum: ['single', 'married', 'divorced', 'widowed']
    },
    spouseName: {
        type: String,
        default: null
    },
    motherName: {
        type: String,
        required: true
    },
    
    // Employment Info (Step 1)
    employmentType: {
        type: String,
        required: true,
        enum: ['employed', 'self-employed']
    },
    
    // PAN Card Details (Step 1)
    personalEmail: {
        type: String,
        required: true,
        match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    },
    panCardNumber: {
        type: String,
        required: true,
        match: /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/
    },

    // Address Information
    qualification: {
        type: String,
        required: true,
        enum: ['10th', '12th', 'graduation', 'post-graduation', 'diploma']
    },
    residenceType: {
        type: String,
        required: true,
        enum: ['owned', 'rented', 'company-provided', 'family']
    },
    currentAddress: {
        address: {
            type: String,
            required: true
        },
        street: String,
        city: {
            type: String,
            required: true
        },
        zipcode: {
            type: String,
            required: true
        }
    },
    permanentAddress: {
        address: {
            type: String,
            required: true
        },
        street: String,
        city: {
            type: String,
            required: true
        },
        zipcode: {
            type: String,
            required: true
        }
    },

    // Employment Information
    companyName: {
        type: String,
        required: true
    },
    companyAddress: {
        address: {
            type: String,
            required: true
        },
        street: String,
        city: {
            type: String,
            required: true
        },
        zipcode: {
            type: String,
            required: true
        }
    },
    designation: {
        type: String,
        required: true
    },
    officialEmail: {
        type: String,
        required: true,
        match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    },
    currentWorkExperience: {
        type: Number,
        required: true
    },
    totalWorkExperience: {
        type: Number,
        required: true
    },

    // Business Loan Specific Fields
    monthlyIncome: {
        type: Number,
        default: null
    },
    gstRegistered: {
        type: String,
        enum: ['yes', 'no', null],
        default: null
    },
    itrReturn: {
        type: String,
        enum: ['yes', 'no', null],
        default: null
    },

    // Employee Specific Fields (for non-business loans)
    monthlyInhandSalary: {
        type: Number,
        default: null
    },
    pfDeduction: {
        type: String,
        enum: ['yes', 'no', null],
        default: null
    },

    // Metadata
    applicationStatus: {
        type: String,
        enum: ['submitted', 'under-review', 'approved', 'rejected', 'on-hold'],
        default: 'submitted'
    },
    applicationDate: {
        type: Date,
        default: Date.now
    },
    ipAddress: String,
    userAgent: String
});

// Create and export model
module.exports = mongoose.model('LoanApplication', loanApplicationSchema);
