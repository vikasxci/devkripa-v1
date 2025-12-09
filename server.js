require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
 
const app = express();

// ===========================
// Cloudinary Configuration
// ===========================
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Helper function to upload to Cloudinary
const uploadToCloudinary = (buffer, options) => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            options,
            (error, result) => {
                if (error) reject(error);
                else resolve(result);
            }
        );
        uploadStream.end(buffer);
    });
};

// ===========================
// Multer Configuration for File Uploads
// ===========================
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB max
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only PDF, DOC, and DOCX are allowed.'), false);
        }
    }
});

// ===========================
// Middleware
// ===========================
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

// Serve static files from public folder (only in development)
if (process.env.NODE_ENV !== 'production') {
    app.use(express.static(path.join(__dirname, '../public')));
}

// ===========================
// Database Connection
// ===========================
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/devkripafincrop';

console.log('📍 Attempting to connect to MongoDB...');
console.log('🔗 URI:', mongoUri);

mongoose.connect(mongoUri)
    .then(async () => {
        console.log('✅ MongoDB Connected Successfully');
        
        // Create default super admin if none exists
        await createDefaultSuperAdmin();
    })
    .catch((err) => {
        console.error('❌ MongoDB Connection Error:', err.message);
        console.log('⚠️  Make sure your MongoDB Atlas connection string is correct');
        console.log('📝 Update MONGODB_URI in .env file with your cluster connection string');
    });

// Function to create default super admin
async function createDefaultSuperAdmin() {
    try {
        const AdminUser = require('./models/AdminUser');
        const existingSuperAdmin = await AdminUser.findOne({ role: 'super-admin' });
        
        if (!existingSuperAdmin) {
            const defaultSuperAdmin = new AdminUser({
                fullName: 'Super Admin',
                email: 'admin@devkripafincrop.com',
                password: 'Jitendra@098',
                phone: '0000000000',
                role: 'super-admin',
                status: 'active'
            });
            
            await defaultSuperAdmin.save();
            console.log('✅ Default Super Admin created:');
            console.log('   Email: admin@devkripafincrop.com');
            console.log('   Password: Jitendra@098');
            console.log('   ⚠️  Please change this password immediately!');
        } else {
            console.log('ℹ️  Super Admin already exists');
        }
    } catch (error) {
        console.error('❌ Error creating default super admin:', error.message);
    }
}

// ===========================
// Models
// ===========================
const LoanApplication = require('./models/LoanApplication');
const CareerApplication = require('./models/CareerApplication');
const AdminUser = require('./models/AdminUser');
const jwt = require('jsonwebtoken');

// JWT Secret (should be in .env file)
const JWT_SECRET = process.env.JWT_SECRET || 'devkripa-fincrop-secret-key-2025';

// Contact Message Schema (inline for simplicity)
const contactMessageSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    service: { type: String, required: true },
    message: { type: String, required: true },
    status: { type: String, enum: ['new', 'in-progress', 'resolved'], default: 'new' },
    date: { type: Date, default: Date.now }
});

const ContactMessage = mongoose.model('ContactMessage', contactMessageSchema);

// FAQ Schema
const faqSchema = new mongoose.Schema({
    question: { type: String, required: true },
    answer: { type: String, required: true },
    category: { type: String, default: 'general' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const FAQ = mongoose.model('FAQ', faqSchema);

// ===========================
// Routes
// ===========================

// Health check / API info route
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'DevKripa Fincrop API Server',
        version: '1.0.0',
        endpoints: {
            applications: '/api/applications',
            contact: '/api/contact-messages',
            faqs: '/api/faqs',
            career: '/api/career/applications',
            statistics: '/api/statistics'
        }
    });
});

// ===========================
// API Routes
// ===========================

/**
 * POST /api/submit-application
 * Submit loan application form (handles all form types)
 */
