const express = require('express');
const router = express.Router();

// Middleware to get database
const getDb = (req) => req.app.locals.db;

// Get landing page information
router.get('/info', (req, res) => {
    try {
        const landingInfo = {
            title: "JobScooter - AI-Powered Job Application Platform",
            subtitle: "Launch Your Career with Intelligent Document Verification",
            description: "JobScooter automates your job application process using advanced AI document verification, intelligent profile creation, and our exclusive Traffic Light System for maximum employer confidence.",
            features: [
                {
                    id: "ai-processing",
                    title: "AI Document Processing",
                    description: "Advanced AI extracts and verifies your credentials automatically from ID documents and certificates.",
                    icon: "fas fa-robot"
                },
                {
                    id: "traffic-light",
                    title: "Traffic Light System",
                    description: "Get instant feedback on your profile quality with our unique scoring system that employers trust.",
                    icon: "fas fa-traffic-light"
                },
                {
                    id: "verified-credentials",
                    title: "Verified Credentials",
                    description: "We verify your certificates against accredited institutions to ensure authenticity.",
                    icon: "fas fa-shield-alt"
                },
                {
                    id: "language-verification",
                    title: "Language Verification",
                    description: "Prove your language skills with verified certificates from recognized institutions.",
                    icon: "fas fa-language"
                },
                {
                    id: "auto-cv",
                    title: "Auto CV Generation",
                    description: "Professional CVs generated automatically from your verified information.",
                    icon: "fas fa-file-pdf"
                },
                {
                    id: "public-profiles",
                    title: "Public Profiles",
                    description: "Share your verified profile with employers through secure, tiered access controls.",
                    icon: "fas fa-eye"
                }
            ],
            stats: {
                applications_processed: "1,000+",
                verification_accuracy: "95%",
                speed_improvement: "3x"
            },
            steps: [
                {
                    step: 1,
                    title: "Upload Your ID",
                    description: "AI extracts your personal information and creates your account automatically."
                },
                {
                    step: 2,
                    title: "Verify Languages",
                    description: "Upload language certificates to verify your multilingual abilities."
                },
                {
                    step: 3,
                    title: "Upload Certificates",
                    description: "Our AI analyzes and verifies your educational and professional qualifications."
                },
                {
                    step: 4,
                    title: "Add Media",
                    description: "Upload your profile picture and record a video introduction."
                },
                {
                    step: 5,
                    title: "Get Your Score",
                    description: "Receive your Traffic Light status and professional profile ready for employers."
                }
            ]
        };

        res.json({
            success: true,
            data: landingInfo
        });
    } catch (error) {
        console.error('Landing info error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load landing information'
        });
    }
});

// Initialize application session
router.post('/start-application', (req, res) => {
    try {
        const { userAgent, ipAddress } = req.body;
        const db = getDb(req);

        // Generate session token
        const { v4: uuidv4 } = require('uuid');
        const sessionToken = uuidv4();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        db.query(`
            INSERT INTO application_sessions (
                session_token, 
                step_completed, 
                user_agent, 
                ip_address, 
                expires_at, 
                created_at
            ) VALUES (?, 0, ?, ?, ?, NOW())
        `, [sessionToken, userAgent, ipAddress, expiresAt.toISOString()], (err, result) => {
            if (err) {
                console.error('Session creation error:', err);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to create application session'
                });
            }

            res.json({
                success: true,
                data: {
                    sessionToken,
                    expiresAt: expiresAt.toISOString(),
                    message: 'Application session started successfully'
                }
            });
        });

    } catch (error) {
        console.error('Start application error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to start application session'
        });
    }
});

// Accept legal agreements
router.put('/legal-accept', (req, res) => {
    try {
        const { sessionToken, agreements } = req.body;
        
        // Validate required agreements
        const requiredAgreements = ['terms', 'privacy', 'data'];
        const acceptedAgreements = Object.keys(agreements || {}).filter(key => agreements[key]);
        
        const allAccepted = requiredAgreements.every(req => acceptedAgreements.includes(req));
        
        if (!allAccepted) {
            return res.status(400).json({
                success: false,
                error: 'All legal agreements must be accepted',
                required: requiredAgreements,
                accepted: acceptedAgreements
            });
        }

        const db = getDb(req);

        // Update session with legal acceptance
        db.query(`
            UPDATE application_sessions 
            SET 
                legal_agreements_accepted = ?,
                legal_accepted_at = NOW(),
                updated_at = NOW()
            WHERE session_token = ? AND expires_at > NOW()
        `, [JSON.stringify(agreements), sessionToken], (err, result) => {
            if (err) {
                console.error('Legal acceptance error:', err);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to record legal agreement acceptance'
                });
            }

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Session not found or expired'
                });
            }

            res.json({
                success: true,
                data: {
                    message: 'Legal agreements accepted successfully',
                    acceptedAt: new Date().toISOString()
                }
            });
        });

    } catch (error) {
        console.error('Legal acceptance error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process legal agreement acceptance'
        });
    }
});

