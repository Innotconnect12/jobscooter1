const express = require('express');
const router = express.Router();

// Middleware to get database
const getDb = (req) => req.app.locals.db;

// Subscription tiers and their permissions
const SUBSCRIPTION_TIERS = {
    'free': {
        name: 'Free Viewer',
        canViewBasicInfo: true,
        canViewCertificates: false,
        canViewLanguages: false,
        canViewFullProfile: false,
        canViewContactInfo: false,
        canViewVideo: false,
        canDownloadCV: false,
        maxProfileViews: 3
    },
    'basic': {
        name: 'Basic Subscriber',
        canViewBasicInfo: true,
        canViewCertificates: true,
        canViewLanguages: true,
        canViewFullProfile: false,
        canViewContactInfo: false,
        canViewVideo: false,
        canDownloadCV: false,
        maxProfileViews: 25
    },
    'premium': {
        name: 'Premium Subscriber',
        canViewBasicInfo: true,
        canViewCertificates: true,
        canViewLanguages: true,
        canViewFullProfile: true,
        canViewContactInfo: true,
        canViewVideo: true,
        canDownloadCV: true,
        maxProfileViews: -1 // unlimited
    },
    'employer': {
        name: 'Employer Access',
        canViewBasicInfo: true,
        canViewCertificates: true,
        canViewLanguages: true,
        canViewFullProfile: true,
        canViewContactInfo: true,
        canViewVideo: true,
        canDownloadCV: true,
        maxProfileViews: -1 // unlimited
    }
};

// Middleware to verify subscription access
const verifySubscriptionAccess = async (req, res, next) => {
    try {
        const { viewerToken, viewerId } = req.query;
        const db = getDb(req);

        let viewerTier = 'free'; // Default to free viewer
        let viewerId_actual = null;

        // If viewer token provided, verify it
        if (viewerToken) {
            const jwt = require('jsonwebtoken');
            try {
                const decoded = jwt.verify(viewerToken, process.env.JWT_SECRET || 'jobscooter_development_secret_key_2024');
                viewerId_actual = decoded.id;

                // Get viewer's subscription tier
                const [viewer] = await new Promise((resolve, reject) => {
                    db.query('SELECT subscription_tier FROM employers WHERE id = ? UNION SELECT "free" as subscription_tier FROM applicants WHERE id = ?', 
                        [viewerId_actual, viewerId_actual], (err, results) => {
                        if (err) reject(err);
                        else resolve(results || []);
                    });
                });

                viewerTier = viewer ? viewer.subscription_tier || 'free' : 'free';
            } catch (error) {
                // Invalid token, default to free
                viewerTier = 'free';
            }
        }

        req.viewerTier = viewerTier;
        req.viewerId = viewerId_actual;
        req.permissions = SUBSCRIPTION_TIERS[viewerTier];
        
        next();
    } catch (error) {
        console.error('Subscription verification error:', error);
        req.viewerTier = 'free';
        req.permissions = SUBSCRIPTION_TIERS.free;
        next();
    }
};

// Log profile view
const logProfileView = async (profileId, viewerId, viewerTier, db) => {
    try {
        await new Promise((resolve, reject) => {
            db.query(`
                INSERT INTO profile_views (profile_id, viewer_id, viewer_tier, viewed_at, ip_address)
                VALUES (?, ?, ?, NOW(), ?)
            `, [profileId, viewerId, viewerTier, '127.0.0.1'], (err, result) => {
                if (err) {
                    console.error('Profile view logging error:', err);
                    resolve(); // Don't fail the request if logging fails
                } else {
                    resolve(result);
                }
            });
        });
    } catch (error) {
        console.error('Profile view logging error:', error);
    }
};

// Check view limits for free users
const checkViewLimits = async (viewerId, viewerTier, db) => {
    if (viewerTier !== 'free' || !viewerId) return { allowed: true };

    try {
        const [viewCount] = await new Promise((resolve, reject) => {
            db.query(`
                SELECT COUNT(*) as count 
                FROM profile_views 
                WHERE viewer_id = ? AND viewed_at > DATE_SUB(NOW(), INTERVAL 1 DAY)
            `, [viewerId], (err, results) => {
                if (err) reject(err);
                else resolve(results || [{ count: 0 }]);
            });
        });

        const maxViews = SUBSCRIPTION_TIERS.free.maxProfileViews;
        const currentViews = viewCount.count || 0;

        return {
            allowed: currentViews < maxViews,
            currentViews,
            maxViews,
            remainingViews: Math.max(0, maxViews - currentViews)
        };
    } catch (error) {
        console.error('View limit check error:', error);
        return { allowed: true }; // Allow on error
    }
};

