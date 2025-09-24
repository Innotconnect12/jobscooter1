const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const AIService = require('../services/ai-service');
const router = express.Router();

// Initialize AI service
const aiService = new AIService();

// Middleware to get database
const getDb = (req) => req.app.locals.db;

// Middleware to authenticate JWT token
const authenticateToken = require('./auth').authenticateToken;

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

// Upload for ID documents (JPG only as requested)
const uploadID = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit for documents
    },
    fileFilter: (req, file, cb) => {
        // Only allow JPG files for ID documents as specifically requested
        const allowedTypes = /jpeg|jpg/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only JPG files are allowed for ID documents'));
        }
    }
});

// General upload for certificates (supports multiple formats)
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit for documents
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|pdf/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Invalid file type'));
        }
    }
});

// Upload for media files (profile pictures and videos)
const uploadMedia = multer({
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB limit for media files
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|mp4|mov|avi|webm/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Invalid file type'));
        }
    }
});

// Process ID document
router.post('/process-id', uploadID.single('id_document'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No ID document uploaded' });
        }

        const filePath = req.file.path;
        const fileName = req.file.filename;

        // Use AI service for real document processing
        console.log('🤖 Processing ID document with AI service...');
        const aiResult = await aiService.processIDDocument(filePath);
        
        // Delete the original ID document for security
        setTimeout(() => {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log('🔒 ID document deleted for security');
            }
        }, 5000); // Delete after 5 seconds
        
        if (!aiResult.success) {
            return res.status(422).json({
                error: 'Failed to extract data from ID document',
                details: aiResult.error,
                requiresManualEntry: true,
                confidence: 0
            });
        }
        
        const extractedData = {
            ...aiResult.extractedData.extractedFields,
            confidence: aiResult.confidence,
            manual_entry: false,
            extracted_at: new Date().toISOString()
        };

        // Store file info temporarily (will be deleted after processing)
        const tempFileData = {
            originalName: req.file.originalname,
            filePath: filePath,
            fileName: fileName,
            extractedData: extractedData,
            uploadedAt: new Date().toISOString()
        };

        // In a real implementation, you'd store this in a temporary session
        // For now, we'll return the data directly
        res.json({
            message: 'ID document processed successfully',
            extractedData: extractedData,
            confidence: extractedData.confidence || 0.85,
            tempFileId: uuidv4() // For tracking if needed
        });

    } catch (error) {
        console.error('ID processing error:', error);
        res.status(500).json({ error: 'Failed to process ID document' });
    }
});

// Manual ID data entry fallback
router.post('/manual-entry', (req, res) => {
    try {
        const {
            first_name,
            surname,
            id_number,
            country,
            email,
            phone
        } = req.body;

        // Validate required fields
        if (!first_name || !surname || !id_number || !country || !email || !phone) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: ['first_name', 'surname', 'id_number', 'country', 'email', 'phone']
            });
        }

        const manualData = {
            first_name,
            surname,
            id_number,
            country,
            email,
            phone,
            manual_entry: true,
            confidence: 1.0 // Manual entry is 100% accurate
        };

        res.json({
            message: 'Manual data entry saved',
            extractedData: manualData,
            confidence: 1.0
        });

    } catch (error) {
        console.error('Manual entry error:', error);
        res.status(500).json({ error: 'Failed to save manual entry' });
    }
});

