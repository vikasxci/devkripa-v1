const mongoose = require('mongoose');

// ===========================
// Loan Application Schema
// ===========================
const loanApplicationSchema = new mongoose.Schema({
    // Common Fields (required for all forms)
    loanType: {
        type: String,
        required: true,
        enum: ['personal-loan', 'business-loan', 'instant-loan', 'car-loan', 'credit-card', 'emi-card', 'insurance', 'bank-account']
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

    // ==========================================
    // INSURANCE FORM SPECIFIC FIELDS
    // ==========================================
    insuranceType: {
        type: String,
        enum: ['life-insurance', 'health-insurance', 'vehicle-insurance', null],
        default: null
    },

    // ==========================================
    // BANK ACCOUNT FORM SPECIFIC FIELDS
    // ==========================================
    accountType: {
        type: String,
        enum: ['savings-account', 'current-account', 'salary-account', null],
        default: null
    },

    // ==========================================
    // LOAN FORM FIELDS (3-Step Form)
    // ==========================================
    
    // Loan Amount (required only for loans, not for insurance/bank/emi)
    loanAmount: {
        type: Number,
        default: null
    },
    
    // Marital Status (loan forms only)
    maritalStatus: {
        type: String,
        enum: ['single', 'married', 'divorced', 'widowed', null],
        default: null
    },
    spouseName: {
        type: String,
        default: null
    },
    motherName: {
        type: String,
        default: null
    },
    
    // Employment Type (used by loans and EMI card)
    employmentType: {
        type: String,
        enum: ['employed', 'self-employed', null],
        default: null
    },

    // Qualification (loan forms only)
    qualification: {
        type: String,
        enum: ['10th', '12th', 'graduation', 'post-graduation', 'diploma', null],
        default: null
    },
    
    // Residence Type (loan forms only)
    residenceType: {
        type: String,
        enum: ['owned', 'rented', 'company-provided', 'family', null],
        default: null
    },
    
    // Current Address (loan forms only)
    currentAddress: {
        address: { type: String, default: null },
        street: { type: String, default: null },
        city: { type: String, default: null },
        zipcode: { type: String, default: null }
    },
    
    // Permanent Address (loan forms only)
    permanentAddress: {
        address: { type: String, default: null },
        street: { type: String, default: null },
        city: { type: String, default: null },
        zipcode: { type: String, default: null }
    },

    // Company Information (loan forms only)
    companyName: {
        type: String,
        default: null
    },
    companyAddress: {
        address: { type: String, default: null },
        street: { type: String, default: null },
        city: { type: String, default: null },
        zipcode: { type: String, default: null }
    },
    designation: {
        type: String,
        default: null
    },
    officialEmail: {
        type: String,
        default: null
    },
    currentWorkExperience: {
        type: Number,
        default: null
    },
    totalWorkExperience: {
        type: Number,
        default: null
    },

    // Monthly Income (used by business loans, insurance, bank account)
    monthlyIncome: {
        type: Number,
        default: null
    },
    
    // Business Loan Specific Fields
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