app.post('/api/submit-application', async (req, res) => {
    try {
        const {
            loanType,
            loanAmount,
            fullName,
            mobileNumber,
            maritalStatus,
            spouseName,
            motherName,
            employmentType,
            personalEmail,
            panCardNumber,
            qualification,
            residenceType,
            currentAddress,
            currentStreet,
            currentCity,
            currentZipcode,
            permanentAddress,
            permanentStreet,
            permanentCity,
            permanentZipcode,
            companyName,
            companyAddress,
            companyStreet,
            companyCity,
            companyZipcode,
            designation,
            officialEmail,
            currentWorkExperience,
            totalWorkExperience,
            // Business loan fields
            businessVintage,
            monthlyIncome,
            gstRegistered,
            itrReturn,
            // Employee fields (non-business loans)
            monthlyInhandSalary,
            pfDeduction,
            // Insurance specific
            insuranceType,
            // Bank account specific
            accountType
        } = req.body;

        // Common required fields for all forms
        if (!loanType || !fullName || !mobileNumber || !personalEmail || !panCardNumber) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        // Determine form type and create appropriate application object
        const isSimpleForm = ['insurance', 'bank-account', 'emi-card'].includes(loanType);
        
        let applicationData = {
            loanType,
            fullName,
            mobileNumber,
            personalEmail,
            panCardNumber: panCardNumber ? panCardNumber.toUpperCase() : null,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('user-agent')
        };

        if (loanType === 'insurance') {
            // Insurance Form: Simple fields only
            applicationData.monthlyIncome = monthlyIncome ? parseFloat(monthlyIncome) : null;
            applicationData.insuranceType = insuranceType;
        } else if (loanType === 'bank-account') {
            // Bank Account Form: Simple fields only
            applicationData.monthlyIncome = monthlyIncome ? parseFloat(monthlyIncome) : null;
            applicationData.accountType = accountType;
        } else if (loanType === 'emi-card') {
            // EMI Card Form: Simple fields only
            applicationData.employmentType = employmentType;
        } else {
            // Full Loan Application Form (3 Steps)
            if (!loanAmount) {
                return res.status(400).json({
                    success: false,
                    message: 'Loan amount is required'
                });
            }

            applicationData = {
                ...applicationData,
                loanAmount: parseFloat(loanAmount),
                maritalStatus,
                spouseName: maritalStatus === 'married' ? spouseName : null,
                motherName,
                employmentType,
                qualification,
                residenceType,
                currentAddress: {
                    address: currentAddress,
                    street: currentStreet,
                    city: currentCity,
                    zipcode: currentZipcode
                },
                permanentAddress: {
                    address: permanentAddress,
                    street: permanentStreet,
                    city: permanentCity,
                    zipcode: permanentZipcode
                },
                companyName,
                companyAddress: {
                    address: companyAddress,
                    street: companyStreet,
                    city: companyCity,
                    zipcode: companyZipcode
                },
                designation,
                officialEmail,
                currentWorkExperience: loanType !== 'business-loan' && currentWorkExperience ? parseInt(currentWorkExperience) : null,
                totalWorkExperience: loanType !== 'business-loan' && totalWorkExperience ? parseInt(totalWorkExperience) : null,
                // Business loan specific
                businessVintage: loanType === 'business-loan' ? businessVintage : null,
                monthlyIncome: loanType === 'business-loan' ? parseFloat(monthlyIncome) : null,
                gstRegistered: loanType === 'business-loan' ? gstRegistered : null,
                itrReturn: loanType === 'business-loan' ? itrReturn : null,
                // Employee specific (non-business loans)
                monthlyInhandSalary: (loanType !== 'business-loan' && employmentType === 'employed') ? parseFloat(monthlyInhandSalary) : null,
                pfDeduction: (loanType !== 'business-loan' && employmentType === 'employed') ? pfDeduction : null
            };
        }

        // Create new application
        const newApplication = new LoanApplication(applicationData);

        // Save to database
        const savedApplication = await newApplication.save();

        console.log('✅ Application saved successfully:', {
            id: savedApplication._id,
            name: fullName,
            email: personalEmail,
            loanType: loanType,
            formType: isSimpleForm ? 'Simple Form' : 'Full Loan Form'
        });

        res.status(201).json({
            success: true,
            message: 'Application submitted successfully',
            applicationId: savedApplication._id,
            data: savedApplication
        });

    } catch (error) {
        console.error('❌ Error saving application:', error);

        // Mongoose validation errors
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: messages
            });
        }

        res.status(500).json({
            success: false,
            message: 'Error submitting application. Please try again.',
            error: error.message
        });
    }
});