// Get public profile with subscription-based access control
router.get('/profile/:profileId', verifySubscriptionAccess, async (req, res) => {
    try {
        const { profileId } = req.params;
        const { permissions, viewerTier, viewerId } = req;
        const db = getDb(req);

        // Check view limits for free users
        const viewLimits = await checkViewLimits(viewerId, viewerTier, db);
        if (!viewLimits.allowed) {
            return res.status(429).json({
                error: 'Daily view limit exceeded',
                message: `Free users can view ${viewLimits.maxViews} profiles per day. Upgrade to continue viewing profiles.`,
                upgradeRequired: true,
                subscriptionTiers: Object.keys(SUBSCRIPTION_TIERS).filter(tier => tier !== 'free')
            });
        }

        // Get base profile data
        const [profile] = await new Promise((resolve, reject) => {
            db.query(`
                SELECT a.*, tls.total_score, tls.status as traffic_light_status,
                       COUNT(DISTINCT c.id) as certificate_count,
                       COUNT(DISTINCT l.id) as language_count
                FROM applicants a
                LEFT JOIN traffic_light_scores tls ON a.id = tls.applicant_id
                LEFT JOIN certificates c ON a.id = c.applicant_id AND c.processing_status = 'completed'
                LEFT JOIN language_verifications l ON a.id = l.applicant_id AND l.is_verified = 1
                WHERE a.id = ? AND a.profile_visibility = 'public'
                GROUP BY a.id
            `, [profileId], (err, results) => {
                if (err) reject(err);
                else resolve(results || []);
            });
        });

        if (!profile) {
            return res.status(404).json({
                error: 'Profile not found or not public'
            });
        }

        // Log the view
        await logProfileView(profileId, viewerId, viewerTier, db);

        // Build response based on permissions
        const publicProfile = {
            id: profile.id,
            firstName: profile.first_name,
            surname: profile.surname,
            profilePictureUrl: profile.profile_picture_url,
            trafficLightScore: profile.total_score,
            trafficLightStatus: profile.traffic_light_status,
            completionPercentage: profile.completion_percentage,
            certificateCount: profile.certificate_count,
            languageCount: profile.language_count,
            country: profile.country,
            memberSince: profile.created_at,
            subscriptionTier: viewerTier,
            permissions: permissions
        };

        // Add contact information based on permissions
        if (permissions.canViewContactInfo) {
            publicProfile.email = profile.email;
            publicProfile.phone = profile.phone;
        }

        // Add video introduction if permitted
        if (permissions.canViewVideo && profile.video_intro_url) {
            publicProfile.videoIntroUrl = profile.video_intro_url;
            publicProfile.videoTranscript = profile.video_transcript;
        }

        // Add certificates if permitted
        if (permissions.canViewCertificates) {
            const certificates = await new Promise((resolve, reject) => {
                db.query(`
                    SELECT certificate_type, document_classification, institution_name,
                           field_of_study, grade_level, date_issued, is_verified,
                           authenticity_score, is_accredited
                    FROM certificates
                    WHERE applicant_id = ? AND processing_status = 'completed'
                    ORDER BY date_issued DESC
                `, [profileId], (err, results) => {
                    if (err) reject(err);
                    else resolve(results || []);
                });
            });

            publicProfile.certificates = certificates;
        }

        // Add languages if permitted
        if (permissions.canViewLanguages) {
            const languages = await new Promise((resolve, reject) => {
                db.query(`
                    SELECT language, is_verified, verification_method,
                           certificate_level, proficiency_level
                    FROM language_verifications
                    WHERE applicant_id = ?
                    ORDER BY is_verified DESC, language ASC
                `, [profileId], (err, results) => {
                    if (err) reject(err);
                    else resolve(results || []);
                });
            });

            publicProfile.languages = languages;
        }

        // Add full profile data if permitted
        if (permissions.canViewFullProfile) {
            const additionalData = await new Promise((resolve, reject) => {
                db.query(`
                    SELECT date_of_birth, gender, id_extraction_confidence,
                           manual_entry, verification_status
                    FROM applicants
                    WHERE id = ?
                `, [profileId], (err, results) => {
                    if (err) reject(err);
                    else resolve(results && results[0] ? results[0] : {});
                });
            });

            Object.assign(publicProfile, additionalData);
        }

        // Add view limits info for free users
        if (viewerTier === 'free') {
            publicProfile.viewLimits = {
                currentViews: viewLimits.currentViews + 1,
                maxViews: viewLimits.maxViews,
                remainingViews: viewLimits.remainingViews - 1
            };
        }

        res.json({
            success: true,
            profile: publicProfile,
            accessLevel: viewerTier,
            permissions: permissions
        });

    } catch (error) {
        console.error('Public profile fetch error:', error);
        res.status(500).json({
            error: 'Failed to fetch public profile'
        });
    }
});

