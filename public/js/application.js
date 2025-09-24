const Application = {
    currentStep: 1,
    totalSteps: 5,
    applicationData: {},
    sessionToken: null,

    // Initialize the application process
    async initializeApplication() {
        this.currentStep = 1;
        this.applicationData = {};
        this.sessionToken = null;

        console.log('🚀 Initializing JobScooter application flow...');

        try {
            // Start application session first
            await this.startApplicationSession();

            Utils.showToast('Application started - Upload your ID to begin!', 'info');

            this.updateProgress();
            this.loadStep(1);
        } catch (error) {
            console.error('Failed to initialize application session:', error);
            Utils.showToast('Error starting application session. Please try again.', 'error');
        }
    },

    // Start application session by calling backend API
    async startApplicationSession() {
        try {
            console.log('🔄 Starting application session...');

            const response = await fetch('/api/landing/start-application', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userAgent: navigator.userAgent,
                    ipAddress: '127.0.0.1', // This will be populated server-side in production
                    timestamp: new Date().toISOString()
                })
            });

            const data = await response.json();

            if (response.ok && data.success && data.data && data.data.sessionToken) {
                this.sessionToken = data.data.sessionToken;
                console.log('✅ Application session started successfully:', this.sessionToken);
                return data.data;
            } else {
                throw new Error(data.error || 'Failed to start session');
            }
        } catch (error) {
            console.error('❌ Failed to start application session:', error);
            throw error;
        }
    },

    // Load current step from backend
    async loadCurrentStep() {
        try {
            const response = await fetch('/api/application/current-step/' + this.sessionToken, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${AppState.user?.token}`
                }
            });
            const data = await response.json();
            if (response.ok) {
                this.currentStep = data.currentStep || 1;
                // Map extractedData to applicationData for frontend consistency
                this.applicationData = data.extractedData || {};
                this.updateProgress();
                this.loadStep(this.currentStep);
            } else {
                // If no current step found, start from step 1
                this.currentStep = 1;
                this.updateProgress();
                this.loadStep(1);
            }
        } catch (error) {
            console.error('Error loading current step:', error);
            // Fallback to step 1
            this.currentStep = 1;
            this.updateProgress();
            this.loadStep(1);
        }
    },

    // Update current step in backend
    async updateCurrentStep(stepNumber) {
        try {
            const response = await fetch('/api/application/update-step/' + this.sessionToken, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${AppState.user?.token}`
                },
                body: JSON.stringify({
                    stepCompleted: stepNumber,
                    extractedData: this.applicationData
                })
            });

            if (!response.ok) {
                console.error('Failed to update current step');
            }
        } catch (error) {
            console.error('Error updating current step:', error);
        }
    },

    // Update progress bar and step indicators
    updateProgress() {
        const progressFill = document.getElementById('progress-fill');
        const stepIndicators = document.querySelectorAll('.step-indicator');
        
        const progressPercentage = ((this.currentStep - 1) / (this.totalSteps - 1)) * 100;
        progressFill.style.width = `${progressPercentage}%`;
        
        stepIndicators.forEach((indicator, index) => {
            const stepNumber = index + 1;
            indicator.classList.remove('active', 'completed');
            
            if (stepNumber < this.currentStep) {
                indicator.classList.add('completed');
            } else if (stepNumber === this.currentStep) {
                indicator.classList.add('active');
            }
        });
    },

    // Go back to previous step
    goBackStep() {
        if (this.currentStep > 1) {
            this.currentStep--;
            this.updateProgress();
            this.updateCurrentStep(this.currentStep);
            this.loadStep(this.currentStep);
        }
    },

    // Load specific step content
    loadStep(stepNumber) {
        const stepContent = document.getElementById('step-content');
        const prevBtn = document.getElementById('prev-btn');
        const nextBtn = document.getElementById('next-btn');

        prevBtn.disabled = stepNumber === 1;

        switch (stepNumber) {
            case 1:
                stepContent.innerHTML = this.getStep1Content();
                nextBtn.textContent = 'Process ID';
                nextBtn.style.display = 'inline-block';
                this.initializeStep1();
                break;
            case 2:
                stepContent.innerHTML = this.getStep2Content();
                nextBtn.textContent = 'Next';
                nextBtn.style.display = 'inline-block';
                this.initializeStep2();
                break;
            case 3:
                stepContent.innerHTML = this.getStep3Content();
                nextBtn.textContent = 'Next';
                nextBtn.style.display = 'inline-block';
                this.initializeStep3();
                break;
            case 4:
                stepContent.innerHTML = this.getStep4Content();
                nextBtn.textContent = 'Next';
                nextBtn.style.display = 'inline-block';
                this.initializeStep4();
                break;
            case 5:
                stepContent.innerHTML = this.getStep5Content();
                // Hide navigation buttons for step 5 since it has its own completion button
                nextBtn.style.display = 'none';
                this.initializeStep5();
                break;
        }
    },

    // Step 1: ID Verification & Account Creation
    getStep1Content() {
        return `
            <div class="step-container">
                <h2><i class="fas fa-id-card"></i> ID Verification & Account Creation</h2>
                <p>Upload your ID document for automated data extraction and account creation.</p>
                
                <div class="form-group">
                    <label for="id-upload">Upload ID Document</label>
                    <div class="file-upload-area" id="id-upload-area">
                        <div class="file-upload-icon">
                            <i class="fas fa-cloud-upload-alt"></i>
                        </div>
                        <div class="file-upload-text">Drop your ID document here or click to browse</div>
                        <div class="file-upload-hint">Supported formats: JPG only (Max 10MB)</div>
                        <input type="file" id="id-file-input" accept=".jpg,.jpeg" style="display: none;">
                    </div>
                    <div id="id-file-list" class="file-list"></div>
                </div>

                <div id="extraction-results" class="extraction-results" style="display: none;">
                    <h3>Extracted Information</h3>
                    <div class="extracted-data-form">
                        <div class="form-row">
                            <div class="form-group">
                                <label for="extracted-first-name">First Name *</label>
                                <input type="text" id="extracted-first-name" class="form-control" placeholder="Edit if incorrect" required>
                            </div>
                            <div class="form-group">
                                <label for="extracted-surname">Surname *</label>
                                <input type="text" id="extracted-surname" class="form-control" placeholder="Edit if incorrect" required>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="extracted-id-number">ID Number *</label>
                                <input type="text" id="extracted-id-number" class="form-control" placeholder="Edit if incorrect" required>
                            </div>
                            <div class="form-group">
                                <label for="extracted-country">Country</label>
                                <input type="text" id="extracted-country" class="form-control" placeholder="Country" readonly>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="extracted-date-of-birth">Date of Birth</label>
                                <input type="date" id="extracted-date-of-birth" class="form-control">
                            </div>
                            <div class="form-group">
                                <label for="extracted-gender">Gender *</label>
                                <select id="extracted-gender" class="form-control" required>
                                    <option value="">Please select your gender</option>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                    <option value="Other">Other</option>
                                    <option value="Prefer not to say">Prefer not to say</option>
                                </select>
                            </div>
                        </div>
                        <div class="form-group">
                            <label for="user-email">Email Address</label>
                            <input type="email" id="user-email" class="form-control" placeholder="Enter your email address" required>
                        </div>
                        <div class="form-group">
                            <label for="user-phone">Phone Number</label>
                            <input type="tel" id="user-phone" class="form-control" placeholder="Enter your phone number" required>
                        </div>
                        <div class="confidence-indicator">
                            <label>Extraction Confidence: <span id="confidence-score">0%</span></label>
                            <div class="confidence-bar">
                                <div id="confidence-fill" class="confidence-fill"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="manual-entry" class="manual-entry" style="display: none;">
                    <h3>Manual Information Entry</h3>
                    <p>AI extraction failed. Please enter your information manually.</p>
                    <div class="manual-form">
                        <div class="form-row">
                            <div class="form-group">
                                <label for="manual-first-name">First Name</label>
                                <input type="text" id="manual-first-name" class="form-control" required>
                            </div>
                            <div class="form-group">
                                <label for="manual-surname">Surname</label>
                                <input type="text" id="manual-surname" class="form-control" required>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="manual-id-number">ID Number</label>
                                <input type="text" id="manual-id-number" class="form-control" required>
                            </div>
                            <div class="form-group">
                                <label for="manual-country">Country</label>
                                <select id="manual-country" class="form-control" required>
                                    <option value="">Select Country</option>
                                    <option value="South Africa">South Africa</option>
                                    <option value="Namibia">Namibia</option>
                                    <option value="Germany">Germany</option>
                                    <option value="United Kingdom">United Kingdom</option>
                                    <option value="United States">United States</option>
                                    <option value="Botswana">Botswana</option>
                                    <option value="Zimbabwe">Zimbabwe</option>
                                    <option value="Other">Other</option>
                                </select>
                                <div id="other-country-input" class="form-group" style="display: none; margin-top: 10px;">
                                    <label for="manual-other-country">Please specify country:</label>
                                    <input type="text" id="manual-other-country" class="form-control" placeholder="Enter country name">
                                </div>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="manual-date-of-birth">Date of Birth</label>
                                <input type="date" id="manual-date-of-birth" class="form-control">
                            </div>
                            <div class="form-group">
                                <label for="manual-gender">Gender *</label>
                                <select id="manual-gender" class="form-control" required>
                                    <option value="">Please select your gender</option>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                    <option value="Other">Other</option>
                                    <option value="Prefer not to say">Prefer not to say</option>
                                </select>
                            </div>
                        </div>
                        <div class="form-group">
                            <label for="manual-email">Email Address</label>
                            <input type="email" id="manual-email" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label for="manual-phone">Phone Number</label>
                            <input type="tel" id="manual-phone" class="form-control" required>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    // Step 2: Language Verification
    getStep2Content() {
        return `
            <div class="step-container">
                <h2><i class="fas fa-language"></i> Language Verification</h2>
                <p>Select your languages and provide verification certificates. <strong>German language selection requires verified certificates from accredited institutions.</strong></p>
                
                <div class="language-selection">
                    <h3>Select Your Languages</h3>
                    <div class="language-options-info">
                        <div class="info-card">
                            <i class="fas fa-info-circle"></i>
                            <strong>Important:</strong> If you select German, you must provide a certificate from an accredited institution (e.g., Goethe-Institut, TestDaF, TELC, ÖSD).
                        </div>
                    </div>
                    <div class="language-grid">
                        <label class="language-option">
                            <input type="checkbox" value="English" checked>
                            <span class="language-name">English</span>
                            <span class="language-note">(Native/No certificate required)</span>
                            <i class="fas fa-check language-check"></i>
                        </label>
                        <label class="language-option german-option">
                            <input type="checkbox" value="German" id="german-checkbox">
                            <span class="language-name">German</span>
                            <span class="language-note">(Certificate required from accredited institution)</span>
                            <i class="fas fa-check language-check"></i>
                            <i class="fas fa-certificate verification-icon"></i>
                        </label>
                        <label class="language-option both-option">
                            <input type="checkbox" value="Both" id="both-checkbox">
                            <span class="language-name">Both English & German</span>
                            <span class="language-note">(German certificate required)</span>
                            <i class="fas fa-check language-check"></i>
                        </label>
                        <label class="language-option">
                            <input type="checkbox" value="French">
                            <span class="language-name">French</span>
                            <span class="language-note">(Certificate recommended)</span>
                            <i class="fas fa-check language-check"></i>
                        </label>
                        <label class="language-option">
                            <input type="checkbox" value="Afrikaans">
                            <span class="language-name">Afrikaans</span>
                            <span class="language-note">(Certificate recommended)</span>
                            <i class="fas fa-check language-check"></i>
                        </label>
                        <label class="language-option">
                            <input type="checkbox" value="Other">
                            <span class="language-name">Other Languages</span>
                            <span class="language-note">(Please specify and provide certificate)</span>
                            <i class="fas fa-check language-check"></i>
                        </label>
                    </div>
                </div>

                <div id="german-certificate-warning" class="german-warning" style="display: none;">
                    <div class="warning-card">
                        <i class="fas fa-exclamation-triangle"></i>
                        <h4>German Certificate Required</h4>
                        <p>You have selected German language. Please upload a certificate from one of these accredited institutions:</p>
                        <ul>
                            <li><strong>Goethe-Institut</strong> (Zertifikat Deutsch, Goethe-Zertifikat)</li>
                            <li><strong>TestDaF Institute</strong> (Test Deutsch als Fremdsprache)</li>
                            <li><strong>TELC</strong> (The European Language Certificates)</li>
                            <li><strong>ÖSD</strong> (Österreichisches Sprachdiplom Deutsch)</li>
                            <li><strong>DSH</strong> (Deutsche Sprachprüfung für den Hochschulzugang)</li>
                        </ul>
                    </div>
                </div>

                <div id="language-certificates" class="language-certificates">
                    <h3>Language Certificates</h3>
                    <p>Upload certificates for verification. <span class="required">German certificates are mandatory and will be verified against our accredited institutions database.</span></p>
                    <div id="certificate-upload-areas">
                        <!-- Certificate upload areas will be dynamically added here -->
                    </div>
                </div>
            </div>
        `;
    },

    // Step 3: Certificate Analysis & Classification
    getStep3Content() {
        return `
            <div class="step-container">
                <h2><i class="fas fa-certificate"></i> Certificate Analysis & Classification</h2>
                <p>Upload all your educational and professional certificates for AI analysis.</p>
                
                <div class="certificate-upload-section">
                    <div class="file-upload-area" id="certificates-upload-area">
                        <div class="file-upload-icon">
                            <i class="fas fa-certificate"></i>
                        </div>
                        <div class="file-upload-text">Drop your certificates here or click to browse</div>
                        <div class="file-upload-hint">Supported formats: JPG, PNG, PDF (Max 10MB each)</div>
                        <input type="file" id="certificates-file-input" accept=".jpg,.jpeg,.png,.pdf" multiple style="display: none;">
                    </div>
                    <div id="certificates-file-list" class="file-list"></div>
                </div>

                <div id="certificate-analysis" class="certificate-analysis" style="display: none;">
                    <h3>Certificate Analysis Results</h3>
                    <div id="analyzed-certificates" class="analyzed-certificates">
                        <!-- Analysis results will be displayed here -->
                    </div>
                </div>
            </div>
        `;
    },

    // Step 4: Media & Introduction
    getStep4Content() {
        return `
            <div class="step-container">
                <h2><i class="fas fa-camera"></i> Media & Introduction</h2>
                <p>Upload a profile picture and record a video introduction.</p>
                
                <div class="media-upload-grid">
                    <div class="media-section">
                        <h3>Profile Picture</h3>
                        <div class="profile-picture-upload">
                            <div class="profile-preview">
                                <img id="profile-preview" src="/images/default-avatar.svg" alt="Profile Preview">
                                <div class="upload-overlay" id="profile-upload-overlay">
                                    <i class="fas fa-camera"></i>
                                    <span>Click to upload</span>
                                </div>
                                <input type="file" id="profile-picture-input" accept="image/*" style="display: none;">
                            </div>
                            <div class="upload-guidelines">
                                <h4>Guidelines:</h4>
                                <ul>
                                    <li>Professional headshot</li>
                                    <li>Clear, well-lit photo</li>
                                    <li>Neutral background preferred</li>
                                    <li>JPG or PNG format</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div class="media-section">
                        <h3>Video Introduction</h3>
                        <div class="video-upload-section">
                            <div class="video-preview" id="video-preview-container" style="display: none;">
                                <video id="video-preview" controls></video>
                            </div>
                            <div class="video-upload-area" id="video-upload-area">
                                <div class="file-upload-icon">
                                    <i class="fas fa-video"></i>
                                </div>
                                <div class="file-upload-text">Upload your video introduction</div>
                                <div class="file-upload-hint">2-3 minutes max, MP4 format preferred</div>
                                <input type="file" id="video-file-input" accept="video/*" style="display: none;">
                            </div>
                            <div class="upload-guidelines">
                                <h4>Guidelines:</h4>
                                <ul>
                                    <li>2-3 minutes maximum</li>
                                    <li>Clear audio quality</li>
                                    <li>Professional appearance</li>
                                    <li>Introduce yourself and skills</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    // Step 5: CV & Profile Finalization
    getStep5Content() {
        return `
            <div class="step-container">
                <div class="completion-header">
                    <div class="success-icon">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <h2>Application Complete!</h2>
                    <p>Your profile has been successfully created with our Traffic Light scoring system.</p>
                </div>

                <div class="completion-summary">
                    <div class="traffic-light-container">
                        <div id="final-traffic-light" class="traffic-light">
                            <!-- Traffic light will be rendered here -->
                        </div>
                    </div>

                    <div class="completion-stats">
                        <div class="stat-grid">
                            <div class="completion-stat">
                                <i class="fas fa-id-card"></i>
                                <span class="stat-label">ID Verified</span>
                                <span class="stat-status verified">✓</span>
                            </div>
                            <div class="completion-stat">
                                <i class="fas fa-language"></i>
                                <span class="stat-label">Languages</span>
                                <span class="stat-value" id="final-languages-count">0</span>
                            </div>
                            <div class="completion-stat">
                                <i class="fas fa-certificate"></i>
                                <span class="stat-label">Certificates</span>
                                <span class="stat-value" id="final-certificates-count">0</span>
                            </div>
                            <div class="completion-stat">
                                <i class="fas fa-file-pdf"></i>
                                <span class="stat-label">CV Generated</span>
                                <span class="stat-status verified">✓</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="next-steps">
                    <h3>What happens next?</h3>
                    <div class="next-steps-content">
                        <div class="step-item">
                            <div class="step-number">1</div>
                            <div class="step-description">
                                <strong>Check your email</strong> for login credentials and access link
                            </div>
                        </div>
                        <div class="step-item">
                            <div class="step-number">2</div>
                            <div class="step-description">
                                <strong>Login to your dashboard</strong> to view and edit your profile
                            </div>
                        </div>
                        <div class="step-item">
                            <div class="step-number">3</div>
                            <div class="step-description">
                                <strong>Download your CV</strong> and share your profile with employers
                            </div>
                        </div>
                        <div class="step-item">
                            <div class="step-number">4</div>
                            <div class="step-description">
                                <strong>Continue improving</strong> your Traffic Light score
                            </div>
                        </div>
                    </div>
                </div>

                <div class="completion-actions">
                    <button class="btn btn-primary btn-complete" onclick="completeApplication()">
                        <i class="fas fa-check"></i> Complete Application
                    </button>
                </div>
            </div>
        `;
    },

    // Initialize step-specific functionality
    initializeStep1() {
        const uploadArea = document.getElementById('id-upload-area');
        const fileInput = document.getElementById('id-file-input');
        const fileList = document.getElementById('id-file-list');

        // File upload handling
        uploadArea.addEventListener('click', () => fileInput.click());
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleIDUpload(files[0]);
            }
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleIDUpload(e.target.files[0]);
            }
        });

        // Handle country dropdown change for "Other" option
        setTimeout(() => {
            const countrySelect = document.getElementById('manual-country');
            const otherCountryInput = document.getElementById('other-country-input');
            
            if (countrySelect && otherCountryInput) {
                countrySelect.addEventListener('change', (e) => {
                    if (e.target.value === 'Other') {
                        otherCountryInput.style.display = 'block';
                        document.getElementById('manual-other-country').required = true;
                    } else {
                        otherCountryInput.style.display = 'none';
                        document.getElementById('manual-other-country').required = false;
                    }
                });
            }
        }, 100);
    },

    initializeStep2() {
        const languageOptions = document.querySelectorAll('.language-option input[type="checkbox"]');
        const germanWarning = document.getElementById('german-certificate-warning');
        
        languageOptions.forEach(option => {
            option.addEventListener('change', () => {
                // Handle German certificate warning
                const selectedLanguages = Array.from(document.querySelectorAll('.language-option input:checked'))
                    .map(input => input.value);
                    
                const requiresGermanCert = selectedLanguages.includes('German') || selectedLanguages.includes('Both');
                
                if (germanWarning) {
                    germanWarning.style.display = requiresGermanCert ? 'block' : 'none';
                }
                
                // Handle mutual exclusivity between "German", "Both", and other languages
                if (option.value === 'Both' && option.checked) {
                    // Uncheck German and English when Both is selected
                    document.querySelectorAll('input[value="German"], input[value="English"]:not([value="Both"])').forEach(input => {
                        if (input.value !== 'Both') {
                            input.checked = false;
                        }
                    });
                } else if (option.value === 'German' && option.checked) {
                    // Uncheck Both when German is selected
                    document.querySelector('input[value="Both"]').checked = false;
                }
                
                this.updateLanguageCertificates();
            });
        });
        
        this.updateLanguageCertificates();
    },

    initializeStep3() {
        const uploadArea = document.getElementById('certificates-upload-area');
        const fileInput = document.getElementById('certificates-file-input');

        uploadArea.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleCertificatesUpload(Array.from(e.target.files));
            }
        });
    },

    initializeStep4() {
        // Profile picture upload
        const profileOverlay = document.getElementById('profile-upload-overlay');
        const profileInput = document.getElementById('profile-picture-input');
        const profilePreview = document.getElementById('profile-preview');

        profileOverlay.addEventListener('click', () => profileInput.click());
        profileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleProfilePictureUpload(e.target.files[0]);
            }
        });

        // Video upload
        const videoArea = document.getElementById('video-upload-area');
        const videoInput = document.getElementById('video-file-input');

        videoArea.addEventListener('click', () => videoInput.click());
        videoInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleVideoUpload(e.target.files[0]);
            }
        });
    },

    // File upload handlers
    async handleIDUpload(file) {
        Utils.showLoading('Processing ID document with AI...');

        try {
            const formData = new FormData();
            formData.append('id_document', file);

            console.log('🤖 Uploading ID document for AI processing...');
            const response = await fetch('/api/application-enhanced/step1/process-id', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (response.ok && data.success && data.extractedData) {
                console.log('✅ ID processing successful:', data);
                console.log('📄 Extracted data:', data.extractedData);
                
                // Store extracted data for account creation
                this.applicationData.extractedData = data.extractedData;
                
                // Force show extraction results div
                const extractionResults = document.getElementById('extraction-results');
                const manualEntry = document.getElementById('manual-entry');
                
                if (extractionResults) {
                    extractionResults.style.display = 'block';
                    console.log('✅ extraction-results div shown');
                } else {
                    console.error('❌ extraction-results div not found!');
                }
                
                // Hide manual entry form if it was showing
                if (manualEntry) {
                    manualEntry.style.display = 'none';
                }
                
                // Display the extracted data in the form fields
                this.displayExtractedData(data.extractedData);
                
                // Show success message with next step instructions
                Utils.showToast('ID document processed successfully! Please confirm your information and provide email/phone to create your account.', 'success');
                
                // Update next button to show account creation
                const nextBtn = document.getElementById('next-btn');
                if (nextBtn) {
                    nextBtn.textContent = 'Create Account';
                }
                
            } else if (data.requiresManualEntry) {
                console.log('⚠️ AI extraction failed, switching to manual entry');
                Utils.showToast('AI extraction failed. Please enter your information manually.', 'warning');
                this.showManualEntry();
            } else {
                throw new Error(data.error || data.details || 'Processing failed');
            }

        } catch (error) {
            console.error('ID processing error:', error);
            Utils.showToast('AI extraction failed. Please enter your information manually.', 'warning');
            this.showManualEntry();
        } finally {
            Utils.hideLoading();
        }
    },

    async handleCertificatesUpload(files) {
        Utils.showLoading('Analyzing certificates...');

        try {
            const formData = new FormData();
            files.forEach(file => {
                formData.append('certificates', file);
            });

            const response = await fetch('/api/documents/certificates/upload', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${AppState.user?.token}`
                },
                body: formData
            });

            const data = await response.json();

            if (response.ok) {
                this.displayCertificateAnalysis(data.certificates);
                Utils.showToast(`${files.length} certificates processed`, 'success');
            } else {
                throw new Error(data.error || 'Upload failed');
            }
        } catch (error) {
            console.error('Certificate upload error:', error);
            Utils.showToast('Error processing certificates', 'error');
        } finally {
            Utils.hideLoading();
        }
    },

    async handleProfilePictureUpload(file) {
        Utils.showLoading('Uploading profile picture...');

        try {
            const formData = new FormData();
            formData.append('profile_picture', file);

            const response = await fetch('/api/documents/media/upload', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${AppState.user?.token}`
                },
                body: formData
            });

            const data = await response.json();

            if (response.ok) {
                const preview = document.getElementById('profile-preview');
                const reader = new FileReader();

                reader.onload = (e) => {
                    preview.src = e.target.result;
                    // Also update the profile icon in the header if exists
                    const profileIcon = document.getElementById('header-profile-icon');
                    if (profileIcon) {
                        profileIcon.src = e.target.result;
                    }
                };
                reader.readAsDataURL(file);

                Utils.showToast('Profile picture uploaded successfully', 'success');
            } else {
                throw new Error(data.error || 'Upload failed');
            }
        } catch (error) {
            console.error('Profile picture upload error:', error);
            Utils.showToast('Error uploading profile picture', 'error');
        } finally {
            Utils.hideLoading();
        }
    },

    async handleVideoUpload(file) {
        Utils.showLoading('Uploading video...');

        try {
            const formData = new FormData();
            formData.append('video', file);

            const response = await fetch('/api/documents/media/upload', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${AppState.user?.token}`
                },
                body: formData
            });

            const data = await response.json();

            if (response.ok) {
                const previewContainer = document.getElementById('video-preview-container');
                const preview = document.getElementById('video-preview');
                const uploadArea = document.getElementById('video-upload-area');

                // Show video link below upload area
                const videoLinkContainer = document.getElementById('video-link-container');
                if (!videoLinkContainer) {
                    const container = document.createElement('div');
                    container.id = 'video-link-container';
                    container.style.marginTop = '10px';
                    uploadArea.parentNode.insertBefore(container, uploadArea.nextSibling);
                }
                const videoUrl = URL.createObjectURL(file);
                const linkHtml = `<a href="${videoUrl}" target="_blank" rel="noopener noreferrer">View uploaded video</a>`;
                document.getElementById('video-link-container').innerHTML = linkHtml;

                const reader = new FileReader();
                reader.onload = (e) => {
                    preview.src = e.target.result;
                    previewContainer.style.display = 'block';
                    uploadArea.style.display = 'none';
                };
                reader.readAsDataURL(file);

                Utils.showToast('Video uploaded successfully', 'success');
            } else {
                throw new Error(data.error || 'Upload failed');
            }
        } catch (error) {
            console.error('Video upload error:', error);
            Utils.showToast('Error uploading video', 'error');
        } finally {
            Utils.hideLoading();
        }
    },

    initializeStep5() {
        // Initialize final traffic light and stats
        this.loadCompletionData();
    },

    // Simulation functions (replace with real API calls)
    async simulateIDProcessing(file) {
        return new Promise((resolve) => {
            setTimeout(() => {
                // Simulate AI extraction with varying confidence
                const confidence = Math.random() * 0.4 + 0.6; // 60-100%
                
                const extractedData = {
                    first_name: 'John',
                    surname: 'Doe',
                    id_number: '8901015800083',
                    country: 'South Africa',
                    confidence: confidence
                };
                
                this.displayExtractedData(extractedData);
                resolve(extractedData);
            }, 2000);
        });
    },

    async simulateCertificateProcessing(files) {
        return new Promise((resolve) => {
            setTimeout(() => {
                const results = files.map((file, index) => ({
                    filename: file.name,
                    type: ['academic', 'professional', 'language'][index % 3],
                    classification: ['degree', 'certificate', 'diploma'][index % 3],
                    institution: ['University of Cape Town', 'Goethe Institute', 'Microsoft'][index % 3],
                    authenticity_score: Math.floor(Math.random() * 30) + 70,
                    is_verified: Math.random() > 0.3,
                    field_of_study: ['Computer Science', 'German Language', 'Cloud Computing'][index % 3]
                }));
                resolve(results);
            }, 3000);
        });
    },

    // Display functions
    displayExtractedData(data) {
        console.log('📋 displayExtractedData called with data:', data);
        
        // Wait a moment for DOM to be ready if needed
        setTimeout(() => {
            // Check if extraction-results div exists
            const extractionResults = document.getElementById('extraction-results');
            console.log('🔍 extraction-results element:', extractionResults);
            
            // Check if form elements exist
            const elements = {
                firstName: document.getElementById('extracted-first-name'),
                surname: document.getElementById('extracted-surname'),
                idNumber: document.getElementById('extracted-id-number'),
                country: document.getElementById('extracted-country'),
                dateOfBirth: document.getElementById('extracted-date-of-birth'),
                gender: document.getElementById('extracted-gender')
            };
            
            console.log('🔍 Form elements check:', elements);
            
            // Fill in the extracted data
            if (elements.firstName) {
                elements.firstName.value = data.first_name || '';
                console.log('✅ First name set to:', data.first_name);
            }
            
            if (elements.surname) {
                elements.surname.value = data.surname || '';
                console.log('✅ Surname set to:', data.surname);
            }
            
            if (elements.idNumber) {
                elements.idNumber.value = data.id_number || '';
                console.log('✅ ID Number set to:', data.id_number);
            }
            
            if (elements.country) {
                elements.country.value = data.country || 'REPUBLIC OF NAMIBIA';
                console.log('✅ Country set to:', data.country);
            }
            
            if (elements.dateOfBirth) {
                elements.dateOfBirth.value = data.date_of_birth || '';
                console.log('✅ Date of birth set to:', data.date_of_birth);
            }
            
            // Handle gender field - user must select this
            if (elements.gender && data.gender) {
                elements.gender.value = data.gender;
                console.log('✅ Gender set to:', data.gender);
            }
            
            console.log('✅ All extracted data has been filled into the form fields');
            
        }, 100); // Small delay to ensure DOM is ready
        
        const confidenceScore = document.getElementById('confidence-score');
        const confidenceFill = document.getElementById('confidence-fill');
        
        const percentage = Math.round(data.confidence * 100);
        confidenceScore.textContent = `${percentage}%`;
        confidenceFill.style.width = `${percentage}%`;
        
        if (percentage >= 80) {
            confidenceFill.style.background = 'var(--success-color)';
        } else if (percentage >= 60) {
            confidenceFill.style.background = 'var(--warning-color)';
        } else {
            confidenceFill.style.background = 'var(--danger-color)';
        }
        
        document.getElementById('extraction-results').style.display = 'block';
        this.applicationData.extractedData = data;
    },

    // Check if extracted data is valid (high confidence and not dummy data)
    isValidExtraction(data) {
        // Check confidence level (must be at least 60%)
        if (!data.confidence || data.confidence < 0.6) {
            return false;
        }

        // Check for dummy/placeholder data
        const dummyNames = ['john', 'jane', 'doe', 'smith', 'test', 'user', 'sample'];
        const firstName = data.first_name?.toLowerCase().trim();
        const surname = data.surname?.toLowerCase().trim();

        if (dummyNames.includes(firstName) || dummyNames.includes(surname)) {
            return false;
        }

        // Check for obviously invalid data
        if (!data.first_name || !data.surname || !data.id_number || !data.country) {
            return false;
        }

        // Check if ID number looks like a placeholder
        if (data.id_number === '8901015800083' || data.id_number.length < 5) {
            return false;
        }

        return true;
    },

    showManualEntry() {
        document.getElementById('manual-entry').style.display = 'block';
        document.getElementById('extraction-results').style.display = 'none';
    },

    // Save manual entry data
    async saveManualEntry() {
        try {
            const formData = this.getFormData(true); // true for manual entry

            const response = await fetch('/api/documents/manual-entry', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${AppState.user?.token}`
                },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (response.ok) {
                this.applicationData.manualData = formData;
                Utils.showToast('Manual entry data saved successfully', 'success');
                return data;
            } else {
                throw new Error(data.error || 'Failed to save manual entry');
            }
        } catch (error) {
            console.error('Manual entry save error:', error);
            Utils.showToast('Error saving manual entry data', 'error');
            throw error;
        }
    },

    async updateLanguageCertificates() {
        const selectedLanguages = Array.from(document.querySelectorAll('.language-option input:checked'))
            .map(input => input.value);

        // Save languages to backend using enhanced route
        if (AppState.user && AppState.user.token && selectedLanguages.length > 0) {
            try {
                console.log('🌍 Saving language selection:', selectedLanguages);
                
                // Determine the language format for the API
                let languageSelection;
                if (selectedLanguages.includes('English') && selectedLanguages.includes('German')) {
                    languageSelection = 'Both';
                } else if (selectedLanguages.includes('German')) {
                    languageSelection = 'German';
                } else {
                    languageSelection = 'English';
                }

                const response = await fetch('/api/application-enhanced/step2/languages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${AppState.user.token}`
                    },
                    body: JSON.stringify({ 
                        languages: languageSelection,
                        selectedLanguageList: selectedLanguages 
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    this.applicationData.languages = selectedLanguages;
                    console.log('✅ Languages saved successfully:', data);
                    Utils.showToast('Languages saved successfully', 'success');
                } else {
                    const errorData = await response.json();
                    console.error('Failed to save languages:', errorData);
                    Utils.showToast('Failed to save languages: ' + (errorData.error || 'Unknown error'), 'warning');
                }
            } catch (error) {
                console.error('Error saving languages:', error);
                Utils.showToast('Error saving languages: ' + error.message, 'error');
            }
        }

        const certificateContainer = document.getElementById('certificate-upload-areas');
        certificateContainer.innerHTML = '';

        const nativeLanguages = ['English']; // Add more native languages as needed

        selectedLanguages.forEach(language => {
            if (!nativeLanguages.includes(language) && language !== 'Other') {
                const uploadArea = document.createElement('div');
                uploadArea.innerHTML = `
                    <div class="language-certificate-upload">
                        <h4>${language} Certificate</h4>
                        <div class="file-upload-area" data-language="${language}">
                            <div class="file-upload-icon"><i class="fas fa-certificate"></i></div>
                            <div class="file-upload-text">Upload ${language} certificate</div>
                            <div class="file-upload-hint">PDF, JPG, PNG accepted</div>
                            <input type="file" accept=".jpg,.jpeg,.png,.pdf" style="display: none;">
                        </div>
                        <div class="certificate-status" style="display: none;">
                            <span class="status-text">Certificate uploaded</span>
                            <i class="fas fa-check status-icon"></i>
                        </div>
                    </div>
                `;

                const fileArea = uploadArea.querySelector('.file-upload-area');
                const fileInput = uploadArea.querySelector('input[type="file"]');

                fileArea.addEventListener('click', () => fileInput.click());
                fileInput.addEventListener('change', (e) => {
                    if (e.target.files.length > 0) {
                        const statusDiv = uploadArea.querySelector('.certificate-status');
                        statusDiv.style.display = 'flex';
                        fileArea.style.display = 'none';
                        Utils.showToast(`${language} certificate uploaded`, 'success');
                    }
                });

                certificateContainer.appendChild(uploadArea);
            }
        });
    },

    displayCertificateAnalysis(results) {
        const container = document.getElementById('analyzed-certificates');
        
        const analysisHtml = results.map(cert => `
            <div class="certificate-analysis-card">
                <div class="certificate-header">
                    <div class="certificate-name">${cert.filename || cert.holderName || 'Certificate'}</div>
                    <div class="certificate-type ${cert.classification || 'unknown'}">
                        ${cert.type || 'Unknown Type'}
                    </div>
                </div>
                <div class="certificate-details">
                    <div class="detail-row">
                        <span class="label">Institution:</span>
                        <span class="value ${cert.isAccredited ? 'accredited' : 'unaccredited'}">
                            ${cert.institution || 'Not identified'}
                            ${cert.isAccredited ? '<i class="fas fa-certificate verified-icon"></i>' : ''}
                        </span>
                    </div>
                    <div class="detail-row">
                        <span class="label">Subject/Field:</span>
                        <span class="value">${cert.subject || cert.field_of_study || 'Not specified'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="label">Date Issued:</span>
                        <span class="value">${cert.dateIssued || 'Not found'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="label">Grade/Level:</span>
                        <span class="value">${cert.grade || 'Not specified'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="label">Holder Name:</span>
                        <span class="value">${cert.holderName || 'Not identified'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="label">Classification:</span>
                        <span class="value certificate-classification ${cert.classification}">
                            ${cert.classification === 'academic' ? '🎓 Academic' : 
                              cert.classification === 'professional' ? '💼 Professional' :
                              cert.classification === 'reference' ? '📝 Reference Letter' : '❓ Unclassified'}
                        </span>
                    </div>
                </div>
                <div class="certificate-verification">
                    <div class="authenticity-score">
                        <span class="score-label">Authenticity Score:</span>
                        <div class="score-bar">
                            <div class="score-fill ${this.getScoreClass(cert.authenticityScore || cert.authenticity_score)}" 
                                 style="width: ${cert.authenticityScore || cert.authenticity_score || 0}%"></div>
                        </div>
                        <span class="score-value">${cert.authenticityScore || cert.authenticity_score || 0}%</span>
                    </div>
                    <div class="verification-details">
                        ${cert.verificationDetails ? this.renderVerificationDetails(cert.verificationDetails) : ''}
                    </div>
                    <div class="verification-status ${(cert.is_verified || cert.authenticityScore > 70) ? 'verified' : 'pending'}">
                        <i class="fas ${(cert.is_verified || cert.authenticityScore > 70) ? 'fa-check-circle' : 'fa-clock'}"></i>
                        <span>${(cert.is_verified || cert.authenticityScore > 70) ? 'Verified' : 'Pending Verification'}</span>
                    </div>
                </div>
            </div>
        `).join('');
        
        container.innerHTML = analysisHtml;
        document.getElementById('certificate-analysis').style.display = 'block';
        
        this.applicationData.certificates = results;
    },
    
    renderVerificationDetails(details) {
        if (!details) return '';
        
        const checks = [
            { key: 'institutionFound', label: 'Institution Verified', icon: 'fa-university' },
            { key: 'dateFormatValid', label: 'Valid Date Format', icon: 'fa-calendar' },
            { key: 'gradePresent', label: 'Grade Information', icon: 'fa-award' },
            { key: 'certificateStructureValid', label: 'Valid Structure', icon: 'fa-file-certificate' }
        ];
        
        const checksHtml = checks.map(check => `
            <div class="verification-check ${details[check.key] ? 'passed' : 'failed'}">
                <i class="fas ${check.icon}"></i>
                <span>${check.label}</span>
                <i class="fas ${details[check.key] ? 'fa-check' : 'fa-times'} status-icon"></i>
            </div>
        `).join('');
        
        return `
            <div class="verification-checks">
                <h5>Verification Checks:</h5>
                ${checksHtml}
            </div>
        `;
    },

    getScoreClass(score) {
        if (score >= 80) return 'high';
        if (score >= 60) return 'medium';
        return 'low';
    },

    loadCompletionData() {
        // Simulate completion data
        const completionData = {
            languages: this.applicationData.languages || ['English', 'German'],
            certificates: this.applicationData.certificates || [],
            trafficLightScore: 83
        };
        
        // Update counts
        document.getElementById('final-languages-count').textContent = completionData.languages.length;
        document.getElementById('final-certificates-count').textContent = completionData.certificates.length;
        
        // Initialize traffic light
        TrafficLight.initializeDemoTrafficLight();
    },

    // Account creation after ID processing
    async createAccount() {
        try {
            Utils.showLoading('Creating your account...');

            // Get data from either extracted or manual forms
            const isManual = document.getElementById('manual-entry').style.display !== 'none';
            
            let response, data;
            
            if (isManual) {
                // Manual entry flow
                const formData = this.getFormData(true);
                console.log('✋ Creating account with manual entry...');
                
                response = await fetch('/api/application-enhanced/step1/manual-entry', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(formData)
                });
            } else {
                // Extracted data flow - confirm and create account
                const formData = this.getFormData(false);
                console.log('📝 Form data from frontend:', formData);
                
                // Include extracted data confidence and other metadata
                // Form data should override extracted data (especially gender which user selects)
                const accountData = {
                    ...this.applicationData.extractedData,
                    ...formData,  // Form data takes priority
                    manual_entry: false
                };
                
                console.log('✨ Creating account with extracted data:', accountData);
                response = await fetch('/api/application-enhanced/step1/confirm-and-create-account', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(accountData)
                });
            }

            data = await response.json();

            if (response.ok && data.success) {
                console.log('✅ Account created successfully:', data.user.username);
                // Store user data with token
                AppState.user = data.user;
                localStorage.setItem('jobscooter_user', JSON.stringify(data.user));

                const emailStatus = data.emailSent ? 'Check your email for login details!' : 'Account created!';
                Utils.showToast(`Account created successfully! ${emailStatus}`, 'success');
                
                // Show credentials in console for development
                if (data.credentials) {
                    console.log('🔑 Login credentials:');
                    console.log('Username:', data.credentials.username);
                    console.log('Temporary Password:', data.credentials.temporaryPassword);
                }
                
                return data;
            } else {
                console.error('❌ Server validation error:', data);
                const errorMsg = data.error || 'Account creation failed';
                const detailsMsg = data.required ? ` Missing: ${data.required.join(', ')}` : '';
                throw new Error(errorMsg + detailsMsg);
            }

        } catch (error) {
            console.error('Account creation error:', error);
            Utils.showToast('Error creating account: ' + error.message, 'error');
            throw error;
        } finally {
            Utils.hideLoading();
        }
    },

    getFormData(isManual) {
        const prefix = isManual ? 'manual-' : 'extracted-';
        console.log('🔍 Getting form data, isManual:', isManual, 'prefix:', prefix);
        
        // Debug: Check if elements exist
        const firstNameEl = document.getElementById(`${prefix}first-name`);
        const surnameEl = document.getElementById(`${prefix}surname`);
        const idNumberEl = document.getElementById(`${prefix}id-number`);
        const dateOfBirthEl = document.getElementById(`${prefix}date-of-birth`);
        const genderEl = document.getElementById(`${prefix}gender`);
        const emailEl = document.getElementById(isManual ? 'manual-email' : 'user-email');
        const phoneEl = document.getElementById(isManual ? 'manual-phone' : 'user-phone');
        
        console.log('🔍 Element checks:');
        console.log('First name element:', firstNameEl, firstNameEl ? '✅ Found' : '❌ Missing', 'value:', firstNameEl?.value);
        console.log('Surname element:', surnameEl, surnameEl ? '✅ Found' : '❌ Missing', 'value:', surnameEl?.value);
        console.log('ID number element:', idNumberEl, idNumberEl ? '✅ Found' : '❌ Missing', 'value:', idNumberEl?.value);
        console.log('Date of birth element:', dateOfBirthEl, dateOfBirthEl ? '✅ Found' : '❌ Missing', 'value:', dateOfBirthEl?.value);
        console.log('Gender element:', genderEl, genderEl ? '✅ Found' : '❌ Missing', 'value:', genderEl?.value);
        console.log('Email element:', emailEl, emailEl ? '✅ Found' : '❌ Missing', 'value:', emailEl?.value);
        console.log('Phone element:', phoneEl, phoneEl ? '✅ Found' : '❌ Missing', 'value:', phoneEl?.value);
        
        // Alert if critical elements are missing
        if (!genderEl) {
            console.error('❌ CRITICAL: Gender element not found! Looking for ID:', `${prefix}gender`);
            console.error('Available elements with gender in ID:');
            document.querySelectorAll('[id*="gender"]').forEach(el => {
                console.log('  Found element:', el.id, el);
            });
        }
        
        // Handle country field - for extracted form, it's a readonly input, not a select
        let country = '';
        if (isManual) {
            const countrySelect = document.getElementById('manual-country');
            country = countrySelect ? countrySelect.value : '';
            console.log('Country select element:', countrySelect, 'value:', country);
            
            // Handle "Other" country option for manual entry
            if (country === 'Other') {
                const otherCountryInput = document.getElementById('manual-other-country');
                country = otherCountryInput ? otherCountryInput.value : 'Other';
            }
        } else {
            // For extracted form, country is a readonly input
            const countryInput = document.getElementById('extracted-country');
            country = countryInput ? countryInput.value : '';
            console.log('Country input element:', countryInput, 'value:', country);
        }
        
        const formData = {
            first_name: firstNameEl?.value || '',
            surname: surnameEl?.value || '',
            id_number: idNumberEl?.value || '',
            country: country,
            date_of_birth: dateOfBirthEl?.value || '',
            gender: genderEl?.value || '',
            email: emailEl?.value || '',
            phone: phoneEl?.value || ''
        };
        
        console.log('📋 Final form data:', formData);
        return formData;
    },

    async simulateAccountCreation(data) {
        return new Promise((resolve) => {
            setTimeout(() => {
                const accountData = {
                    ...data,
                    username: `user_${Date.now()}`,
                    password: 'temp_password_123',
                    token: 'demo_jwt_token_' + Date.now()
                };

                // Store user data
                AppState.user = accountData;
                localStorage.setItem('jobscooter_user', JSON.stringify(accountData));

                resolve(accountData);
            }, 1500);
        });
    },

    // Login functionality
    async loginUser(credentials) {
        try {
            Utils.showLoading('Logging in...');

            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(credentials)
            });

            const data = await response.json();

            if (response.ok) {
                // Store user data
                AppState.user = data.user;
                localStorage.setItem('jobscooter_user', JSON.stringify(data.user));

                Utils.showToast('Login successful!', 'success');
                return data;
            } else {
                throw new Error(data.error || 'Login failed');
            }
        } catch (error) {
            console.error('Login error:', error);
            Utils.showToast('Login failed: ' + error.message, 'error');
            throw error;
        } finally {
            Utils.hideLoading();
        }
    },
    
    // Helper function to highlight missing form fields
    highlightMissingFields(formData, isManual) {
        const prefix = isManual ? 'manual-' : 'extracted-';
        const fieldMappings = {
            first_name: `${prefix}first-name`,
            surname: `${prefix}surname`,
            id_number: `${prefix}id-number`,
            country: isManual ? 'manual-country' : 'extracted-country',
            date_of_birth: `${prefix}date-of-birth`,
            gender: `${prefix}gender`,
            email: isManual ? 'manual-email' : 'user-email',
            phone: isManual ? 'manual-phone' : 'user-phone'
        };
        
        // Clear previous errors
        this.clearFieldErrors(isManual);
        
        // Highlight missing fields
        Object.keys(fieldMappings).forEach(fieldKey => {
            if (!formData[fieldKey]) {
                const elementId = fieldMappings[fieldKey];
                const element = document.getElementById(elementId);
                
                if (element) {
                    element.classList.add('error');
                    const formGroup = element.closest('.form-group');
                    if (formGroup) {
                        formGroup.classList.add('has-error');
                    }
                    
                    console.log(`🔴 Highlighted missing field: ${fieldKey} (${elementId})`);
                } else {
                    console.warn(`⚠️ Could not find element to highlight: ${elementId}`);
                }
            }
        });
    },
    
    // Helper function to clear field error highlighting
    clearFieldErrors(isManual) {
        const allFields = document.querySelectorAll('.form-control');
        allFields.forEach(field => {
            field.classList.remove('error');
        });
        
        const allFormGroups = document.querySelectorAll('.form-group');
        allFormGroups.forEach(group => {
            group.classList.remove('has-error');
        });
    }
};