/**
 * GET /api/applications
 * Get all applications (for admin dashboard)
 */
app.get('/api/applications', async (req, res) => {
    try {
        const applications = await LoanApplication.find()
            .sort({ applicationDate: -1 })
            .limit(100);

        res.json({
            success: true,
            count: applications.length,
            data: applications
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching applications',
            error: error.message
        });
    }
});

/**
 * GET /api/applications/:id
 * Get single application by ID
 */
app.get('/api/applications/:id', async (req, res) => {
    try {
        const application = await LoanApplication.findById(req.params.id);

        if (!application) {
            return res.status(404).json({
                success: false,
                message: 'Application not found'
            });
        }

        res.json({
            success: true,
            data: application
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching application',
            error: error.message
        });
    }
});

/**
 * PUT /api/applications/:id/status
 * Update application status
 */
app.put('/api/applications/:id/status', async (req, res) => {
    try {
        const { status } = req.body;

        if (!status || !['submitted', 'under-review', 'approved', 'rejected', 'on-hold'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status'
            });
        }

        const application = await LoanApplication.findByIdAndUpdate(
            req.params.id,
            { applicationStatus: status },
            { new: true }
        );

        if (!application) {
            return res.status(404).json({
                success: false,
                message: 'Application not found'
            });
        }

        res.json({
            success: true,
            message: 'Status updated successfully',
            data: application
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error updating application',
            error: error.message
        });
    }
});

/**
 * GET /api/statistics
 * Get application statistics
 */
app.get('/api/statistics', async (req, res) => {
    try {
        const total = await LoanApplication.countDocuments();
        const byLoanType = await LoanApplication.aggregate([
            { $group: { _id: '$loanType', count: { $sum: 1 } } }
        ]);
        const byStatus = await LoanApplication.aggregate([
            { $group: { _id: '$applicationStatus', count: { $sum: 1 } } }
        ]);

        res.json({
            success: true,
            statistics: {
                totalApplications: total,
                byLoanType: byLoanType,
                byStatus: byStatus
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching statistics',
            error: error.message
        });
    }
});

/**
 * POST /api/contact-messages
 * Submit contact form message
 */
app.post('/api/contact-messages', async (req, res) => {
    try {
        const { name, email, phone, service, message } = req.body;

        if (!name || !email || !phone || !service || !message) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        const newMessage = new ContactMessage({
            name,
            email,
            phone,
            service,
            message
        });

        const savedMessage = await newMessage.save();

        res.status(201).json({
            success: true,
            message: 'Message submitted successfully',
            data: savedMessage
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error submitting message',
            error: error.message
        });
    }
});

/**
 * GET /api/contact-messages
 * Get all contact messages
 */
app.get('/api/contact-messages', async (req, res) => {
    try {
        const messages = await ContactMessage.find().sort({ date: -1 });

        res.json({
            success: true,
            data: messages
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching messages',
            error: error.message
        });
    }
});

/**
 * PUT /api/contact-messages/:id/status
 * Update contact message status
 */
app.put('/api/contact-messages/:id/status', async (req, res) => {
    try {
        const { status } = req.body;

        const message = await ContactMessage.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true }
        );

        res.json({
            success: true,
            data: message
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error updating message status',
            error: error.message
        });
    }
});

/**
 * POST /api/faqs
 * Create new FAQ
 */
