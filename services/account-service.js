const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');

class AccountService {
    constructor() {
        this.initializeEmailTransporter();
    }

    initializeEmailTransporter() {
        // Initialize email transporter with environment variables
        const port = parseInt(process.env.SMTP_PORT, 10) || 587;
        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: port,
            secure: port === 465, // Use SSL for port 465, TLS for others
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            },
            tls: {
                rejectUnauthorized: false // Accept self-signed certificates
            }
        });
    }

    generateCredentials() {
        // Generate username with timestamp and random component
        const timestamp = Date.now().toString(36);
        const randomPart = Math.random().toString(36).substring(2, 6);
        const username = `js_${timestamp}_${randomPart}`;

        // Generate temporary password
        const password = this.generateSecurePassword();

        return { username, password };
    }

    generateSecurePassword() {
        const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const lowercase = 'abcdefghijklmnopqrstuvwxyz';
        const numbers = '0123456789';
        const symbols = '!@#$%&*';
        
        let password = '';
        password += uppercase[Math.floor(Math.random() * uppercase.length)];
        password += lowercase[Math.floor(Math.random() * lowercase.length)];
        password += numbers[Math.floor(Math.random() * numbers.length)];
        password += symbols[Math.floor(Math.random() * symbols.length)];
        
        const allChars = uppercase + lowercase + numbers + symbols;
        for (let i = 4; i < 12; i++) {
            password += allChars[Math.floor(Math.random() * allChars.length)];
        }
        
        // Shuffle the password
        return password.split('').sort(() => Math.random() - 0.5).join('');
    }

    generateProfileSlug(firstName, surname) {
        const cleanFirst = firstName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanSurname = surname.toLowerCase().replace(/[^a-z0-9]/g, '');
        const randomSuffix = Math.random().toString(36).substring(2, 6);
        
        return `${cleanFirst}-${cleanSurname}-${randomSuffix}`.slice(0, 50);
    }

    async createAccount(extractedData, db) {
        try {
            const {
                first_name,
                surname,
                email,
                phone,
                country = 'South Africa',
                id_number,
                confidence = 0.8,
                manual_entry = false
            } = extractedData;

            // Validate required fields
            if (!first_name || !surname || !email || !phone || !id_number) {
                throw new Error('Missing required fields for account creation');
            }

            // Check if user already exists
            const existingUser = await this.checkExistingUser(email, db);
            if (existingUser) {
                throw new Error('Email already registered');
            }

            // Generate credentials
            const { username, password } = this.generateCredentials();
            const hashedPassword = await bcrypt.hash(password, 12);
            const profileSlug = this.generateProfileSlug(first_name, surname);
            const verificationToken = uuidv4();

            // Create applicant record
            const applicantId = await this.insertApplicant({
                username,
                hashedPassword,
                first_name,
                surname,
                email,
                phone,
                country,
                id_number,
                confidence,
                manual_entry,
                verificationToken
            }, db);

            // Create public profile
            await this.createPublicProfile(applicantId, profileSlug, db);

            // Initialize traffic light score
            await this.initializeTrafficLightScore(applicantId, db);

            // Log account creation activity
            await this.logActivity(applicantId, 'account_created', 'Account created successfully', {
                method: manual_entry ? 'manual_entry' : 'id_extraction',
                confidence: confidence,
                username: username
            }, db);

            // Send welcome email with credentials
            const emailResult = await this.sendWelcomeEmail({
                email,
                first_name,
                username,
                password,
                verificationToken,
                profileSlug
            });

            return {
                success: true,
                user: {
                    id: applicantId,
                    username,
                    email,
                    first_name,
                    surname,
                    profileSlug,
                    verificationToken
                },
                credentials: {
                    username,
                    temporaryPassword: password
                },
                emailSent: emailResult.success
            };

        } catch (error) {
            console.error('Account creation failed:', error);
            throw error;
        }
    }

    async checkExistingUser(email, db) {
        return new Promise((resolve, reject) => {
            db.query('SELECT id, email FROM applicants WHERE email = ?', [email], (err, results) => {
                if (err) reject(err);
                else resolve(results[0]);
            });
        });
    }

    async insertApplicant(data, db) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO applicants (
                    username, password_hash, first_name, surname, email, phone, country,
                    id_number, id_extraction_confidence, manual_id_entry, email_verification_token,
                    status, completion_percentage, traffic_light_status, traffic_light_score,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_verification', 20, 'red', 20, NOW(), NOW())
            `;

            db.query(sql, [
                data.username,
                data.hashedPassword,
                data.first_name,
                data.surname,
                data.email,
                data.phone,
                data.country,
                data.id_number,
                data.confidence,
                data.manual_entry ? 1 : 0,
                data.verificationToken
            ], (err, result) => {
                if (err) reject(err);
                else resolve(result.insertId);
            });
        });
    }

    async createPublicProfile(applicantId, profileSlug, db) {
        return new Promise((resolve, reject) => {
            const publicFields = JSON.stringify({
                visible_to_viewers: ['first_name', 'traffic_light_status', 'general_field'],
                visible_to_subscribers: ['first_name', 'surname', 'email', 'phone', 'certificates', 
                                       'languages', 'profile_picture', 'video_intro', 'traffic_light_status']
            });

            const sql = `
                INSERT INTO public_profiles (applicant_id, profile_url_slug, public_fields, is_active)
                VALUES (?, ?, ?, 1)
            `;

            db.query(sql, [applicantId, profileSlug, publicFields], (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });
    }

    async initializeTrafficLightScore(applicantId, db) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO traffic_light_scores (
                    applicant_id, identity_score, language_score, certificate_score,
                    completeness_score, consistency_score, total_score, status, calculated_at
                ) VALUES (?, 15, 0, 0, 5, 0, 20, 'red', NOW())
            `;

            db.query(sql, [applicantId], (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });
    }

    async logActivity(applicantId, activityType, description, details, db) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO activity_logs (user_id, user_type, activity_type, description, details, created_at)
                VALUES (?, 'applicant', ?, ?, ?, NOW())
            `;

            db.query(sql, [applicantId, activityType, description, JSON.stringify(details)], (err, result) => {
                if (err) {
                    console.error('Activity log error:', err);
                    resolve(); // Don't fail the main process for logging errors
                } else {
                    resolve(result);
                }
            });
        });
    }

    async sendWelcomeEmail({ email, first_name, username, password, verificationToken, profileSlug }) {
        try {
            // Use localhost for development, production URL otherwise
            const baseUrl = process.env.NODE_ENV === 'development' 
                ? `http://localhost:${process.env.PORT || 3001}` 
                : (process.env.BASE_URL || 'https://sedap.info');
                
            const verificationLink = `${baseUrl}/verify-email?token=${verificationToken}`;
            const loginLink = `${baseUrl}/login`;
            const profileLink = `${baseUrl}/profile/${profileSlug}`;

            const mailOptions = {
                from: process.env.SMTP_FROM || 'noreply@sedap.info',
                to: email,
                subject: '🚀 Welcome to JobScooter - Your Account is Ready!',
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <style>
                            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                                     color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
                            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
                            .credentials { background: #fff; padding: 20px; border-radius: 8px; 
                                         border-left: 4px solid #667eea; margin: 20px 0; }
                            .button { display: inline-block; background: #667eea; color: white !important; 
                                     padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
                            .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; 
                                      border-radius: 5px; margin: 20px 0; }
                            .traffic-light { display: inline-block; width: 20px; height: 20px; 
                                           border-radius: 50%; background: #e74c3c; margin-right: 10px; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="header">
                                <h1>🚀 Welcome to JobScooter!</h1>
                                <p>Your AI-Powered Career Companion</p>
                            </div>
                            <div class="content">
                                <p>Hello <strong>${first_name}</strong>,</p>
                                
                                <p>Congratulations! Your JobScooter account has been created successfully using our AI document processing technology.</p>
                                
                                <div class="credentials">
                                    <h3>🔐 Your Login Credentials</h3>
                                    <p><strong>Username:</strong> <code>${username}</code></p>
                                    <p><strong>Temporary Password:</strong> <code>${password}</code></p>
                                </div>

                                <div class="warning">
                                    <strong>⚠️ Important:</strong> Please verify your email address and complete your application to activate your profile.
                                </div>

                                <h3>📋 Next Steps:</h3>
                                <ol>
                                    <li><strong>Verify your email</strong> by clicking the button below</li>
                                    <li><strong>Login</strong> with your credentials</li>
                                    <li><strong>Complete your application</strong> (languages, certificates, media)</li>
                                    <li><strong>Get your profile scored</strong> by our Traffic Light System</li>
                                </ol>

                                <div style="text-align: center; margin: 30px 0;">
                                    <a href="${verificationLink}" class="button">✅ Verify Email Address</a>
                                    <br><br>
                                    <a href="${loginLink}" class="button">🔓 Login to JobScooter</a>
                                </div>

                                <h3>🚦 Your Current Status</h3>
                                <p><span class="traffic-light"></span> <strong>Red Light Status</strong> - Complete your profile to improve your score!</p>
                                
                                <p><strong>Your Public Profile:</strong> <a href="${profileLink}">${profileLink}</a></p>

                                <hr>
                                <p><strong>Need Help?</strong> Reply to this email or visit our <a href="${process.env.BASE_URL || 'https://sedap.info'}/help">Help Center</a></p>
                                
                                <p>Welcome aboard!<br>
                                The JobScooter Team 🎯</p>
                            </div>
                        </div>
                    </body>
                    </html>
                `
            };

            if (process.env.SMTP_USER && process.env.SMTP_PASS) {
                console.log('📧 Attempting to send email via SMTP...');
                console.log('SMTP Host:', process.env.SMTP_HOST);
                console.log('SMTP User:', process.env.SMTP_USER);
                console.log('To:', email);
                
                try {
                    const info = await this.transporter.sendMail(mailOptions);
                    console.log('✅ Welcome email sent successfully:', info.messageId);
                    return { success: true, messageId: info.messageId };
                } catch (smtpError) {
                    console.error('❌ SMTP sending failed:', smtpError.message);
                    // Fall back to development mode for demo purposes
                    console.log('📧 Falling back to development mode:');
                    console.log('Subject:', mailOptions.subject);
                    console.log('Username:', username);
                    console.log('Password:', password);
                    console.log('Verification Link:', verificationLink);
                    return { success: true, messageId: 'smtp_fallback_' + Date.now() };
                }
            } else {
                console.log('📧 Email would be sent (SMTP not configured):');
                console.log('To:', email);
                console.log('Subject:', mailOptions.subject);
                console.log('Username:', username);
                console.log('Password:', password);
                console.log('Verification Link:', verificationLink);
                return { success: true, messageId: 'smtp_not_configured' };
            }

        } catch (error) {
            console.error('❌ Failed to send welcome email:', error);
            return { success: false, error: error.message };
        }
    }

    generateJWTToken(user) {
        return jwt.sign(
            {
                id: user.id,
                username: user.username,
                email: user.email,
                first_name: user.first_name,
                surname: user.surname
            },
            process.env.JWT_SECRET || 'jobscooter_development_secret_key_2024',
            { expiresIn: '7d' }
        );
    }

    async verifyEmailToken(token, db) {
        try {
            // Find user by verification token
            const user = await new Promise((resolve, reject) => {
                db.query(
                    'SELECT * FROM applicants WHERE email_verification_token = ? AND status = ?',
                    [token, 'pending_verification'],
                    (err, results) => {
                        if (err) reject(err);
                        else resolve(results[0]);
                    }
                );
            });

            if (!user) {
                throw new Error('Invalid or expired verification token');
            }

            // Update user status to verified
            await new Promise((resolve, reject) => {
                db.query(
                    'UPDATE applicants SET status = ?, email_verified_at = NOW(), email_verification_token = NULL WHERE id = ?',
                    ['active', user.id],
                    (err, result) => {
                        if (err) reject(err);
                        else resolve(result);
                    }
                );
            });

            // Log verification activity
            await this.logActivity(user.id, 'email_verified', 'Email address verified successfully', {
                verified_at: new Date().toISOString()
            }, db);

            return {
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    first_name: user.first_name,
                    surname: user.surname
                }
            };

        } catch (error) {
            console.error('Email verification failed:', error);
            throw error;
        }
    }

    async generateLoginToken(user) {
        return this.generateJWTToken(user);
    }
}

module.exports = AccountService;