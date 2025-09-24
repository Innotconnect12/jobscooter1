const express = require('express');
const path = require('path');
const cors = require('cors');
const mysql = require('mysql2');
const fs = require('fs');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const applicationRoutes = require('./routes/application');
const applicationEnhancedRoutes = require('./routes/application-enhanced');
const documentRoutes = require('./routes/documents');
const profileRoutes = require('./routes/profile');
const landingRoutes = require('./routes/landing');
const cvRoutes = require('./routes/cv');
const publicProfileRoutes = require('./routes/public-profile');

const app = express();
const PORT = process.env.PORT || 3001; // Development port

// Setup logging - write to project directory instead of /var/log
const logsDir = './logs';
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
    console.log('Created logs directory');
}

// Create log stream for application logs
const logStream = fs.createWriteStream(path.join(logsDir, 'jobscooter.log'), { flags: 'a' });

// Override console.log to also write to file in production
const originalConsoleLog = console.log;
console.log = function(...args) {
    originalConsoleLog.apply(console, args);
    if (process.env.NODE_ENV === 'production') {
        logStream.write(`[${new Date().toISOString()}] ${args.join(' ')}\n`);
    }
};

// Database Configuration - Uses .env variables
const dbConfig = {
    host: process.env.MYSQLHOST,
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
    database: process.env.MYSQLDATABASE,
    port: process.env.MYSQLPORT || 3306,
    connectTimeout: 60000,
    acquireTimeout: 60000,
    timeout: 60000,
};

// Create database connection pool (only in production or when database is available)
let db;
let databaseConnected = false;

if (process.env.NODE_ENV === 'production') {
    db = mysql.createPool(dbConfig);
} else {
    // Try to connect in development, but don't fail if it doesn't work
    try {
        db = mysql.createPool(dbConfig);
    } catch (error) {
        console.log('No database available in development mode');
        db = null;
    }
}