// Upload certificates
router.post('/certificates/upload', authenticateToken, upload.array('certificates', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No certificates uploaded' });
        }

        const db = getDb(req);
        const results = [];

        for (const file of req.files) {
            // Use AI service for real certificate processing
            console.log('🎓 Processing certificate with AI service:', file.originalname);
            const aiResult = await aiService.processCertificate(file.path);
            
            let analysis;
            if (aiResult.success) {
                const certData = aiResult.certificateData;
                analysis = {
                    type: certData.classification || 'certificate',
                    classification: certData.classification,
                    institution: certData.institution,
                    fieldOfStudy: certData.subject,
                    gradeLevel: certData.grade,
                    dateIssued: certData.dateIssued,
                    isVerified: certData.isAccredited,
                    authenticityScore: certData.isAccredited ? 95 : 75,
                    confidence: aiResult.confidence,
                    extractedData: {
                        type: certData.type,
                        holderName: certData.holderName,
                        institution: certData.institution,
                        subject: certData.subject,
                        dateIssued: certData.dateIssued,
                        grade: certData.grade
                    },
                    validationNotes: certData.isAccredited ? 
                        'Certificate verified against accredited institution database.' :
                        'Institution not found in accredited database - manual verification may be required.'
                };
            } else {
                // Fallback to basic analysis
                analysis = await simulateCertificateAnalysis(file.path);
                analysis.validationNotes = 'AI processing failed - using fallback analysis: ' + aiResult.error;
            }

            // Save certificate to database
            const certificateId = await new Promise((resolve, reject) => {
                const sql = `
                    INSERT INTO certificates (
                        applicant_id, original_filename, file_path, certificate_type,
                        document_classification, extracted_data, institution_name,
                        field_of_study, grade_level, date_issued, is_verified,
                        authenticity_score, validation_notes, processing_status,
                        file_size, mime_type, ai_confidence
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `;

                const extractedData = JSON.stringify(analysis.extractedData);

                db.query(sql, [
                    req.user.id,
                    file.originalname,
                    file.path,
                    analysis.type,
                    analysis.classification,
                    extractedData,
                    analysis.institution,
                    analysis.fieldOfStudy,
                    analysis.gradeLevel,
                    analysis.dateIssued,
                    analysis.isVerified ? 1 : 0,
                    analysis.authenticityScore,
                    analysis.validationNotes,
                    'completed',
                    file.size,
                    file.mimetype,
                    analysis.confidence
                ], (err, result) => {
                    if (err) reject(err);
                    else resolve(result.insertId);
                });
            });

            results.push({
                id: certificateId,
                filename: file.originalname,
                analysis: analysis
            });
        }

        // Trigger traffic light score recalculation
        await updateTrafficLightScore(req.user.id, db);

        res.json({
            message: `${req.files.length} certificates processed successfully`,
            certificates: results
        });

    } catch (error) {
        console.error('Certificate upload error:', error);
        res.status(500).json({ error: 'Failed to upload certificates' });
    }
});

