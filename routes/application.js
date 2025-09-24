const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// Middleware to get database
const getDb = (req) => req.app.locals.db;

// Middleware to authenticate JWT token
const authenticateToken = require('./auth').authenticateToken;

// Create application session
router.post('/start-session', (req, res) => {
    try {
        const sessionToken = uuidv4();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        const db = getDb(req);

        db.query(`
            INSERT INTO application_sessions (session_token, step_completed, expires_at, created_at)
            VALUES (?, 0, ?, NOW())
        `, [sessionToken, expiresAt.toISOString()], (err, result) => {
            if (err) {
                console.error('Session creation error:', err);
                return res.status(500).json({ error: 'Failed to create session' });
            }

            res.json({
                sessionToken,
                expiresAt: expiresAt.toISOString(),
                message: 'Application session started'
            });
        });

    } catch (error) {
        console.error('Start session error:', error);
        res.status(500).json({ error: 'Failed to start application session' });
    }
});

// Get current application step
router.get('/current-step/:sessionToken', (req, res) => {
    try {
        const { sessionToken } = req.params;
        const db = getDb(req);

        db.query(`
            SELECT * FROM application_sessions
            WHERE session_token = ? AND expires_at > NOW()
        `, [sessionToken], (err, results) => {
            if (err) {
                console.error('Session fetch error:', err);
                return res.status(500).json({ error: 'Failed to fetch session' });
            }

            if (!results || results.length === 0) {
                return res.status(404).json({ error: 'Session not found or expired' });
            }

            const session = results[0];
            res.json({
                currentStep: session.step_completed,
                extractedData: session.extracted_data ? JSON.parse(session.extracted_data) : null,
                sessionToken
            });
        });

    } catch (error) {
        console.error('Current step error:', error);
        res.status(500).json({ error: 'Failed to get current step' });
    }
});

// Update application step
router.put('/update-step/:sessionToken', (req, res) => {
    try {
        const { sessionToken } = req.params;
        const { stepCompleted, extractedData } = req.body;
        const db = getDb(req);

        const sql = `
            UPDATE application_sessions
            SET step_completed = ?, extracted_data = ?, updated_at = NOW()
            WHERE session_token = ? AND expires_at > NOW()
        `;

        db.query(sql, [stepCompleted, extractedData ? JSON.stringify(extractedData) : null, sessionToken], (err, result) => {
            if (err) {
                console.error('Step update error:', err);
                return res.status(500).json({ error: 'Failed to update step' });
            }

            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'Session not found or expired' });
            }

            res.json({
                message: 'Step updated successfully',
                currentStep: stepCompleted
            });
        });

    } catch (error) {
        console.error('Update step error:', error);
        res.status(500).json({ error: 'Failed to update step' });
    }
});

// Update language selection
router.put('/language/:sessionToken', (req, res) => {
    try {
        const { sessionToken } = req.params;
        const { languages } = req.body;
        const db = getDb(req);

        // Get current session data
        db.query(`
            SELECT extracted_data FROM application_sessions
            WHERE session_token = ? AND expires_at > NOW()
        `, [sessionToken], (err, results) => {
            if (err) {
                console.error('Session fetch error:', err);
                return res.status(500).json({ error: 'Failed to fetch session' });
            }

            if (!results || results.length === 0) {
                return res.status(404).json({ error: 'Session not found or expired' });
            }

            const session = results[0];
            const currentData = session.extracted_data ? JSON.parse(session.extracted_data) : {};
            currentData.languages = languages;

            db.query(`
                UPDATE application_sessions
                SET extracted_data = ?, updated_at = NOW()
                WHERE session_token = ?
            `, [JSON.stringify(currentData), sessionToken], (err, result) => {
                if (err) {
                    console.error('Language update error:', err);
                    return res.status(500).json({ error: 'Failed to update languages' });
                }

                res.json({
                    message: 'Languages updated successfully',
                    languages
                });
            });
        });

    } catch (error) {
        console.error('Language update error:', error);
        res.status(500).json({ error: 'Failed to update languages' });
    }
});