app.post('/api/faqs', async (req, res) => {
    try {
        const { question, answer, category } = req.body;

        if (!question || !answer) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        const newFaq = new FAQ({
            question,
            answer,
            category: category || 'general'
        });

        const savedFaq = await newFaq.save();

        res.status(201).json({
            success: true,
            message: 'FAQ created successfully',
            data: savedFaq
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error creating FAQ',
            error: error.message
        });
    }
});

/**
 * GET /api/faqs
 * Get all FAQs
 */
app.get('/api/faqs', async (req, res) => {
    try {
        const faqs = await FAQ.find().sort({ createdAt: -1 });

        res.json({
            success: true,
            data: faqs
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching FAQs',
            error: error.message
        });
    }
});

/**
 * GET /api/faqs/:id
 * Get single FAQ
 */
app.get('/api/faqs/:id', async (req, res) => {
    try {
        const faq = await FAQ.findById(req.params.id);

        if (!faq) {
            return res.status(404).json({
                success: false,
                message: 'FAQ not found'
            });
        }

        res.json({
            success: true,
            data: faq
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching FAQ',
            error: error.message
        });
    }
});

/**
 * PUT /api/faqs/:id
 * Update FAQ
 */
app.put('/api/faqs/:id', async (req, res) => {
    try {
        const { question, answer, category } = req.body;

        const faq = await FAQ.findByIdAndUpdate(
            req.params.id,
            { question, answer, category, updatedAt: Date.now() },
            { new: true }
        );

        res.json({
            success: true,
            message: 'FAQ updated successfully',
            data: faq
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error updating FAQ',
            error: error.message
        });
    }
});

/**
 * DELETE /api/faqs/:id
 * Delete FAQ
 */
app.delete('/api/faqs/:id', async (req, res) => {
    try {
        const faq = await FAQ.findByIdAndDelete(req.params.id);

        if (!faq) {
            return res.status(404).json({
                success: false,
                message: 'FAQ not found'
            });
        }

        res.json({
            success: true,
            message: 'FAQ deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error deleting FAQ',
            error: error.message
        });
    }
});

// ===========================
// Career Application Routes
// ===========================

/**
 * POST /api/career/apply
 * Submit career application with resume (uploads to Cloudinary)
 */
app.post('/api/career/apply', upload.single('resume'), async (req, res) => {
    try {
        const {
            fullName,
            email,
            phone,
            position,
            experience,
            currentSalary,
            location,
            qualification,
            coverLetter
        } = req.body;

        // Validate required fields
        if (!fullName || !email || !phone || !position || !experience || !location || !qualification) {
            return res.status(400).json({
                success: false,
                message: 'Please fill all required fields'
            });
        }

        // Validate resume file
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Please upload your resume'
            });
        }

        // Upload resume to Cloudinary (signed upload with API credentials)
        const fileExt = req.file.originalname.split('.').pop().toLowerCase();
        const publicId = `resume_${Date.now()}_${fullName.replace(/\s+/g, '_')}.${fileExt}`;
        const cloudinaryResult = await uploadToCloudinary(req.file.buffer, {
            folder: 'resumes',
            resource_type: 'raw',
            public_id: publicId
        });

        // Create career application with Cloudinary URL
        const careerApplication = new CareerApplication({
            fullName,
            email,
            phone,
            position,
            experience,
            currentSalary: currentSalary ? parseFloat(currentSalary) : null,
            location,
            qualification,
            resumeFileName: req.file.originalname,
            resumeUrl: cloudinaryResult.secure_url,
            resumePublicId: cloudinaryResult.public_id,
            coverLetter: coverLetter || ''
        });

        await careerApplication.save();

        res.status(201).json({
            success: true,
            message: 'Application submitted successfully',
            applicationId: careerApplication._id
        });

    } catch (error) {
        console.error('Career application error:', error);
        res.status(500).json({
            success: false,
            message: 'Error submitting application',
            error: error.message
        });
    }
});

/**
 * GET /api/career/applications
 * Get all career applications (Admin)
 */