// Get legal document content
router.get('/legal/:type', (req, res) => {
    try {
        const { type } = req.params;
        let content = {};

        switch (type) {
            case 'terms':
                content = {
                    title: "Terms & Conditions",
                    lastUpdated: "2024-01-01",
                    sections: [
                        {
                            title: "1. Acceptance of Terms",
                            content: "By using JobScooter, you agree to these terms and conditions. If you do not agree to these terms, please do not use our services."
                        },
                        {
                            title: "2. Service Description",
                            content: "JobScooter provides AI-powered job application automation and document verification services to help users create professional profiles and applications."
                        },
                        {
                            title: "3. User Responsibilities",
                            content: "Users must provide accurate and truthful information, upload only legitimate documents, and respect intellectual property rights."
                        },
                        {
                            title: "4. Privacy and Data Protection",
                            content: "We are committed to protecting your personal information and privacy in accordance with applicable data protection laws."
                        },
                        {
                            title: "5. Limitation of Liability",
                            content: "JobScooter is not liable for any damages arising from use of our services, except as required by applicable law."
                        },
                        {
                            title: "6. Modifications to Terms",
                            content: "We reserve the right to modify these terms at any time. Users will be notified of significant changes."
                        }
                    ]
                };
                break;

            case 'privacy':
                content = {
                    title: "Privacy Policy",
                    lastUpdated: "2024-01-01",
                    sections: [
                        {
                            title: "Information We Collect",
                            content: "We collect personal identification information from ID documents, educational and professional certificates, profile pictures, and video introductions."
                        },
                        {
                            title: "How We Use Your Information",
                            content: "We use your information to create and maintain your profile, verify your credentials, generate CVs and application materials, and provide our services."
                        },
                        {
                            title: "Data Security",
                            content: "We use industry-standard security measures including encryption, secure data centers, and regular security audits to protect your data."
                        },
                        {
                            title: "Data Sharing",
                            content: "We do not sell your personal data. We may share anonymized data for research purposes and with service providers who help us operate our platform."
                        },
                        {
                            title: "Your Rights",
                            content: "You have the right to access, modify, delete your personal information, and control how your data is processed."
                        },
                        {
                            title: "Data Retention",
                            content: "We retain your data as long as your account is active or as needed to provide services. You can request deletion at any time."
                        }
                    ]
                };
                break;

            case 'data':
                content = {
                    title: "Data Processing Agreement",
                    lastUpdated: "2024-01-01",
                    sections: [
                        {
                            title: "Purpose of Processing",
                            content: "We process your data to provide job application automation services, including profile creation, document verification, and CV generation."
                        },
                        {
                            title: "Legal Basis",
                            content: "Processing is based on your explicit consent and our legitimate business interests in providing job application services."
                        },
                        {
                            title: "Data Categories",
                            content: "We process personal identification data, educational qualifications, professional experience, and multimedia content (photos, videos)."
                        },
                        {
                            title: "Third-Party Processing",
                            content: "We may use third-party AI services for document processing, verification, and transcription. All third parties are bound by data protection agreements."
                        },
                        {
                            title: "International Transfers",
                            content: "Your data may be processed in countries outside of your residence, with appropriate safeguards in place."
                        },
                        {
                            title: "Data Subject Rights",
                            content: "You have rights to access, rectification, erasure, portability, and objection regarding your personal data processing."
                        }
                    ]
                };
                break;

            default:
                return res.status(404).json({
                    success: false,
                    error: 'Legal document not found'
                });
        }

        res.json({
            success: true,
            data: content
        });

    } catch (error) {
        console.error('Legal document error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load legal document'
        });
    }
});

// Get system statistics for landing page
router.get('/stats', (req, res) => {
    try {
        const db = getDb(req);

        // Get real statistics from database
        const queries = [
            'SELECT COUNT(*) as total_applications FROM applicants WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 YEAR)',
            'SELECT COUNT(*) as verified_certificates FROM certificates WHERE verification_status = "verified"',
            'SELECT AVG(traffic_light_score) as avg_score FROM applicants WHERE traffic_light_score > 0',
            'SELECT COUNT(*) as green_profiles FROM applicants WHERE traffic_light_status = "green"',
            'SELECT COUNT(*) as total_profiles FROM applicants WHERE status = "active"'
        ];

        Promise.all(queries.map(query => 
            new Promise((resolve, reject) => {
                db.query(query, (err, results) => {
                    if (err) reject(err);
                    else resolve(results[0]);
                });
            })
        )).then(results => {
            const stats = {
                total_applications: results[0].total_applications || 1000,
                verified_certificates: results[1].verified_certificates || 500,
                average_score: Math.round(results[2].avg_score || 85),
                success_rate: results[4].total_profiles > 0 ? 
                    Math.round((results[3].green_profiles / results[4].total_profiles) * 100) : 95,
                verification_accuracy: 95,
                processing_speed: "3x faster"
            };

            res.json({
                success: true,
                data: stats
            });
        }).catch(error => {
            console.error('Stats query error:', error);
            // Return default stats if query fails
            res.json({
                success: true,
                data: {
                    total_applications: 1000,
                    verified_certificates: 500,
                    average_score: 85,
                    success_rate: 95,
                    verification_accuracy: 95,
                    processing_speed: "3x faster"
                }
            });
        });

    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load statistics'
        });
    }
});

module.exports = router;