// Navigation functions
function nextStep() {
    const currentStep = Application.currentStep;

    if (currentStep === 1) {
        // Validate step 1 and create account
        const extractionResults = document.getElementById('extraction-results');
        const manualEntry = document.getElementById('manual-entry');

        // Check if either extraction results or manual entry is visible
        if (extractionResults.style.display === 'none' && manualEntry.style.display === 'none') {
            Utils.showToast('Please upload an ID document first', 'warning');
            return;
        }

        // Validate form data before proceeding
        const isManual = manualEntry.style.display !== 'none';
        const formData = Application.getFormData(isManual);

        // Check required fields with detailed logging
        console.log('🔍 Validating form data:', formData);
        console.log('🔍 Required field checks:');
        console.log('  first_name:', formData.first_name, '✅' + (formData.first_name ? 'OK' : 'MISSING'));
        console.log('  surname:', formData.surname, '✅' + (formData.surname ? 'OK' : 'MISSING'));
        console.log('  email:', formData.email, '✅' + (formData.email ? 'OK' : 'MISSING'));
        console.log('  phone:', formData.phone, '✅' + (formData.phone ? 'OK' : 'MISSING'));
        console.log('  country:', formData.country, '✅' + (formData.country ? 'OK' : 'MISSING'));
        console.log('  id_number:', formData.id_number, '✅' + (formData.id_number ? 'OK' : 'MISSING'));
        console.log('  gender:', formData.gender, '✅' + (formData.gender ? 'OK' : 'MISSING'));
        
        const missingFields = [];
        if (!formData.first_name) missingFields.push('first name');
        if (!formData.surname) missingFields.push('surname');
        if (!formData.email) missingFields.push('email');
        if (!formData.phone) missingFields.push('phone');
        if (!formData.country) missingFields.push('country');
        if (!formData.id_number) missingFields.push('ID number');
        if (!formData.gender) missingFields.push('gender');
        
        if (missingFields.length > 0) {
            console.error('❌ Missing required fields:', missingFields);
            
            // Highlight missing fields
            Application.highlightMissingFields(formData, isManual);
            
            Utils.showToast(`Please fill in all required fields. Missing: ${missingFields.join(', ')}`, 'warning');
            return;
        }
        
        // Clear any previous error highlighting
        Application.clearFieldErrors(isManual);

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData.email)) {
            Utils.showToast('Please enter a valid email address', 'warning');
            return;
        }

        Application.createAccount().then(() => {
            Application.currentStep++;
            Application.updateProgress();
            Application.updateCurrentStep(Application.currentStep);
            Application.loadStep(Application.currentStep);
        }).catch(error => {
            console.error('Error creating account:', error);
            Utils.showToast('Failed to create account. Please try again.', 'error');
        });
    } else if (currentStep < Application.totalSteps) {
        Application.currentStep++;
        Application.updateProgress();
        Application.updateCurrentStep(Application.currentStep);
        Application.loadStep(Application.currentStep);
    } else if (currentStep === Application.totalSteps) {
        // On final step, do nothing - user should use the Complete Application button
        return;
    } else {
        // Complete application (fallback)
        completeApplication();
    }
}

function previousStep() {
    Application.goBackStep();
}

function completeApplication() {
    Utils.showToast('Application completed successfully!', 'success');
    // Redirect to dashboard after completion
    setTimeout(() => {
        Dashboard.loadDashboard();
    }, 2000);
}

function goToDashboard() {
    Dashboard.loadDashboard();
}

function downloadCV() {
    Utils.showToast('CV download would start here', 'info');
    // Implement CV download functionality
}

// Export functions
window.nextStep = nextStep;
window.previousStep = previousStep;
window.goToDashboard = goToDashboard;
window.downloadCV = downloadCV;
window.Application = Application;