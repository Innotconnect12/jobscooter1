// JobScooter Dashboard Management System

const Dashboard = {
    user: null,
    profileData: null,
    currentTab: 'overview',

    // Load and display dashboard
    async loadDashboard() {
        try {
            // Check if user is logged in
            if (!AppState.user || !AppState.user.token) {
                Utils.showToast('Please log in first', 'warning');
                Utils.showPage('landing-page');
                return;
            }

            this.user = AppState.user;
            Utils.showLoading('Loading your dashboard...');

            // Fetch user profile data
            await this.fetchProfileData();

            // Switch to dashboard page
            Utils.showPage('dashboard-page');

            // Initialize dashboard components
            await this.initializeDashboard();

            Utils.hideLoading();
        } catch (error) {
            Utils.hideLoading();
            console.error('Dashboard loading error:', error);
            Utils.showToast('Error loading dashboard: ' + error.message, 'error');
        }
    },

    // Fetch user profile data from API
    async fetchProfileData() {
        try {
            const response = await Utils.apiCall('/api/profile/dashboard');
            this.profileData = response.data;
        } catch (error) {
            console.error('Error fetching profile data:', error);
            throw error;
        }
    },

    // Initialize dashboard components
    async initializeDashboard() {
        // Update profile information
        this.updateProfileDisplay();
        
        // Update traffic light status
        this.updateTrafficLightStatus();
        
        // Update statistics
        this.updateStatistics();
        
        // Load default tab content
        await this.loadTabContent(this.currentTab);
        
        // Initialize event listeners
        this.initializeEventListeners();
    },

    // Update profile display
    updateProfileDisplay() {
        if (!this.profileData) return;

        const profileName = document.getElementById('profile-name');
        const profileEmail = document.getElementById('profile-email');
        const profileImg = document.getElementById('profile-img');
        const completionPercentage = document.getElementById('completion-percentage');

        if (profileName) {
            profileName.textContent = `${this.profileData.first_name} ${this.profileData.surname}`;
        }
        
        if (profileEmail) {
            profileEmail.textContent = this.profileData.email;
        }
        
        if (profileImg && this.profileData.profile_picture_url) {
            profileImg.src = this.profileData.profile_picture_url;
        }
        
        if (completionPercentage) {
            completionPercentage.textContent = `${this.profileData.completion_percentage}%`;
        }
    },

    // Update traffic light status display
    updateTrafficLightStatus() {
        if (!this.profileData) return;

        const trafficLight = document.getElementById('traffic-light');
        if (!trafficLight) return;

        const status = this.profileData.traffic_light_status || 'red';
        const score = this.profileData.traffic_light_score || 0;

        trafficLight.innerHTML = this.generateTrafficLightHTML(status, score);
    },

    // Generate traffic light HTML
    generateTrafficLightHTML(status, score) {
        const statusMessages = {
            green: 'Ready for Employers',
            yellow: 'Good Progress',
            red: 'Needs Improvement'
        };

        const statusIcons = {
            green: 'fas fa-check-circle',
            yellow: 'fas fa-exclamation-triangle',
            red: 'fas fa-times-circle'
        };

        return `
            <div class="traffic-light ${status}">
                <div class="traffic-light-icon">
                    <i class="${statusIcons[status]}"></i>
                </div>
                <div class="traffic-light-content">
                    <div class="traffic-light-status">${statusMessages[status]}</div>
                    <div class="traffic-light-score">Score: ${score}%</div>
                </div>
            </div>
        `;
    },

    // Update statistics
    updateStatistics() {
        if (!this.profileData) return;

        const certificatesCount = document.getElementById('certificates-count');
        const languagesCount = document.getElementById('languages-count');

        if (certificatesCount) {
            certificatesCount.textContent = this.profileData.certificates_count || 0;
        }
        
        if (languagesCount) {
            languagesCount.textContent = this.profileData.languages_count || 0;
        }
    },

    // Load tab content
    async loadTabContent(tabName) {
        this.currentTab = tabName;

        try {
            switch (tabName) {
                case 'overview':
                    await this.loadOverviewTab();
                    break;
                case 'certificates':
                    await this.loadCertificatesTab();
                    break;
                case 'profile':
                    await this.loadProfileTab();
                    break;
                case 'public':
                    await this.loadPublicTab();
                    break;
                default:
                    console.error('Unknown tab:', tabName);
            }
        } catch (error) {
            console.error('Error loading tab content:', error);
            Utils.showToast('Error loading tab content', 'error');
        }
    },

    // Load overview tab
    async loadOverviewTab() {
        const tabPanel = document.getElementById('overview-tab');
        if (!tabPanel) return;

        tabPanel.innerHTML = `
            <div class="overview-content">
                <div class="profile-summary">
                    <h3>Profile Summary</h3>
                    <div class="summary-grid">
                        <div class="summary-item">
                            <label>Profile Completion</label>
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${this.profileData?.completion_percentage || 0}%"></div>
                            </div>
                            <span class="progress-text">${this.profileData?.completion_percentage || 0}%</span>
                        </div>
                        <div class="summary-item">
                            <label>Account Status</label>
                            <div class="status-badge ${this.profileData?.status || 'pending'}">${this.profileData?.status || 'pending'}</div>
                        </div>
                        <div class="summary-item">
                            <label>Last Updated</label>
                            <span class="date">${this.formatDate(this.profileData?.updated_at)}</span>
                        </div>
                        <div class="summary-item">
                            <label>Member Since</label>
                            <span class="date">${this.formatDate(this.profileData?.created_at)}</span>
                        </div>
                    </div>
                </div>

                <div class="recent-activity">
                    <h3>Recent Activity</h3>
                    <div id="activity-list" class="activity-list">
                        <div class="loading-placeholder">Loading activities...</div>
                    </div>
                </div>

                <div class="quick-actions">
                    <h3>Quick Actions</h3>
                    <div class="action-buttons">
                        <button class="btn btn-primary" onclick="Dashboard.generateCV()">
                            <i class="fas fa-file-pdf"></i> Generate CV
                        </button>
                        <button class="btn btn-secondary" onclick="Dashboard.editProfile()">
                            <i class="fas fa-edit"></i> Edit Profile
                        </button>
                        <button class="btn btn-secondary" onclick="Dashboard.viewPublicProfile()">
                            <i class="fas fa-eye"></i> View Public Profile
                        </button>
                        <button class="btn btn-secondary" onclick="Dashboard.downloadData()">
                            <i class="fas fa-download"></i> Download Data
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Load recent activity
        await this.loadRecentActivity();
    },

    // Load certificates tab
    async loadCertificatesTab() {
        const tabPanel = document.getElementById('certificates-tab');
        if (!tabPanel) return;

        try {
            const response = await Utils.apiCall('/api/profile/certificates');
            const certificates = response.data.certificates || [];

            tabPanel.innerHTML = `
                <div class="certificates-content">
                    <div class="certificates-header">
                        <h3>Your Certificates</h3>
                        <button class="btn btn-primary" onclick="Dashboard.uploadCertificate()">
                            <i class="fas fa-plus"></i> Add Certificate
                        </button>
                    </div>

                    <div class="certificates-stats">
                        <div class="stat-card">
                            <div class="stat-icon">
                                <i class="fas fa-certificate"></i>
                            </div>
                            <div class="stat-info">
                                <div class="stat-value">${certificates.length}</div>
                                <div class="stat-label">Total Certificates</div>
                            </div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">
                                <i class="fas fa-check-circle"></i>
                            </div>
                            <div class="stat-info">
                                <div class="stat-value">${certificates.filter(c => c.is_verified).length}</div>
                                <div class="stat-label">Verified</div>
                            </div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">
                                <i class="fas fa-clock"></i>
                            </div>
                            <div class="stat-info">
                                <div class="stat-value">${certificates.filter(c => !c.is_verified).length}</div>
                                <div class="stat-label">Pending</div>
                            </div>
                        </div>
                    </div>

                    <div class="certificates-list">
                        ${this.renderCertificatesList(certificates)}
                    </div>
                </div>
            `;
        } catch (error) {
            tabPanel.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Error loading certificates</p>
                    <button class="btn btn-secondary" onclick="Dashboard.loadTabContent('certificates')">
                        <i class="fas fa-refresh"></i> Retry
                    </button>
                </div>
            `;
        }
    },

    // Load profile editing tab
    async loadProfileTab() {
        const tabPanel = document.getElementById('profile-tab');
        if (!tabPanel) return;

        tabPanel.innerHTML = `
            <div class="profile-edit-content">
                <div class="profile-edit-header">
                    <h3>Edit Profile</h3>
                    <button class="btn btn-primary" onclick="Dashboard.saveProfile()" id="save-profile-btn">
                        <i class="fas fa-save"></i> Save Changes
                    </button>
                </div>

                <form id="profile-edit-form" class="profile-form">
                    <div class="form-section">
                        <h4>Personal Information</h4>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="edit-first-name">First Name</label>
                                <input type="text" id="edit-first-name" class="form-control" 
                                       value="${this.profileData?.first_name || ''}" required>
                            </div>
                            <div class="form-group">
                                <label for="edit-surname">Surname</label>
                                <input type="text" id="edit-surname" class="form-control" 
                                       value="${this.profileData?.surname || ''}" required>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="edit-email">Email Address</label>
                                <input type="email" id="edit-email" class="form-control" 
                                       value="${this.profileData?.email || ''}" required>
                            </div>
                            <div class="form-group">
                                <label for="edit-phone">Phone Number</label>
                                <input type="tel" id="edit-phone" class="form-control" 
                                       value="${this.profileData?.phone || ''}" required>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="edit-country">Country</label>
                                <select id="edit-country" class="form-control" required>
                                    <option value="">Select Country</option>
                                    <option value="South Africa" ${this.profileData?.country === 'South Africa' ? 'selected' : ''}>South Africa</option>
                                    <option value="Germany" ${this.profileData?.country === 'Germany' ? 'selected' : ''}>Germany</option>
                                    <option value="United Kingdom" ${this.profileData?.country === 'United Kingdom' ? 'selected' : ''}>United Kingdom</option>
                                    <option value="United States" ${this.profileData?.country === 'United States' ? 'selected' : ''}>United States</option>
                                    <option value="Other" ${this.profileData?.country === 'Other' ? 'selected' : ''}>Other</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label for="edit-nationality">Nationality</label>
                                <input type="text" id="edit-nationality" class="form-control" 
                                       value="${this.profileData?.nationality || ''}">
                            </div>
                        </div>
                    </div>

                    <div class="form-section">
                        <h4>Privacy Settings</h4>
                        <div class="privacy-controls">
                            <label class="checkbox-group">
                                <input type="checkbox" id="public-profile-enabled" 
                                       ${this.profileData?.public_profile_enabled ? 'checked' : ''}>
                                <span>Make my profile publicly viewable</span>
                            </label>
                            <label class="checkbox-group">
                                <input type="checkbox" id="show-contact-info" 
                                       ${this.profileData?.show_contact_info ? 'checked' : ''}>
                                <span>Show contact information in public profile</span>
                            </label>
                            <label class="checkbox-group">
                                <input type="checkbox" id="allow-cv-download" 
                                       ${this.profileData?.allow_cv_download ? 'checked' : ''}>
                                <span>Allow employers to download my CV</span>
                            </label>
                        </div>
                    </div>

                    <div class="form-section">
                        <h4>Notifications</h4>
                        <div class="notification-controls">
                            <label class="checkbox-group">
                                <input type="checkbox" id="email-notifications" 
                                       ${this.profileData?.email_notifications ? 'checked' : ''}>
                                <span>Email notifications for profile views</span>
                            </label>
                            <label class="checkbox-group">
                                <input type="checkbox" id="certificate-notifications" 
                                       ${this.profileData?.certificate_notifications ? 'checked' : ''}>
                                <span>Notifications for certificate verification updates</span>
                            </label>
                        </div>
                    </div>
                </form>

                <div class="danger-zone">
                    <h4>Danger Zone</h4>
                    <button class="btn btn-danger" onclick="Dashboard.deleteAccount()">
                        <i class="fas fa-trash"></i> Delete Account
                    </button>
                </div>
            </div>
        `;
    },

    // Load public profile tab
    async loadPublicTab() {
        const tabPanel = document.getElementById('public-tab');
        if (!tabPanel) return;

        tabPanel.innerHTML = `
            <div class="public-profile-content">
                <div class="public-profile-header">
                    <h3>Public Profile</h3>
                    <div class="profile-url">
                        <label>Your Profile URL:</label>
                        <div class="url-display">
                            <input type="text" readonly value="${window.location.origin}/profile/${this.profileData?.public_profile_url || 'not-set'}" 
                                   class="form-control url-input" id="profile-url-input">
                            <button class="btn btn-secondary" onclick="Dashboard.copyProfileURL()">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                    </div>
                </div>

                <div class="access-level-preview">
                    <h4>Profile Access Levels</h4>
                    <div class="access-buttons">
                        <button class="access-button ${this.currentAccessLevel === 'viewer' ? 'active' : ''}" 
                                onclick="Dashboard.switchAccessLevel('viewer')" id="viewer-access">
                            <h5>Viewer Access</h5>
                            <p>What free viewers can see</p>
                        </button>
                        <button class="access-button ${this.currentAccessLevel === 'subscriber' ? 'active' : ''}" 
                                onclick="Dashboard.switchAccessLevel('subscriber')" id="subscriber-access">
                            <h5>Subscriber Access</h5>
                            <p>What paying subscribers can see</p>
                        </button>
                    </div>
                </div>

                <div class="profile-preview" id="profile-preview">
                    ${this.generateProfilePreview('viewer')}
                </div>

                <div class="profile-analytics">
                    <h4>Profile Analytics</h4>
                    <div class="analytics-grid">
                        <div class="analytics-card">
                            <div class="analytics-icon">
                                <i class="fas fa-eye"></i>
                            </div>
                            <div class="analytics-info">
                                <div class="analytics-value">0</div>
                                <div class="analytics-label">Total Views</div>
                            </div>
                        </div>
                        <div class="analytics-card">
                            <div class="analytics-icon">
                                <i class="fas fa-calendar-week"></i>
                            </div>
                            <div class="analytics-info">
                                <div class="analytics-value">0</div>
                                <div class="analytics-label">This Week</div>
                            </div>
                        </div>
                        <div class="analytics-card">
                            <div class="analytics-icon">
                                <i class="fas fa-download"></i>
                            </div>
                            <div class="analytics-info">
                                <div class="analytics-value">0</div>
                                <div class="analytics-label">CV Downloads</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.currentAccessLevel = 'viewer';
        await this.loadProfileAnalytics();
    },

    // Initialize event listeners
    initializeEventListeners() {
        // Add any additional event listeners here
        console.log('Dashboard event listeners initialized');
    },

    // Load recent activity
    async loadRecentActivity() {
        try {
            const response = await Utils.apiCall('/api/profile/activity');
            const activities = response.data.activities || [];

            const activityList = document.getElementById('activity-list');
            if (!activityList) return;

            if (activities.length === 0) {
                activityList.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-history"></i>
                        <p>No recent activity</p>
                    </div>
                `;
                return;
            }

            activityList.innerHTML = activities.map(activity => `
                <div class="activity-item">
                    <div class="activity-icon">
                        <i class="fas ${this.getActivityIcon(activity.activity_type)}"></i>
                    </div>
                    <div class="activity-content">
                        <div class="activity-description">${activity.description}</div>
                        <div class="activity-time">${this.formatDate(activity.created_at)}</div>
                    </div>
                </div>
            `).join('');

        } catch (error) {
            const activityList = document.getElementById('activity-list');
            if (activityList) {
                activityList.innerHTML = `
                    <div class="error-state">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>Error loading activities</p>
                    </div>
                `;
            }
        }
    },

    // Dashboard actions
    async generateCV() {
        try {
            Utils.showLoading('Generating your CV...');
            const response = await Utils.apiCall('/api/cv/generate', 'POST', {
                template: 'professional',
                format: 'html'
            });
            
            Utils.hideLoading();
            Utils.showToast('CV generated successfully!', 'success');
            
            // Open CV in new window
            window.open(response.data.url, '_blank');
        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error generating CV: ' + error.message, 'error');
        }
    },

    editProfile() {
        switchTab('profile');
    },

    viewPublicProfile() {
        const profileUrl = this.profileData?.public_profile_url;
        if (profileUrl) {
            window.open(`/profile/${profileUrl}`, '_blank');
        } else {
            Utils.showToast('Public profile URL not set', 'warning');
        }
    },

    async downloadData() {
        try {
            Utils.showLoading('Preparing your data...');
            const response = await Utils.apiCall('/api/profile/export');
            
            // Create download link
            const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `jobscooter-profile-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            Utils.hideLoading();
            Utils.showToast('Profile data downloaded', 'success');
        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error downloading data: ' + error.message, 'error');
        }
    },

    async saveProfile() {
        try {
            Utils.showLoading('Saving profile...');
            
            const formData = {
                first_name: document.getElementById('edit-first-name').value,
                surname: document.getElementById('edit-surname').value,
                email: document.getElementById('edit-email').value,
                phone: document.getElementById('edit-phone').value,
                country: document.getElementById('edit-country').value,
                nationality: document.getElementById('edit-nationality').value,
                public_profile_enabled: document.getElementById('public-profile-enabled').checked,
                show_contact_info: document.getElementById('show-contact-info').checked,
                allow_cv_download: document.getElementById('allow-cv-download').checked,
                email_notifications: document.getElementById('email-notifications').checked,
                certificate_notifications: document.getElementById('certificate-notifications').checked
            };

            await Utils.apiCall('/api/profile/update', 'PUT', formData);
            
            // Update local profile data
            Object.assign(this.profileData, formData);
            this.updateProfileDisplay();
            
            Utils.hideLoading();
            Utils.showToast('Profile updated successfully', 'success');
        } catch (error) {
            Utils.hideLoading();
            Utils.showToast('Error saving profile: ' + error.message, 'error');
        }
    },

    // Helper functions
    formatDate(dateString) {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString();
    },

    getActivityIcon(activityType) {
        const icons = {
            'profile_created': 'fa-user-plus',
            'document_uploaded': 'fa-upload',
            'certificate_verified': 'fa-check-circle',
            'cv_generated': 'fa-file-pdf',
            'profile_updated': 'fa-edit',
            'login': 'fa-sign-in-alt'
        };
        return icons[activityType] || 'fa-info-circle';
    },

    renderCertificatesList(certificates) {
        if (certificates.length === 0) {
            return `
                <div class="empty-state">
                    <i class="fas fa-certificate"></i>
                    <p>No certificates uploaded yet</p>
                    <button class="btn btn-primary" onclick="Dashboard.uploadCertificate()">
                        <i class="fas fa-plus"></i> Add Your First Certificate
                    </button>
                </div>
            `;
        }

        return certificates.map(cert => `
            <div class="certificate-card">
                <div class="certificate-header">
                    <div class="certificate-info">
                        <h4>${cert.institution_name}</h4>
                        <p>${cert.field_of_study}</p>
                        <small>${cert.certificate_type} • ${this.formatDate(cert.date_issued)}</small>
                    </div>
                    <div class="certificate-status">
                        <div class="status-badge ${cert.is_verified ? 'verified' : 'pending'}">
                            <i class="fas ${cert.is_verified ? 'fa-check-circle' : 'fa-clock'}"></i>
                            ${cert.is_verified ? 'Verified' : 'Pending'}
                        </div>
                    </div>
                </div>
                <div class="certificate-actions">
                    <button class="btn btn-sm btn-secondary" onclick="Dashboard.viewCertificate('${cert.id}')">
                        <i class="fas fa-eye"></i> View
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="Dashboard.downloadCertificate('${cert.id}')">
                        <i class="fas fa-download"></i> Download
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="Dashboard.deleteCertificate('${cert.id}')">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            </div>
        `).join('');
    },

    generateProfilePreview(accessLevel) {
        if (!this.profileData) return '<div class="loading-placeholder">Loading preview...</div>';

        const isSubscriber = accessLevel === 'subscriber';

        return `
            <div class="profile-preview-card">
                <div class="profile-header">
                    <div class="profile-picture">
                        <img src="${this.profileData.profile_picture_url || '/images/default-avatar.png'}" alt="Profile Picture">
                    </div>
                    <div class="profile-basic">
                        <h3>${this.profileData.first_name} ${this.profileData.surname}</h3>
                        <p>${isSubscriber ? this.profileData.email : 'Email hidden'}</p>
                        <p>${isSubscriber ? this.profileData.phone : 'Phone hidden'}</p>
                        <div class="traffic-light-badge ${this.profileData.traffic_light_status}">
                            ${this.profileData.traffic_light_status.toUpperCase()} Profile
                        </div>
                    </div>
                </div>

                <div class="profile-sections">
                    ${isSubscriber ? `
                        <div class="profile-section">
                            <h4>Full Details</h4>
                            <p>Subscribers can see complete profile information, certificates, and download CV.</p>
                        </div>
                    ` : `
                        <div class="profile-section">
                            <h4>Limited Preview</h4>
                            <p>This is what free viewers can see. Subscribe for full access.</p>
                        </div>
                    `}
                </div>
            </div>
        `;
    },

    async loadProfileAnalytics() {
        try {
            const response = await Utils.apiCall('/api/profile/analytics');
            const analytics = response.data;

            // Update analytics display
            const analyticsCards = document.querySelectorAll('.analytics-card .analytics-value');
            if (analyticsCards.length >= 3) {
                analyticsCards[0].textContent = analytics.total_views || 0;
                analyticsCards[1].textContent = analytics.weekly_views || 0;
                analyticsCards[2].textContent = analytics.cv_downloads || 0;
            }
        } catch (error) {
            console.error('Error loading analytics:', error);
        }
    },

    copyProfileURL() {
        const urlInput = document.getElementById('profile-url-input');
        if (urlInput) {
            urlInput.select();
            navigator.clipboard.writeText(urlInput.value);
            Utils.showToast('Profile URL copied to clipboard', 'success');
        }
    },

    switchAccessLevel(level) {
        this.currentAccessLevel = level;
        
        // Update button states
        document.querySelectorAll('.access-button').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`${level}-access`).classList.add('active');
        
        // Update preview
        const preview = document.getElementById('profile-preview');
        if (preview) {
            preview.innerHTML = this.generateProfilePreview(level);
        }
    }
};

// Export Dashboard for global access
window.Dashboard = Dashboard;