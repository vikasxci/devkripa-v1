require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();

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

// Serve static files from public folder
app.use(express.static(path.join(__dirname, '../public')));

// ===========================
// Database Connection
// ===========================
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/devkripafincrop';

console.log('📍 Attempting to connect to MongoDB...');
console.log('🔗 URI:', mongoUri);

mongoose.connect(mongoUri)
    .then(() => {
        console.log('✅ MongoDB Connected Successfully');
    })
    .catch((err) => {
        console.error('❌ MongoDB Connection Error:', err.message);
        console.log('⚠️  Make sure your MongoDB Atlas connection string is correct');
        console.log('📝 Update MONGODB_URI in .env file with your cluster connection string');
    });

// ===========================
// Models
// ===========================
const LoanApplication = require('./models/LoanApplication');

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

// Home route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Application form page
app.get('/apply', (req, res) => {
    res.sendFile(path.join(__dirname, 'apply.html'));
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
                currentWorkExperience: currentWorkExperience ? parseInt(currentWorkExperience) : null,
                totalWorkExperience: totalWorkExperience ? parseInt(totalWorkExperience) : null,
                // Business loan specific
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
