const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const AIService = require('../services/ai-service');
const AccountService = require('../services/account-service');
const router = express.Router();

// Initialize services
const aiService = new AIService();
const accountService = new AccountService();

// Middleware to get database
const getDb = (req) => req.app.locals.db;

// Import authentication middleware
const jwt = require('jsonwebtoken');

// Middleware to authenticate JWT token (optional for some routes)
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'jobscooter_development_secret_key_2024', (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
};

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let uploadPath = './public/uploads/';
        
        if (file.fieldname === 'id_document') {
            uploadPath += 'ids/';
        } else if (file.fieldname === 'certificate') {
            uploadPath += 'certificates/';
        } else if (file.fieldname.includes('media') || file.fieldname === 'profile_picture' || file.fieldname === 'video') {
            uploadPath += 'media/';
        }

        // Ensure directory exists
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }

        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        // For ID documents, only allow JPG files as specifically requested
        if (file.fieldname === 'id_document') {
            const allowedTypes = /jpeg|jpg/;
            const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
            const mimetype = allowedTypes.test(file.mimetype);

            if (mimetype && extname) {
                return cb(null, true);
            } else {
                cb(new Error('Invalid file type for ID document. Only JPG files are allowed.'));
            }
        } else {
            // For other documents (certificates), allow PDF and images
            const allowedTypes = /jpeg|jpg|png|pdf/;
            const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
            const mimetype = allowedTypes.test(file.mimetype);

            if (mimetype && extname) {
                return cb(null, true);
            } else {
                cb(new Error('Invalid file type. Only JPEG, JPG, PNG, and PDF files are allowed.'));
            }
        }
    }
});

// Step 1: Process ID Document and Create Account
router.post('/step1/process-id', upload.single('id_document'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                error: 'No ID document uploaded',
                step: 1,
                requiresManualEntry: true 
            });
        }

        console.log('🔄 Starting Step 1: ID Processing and Account Creation...');
        const filePath = req.file.path;
        const db = getDb(req);

        // Process ID document with AI
        console.log('🤖 Processing ID document with AI...');
        const aiResult = await aiService.processIDDocument(filePath);
        
        // Clean up ID file immediately for security
        setTimeout(() => {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log('🔒 ID document deleted for security');
            }
        }, 2000);

        if (!aiResult.success) {
            console.log('❌ AI processing failed, requiring manual entry');
            return res.status(422).json({
                error: 'Failed to extract data from ID document',
                details: aiResult.error,
                requiresManualEntry: true,
                step: 1,
                confidence: 0
            });
        }

        // Prepare extracted data for account creation
        const extractedFields = aiResult.extractedData.extractedFields;
        
        // Return extracted data for user confirmation before account creation
        res.json({
            success: true,
            step: 1,
            phase: 'data_extracted',
            extractedData: {
                first_name: extractedFields.firstName || extractedFields.names || '',
                surname: extractedFields.surname || '',
                id_number: extractedFields.idNumber || '',
                country: extractedFields.country || 'REPUBLIC OF NAMIBIA',
                date_of_birth: extractedFields.dateOfBirth || '',
                gender: '', // Gender must be manually selected
                age: extractedFields.age || '',
                confidence: aiResult.confidence,
                manual_entry: false
            },
            genderRequired: true, // Signal frontend to show gender selection
            message: 'ID data extracted successfully from Namibian ID. Please review the information and select your gender.',
            nextAction: 'confirm_and_complete'
        });

    } catch (error) {
        console.error('Step 1 processing error:', error);
        res.status(500).json({ 
            error: 'Failed to process ID document',
            details: error.message,
            step: 1,
            requiresManualEntry: true 
        });
    }
});

// Step 1: Confirm extracted data and complete account creation
router.post('/step1/confirm-and-create-account', async (req, res) => {
    try {
        const {
            first_name,
            surname,
            email,
            phone,
            country,
            id_number,
            date_of_birth,
            gender,
            confidence,
            manual_entry = false
        } = req.body;

        console.log('👤 Creating account with confirmed data...');
        console.log('📥 Received request body:', req.body);
        console.log('🔍 Individual field values:');
        console.log('  first_name:', first_name);
        console.log('  surname:', surname);
        console.log('  email:', email);
        console.log('  phone:', phone);
        console.log('  id_number:', id_number);
        console.log('  gender:', gender);
        console.log('  country:', country);

        // Validate required fields
        if (!first_name || !surname || !email || !phone || !id_number || !gender) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: ['first_name', 'surname', 'email', 'phone', 'id_number', 'gender'],
                step: 1
            });
        }

        const db = getDb(req);

        // Create account using account service
        const accountResult = await accountService.createAccount({
            first_name,
            surname,
            email,
            phone,
            country: country || 'South Africa',
            id_number,
            date_of_birth,
            gender,
            confidence: confidence || 0.8,
            manual_entry
        }, db);

        if (!accountResult.success) {
            return res.status(400).json({
                error: accountResult.error || 'Failed to create account',
                step: 1
            });
        }

        // Generate login token
        const token = accountService.generateJWTToken(accountResult.user);

        console.log('✅ Account created successfully:', accountResult.user.username);

        res.status(201).json({
            success: true,
            step: 1,
            phase: 'account_created',
            message: 'Account created successfully! Please check your email for login credentials.',
            user: {
                ...accountResult.user,
                token
            },
            credentials: accountResult.credentials,
            emailSent: accountResult.emailSent,
            nextStep: {
                step: 2,
                action: 'language_selection',
                url: '/api/application/step2/languages'
            }
        });

    } catch (error) {
        console.error('Account creation error:', error);
        res.status(500).json({ 
            error: error.message || 'Failed to create account',
            step: 1 
        });
    }
});