// Get application progress
router.get('/progress/:sessionToken', (req, res) => {
    try {
        const { sessionToken } = req.params;
        const db = getDb(req);

        db.query(`
            SELECT step_completed, extracted_data FROM application_sessions
            WHERE session_token = ? AND expires_at > NOW()
        `, [sessionToken], (err, results) => {
            if (err) {
                console.error('Progress fetch error:', err);
                return res.status(500).json({ error: 'Failed to fetch progress' });
            }

            if (!results || results.length === 0) {
                return res.status(404).json({ error: 'Session not found or expired' });
            }

            const session = results[0];
            const extractedData = session.extracted_data ? JSON.parse(session.extracted_data) : {};
            const progressPercentage = Math.round((session.step_completed / 5) * 100);

            res.json({
                currentStep: session.step_completed,
                progressPercentage,
                extractedData,
                sessionToken
            });
        });

    } catch (error) {
        console.error('Progress error:', error);
        res.status(500).json({ error: 'Failed to get progress' });
    }
});

// Complete application (authenticated endpoint)
router.post('/complete', authenticateToken, async (req, res) => {
    try {
        const { sessionToken } = req.body;
        const db = getDb(req);

        // Get session data
        const [session] = await new Promise((resolve, reject) => {
            db.query(`
                SELECT * FROM application_sessions
                WHERE session_token = ? AND expires_at > NOW()
            `, [sessionToken], (err, results) => {
                if (err) reject(err);
                else resolve(results || []);
            });
        });

        if (!session) {
            return res.status(404).json({ error: 'Session not found or expired' });
        }

        const extractedData = session.extracted_data ? JSON.parse(session.extracted_data) : {};

        // Update applicant completion status
        await new Promise((resolve, reject) => {
            db.query(`
                UPDATE applicants
                SET status = 'active', completion_percentage = 100, updated_at = NOW()
                WHERE id = ?
            `, [req.user.id], (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });

        // Calculate final traffic light score
        const finalScore = await calculateTrafficLightScore(req.user.id, db);

        // Update traffic light status
        await new Promise((resolve, reject) => {
            db.query(`
                UPDATE applicants
                SET traffic_light_status = ?, traffic_light_score = ?, updated_at = NOW()
                WHERE id = ?
            `, [finalScore.status, finalScore.totalScore, req.user.id], (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });

        // Update traffic light scores table
        await new Promise((resolve, reject) => {
            db.query(`
                UPDATE traffic_light_scores
                SET total_score = ?, status = ?, calculated_at = NOW()
                WHERE applicant_id = ?
            `, [finalScore.totalScore, finalScore.status, req.user.id], (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });

        // Clean up session
        await new Promise((resolve, reject) => {
            db.query(`
                DELETE FROM application_sessions WHERE session_token = ?
            `, [sessionToken], (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });

        res.json({
            message: 'Application completed successfully',
            trafficLightStatus: finalScore.status,
            score: finalScore.totalScore,
            completionPercentage: 100
        });

    } catch (error) {
        console.error('Application completion error:', error);
        res.status(500).json({ error: 'Failed to complete application' });
    }
});

// Helper function to calculate traffic light score
async function calculateTrafficLightScore(applicantId, db) {
    try {
        // Get certificate count and verification status
        const certificates = await new Promise((resolve, reject) => {
            db.query(`
                SELECT is_verified, authenticity_score FROM certificates
                WHERE applicant_id = ?
            `, [applicantId], (err, results) => {
                if (err) reject(err);
                else resolve(results || []);
            });
        });

        // Get language verification count
        const [languageResult] = await new Promise((resolve, reject) => {
            db.query(`
                SELECT COUNT(*) as count FROM language_verifications
                WHERE applicant_id = ? AND is_verified = 1
            `, [applicantId], (err, results) => {
                if (err) reject(err);
                else resolve(results || [{ count: 0 }]);
            });
        });

        const languages = languageResult ? languageResult.count : 0;

        // Calculate scores (simplified scoring logic)
        const certificateScore = Math.min(certificates.length * 15, 60);
        const languageScore = Math.min(languages * 10, 20);
        const identityScore = 20; // Assuming ID is verified
        const completenessScore = 100; // Assuming all steps completed

        const totalScore = certificateScore + languageScore + identityScore + completenessScore;

        let status = 'red';
        if (totalScore >= 80) status = 'green';
        else if (totalScore >= 60) status = 'yellow';

        return {
            totalScore,
            status,
            breakdown: {
                certificateScore,
                languageScore,
                identityScore,
                completenessScore
            }
        };

    } catch (error) {
        console.error('Score calculation error:', error);
        return { totalScore: 0, status: 'red', breakdown: {} };
    }
}

module.exports = router;