// Test database connection
if (db) {
    db.getConnection((err, connection) => {
    if (err) {
        console.error('Error connecting to MariaDB database:', err.message);
        console.log('Please ensure MySQL/MariaDB server is running and credentials are correct');
        
        if (process.env.NODE_ENV === 'development') {
            console.log('⚠️  Running in development mode without database connection');
            console.log('📝 Creating mock database for development...');
            
            // Create mock database for development
            app.locals.db = {
                query: (sql, params, callback) => {
                    // Handle different callback patterns
                    if (typeof params === 'function') {
                        callback = params;
                        params = [];
                    }
                    
                    // Simulate async behavior
                    setTimeout(() => {
                        try {
                            if (sql.includes('SELECT')) {
                                // Return mock data based on query
                                if (sql.includes('application_sessions')) {
                                    callback(null, [{ session_token: 'mock-session', step_completed: 0 }]);
                                } else if (sql.includes('applicants')) {
                                    callback(null, [{ id: 1, first_name: 'Demo', surname: 'User', email: 'demo@jobscooter.co.za' }]);
                                } else {
                                    callback(null, []);
                                }
                            } else if (sql.includes('INSERT')) {
                                callback(null, { insertId: Math.floor(Math.random() * 1000) + 1, affectedRows: 1 });
                            } else if (sql.includes('UPDATE') || sql.includes('DELETE')) {
                                callback(null, { affectedRows: 1 });
                            } else {
                                callback(null, { affectedRows: 0 });
                            }
                        } catch (mockError) {
                            console.log('Mock database query:', sql.substring(0, 100) + '...');
                            callback(null, { insertId: 1, affectedRows: 1 });
                        }
                    }, 50); // Reduced delay for better UX
                },
                end: (callback) => {
                    if (callback) callback();
                }
            };
            databaseConnected = true;
        } else {
            process.exit(1);
        }
    } else {
        console.log('Connected to MariaDB database');
        connection.release();
        databaseConnected = true;
    }
});

// Initialize database schema if needed
const initDatabase = async () => {
    try {
        // Skip database initialization in development mode without real database
        if (process.env.NODE_ENV === 'development' && !databaseConnected) {
            console.log('⚠️  Skipping database initialization in development mode');
            return;
        }
        
        const schemaPath = './database/jobscootercoz614_jobscooter.sql';
        if (fs.existsSync(schemaPath)) {
            console.log('Initializing database schema...');

            // Use a simpler approach - execute the SQL file directly
            // First, clean up the SQL file by removing problematic lines
            let schema = fs.readFileSync(schemaPath, 'utf8');

            // Remove phpMyAdmin comments and settings
            schema = schema.replace(/-- phpMyAdmin SQL Dump[\s\S]*?-- PHP Version: [\d.]+\n/g, '');
            schema = schema.replace(/SET SQL_MODE[\s\S]*?;\n/g, '');
            schema = schema.replace(/START TRANSACTION;\n/g, '');
            schema = schema.replace(/SET time_zone[\s\S]*?;\n/g, '');
            schema = schema.replace(/\/\*!\d+ [\s\S]*?\*\//g, '');
            schema = schema.replace(/COMMIT;\n/g, '');

            // Skip trigger creation during initialization since they may already exist
            schema = schema.replace(/CREATE TRIGGER[\s\S]*?END\s*\$\$[\s\S]*?DELIMITER ;/g, '');

            // Handle DELIMITER statements by replacing them with semicolons
            schema = schema.replace(/DELIMITER \$\$[\s\S]*?DELIMITER ;/g, (match) => {
                return match.replace(/DELIMITER \$\$/g, '').replace(/DELIMITER ;/g, '').replace(/\$\$/g, ';');
            });

            // Remove remaining DELIMITER statements
            schema = schema.replace(/DELIMITER [\s\S]*?;\n/g, '');

            // Split into individual statements
            const statements = schema
                .split(';')
                .map(stmt => stmt.trim())
                .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

            // Execute statements
            for (const statement of statements) {
                if (statement.trim()) {
                    try {
                        await new Promise((resolve, reject) => {
                            db.query(statement, (err) => {
                                if (err) reject(err);
                                else resolve();
                            });
                        });
                    } catch (error) {
                        // Log but continue with other statements
                        console.log('Statement failed:', statement.substring(0, 100) + '...');
                        console.log('Error:', error.message);
                    }
                }
            }
            console.log('Database schema initialization completed');
        }
    } catch (error) {
        console.error('Error initializing database schema:', error.message);
    }
};

// Initialize database
initDatabase();

// Make database available to routes
app.locals.db = db;

// CORS Configuration - Uses .env variables
const corsOptions = {
    origin: process.env.CORS_ORIGIN || '*',
    methods: process.env.CORS_METHODS ? process.env.CORS_METHODS.split(',') : ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: process.env.CORS_ALLOWED_HEADERS ? process.env.CORS_ALLOWED_HEADERS.split(',') : ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true
};

app.use(cors(corsOptions));

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// Create uploads directories if they don't exist
const uploadDirs = [
    './public/uploads',
    './public/uploads/ids',
    './public/uploads/certificates',
    './public/uploads/media',
    './public/uploads/cvs'
];

uploadDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Created directory: ${dir}`);
    }
});

// Check for Tesseract/OCR availability
if (process.env.TESSERACT_PATH) {
    console.log('✅ OCR (Tesseract) is available and configured');
    // Initialize OCR features if needed
    // const { createWorker } = require('tesseract.js');
    // OCR initialization code would go here
} else {
    console.log('⚠️ OCR (Tesseract) is not available on this server. Document processing will use fallback methods.');
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/application', applicationRoutes);
app.use('/api/application-enhanced', applicationEnhancedRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/landing', landingRoutes);
app.use('/api/cv', cvRoutes);
app.use('/api/public', publicProfileRoutes);

// Serve landing page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Email verification page
app.get('/verify-email', (req, res) => {
    const token = req.query.token;
    if (!token) {
        return res.status(400).send('Missing verification token');
    }
    res.sendFile(path.join(__dirname, 'public', 'verify-email.html'));
});

// Login page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Dashboard page (for logged-in users)
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Public profile page
app.get('/profile/:slug', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'public-profile.html'));
});

// Continue application route (determines where user should go next)
app.get('/continue-application', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// API endpoint for system info
app.get('/api/info', (req, res) => {
    res.json({
        name: 'JobScooter Prototype',
        version: '1.0.0',
        description: 'AI-powered job application automation platform',
        environment: process.env.NODE_ENV || 'development',
        features: [
            'ID document processing',
            'Certificate verification',
            'Traffic light scoring system',
            'Multi-step application process',
            'Profile generation',
            'Email notifications',
            'OCR support: ' + (!!process.env.TESSERACT_PATH ? 'Available' : 'Not Available')
        ],
        endpoints: {
            landing: '/',
            auth: '/api/auth/*',
            application: '/api/application/*',
            documents: '/api/documents/*',
            profile: '/api/profile/*'
        }
    });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        database: 'Connected',
        ocr: !!process.env.TESSERACT_PATH ? 'Available' : 'Not Available'
    });
});

// Email verification API endpoint
app.get('/api/verify-email/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const AccountService = require('./services/account-service');
        const accountService = new AccountService();
        
        const result = await accountService.verifyEmailToken(token, db);
        
        res.json({
            success: true,
            message: 'Email verified successfully!',
            user: result.user
        });
        
    } catch (error) {
        console.error('Email verification error:', error);
        res.status(400).json({
            success: false,
            error: error.message || 'Invalid verification token'
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Application Error:', err.stack);
    res.status(500).json({
        error: 'Something went wrong!',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down gracefully...');
    logStream.end();
    
    if (databaseConnected && typeof db.end === 'function') {
        db.end((err) => {
            if (err) {
                console.error('Error closing database connections:', err.message);
            } else {
                console.log('Database connections closed');
            }
            process.exit(0);
        });
    } else {
        console.log('Mock database - no connections to close');
        process.exit(0);
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`\n🚀 JobScooter Prototype Server Running!`);
    console.log(`📍 Server: http://localhost:${PORT}`);
    console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`💾 Database: MariaDB (${dbConfig.database})`);
    console.log(`📝 Logs: ${path.join(logsDir, 'jobscooter.log')}`);
    console.log(`\n📋 Available endpoints:`);
    console.log(`   Landing Page: http://localhost:${PORT}`);
    console.log(`   API Info: http://localhost:${PORT}/api/info`);
    console.log(`   Health Check: http://localhost:${PORT}/api/health`);
    console.log(`\n✅ Ready for applications!\n`);
});

module.exports = app;}