// Get profile analytics (for profile owners)
router.get('/profile/:profileId/analytics', async (req, res) => {
    try {
        const { profileId } = req.params;
        const { viewerToken } = req.query;
        const db = getDb(req);

        // Verify that the viewer is the profile owner
        let isOwner = false;
        if (viewerToken) {
            try {
                const jwt = require('jsonwebtoken');
                const decoded = jwt.verify(viewerToken, process.env.JWT_SECRET || 'jobscooter_development_secret_key_2024');
                isOwner = decoded.id == profileId;
            } catch (error) {
                // Invalid token
            }
        }

        if (!isOwner) {
            return res.status(403).json({
                error: 'Access denied. You can only view analytics for your own profile.'
            });
        }

        // Get view analytics
        const analytics = await new Promise((resolve, reject) => {
            db.query(`
                SELECT 
                    COUNT(*) as total_views,
                    COUNT(DISTINCT viewer_id) as unique_viewers,
                    COUNT(CASE WHEN viewed_at > DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as views_last_7_days,
                    COUNT(CASE WHEN viewed_at > DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as views_last_30_days,
                    COUNT(CASE WHEN viewer_tier = 'employer' THEN 1 END) as employer_views,
                    COUNT(CASE WHEN viewer_tier = 'premium' THEN 1 END) as premium_views,
                    COUNT(CASE WHEN viewer_tier = 'basic' THEN 1 END) as basic_views,
                    COUNT(CASE WHEN viewer_tier = 'free' THEN 1 END) as free_views
                FROM profile_views 
                WHERE profile_id = ?
            `, [profileId], (err, results) => {
                if (err) reject(err);
                else resolve(results && results[0] ? results[0] : {});
            });
        });

        // Get recent views
        const recentViews = await new Promise((resolve, reject) => {
            db.query(`
                SELECT viewer_tier, viewed_at, ip_address
                FROM profile_views 
                WHERE profile_id = ? 
                ORDER BY viewed_at DESC 
                LIMIT 20
            `, [profileId], (err, results) => {
                if (err) reject(err);
                else resolve(results || []);
            });
        });

        res.json({
            success: true,
            analytics: {
                ...analytics,
                recentViews
            }
        });

    } catch (error) {
        console.error('Profile analytics error:', error);
        res.status(500).json({
            error: 'Failed to fetch profile analytics'
        });
    }
});

// Download CV (premium feature)
router.get('/profile/:profileId/cv/download', verifySubscriptionAccess, async (req, res) => {
    try {
        const { profileId } = req.params;
        const { permissions } = req;

        if (!permissions.canDownloadCV) {
            return res.status(403).json({
                error: 'CV download requires premium subscription',
                upgradeRequired: true,
                requiredTier: 'premium'
            });
        }

        // For now, return a message about CV generation
        // In a real implementation, you would generate and serve the actual CV
        res.json({
            success: true,
            message: 'CV download would be available here',
            downloadUrl: `/api/cv/generate/${profileId}`,
            format: 'PDF'
        });

    } catch (error) {
        console.error('CV download error:', error);
        res.status(500).json({
            error: 'Failed to download CV'
        });
    }
});

// Get subscription information and upgrade options
router.get('/subscriptions', (req, res) => {
    const subscriptionInfo = {
        tiers: SUBSCRIPTION_TIERS,
        features: {
            'free': [
                'View basic profile information',
                '3 profile views per day',
                'Limited access'
            ],
            'basic': [
                'View certificates and languages',
                '25 profile views per day',
                'Enhanced profile access'
            ],
            'premium': [
                'Full profile access',
                'Video introductions',
                'Contact information',
                'CV downloads',
                'Unlimited views'
            ],
            'employer': [
                'All premium features',
                'Employer dashboard',
                'Bulk profile access',
                'Advanced search filters',
                'Priority support'
            ]
        },
        pricing: {
            'basic': { monthly: 9.99, yearly: 99.99 },
            'premium': { monthly: 19.99, yearly: 199.99 },
            'employer': { monthly: 49.99, yearly: 499.99 }
        }
    };

    res.json(subscriptionInfo);
});

module.exports = router;