app.get('/api/career/applications', async (req, res) => {
    try {
        const { status, position, search } = req.query;
        let filter = {};

        if (status) filter.status = status;
        if (position) filter.position = position;
        if (search) {
            filter.$or = [
                { fullName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } }
            ];
        }

        const applications = await CareerApplication.find(filter)
            .select('-resumeData') // Exclude large base64 data for listing
            .sort({ appliedAt: -1 });

        res.json({
            success: true,
            count: applications.length,
            applications
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching applications',
            error: error.message
        });
    }
});

/**
 * GET /api/career/applications/:id
 * Get single career application with resume (Admin)
 */
app.get('/api/career/applications/:id', async (req, res) => {
    try {
        const application = await CareerApplication.findById(req.params.id);

        if (!application) {
            return res.status(404).json({
                success: false,
                message: 'Application not found'
            });
        }

        res.json({
            success: true,
            application
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching application',
            error: error.message
        });
    }
});

/**
 * GET /api/career/applications/:id/resume
 * Redirect to resume file on Cloudinary
 */
app.get('/api/career/applications/:id/resume', async (req, res) => {
    try {
        const application = await CareerApplication.findById(req.params.id);

        if (!application) {
            return res.status(404).json({
                success: false,
                message: 'Application not found'
            });
        }

        // Check if resume URL exists
        if (!application.resumeUrl) {
            return res.status(404).json({
                success: false,
                message: 'Resume not found for this application'
            });
        }

        // Redirect to the Cloudinary URL
        res.redirect(application.resumeUrl);

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error accessing resume',
            error: error.message
        });
    }
});

/**
 * PUT /api/career/applications/:id
 * Update career application status (Admin)
 */
app.put('/api/career/applications/:id', async (req, res) => {
    try {
        const { status, notes } = req.body;

        const application = await CareerApplication.findByIdAndUpdate(
            req.params.id,
            { status, notes, updatedAt: new Date() },
            { new: true }
        );

        if (!application) {
            return res.status(404).json({
                success: false,
                message: 'Application not found'
            });
        }

        res.json({
            success: true,
            message: 'Application updated successfully',
            application
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error updating application',
            error: error.message
        });
    }
});

/**
 * DELETE /api/career/applications/:id
 * Delete career application and resume from Cloudinary (Admin)
 */
app.delete('/api/career/applications/:id', async (req, res) => {
    try {
        const application = await CareerApplication.findById(req.params.id);

        if (!application) {
            return res.status(404).json({
                success: false,
                message: 'Application not found'
            });
        }

        // Delete resume from Cloudinary
        if (application.resumePublicId) {
            try {
                await cloudinary.uploader.destroy(application.resumePublicId, { resource_type: 'raw' });
            } catch (cloudinaryError) {
                console.error('Error deleting from Cloudinary:', cloudinaryError);
                // Continue with deletion even if Cloudinary delete fails
            }
        }

        // Delete from database
        await CareerApplication.findByIdAndDelete(req.params.id);

        res.json({
            success: true,
            message: 'Application deleted successfully'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error deleting application',
            error: error.message
        });
    }
});

/**
 * GET /api/career/stats
 * Get career applications statistics (Admin)
 */
app.get('/api/career/stats', async (req, res) => {
    try {
        const total = await CareerApplication.countDocuments();
        const newCount = await CareerApplication.countDocuments({ status: 'new' });
        const reviewedCount = await CareerApplication.countDocuments({ status: 'reviewed' });
        const shortlistedCount = await CareerApplication.countDocuments({ status: 'shortlisted' });
        const interviewCount = await CareerApplication.countDocuments({ status: 'interview-scheduled' });
        const selectedCount = await CareerApplication.countDocuments({ status: 'selected' });
        const rejectedCount = await CareerApplication.countDocuments({ status: 'rejected' });

        // Get applications by position
        const byPosition = await CareerApplication.aggregate([
            { $group: { _id: '$position', count: { $sum: 1 } } }
        ]);

        res.json({
            success: true,
            stats: {
                total,
                new: newCount,
                reviewed: reviewedCount,
                shortlisted: shortlistedCount,
                interviewScheduled: interviewCount,
                selected: selectedCount,
                rejected: rejectedCount,
                byPosition
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching stats',
            error: error.message
        });
    }
});

// ===========================
// Admin Authentication Routes
// ===========================

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, message: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ success: false, message: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
};

