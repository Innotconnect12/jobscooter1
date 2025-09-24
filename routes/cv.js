const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// Middleware to get database
const getDb = (req) => req.app.locals.db;

// Middleware to authenticate JWT token
const authenticateToken = require('./auth').authenticateToken;

// Generate CV from user data
router.post('/generate', authenticateToken, async (req, res) => {
    try {
        const db = getDb(req);
        const { template = 'professional', format = 'html' } = req.body;

        // Get user data
        const userData = await getUserCompleteProfile(req.user.id, db);
        
        if (!userData) {
            return res.status(404).json({
                success: false,
                error: 'User profile not found'
            });
        }

        // Generate CV content
        const cvContent = await generateCVContent(userData, template);
        
        // Generate unique filename
        const cvId = uuidv4();
        const filename = `cv_${req.user.id}_${cvId}.${format}`;
        const cvPath = path.join('./public/uploads/cvs', filename);

        // Ensure CV directory exists
        const cvDir = path.dirname(cvPath);
        if (!fs.existsSync(cvDir)) {
            fs.mkdirSync(cvDir, { recursive: true });
        }

        let finalContent;
        let mimeType;

        if (format === 'html') {
            finalContent = generateHTMLCV(cvContent, template);
            mimeType = 'text/html';
        } else if (format === 'json') {
            finalContent = JSON.stringify(cvContent, null, 2);
            mimeType = 'application/json';
        } else {
            return res.status(400).json({
                success: false,
                error: 'Unsupported format. Use html or json.'
            });
        }

        // Save CV file
        fs.writeFileSync(cvPath, finalContent, 'utf8');

        // Save CV record to database
        const cvRecord = await new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO generated_cvs (
                    applicant_id, cv_id, template_type, format, file_path, 
                    file_url, generation_data, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            `;

            db.query(sql, [
                req.user.id,
                cvId,
                template,
                format,
                cvPath,
                `/uploads/cvs/${filename}`,
                JSON.stringify(cvContent)
            ], (err, result) => {
                if (err) reject(err);
                else resolve(result.insertId);
            });
        });

        // Update applicant record with latest CV
        await new Promise((resolve, reject) => {
            db.query(
                'UPDATE applicants SET auto_cv_url = ?, updated_at = NOW() WHERE id = ?',
                [`/uploads/cvs/${filename}`, req.user.id],
                (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                }
            );
        });

        // Log activity
        await new Promise((resolve, reject) => {
            db.query(`
                INSERT INTO activity_logs (user_id, user_type, activity_type, description, details)
                VALUES (?, 'applicant', 'cv_generated', 'CV generated successfully', ?)
            `, [req.user.id, JSON.stringify({
                cvId,
                template,
                format,
                filename,
                sections: Object.keys(cvContent).length
            })], (err) => {
                if (err) console.error('Activity log error:', err);
                resolve();
            });
        });

        res.json({
            success: true,
            data: {
                cvId,
                url: `/uploads/cvs/${filename}`,
                filename,
                template,
                format,
                generatedAt: new Date().toISOString(),
                sections: Object.keys(cvContent),
                recordId: cvRecord
            }
        });

    } catch (error) {
        console.error('CV generation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate CV'
        });
    }
});

// Get user's generated CVs
router.get('/list', authenticateToken, async (req, res) => {
    try {
        const db = getDb(req);
        
        const cvs = await new Promise((resolve, reject) => {
            db.query(`
                SELECT cv_id, template_type, format, file_url, created_at, updated_at
                FROM generated_cvs 
                WHERE applicant_id = ?
                ORDER BY created_at DESC
            `, [req.user.id], (err, results) => {
                if (err) reject(err);
                else resolve(results || []);
            });
        });

        res.json({
            success: true,
            data: {
                total: cvs.length,
                cvs: cvs.map(cv => ({
                    id: cv.cv_id,
                    template: cv.template_type,
                    format: cv.format,
                    url: cv.file_url,
                    createdAt: cv.created_at,
                    updatedAt: cv.updated_at
                }))
            }
        });

    } catch (error) {
        console.error('CV list error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve CV list'
        });
    }
});

// Download specific CV
router.get('/download/:cvId', authenticateToken, async (req, res) => {
    try {
        const { cvId } = req.params;
        const db = getDb(req);

        const [cv] = await new Promise((resolve, reject) => {
            db.query(
                'SELECT * FROM generated_cvs WHERE cv_id = ? AND applicant_id = ?',
                [cvId, req.user.id],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results || []);
                }
            );
        });

        if (!cv) {
            return res.status(404).json({
                success: false,
                error: 'CV not found'
            });
        }

        const filePath = cv.file_path;
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                error: 'CV file not found on disk'
            });
        }

        // Set appropriate headers
        const filename = `JobScooter_CV_${cv.template_type}.${cv.format}`;
        const mimeTypes = {
            html: 'text/html',
            json: 'application/json',
            pdf: 'application/pdf'
        };

        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', mimeTypes[cv.format] || 'application/octet-stream');

        // Stream the file
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);

    } catch (error) {
        console.error('CV download error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to download CV'
        });
    }
});

// Get CV templates
router.get('/templates', (req, res) => {
    try {
        const templates = [
            {
                id: 'professional',
                name: 'Professional',
                description: 'Clean, professional layout suitable for corporate environments',
                preview: '/images/templates/professional.png',
                features: ['Clean design', 'ATS-friendly', 'Skills section', 'Experience timeline']
            },
            {
                id: 'creative',
                name: 'Creative',
                description: 'Modern design with visual elements for creative roles',
                preview: '/images/templates/creative.png',
                features: ['Visual design', 'Color accents', 'Portfolio section', 'Social links']
            },
            {
                id: 'academic',
                name: 'Academic',
                description: 'Traditional format for academic and research positions',
                preview: '/images/templates/academic.png',
                features: ['Publications section', 'Research experience', 'Academic format', 'Reference list']
            },
            {
                id: 'technical',
                name: 'Technical',
                description: 'Focused on technical skills and project experience',
                preview: '/images/templates/technical.png',
                features: ['Technical skills', 'Project showcase', 'Code samples', 'GitHub integration']
            }
        ];

        res.json({
            success: true,
            data: templates
        });

    } catch (error) {
        console.error('Templates error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load templates'
        });
    }
});

// Helper function to get complete user profile
async function getUserCompleteProfile(userId, db) {
    try {
        // Get basic user info
        const [user] = await new Promise((resolve, reject) => {
            db.query(`
                SELECT a.*, 
                    COUNT(DISTINCT c.id) as certificate_count,
                    COUNT(DISTINCT lv.id) as language_count
                FROM applicants a
                LEFT JOIN certificates c ON a.id = c.applicant_id
                LEFT JOIN language_verifications lv ON a.id = lv.applicant_id AND lv.is_verified = 1
                WHERE a.id = ?
                GROUP BY a.id
            `, [userId], (err, results) => {
                if (err) reject(err);
                else resolve(results || []);
            });
        });

        if (!user) return null;

        // Get certificates
        const certificates = await new Promise((resolve, reject) => {
            db.query(`
                SELECT certificate_type, document_classification, institution_name,
                    field_of_study, grade_level, date_issued, is_verified, extracted_data
                FROM certificates 
                WHERE applicant_id = ?
                ORDER BY date_issued DESC
            `, [userId], (err, results) => {
                if (err) reject(err);
                else resolve(results || []);
            });
        });

        // Get languages
        const languages = await new Promise((resolve, reject) => {
            db.query(`
                SELECT language, proficiency_level, certificate_type, institution_name,
                    date_verified, is_verified
                FROM language_verifications 
                WHERE applicant_id = ? AND is_verified = 1
                ORDER BY proficiency_level DESC
            `, [userId], (err, results) => {
                if (err) reject(err);
                else resolve(results || []);
            });
        });

        // Get traffic light score
        const [score] = await new Promise((resolve, reject) => {
            db.query(
                'SELECT * FROM traffic_light_scores WHERE applicant_id = ?',
                [userId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results || []);
                }
            );
        });

        return {
            personal: {
                firstName: user.first_name,
                surname: user.surname,
                email: user.email,
                phone: user.phone,
                country: user.country,
                nationality: user.nationality,
                dateOfBirth: user.date_of_birth,
                profilePicture: user.profile_picture_url,
                videoIntro: user.video_intro_url,
                transcript: user.video_transcript
            },
            certificates: certificates.map(cert => ({
                type: cert.certificate_type,
                classification: cert.document_classification,
                institution: cert.institution_name,
                field: cert.field_of_study,
                level: cert.grade_level,
                dateIssued: cert.date_issued,
                verified: cert.is_verified,
                details: cert.extracted_data ? JSON.parse(cert.extracted_data) : null
            })),
            languages: languages.map(lang => ({
                language: lang.language,
                level: lang.proficiency_level,
                certificationType: lang.certificate_type,
                institution: lang.institution_name,
                dateVerified: lang.date_verified,
                verified: lang.is_verified
            })),
            scoring: {
                status: user.traffic_light_status,
                score: user.traffic_light_score,
                completionPercentage: user.completion_percentage,
                details: score || null
            },
            metadata: {
                profileUrl: user.public_profile_url,
                createdAt: user.created_at,
                updatedAt: user.updated_at,
                lastLogin: user.last_login,
                certificateCount: user.certificate_count,
                languageCount: user.language_count
            }
        };

    } catch (error) {
        console.error('Get user profile error:', error);
        return null;
    }
}

// Helper function to generate CV content structure
async function generateCVContent(userData, template) {
    const content = {
        header: {
            name: `${userData.personal.firstName} ${userData.personal.surname}`,
            email: userData.personal.email,
            phone: userData.personal.phone,
            country: userData.personal.country,
            profilePicture: userData.personal.profilePicture
        },
        summary: generateSummary(userData),
        experience: generateExperienceSection(userData),
        education: generateEducationSection(userData),
        skills: generateSkillsSection(userData),
        languages: userData.languages,
        certifications: generateCertificationsSection(userData),
        trafficLightStatus: {
            status: userData.scoring.status,
            score: userData.scoring.score,
            verified: userData.scoring.status === 'green'
        }
    };

    // Add template-specific sections
    if (template === 'academic') {
        content.publications = [];
        content.research = [];
        content.references = 'Available upon request';
    } else if (template === 'creative') {
        content.portfolio = [];
        content.projects = generateProjectsSection(userData);
    } else if (template === 'technical') {
        content.projects = generateProjectsSection(userData);
        content.technicalSkills = generateTechnicalSkillsSection(userData);
    }

    return content;
}

// Helper function to generate HTML CV
function generateHTMLCV(content, template) {
    const baseCSS = `
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2563eb; padding-bottom: 20px; }
            .name { font-size: 2.5em; font-weight: bold; color: #2563eb; margin-bottom: 10px; }
            .contact { font-size: 1.1em; color: #666; }
            .section { margin-bottom: 25px; }
            .section-title { font-size: 1.5em; font-weight: bold; color: #2563eb; margin-bottom: 15px; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
            .item { margin-bottom: 15px; }
            .item-title { font-weight: bold; color: #333; }
            .item-subtitle { color: #666; font-style: italic; }
            .item-date { color: #888; font-size: 0.9em; }
            .traffic-light { display: inline-block; padding: 5px 15px; border-radius: 20px; font-weight: bold; text-transform: uppercase; }
            .traffic-light.green { background-color: #16a34a; color: white; }
            .traffic-light.yellow { background-color: #d97706; color: white; }
            .traffic-light.red { background-color: #dc2626; color: white; }
            .skills { display: flex; flex-wrap: wrap; gap: 10px; }
            .skill { background: #f3f4f6; padding: 5px 12px; border-radius: 15px; font-size: 0.9em; }
        </style>
    `;

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>CV - ${content.header.name}</title>
        ${baseCSS}
    </head>
    <body>
        <div class="header">
            ${content.header.profilePicture ? `
                <div style="text-align: center; margin-bottom: 15px;">
                    <img src="${content.header.profilePicture}" alt="${content.header.name}" style="width: 120px; height: 120px; border-radius: 50%; object-fit: cover; border: 3px solid #2563eb; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
                </div>
            ` : ''}
            <div class="name">${content.header.name}</div>
            <div class="contact">
                ${content.header.email} | ${content.header.phone} | ${content.header.country}
            </div>
            ${content.trafficLightStatus ? `
                <div style="margin-top: 15px;">
                    <span class="traffic-light ${content.trafficLightStatus.status}">
                        ${content.trafficLightStatus.status} Profile
                    </span>
                    <div style="font-size: 0.9em; color: #666; margin-top: 5px;">
                        JobScooter Verified • Score: ${content.trafficLightStatus.score}%
                    </div>
                </div>
            ` : ''}
        </div>

        ${content.summary ? `
        <div class="section">
            <div class="section-title">Professional Summary</div>
            <p>${content.summary}</p>
        </div>
        ` : ''}

        ${content.education.length > 0 ? `
        <div class="section">
            <div class="section-title">Education</div>
            ${content.education.map(edu => `
                <div class="item">
                    <div class="item-title">${edu.qualification}</div>
                    <div class="item-subtitle">${edu.institution}</div>
                    <div class="item-date">${edu.year}</div>
                    ${edu.field ? `<div>Field of Study: ${edu.field}</div>` : ''}
                </div>
            `).join('')}
        </div>
        ` : ''}

        ${content.certifications.length > 0 ? `
        <div class="section">
            <div class="section-title">Certifications</div>
            ${content.certifications.map(cert => `
                <div class="item">
                    <div class="item-title">${cert.name}</div>
                    <div class="item-subtitle">${cert.issuer}</div>
                    <div class="item-date">${cert.date}</div>
                    ${cert.verified ? '<div style="color: #16a34a; font-weight: bold;">✓ Verified</div>' : ''}
                </div>
            `).join('')}
        </div>
        ` : ''}

        ${content.languages.length > 0 ? `
        <div class="section">
            <div class="section-title">Languages</div>
            ${content.languages.map(lang => `
                <div class="item">
                    <div class="item-title">${lang.language}</div>
                    <div class="item-subtitle">Proficiency: ${lang.level}</div>
                    ${lang.institution ? `<div>Certified by: ${lang.institution}</div>` : ''}
                    ${lang.verified ? '<div style="color: #16a34a; font-weight: bold;">✓ Verified</div>' : ''}
                </div>
            `).join('')}
        </div>
        ` : ''}

        ${content.skills.length > 0 ? `
        <div class="section">
            <div class="section-title">Skills</div>
            <div class="skills">
                ${content.skills.map(skill => `<div class="skill">${skill}</div>`).join('')}
            </div>
        </div>
        ` : ''}

        <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 0.9em;">
            Generated by JobScooter AI • Profile Verified • ${new Date().toLocaleDateString()}
        </div>
    </body>
    </html>
    `;

    return html;
}

// Helper functions for content generation
function generateSummary(userData) {
    const experience = userData.certificates.length;
    const languages = userData.languages.length;
    const status = userData.scoring.status;
    
    let summary = `Experienced professional with ${experience} verified qualification${experience !== 1 ? 's' : ''}`;
    
    if (languages > 0) {
        summary += ` and proficiency in ${languages} language${languages !== 1 ? 's' : ''}`;
    }
    
    summary += '. Profile verified through JobScooter\'s AI-powered verification system';
    
    if (status === 'green') {
        summary += ', achieving Green status for comprehensive credentials.';
    } else if (status === 'yellow') {
        summary += ', with strong credentials and room for enhancement.';
    } else {
        summary += ', currently building a comprehensive professional profile.';
    }
    
    return summary;
}

function generateExperienceSection(userData) {
    // This would be extracted from certificates and other data
    // For now, return empty array - can be enhanced later
    return [];
}

function generateEducationSection(userData) {
    return userData.certificates
        .filter(cert => cert.type === 'academic' || cert.classification === 'degree' || cert.classification === 'diploma')
        .map(cert => ({
            qualification: `${cert.level} in ${cert.field}`,
            institution: cert.institution,
            year: cert.dateIssued ? new Date(cert.dateIssued).getFullYear() : 'Unknown',
            field: cert.field,
            verified: cert.verified
        }));
}

function generateSkillsSection(userData) {
    const skills = new Set();
    
    // Extract skills from certificates
    userData.certificates.forEach(cert => {
        if (cert.field) {
            skills.add(cert.field);
        }
        if (cert.type === 'professional') {
            skills.add('Professional Certification');
        }
    });
    
    // Add languages as skills
    userData.languages.forEach(lang => {
        skills.add(`${lang.language} (${lang.level})`);
    });
    
    return Array.from(skills);
}

function generateCertificationsSection(userData) {
    return userData.certificates.map(cert => ({
        name: `${cert.classification} in ${cert.field}`,
        issuer: cert.institution,
        date: cert.dateIssued ? new Date(cert.dateIssued).getFullYear() : 'Unknown',
        verified: cert.verified
    }));
}

function generateProjectsSection(userData) {
    // This would be extracted from experience or additional data
    // For now, return empty array - can be enhanced later
    return [];
}

function generateTechnicalSkillsSection(userData) {
    const techSkills = userData.certificates
        .filter(cert => cert.field && (
            cert.field.toLowerCase().includes('computer') ||
            cert.field.toLowerCase().includes('software') ||
            cert.field.toLowerCase().includes('it') ||
            cert.field.toLowerCase().includes('programming')
        ))
        .map(cert => cert.field);
    
    return techSkills;
}

module.exports = router;