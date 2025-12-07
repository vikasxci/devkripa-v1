const mongoose = require('mongoose');

const careerApplicationSchema = new mongoose.Schema({
    fullName: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    phone: {
        type: String,
        required: true,
        trim: true
    },
    position: {
        type: String,
        required: true,
        enum: ['Sales Executive', 'Relationship Manager', 'Telecaller', 'Branch Manager', 'Other']
    },
    experience: {
        type: String,
        required: true,
        enum: ['Fresher', '0-1 Years', '1-2 Years', '2-3 Years', '3-5 Years', '5+ Years']
    },
    currentSalary: {
        type: Number,
        default: null
    },
    location: {
        type: String,
        required: true,
        trim: true
    },
    qualification: {
        type: String,
        required: true,
        enum: ['10th Pass', '12th Pass', 'Diploma', 'Graduate', 'Post Graduate', 'MBA', 'Other']
    },
    resumeFileName: {
        type: String,
        required: true
    },
    resumeUrl: {
        type: String,  // Cloudinary URL
        required: true
    },
    resumePublicId: {
        type: String,  // Cloudinary public_id for deletion
        required: true
    },
    coverLetter: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['new', 'reviewed', 'shortlisted', 'interview-scheduled', 'selected', 'rejected'],
        default: 'new'
    },
    notes: {
        type: String,
        default: ''
    },
    appliedAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update timestamp on save
careerApplicationSchema.pre('save', function() {
    this.updatedAt = new Date();
});

module.exports = mongoose.model('CareerApplication', careerApplicationSchema);