// Middleware to check if user is Super Admin
const isSuperAdmin = (req, res, next) => {
    if (req.user.role !== 'super-admin') {
        return res.status(403).json({ success: false, message: 'Access denied. Super Admin only.' });
    }
    next();
};

// Initialize Super Admin (run once)
app.post('/api/admin/init-super-admin', async (req, res) => {
    try {
        // Check if super admin already exists
        const existingSuperAdmin = await AdminUser.findOne({ role: 'super-admin' });
        if (existingSuperAdmin) {
            return res.status(400).json({
                success: false,
                message: 'Super Admin already exists'
            });
        }

        // Create default super admin
        const superAdmin = new AdminUser({
            fullName: 'Super Admin',
            email: 'superadmin@devkripafincrop.com',
            password: 'SuperAdmin@123',
            phone: '9584633647',
            role: 'super-admin',
            status: 'active'
        });

        await superAdmin.save();

        res.status(201).json({
            success: true,
            message: 'Super Admin created successfully',
            credentials: {
                email: 'superadmin@devkripafincrop.com',
                password: 'SuperAdmin@123'
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error creating super admin',
            error: error.message
        });
    }
});

// Admin Registration (Signup)
app.post('/api/admin/register', async (req, res) => {
    try {
        const { fullName, email, password, phone } = req.body;

        // Validation
        if (!fullName || !email || !password || !phone) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        // Check if email already exists
        const existingUser = await AdminUser.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Email already registered'
            });
        }

        // Validate password strength
        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters'
            });
        }

        // Create new admin user (pending approval)
        const newAdmin = new AdminUser({
            fullName,
            email: email.toLowerCase(),
            password,
            phone,
            role: 'admin',
            status: 'pending'
        });

        await newAdmin.save();

        res.status(201).json({
            success: true,
            message: 'Registration successful. Please wait for Super Admin approval.',
            data: {
                id: newAdmin._id,
                fullName: newAdmin.fullName,
                email: newAdmin.email,
                status: newAdmin.status
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error during registration',
            error: error.message
        });
    }
});

// Admin Login
app.post('/api/admin/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validation
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        // Find user by email
        const user = await AdminUser.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Check password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Check if user is approved
        if (user.status === 'pending') {
            return res.status(403).json({
                success: false,
                message: 'Your account is pending approval. Please wait for Super Admin to approve.'
            });
        }

        // Check if user is inactive
        if (user.status === 'inactive') {
            return res.status(403).json({
                success: false,
                message: 'Your account has been deactivated. Please contact Super Admin.'
            });
        }

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        // Generate JWT token
        const token = jwt.sign(
            { 
                id: user._id, 
                email: user.email, 
                role: user.role,
                fullName: user.fullName 
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                id: user._id,
                fullName: user.fullName,
                email: user.email,
                role: user.role,
                status: user.status
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error during login',
            error: error.message
        });
    }
});

// Verify Token / Get Current User
app.get('/api/admin/me', authenticateToken, async (req, res) => {
    try {
        const user = await AdminUser.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            user: {
                id: user._id,
                fullName: user.fullName,
                email: user.email,
                role: user.role,
                status: user.status,
                lastLogin: user.lastLogin
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching user',
            error: error.message
        });
    }
});

// Get All Admin Users (Super Admin only)
app.get('/api/admin/users', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const users = await AdminUser.find()
            .select('-password')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            data: users
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching users',
            error: error.message
        });
    }
});

// Get Pending Approval Users (Super Admin only)
app.get('/api/admin/users/pending', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const pendingUsers = await AdminUser.find({ status: 'pending' })
            .select('-password')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            data: pendingUsers,
            count: pendingUsers.length
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching pending users',
            error: error.message
        });
    }
});