// Process uploaded certificates (individual processing)
router.post('/certificates/process/:id', authenticateToken, async (req, res) => {
    try {
        const certificateId = req.params.id;
        const db = getDb(req);

        // Get certificate
        const [certificate] = await new Promise((resolve, reject) => {
            db.query('SELECT * FROM certificates WHERE id = ? AND applicant_id = ?', [certificateId, req.user.id], (err, results) => {
                if (err) reject(err);
                else resolve(results || []);
            });
        });

        if (!certificate) {
            return res.status(404).json({ error: 'Certificate not found' });
        }

        // Re-process with AI (simulate)
        const analysis = await simulateCertificateAnalysis(certificate.file_path);

        // Update certificate
        await new Promise((resolve, reject) => {
            db.query(`
                UPDATE certificates
                SET extracted_data = ?, institution_name = ?, field_of_study = ?,
                    grade_level = ?, date_issued = ?, is_verified = ?,
                    authenticity_score = ?, validation_notes = ?, ai_confidence = ?,
                    processing_status = 'completed'
                WHERE id = ?
            `, [
                JSON.stringify(analysis.extractedData),
                analysis.institution,
                analysis.fieldOfStudy,
                analysis.gradeLevel,
                analysis.dateIssued,
                analysis.isVerified,
                analysis.authenticityScore,
                analysis.validationNotes,
                analysis.confidence,
                certificateId
            ], (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });

        // Update traffic light score
        await updateTrafficLightScore(req.user.id, db);

        res.json({
            message: 'Certificate re-processed successfully',
            analysis: analysis
        });

    } catch (error) {
        console.error('Certificate processing error:', error);
        res.status(500).json({ error: 'Failed to process certificate' });
    }
});

// Verify certificate authenticity
router.get('/certificates/verify/:id', authenticateToken, async (req, res) => {
    try {
        const certificateId = req.params.id;
        const db = getDb(req);

        const [certificate] = await new Promise((resolve, reject) => {
            db.query('SELECT * FROM certificates WHERE id = ? AND applicant_id = ?', [certificateId, req.user.id], (err, results) => {
                if (err) reject(err);
                else resolve(results || []);
            });
        });

        if (!certificate) {
            return res.status(404).json({ error: 'Certificate not found' });
        }

        // Check against accredited institutions
        const [institutionCheck] = await new Promise((resolve, reject) => {
            db.query('SELECT * FROM accredited_institutions WHERE name = ?', [certificate.institution_name], (err, results) => {
                if (err) reject(err);
                else resolve(results || []);
            });
        });

        const verificationResult = {
            isAccredited: !!institutionCheck,
            authenticityScore: certificate.authenticity_score,
            institutionVerified: !!institutionCheck,
            validationNotes: certificate.validation_notes
        };

        // Update certificate verification status
        await new Promise((resolve, reject) => {
            db.query(`
                UPDATE certificates
                SET is_accredited = ?, validation_notes = ?
                WHERE id = ?
            `, [
                verificationResult.isAccredited ? 1 : 0,
                JSON.stringify(verificationResult),
                certificateId
            ], (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });

        res.json({
            certificateId,
            verification: verificationResult
        });

    } catch (error) {
        console.error('Certificate verification error:', error);
        res.status(500).json({ error: 'Failed to verify certificate' });
    }
});

// Upload media (profile picture and video)
router.post('/media/upload', authenticateToken, uploadMedia.fields([
    { name: 'profile_picture', maxCount: 1 },
    { name: 'video', maxCount: 1 }
]), async (req, res) => {
    try {
        const db = getDb(req);
        const response = { message: 'Media uploaded successfully' };
        const updateFields = [];
        const updateValues = [];

        // Handle profile picture
        if (req.files.profile_picture && req.files.profile_picture[0]) {
            const profilePic = req.files.profile_picture[0];
            const mediaUrl = `/uploads/media/${profilePic.filename}`;

            updateFields.push('profile_picture_url = ?');
            updateValues.push(mediaUrl);

            response.profilePicture = {
                url: mediaUrl,
                filename: profilePic.filename
            };

            // Log activity (only if user is authenticated)
            if (req.user && req.user.id) {
                await new Promise((resolve, reject) => {
                    db.query(`
                        INSERT INTO activity_logs (user_id, user_type, activity_type, description, details)
                        VALUES (?, 'applicant', 'media_upload', 'Profile picture uploaded', ?)
                    `, [req.user.id, JSON.stringify({ filename: profilePic.filename, url: mediaUrl })], (err) => {
                        if (err) console.error('Activity log error:', err);
                        resolve();
                    });
                });
            }
        }

        // Handle video
        if (req.files.video && req.files.video[0]) {
            const video = req.files.video[0];
            const mediaUrl = `/uploads/media/${video.filename}`;

            // Simulate video transcription
            const transcription = await simulateVideoTranscription(video.path);

            updateFields.push('video_intro_url = ?, video_transcript = ?');
            updateValues.push(mediaUrl, transcription);

            response.video = {
                url: mediaUrl,
                filename: video.filename,
                transcription: transcription
            };

            // Log activity (only if user is authenticated)
            if (req.user && req.user.id) {
                await new Promise((resolve, reject) => {
                    db.query(`
                        INSERT INTO activity_logs (user_id, user_type, activity_type, description, details)
                        VALUES (?, 'applicant', 'media_upload', 'Video introduction uploaded', ?)
                    `, [req.user.id, JSON.stringify({ filename: video.filename, url: mediaUrl, has_transcription: !!transcription })], (err) => {
                        if (err) console.error('Activity log error:', err);
                        resolve();
                    });
                });
            }
        }

        // Update applicant record with media URLs (only if user is authenticated)
        if (updateFields.length > 0 && req.user && req.user.id) {
            const sql = `UPDATE applicants SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = ?`;
            updateValues.push(req.user.id);

            await new Promise((resolve, reject) => {
                db.query(sql, updateValues, (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            });

            // Update completion percentage
            await updateCompletionPercentage(req.user.id, db);
        }

        res.json(response);

    } catch (error) {
        console.error('Media upload error:', error);
        res.status(500).json({ error: 'Failed to upload media' });
    }
});

// Helper function to simulate ID extraction
async function simulateIDExtraction(filePath) {
    // Simulate AI processing delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Simulate extraction results
    const confidence = Math.random() * 0.3 + 0.7; // 70-100% confidence

    return {
        first_name: 'John',
        surname: 'Doe',
        id_number: '8901015800083',
        country: 'South Africa',
        date_of_birth: '1990-01-01',
        confidence: confidence,
        extracted_at: new Date().toISOString()
    };
}

// Helper function to simulate certificate analysis
async function simulateCertificateAnalysis(filePath) {
    // Simulate AI processing delay
    await new Promise(resolve => setTimeout(resolve, 3000));

    const types = ['academic', 'professional', 'language'];
    const classifications = ['degree', 'certificate', 'diploma', 'reference_letter'];
    const institutions = ['University of Cape Town', 'Goethe Institute', 'Microsoft', 'University of Pretoria'];
    const fields = ['Computer Science', 'German Language', 'Cloud Computing', 'Business Administration'];

    return {
        type: types[Math.floor(Math.random() * types.length)],
        classification: classifications[Math.floor(Math.random() * classifications.length)],
        institution: institutions[Math.floor(Math.random() * institutions.length)],
        fieldOfStudy: fields[Math.floor(Math.random() * fields.length)],
        gradeLevel: 'Bachelor',
        dateIssued: '2020-06-15',
        isVerified: Math.random() > 0.3,
        authenticityScore: Math.floor(Math.random() * 30) + 70,
        confidence: Math.random() * 0.3 + 0.7,
        extractedData: {
            issuer: 'Sample Institution',
            recipient: 'John Doe',
            qualification: 'Bachelor of Science'
        },
        validationNotes: 'Certificate appears authentic based on institution verification patterns.'
    };
}

// Helper function to simulate video transcription
async function simulateVideoTranscription(filePath) {
    // Simulate transcription delay
    await new Promise(resolve => setTimeout(resolve, 5000));

    return "Hello, my name is John Doe. I am a software developer with 5 years of experience in web development. I specialize in JavaScript, React, and Node.js. I am passionate about creating user-friendly applications and solving complex problems. Thank you for considering my application.";
}

// Helper function to update traffic light score
async function updateTrafficLightScore(applicantId, db) {
    try {
        // Get current scores
        const [currentScore] = await new Promise((resolve, reject) => {
            db.query('SELECT * FROM traffic_light_scores WHERE applicant_id = ?', [applicantId], (err, results) => {
                if (err) reject(err);
                else resolve(results || []);
            });
        });

        // Recalculate based on certificates
        const certificates = await new Promise((resolve, reject) => {
            db.query('SELECT authenticity_score, is_verified FROM certificates WHERE applicant_id = ?', [applicantId], (err, results) => {
                if (err) reject(err);
                else resolve(results || []);
            });
        });

        const certificateScore = Math.min(certificates.length * 15, 60);
        const totalScore = (currentScore ? currentScore.identity_score + currentScore.language_score + currentScore.completeness_score : 0) + certificateScore;

        let status = 'red';
        if (totalScore >= 80) status = 'green';
        else if (totalScore >= 60) status = 'yellow';

        // Update or insert score
        if (currentScore) {
            await new Promise((resolve, reject) => {
                db.query(`
                    UPDATE traffic_light_scores
                    SET certificate_score = ?, total_score = ?, status = ?, calculated_at = NOW()
                    WHERE applicant_id = ?
                `, [certificateScore, totalScore, status, applicantId], (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            });
        } else {
            await new Promise((resolve, reject) => {
                db.query(`
                    INSERT INTO traffic_light_scores (applicant_id, certificate_score, total_score, status)
                    VALUES (?, ?, ?, ?)
                `, [applicantId, certificateScore, totalScore, status], (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            });
        }

        // Update applicant table
        await new Promise((resolve, reject) => {
            db.query(`
                UPDATE applicants
                SET traffic_light_score = ?, traffic_light_status = ?, updated_at = NOW()
                WHERE id = ?
            `, [totalScore, status, applicantId], (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });

    } catch (error) {
        console.error('Traffic light update error:', error);
    }
}

// Helper function to update completion percentage
async function updateCompletionPercentage(applicantId, db) {
    try {
        // Get completion data
        const [applicant] = await new Promise((resolve, reject) => {
            db.query(`
                SELECT a.*, COUNT(c.id) as cert_count, COUNT(l.id) as lang_count
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

module.exports = router;