// Step 1: Manual ID entry fallback
router.post('/step1/manual-entry', async (req, res) => {
    try {
        const {
            first_name,
            surname,
            email,
            phone,
            country,
            id_number,
            date_of_birth,
            gender
        } = req.body;

        console.log('✋ Processing manual ID entry...');

        // Validate required fields
        if (!first_name || !surname || !email || !phone || !id_number || !country) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: ['first_name', 'surname', 'email', 'phone', 'id_number', 'country'],
                step: 1
            });
        }

        const db = getDb(req);

        // Create account with manual entry
        const accountResult = await accountService.createAccount({
            first_name,
            surname,
            email,
            phone,
            country,
            id_number,
            date_of_birth,
            gender,
            confidence: 1.0, // Manual entry is 100% accurate
            manual_entry: true
        }, db);

        if (!accountResult.success) {
            return res.status(400).json({
                error: accountResult.error || 'Failed to create account',
                step: 1
            });
        }

        // Generate login token
        const token = accountService.generateJWTToken(accountResult.user);

        console.log('✅ Manual account created successfully:', accountResult.user.username);

        res.status(201).json({
            success: true,
            step: 1,
            phase: 'account_created',
            method: 'manual_entry',
            message: 'Account created successfully with manual entry! Please check your email for login credentials.',
            user: {
                ...accountResult.user,
                token
            },
            credentials: accountResult.credentials,
            emailSent: accountResult.emailSent,
            nextStep: {
                step: 2,
                action: 'language_selection',
                url: '/api/application/step2/languages'
            }
        });

    } catch (error) {
        console.error('Manual entry error:', error);
        res.status(500).json({ 
            error: error.message || 'Failed to create account with manual entry',
            step: 1 
        });
    }
});

// Email verification endpoint
router.get('/verify-email', async (req, res) => {
    try {
        const { token } = req.query;

        if (!token) {
            return res.status(400).json({
                error: 'Verification token is required'
            });
        }

        const db = getDb(req);
        const result = await accountService.verifyEmailToken(token, db);

        if (!result.success) {
            return res.status(400).json({
                error: 'Invalid or expired verification token'
            });
        }

        console.log('✅ Email verified successfully for user:', result.user.email);

        res.json({
            success: true,
            message: 'Email verified successfully! You can now login and continue your application.',
            user: result.user,
            redirectTo: '/login'
        });

    } catch (error) {
        console.error('Email verification error:', error);
        res.status(400).json({
            error: error.message || 'Failed to verify email'
        });
    }
});