// Approve User (Super Admin only)
app.put('/api/admin/users/:id/approve', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const user = await AdminUser.findById(req.params.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        user.status = 'active';
        user.approvedBy = req.user.id;
        user.approvedAt = new Date();
        await user.save();

        res.json({
            success: true,
            message: 'User approved successfully',
            data: {
                id: user._id,
                fullName: user.fullName,
                email: user.email,
                status: user.status
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error approving user',
            error: error.message
        });
    }
});

// Reject/Delete Pending User (Super Admin only)
app.delete('/api/admin/users/:id/reject', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const user = await AdminUser.findById(req.params.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        if (user.role === 'super-admin') {
            return res.status(403).json({
                success: false,
                message: 'Cannot delete Super Admin'
            });
        }

        await AdminUser.findByIdAndDelete(req.params.id);

        res.json({
            success: true,
            message: 'User rejected and deleted successfully'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error rejecting user',
            error: error.message
        });
    }
});

// Activate/Deactivate User (Super Admin only)
app.put('/api/admin/users/:id/status', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        
        if (!['active', 'inactive'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status. Use "active" or "inactive"'
            });
        }

        const user = await AdminUser.findById(req.params.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        if (user.role === 'super-admin') {
            return res.status(403).json({
                success: false,
                message: 'Cannot change Super Admin status'
            });
        }

        user.status = status;
        await user.save();

        res.json({
            success: true,
            message: `User ${status === 'active' ? 'activated' : 'deactivated'} successfully`,
            data: {
                id: user._id,
                fullName: user.fullName,
                email: user.email,
                status: user.status
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error updating user status',
            error: error.message
        });
    }
});

// Delete User (Super Admin only)
app.delete('/api/admin/users/:id', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const user = await AdminUser.findById(req.params.id);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Prevent deleting super admin
        if (user.role === 'super-admin') {
            return res.status(403).json({
                success: false,
                message: 'Cannot delete Super Admin account'
            });
        }

        await AdminUser.findByIdAndDelete(req.params.id);

        res.json({
            success: true,
            message: 'User deleted successfully'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error deleting user',
            error: error.message
        });
    }
});

// Update User Role (Super Admin only)
app.put('/api/admin/users/:id/role', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { role } = req.body;
        
        if (!['admin', 'super-admin'].includes(role)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid role'
            });
        }

        const user = await AdminUser.findById(req.params.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Prevent removing last super admin
        if (user.role === 'super-admin' && role === 'admin') {
            const superAdminCount = await AdminUser.countDocuments({ role: 'super-admin' });
            if (superAdminCount <= 1) {
                return res.status(403).json({
                    success: false,
                    message: 'Cannot demote the only Super Admin'
                });
            }
        }

        user.role = role;
        await user.save();

        res.json({
            success: true,
            message: 'User role updated successfully',
            data: {
                id: user._id,
                fullName: user.fullName,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error updating user role',
            error: error.message
        });
    }
});

// Admin User Stats (Super Admin only)
app.get('/api/admin/users/stats', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const total = await AdminUser.countDocuments();
        const active = await AdminUser.countDocuments({ status: 'active' });
        const pending = await AdminUser.countDocuments({ status: 'pending' });
        const inactive = await AdminUser.countDocuments({ status: 'inactive' });
        const superAdmins = await AdminUser.countDocuments({ role: 'super-admin' });
        const admins = await AdminUser.countDocuments({ role: 'admin' });

        res.json({
            success: true,
            stats: {
                total,
                active,
                pending,
                inactive,
                superAdmins,
                admins
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching stats',
            error: error.message
        });
    }
});

// ===========================
// Error Handling
// ===========================
app.use((err, req, res, next) => {
    console.error('Server Error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// ===========================
// Start Server
// ===========================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║  🏦 Dev Kripa Fincrop Server Running  ║
║  📍 http://localhost:${PORT}             ║
║  🗄️  MongoDB: ${mongoUri}     ║
╚════════════════════════════════════════╝
    `);
});

module.exports = app;
