const mongoose = require('mongoose');

// ===========================
// Visitor Schema - Track website visitors
// ===========================
const visitorSchema = new mongoose.Schema({
    // Session identification
    sessionId: {
        type: String,
        required: true,
        index: true
    },
    visitorId: {
        type: String,
        required: true,
        index: true
    },
    
    // Technical Information
    ipAddress: {
        type: String,
        default: 'Unknown'
    },
    location: {
        country: { type: String, default: 'Unknown' },
        city: { type: String, default: 'Unknown' },
        region: { type: String, default: 'Unknown' },
        timezone: { type: String, default: 'Unknown' },
        latitude: { type: Number, default: null },
        longitude: { type: Number, default: null }
    },
    
    // Device & Browser Information
    device: {
        type: { type: String, default: 'Unknown' }, // desktop, mobile, tablet
        os: { type: String, default: 'Unknown' },
        osVersion: { type: String, default: 'Unknown' },
        browser: { type: String, default: 'Unknown' },
        browserVersion: { type: String, default: 'Unknown' },
        screenResolution: { type: String, default: 'Unknown' },
        screenWidth: { type: Number, default: null },
        screenHeight: { type: Number, default: null },
        colorDepth: { type: Number, default: null },
        language: { type: String, default: 'Unknown' },
        platform: { type: String, default: 'Unknown' }
    },
    
    // Traffic Source
    trafficSource: {
        source: { type: String, default: 'direct' }, // google, facebook, twitter, direct, referral
        medium: { type: String, default: 'none' }, // organic, cpc, referral, social, email
        campaign: { type: String, default: null },
        referrer: { type: String, default: null },
        utmSource: { type: String, default: null },
        utmMedium: { type: String, default: null },
        utmCampaign: { type: String, default: null },
        utmContent: { type: String, default: null },
        utmTerm: { type: String, default: null }
    },
    
    // Behavioral Data
    pageViews: [{
        url: { type: String, required: true },
        title: { type: String, default: '' },
        timestamp: { type: Date, default: Date.now },
        timeSpent: { type: Number, default: 0 }, // seconds
        scrollDepth: { type: Number, default: 0 } // percentage
    }],
    
    interactions: [{
        type: { type: String }, // click, scroll, form_focus, form_submit, etc.
        element: { type: String },
        page: { type: String },
        timestamp: { type: Date, default: Date.now },
        data: { type: mongoose.Schema.Types.Mixed }
    }],
    
    // Session Data
    sessionStart: {
        type: Date,
        default: Date.now
    },
    sessionEnd: {
        type: Date,
        default: null
    },
    totalTimeOnSite: {
        type: Number,
        default: 0 // in seconds
    },
    totalPageViews: {
        type: Number,
        default: 0
    },
    maxScrollDepth: {
        type: Number,
        default: 0
    },
    
    // Entry & Exit
    entryPage: {
        type: String,
        default: ''
    },
    exitPage: {
        type: String,
        default: ''
    },
    
    // Conversion Tracking
    conversions: [{
        type: { type: String }, // form_submit, loan_application, contact, career_application
        page: { type: String },
        timestamp: { type: Date, default: Date.now },
        data: { type: mongoose.Schema.Types.Mixed }
    }],
    
    // Identification Data (if available)
    identified: {
        type: Boolean,
        default: false
    },
    identificationData: {
        name: { type: String, default: null },
        email: { type: String, default: null },
        phone: { type: String, default: null },
        company: { type: String, default: null },
        jobTitle: { type: String, default: null }
    },
    
    // Social Profiles (if detectable)
    socialProfiles: [{
        platform: { type: String },
        profileUrl: { type: String }
    }],
    
    // Status
    isActive: {
        type: Boolean,
        default: true
    },
    isBot: {
        type: Boolean,
        default: false
    },
    
    // Visitor Type
    visitorType: {
        type: String,
        enum: ['new', 'returning'],
        default: 'new'
    },
    
    // Visit count for this visitor
    visitCount: {
        type: Number,
        default: 1
    },
    
    // First and last visit dates
    firstVisit: {
        type: Date,
        default: Date.now
    },
    lastVisit: {
        type: Date,
        default: Date.now
    },
    
    // Notes for admin
    adminNotes: {
        type: String,
        default: ''
    },
    
    // Timestamps
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Indexes for faster queries
visitorSchema.index({ createdAt: -1 });
visitorSchema.index({ 'location.country': 1 });
visitorSchema.index({ 'device.type': 1 });
visitorSchema.index({ 'trafficSource.source': 1 });
visitorSchema.index({ isBot: 1 });
visitorSchema.index({ identified: 1 });
visitorSchema.index({ sessionStart: -1 });

// Update timestamps before saving
visitorSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('Visitor', visitorSchema);