// Step 2: Language Selection and Verification
router.post('/step2/languages', authenticateToken, async (req, res) => {
    try {
        const { languages, german_certificate } = req.body;
        const db = getDb(req);
        
        // This endpoint assumes user is authenticated
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                error: 'Authentication required',
                step: 2
            });
        }

        console.log('🌍 Processing language selection for user:', req.user.id);

        // Validate languages
        const validLanguages = ['English', 'German', 'Both'];
        if (!languages || !validLanguages.includes(languages)) {
            return res.status(400).json({
                error: 'Invalid language selection',
                validOptions: validLanguages,
                step: 2
            });
        }

        let germanVerified = false;
        let germanCertificateData = null;

        // If German is selected, verify German certificate
        if (languages === 'German' || languages === 'Both') {
            if (!german_certificate || !german_certificate.filePath) {
                return res.status(400).json({
                    error: 'German certificate is required for German language selection',
                    step: 2
                });
            }

            console.log('🇩🇪 Verifying German certificate...');
            
            // Process German certificate with AI
            const certResult = await aiService.processCertificate(german_certificate.filePath);
            
            if (certResult.success) {
                const germanVerification = await aiService.verifyGermanLanguageCertificate(certResult.certificateData);
                germanVerified = germanVerification.isValid;
                germanCertificateData = {
                    ...certResult.certificateData,
                    verification: germanVerification
                };
            }
        }

        // Save language verification to database
        await new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO language_verifications (applicant_id, language, is_verified, certificate_data, created_at)
                VALUES (?, ?, ?, ?, NOW())
                ON DUPLICATE KEY UPDATE 
                is_verified = VALUES(is_verified), 
                certificate_data = VALUES(certificate_data),
                updated_at = NOW()
            `;
            
            db.query(sql, [
                req.user.id,
                languages,
                germanVerified ? 1 : 0,
                JSON.stringify(germanCertificateData)
            ], (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });

        // Update completion percentage
        await updateCompletionPercentage(req.user.id, db);

        // Update traffic light score
        await updateTrafficLightScore(req.user.id, db);

        console.log('✅ Language verification completed');

        res.json({
            success: true,
            step: 2,
            message: 'Language selection saved successfully',
            data: {
                languages,
                germanVerified,
                germanCertificate: germanCertificateData ? {
                    institution: germanCertificateData.institution,
                    level: germanCertificateData.verification?.level,
                    isValid: germanVerified
                } : null
            },
            nextStep: {
                step: 3,
                action: 'certificate_upload',
                url: '/api/application/step3/certificates'
            }
        });

    } catch (error) {
        console.error('Language selection error:', error);
        res.status(500).json({
            error: error.message || 'Failed to process language selection',
            step: 2
        });
    }
});

// Helper functions (you can move these to a separate utils file if needed)
async function updateCompletionPercentage(applicantId, db) {
    try {
        const [applicant] = await new Promise((resolve, reject) => {
            db.query(`
                SELECT a.*, COUNT(DISTINCT c.id) as cert_count, COUNT(DISTINCT l.id) as lang_count
                FROM applicants a
                LEFT JOIN certificates c ON a.id = c.applicant_id
                LEFT JOIN language_verifications l ON a.id = l.applicant_id AND l.is_verified = 1
                WHERE a.id = ?
                GROUP BY a.id
            `, [applicantId], (err, results) => {
                if (err) reject(err);
                else resolve(results || []);
            });
        });

        let completion = 20; // Base completion from ID verification

        // Add language completion
        if (applicant.lang_count > 0) completion += 20;

        // Add certificate completion
        if (applicant.cert_count > 0) completion += 20;

        // Add media completion
        if (applicant.profile_picture_url) completion += 20;
        if (applicant.video_intro_url) completion += 20;

        completion = Math.min(completion, 100);

        await new Promise((resolve, reject) => {
            db.query(`
                UPDATE applicants
                SET completion_percentage = ?, updated_at = NOW()
                WHERE id = ?
            `, [completion, applicantId], (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });

    } catch (error) {
        console.error('Completion percentage update error:', error);
    }
}

async function updateTrafficLightScore(applicantId, db) {
    try {
        // Get current applicant data
        const [applicant] = await new Promise((resolve, reject) => {
            db.query(`
                SELECT a.*, COUNT(DISTINCT c.id) as cert_count, COUNT(DISTINCT l.id) as lang_count,
                       COUNT(DISTINCT ac.id) as accredited_cert_count
                FROM applicants a
                LEFT JOIN certificates c ON a.id = c.applicant_id
                LEFT JOIN language_verifications l ON a.id = l.applicant_id AND l.is_verified = 1
                LEFT JOIN certificates ac ON a.id = ac.applicant_id AND ac.is_verified = 1
                WHERE a.id = ?
                GROUP BY a.id
            `, [applicantId], (err, results) => {
                if (err) reject(err);
                else resolve(results || []);
            });
        });

        if (!applicant) return;

        // Use AI service to generate traffic light score
        const profileData = {
            idVerified: true,
            certificates: Array(applicant.cert_count).fill({}),
            accreditedCertificatesCount: applicant.accredited_cert_count,
            languagesVerified: applicant.lang_count > 0,
            profilePicture: !!applicant.profile_picture_url,
            videoIntroduction: !!applicant.video_intro_url,
            completionPercentage: applicant.completion_percentage
        };

        const trafficLightResult = aiService.generateTrafficLightScore(profileData);

        // Update traffic light scores table
        await new Promise((resolve, reject) => {
            db.query(`
                UPDATE traffic_light_scores
                SET total_score = ?, status = ?, calculated_at = NOW()
                WHERE applicant_id = ?
            `, [trafficLightResult.score, trafficLightResult.status, applicantId], (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });

        // Update applicant table
        await new Promise((resolve, reject) => {
            db.query(`
                UPDATE applicants
                SET traffic_light_score = ?, traffic_light_status = ?, updated_at = NOW()
                WHERE id = ?
            `, [trafficLightResult.score, trafficLightResult.status, applicantId], (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });

    } catch (error) {
        console.error('Traffic light score update error:', error);
    }
}

module.exports = router;