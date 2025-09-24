// JobScooter Main JavaScript

// Global application state
const AppState = {
    currentPage: 'landing-page',
    user: null,
    applicationData: {},
    currentStep: 1,
    totalSteps: 5
};

// Utility functions
const Utils = {
    // Show/hide pages
    showPage(pageId) {
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });
        document.getElementById(pageId).classList.add('active');
        AppState.currentPage = pageId;
    },

    // Show loading overlay
    showLoading(message = 'Processing...') {
        const overlay = document.getElementById('loading-overlay');
        const text = document.getElementById('loading-text');
        if (text) text.textContent = message;
        overlay.classList.add('active');
    },

    // Hide loading overlay
    hideLoading() {
        document.getElementById('loading-overlay').classList.remove('active');
    },

    // Show toast notification
    showToast(message, type = 'info', duration = 5000) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-info-circle'
        };
        
        toast.innerHTML = `
            <i class="toast-icon ${icons[type]}"></i>
            <span class="toast-message">${message}</span>
            <i class="toast-close fas fa-times"></i>
        `;
        
        // Add click handler to close button
        toast.querySelector('.toast-close').addEventListener('click', () => {
            toast.remove();
        });
        
        container.appendChild(toast);
        
        // Auto remove after duration
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, duration);
    },

    // Show modal
    showModal(contentHtml) {
        const modal = document.getElementById('modal');
        const modalBody = document.getElementById('modal-body');
        modalBody.innerHTML = contentHtml;
        modal.classList.add('active');
    },

    // Hide modal
    hideModal() {
        document.getElementById('modal').classList.remove('active');
    },

    // Format file size
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    // Validate email
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    },

    // API call wrapper
    async apiCall(endpoint, method = 'GET', data = null) {
        try {
            const options = {
                method,
                headers: {
                    'Content-Type': 'application/json',
                }
            };

            // Add authorization header if user is logged in
            if (AppState.user && AppState.user.token) {
                options.headers.Authorization = `Bearer ${AppState.user.token}`;
            }

            if (data && method !== 'GET') {
                options.body = JSON.stringify(data);
            }

            const response = await fetch(endpoint, options);
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Request failed');
            }

            return result;
        } catch (error) {
            console.error('API call failed:', error);
            throw error;
        }
    }
};

// Landing page functions
function startApplication() {
    // Check if user is logged in
    const savedUser = localStorage.getItem('jobscooter_user');
    if (savedUser) {
        try {
            const user = JSON.parse(savedUser);
            console.log('User is logged in, continuing application for:', user.first_name);
            
            // User is logged in, show the application page directly
            Utils.showPage('application-page');
            Application.initializeApplication();
            return;
        } catch (error) {
            console.error('Error parsing user data:', error);
            // Clear corrupted data and continue normally
            localStorage.removeItem('jobscooter_user');
            localStorage.removeItem('jobscooter_token');
        }
    }
    
    // User not logged in, show pre-application page
    Utils.showPage('pre-application-page');
}

function goBack() {
    Utils.showPage('landing-page');
}

// Pre-application functions
async function proceedToApplication() {
    const termsChecked = document.getElementById('terms-checkbox').checked;
    const privacyChecked = document.getElementById('privacy-checkbox').checked;
    const dataChecked = document.getElementById('data-checkbox').checked;

    if (!termsChecked || !privacyChecked || !dataChecked) {
        Utils.showToast('Please accept all agreements to continue.', 'warning');
        return;
    }

    try {
        console.log('📝 Legal agreements accepted, starting application...');
        
        // Store agreements for later use if needed
        AppState.agreements = {
            terms: termsChecked,
            privacy: privacyChecked,
            data: dataChecked,
            acceptedAt: new Date().toISOString()
        };
        
        // Direct transition to application - no session creation needed
        Utils.showPage('application-page');
        await Application.initializeApplication();
        
    } catch (error) {
        console.error('Application initialization error:', error);
        Utils.showToast('Error starting application: ' + error.message, 'error');
    }
}

// Modal functions
function showModal(type) {
    let content = '';
    
    switch (type) {
        case 'terms':
            content = `
                <h2>Terms & Conditions</h2>
                <div style="max-height: 400px; overflow-y: auto; padding: 1rem 0;">
                    <h3>1. Acceptance of Terms</h3>
                    <p>By using JobScooter, you agree to these terms and conditions.</p>
                    
                    <h3>2. Service Description</h3>
                    <p>JobScooter provides AI-powered job application automation and document verification services.</p>
                    
                    <h3>3. User Responsibilities</h3>
                    <ul>
                        <li>Provide accurate and truthful information</li>
                        <li>Upload only legitimate documents</li>
                        <li>Respect intellectual property rights</li>
                    </ul>
                    
                    <h3>4. Privacy and Data Protection</h3>
                    <p>We are committed to protecting your personal information and privacy.</p>
                    
                    <h3>5. Limitation of Liability</h3>
                    <p>JobScooter is not liable for any damages arising from use of our services.</p>
                </div>
            `;
            break;
        case 'privacy':
            content = `
                <h2>Privacy Policy</h2>
                <div style="max-height: 400px; overflow-y: auto; padding: 1rem 0;">
                    <h3>Information We Collect</h3>
                    <ul>
                        <li>Personal identification information from ID documents</li>
                        <li>Educational and professional certificates</li>
                        <li>Profile pictures and video introductions</li>
                    </ul>
                    
                    <h3>How We Use Your Information</h3>
                    <ul>
                        <li>Create and maintain your profile</li>
                        <li>Verify your credentials</li>
                        <li>Generate CVs and application materials</li>
                    </ul>
                    
                    <h3>Data Security</h3>
                    <p>We use industry-standard security measures to protect your data.</p>
                    
                    <h3>Your Rights</h3>
                    <p>You have the right to access, modify, or delete your personal information.</p>
                </div>
            `;
            break;
        case 'data':
            content = `
                <h2>Data Processing Agreement</h2>
                <div style="max-height: 400px; overflow-y: auto; padding: 1rem 0;">
                    <h3>Purpose of Processing</h3>
                    <p>We process your data to provide job application automation services.</p>
                    
                    <h3>Legal Basis</h3>
                    <p>Processing is based on your consent and legitimate business interests.</p>
                    
                    <h3>Data Retention</h3>
                    <p>We retain your data as long as necessary to provide our services.</p>
                    
                    <h3>Third-Party Processing</h3>
                    <p>We may use third-party AI services for document processing and verification.</p>
                    
                    <h3>International Transfers</h3>
                    <p>Your data may be processed in countries outside of your residence.</p>
                </div>
            `;
            break;
    }
    
    Utils.showModal(content);
}

function closeModal() {
    Utils.hideModal();
}

// Dashboard functions
function logout() {
    AppState.user = null;
    localStorage.removeItem('jobscooter_user');
    Utils.showToast('Logged out successfully', 'success');
    Utils.showPage('landing-page');
}

function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Update tab panels
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    // Load tab content based on selection
    Dashboard.loadTabContent(tabName);
}

// Event listeners for checkbox validation
document.addEventListener('DOMContentLoaded', function() {
    // Check for saved user session
    const savedUser = localStorage.getItem('jobscooter_user');
    if (savedUser) {
        try {
            AppState.user = JSON.parse(savedUser);
            // If user is logged in, show dashboard
            if (AppState.user && AppState.user.token) {
                Dashboard.loadDashboard();
            }
        } catch (error) {
            console.error('Error loading saved user:', error);
            localStorage.removeItem('jobscooter_user');
        }
    }

    // Checkbox validation for pre-application
    const checkboxes = ['terms-checkbox', 'privacy-checkbox', 'data-checkbox'];
    const proceedBtn = document.getElementById('proceed-btn');
    
    checkboxes.forEach(id => {
        const checkbox = document.getElementById(id);
        if (checkbox) {
            checkbox.addEventListener('change', function() {
                const allChecked = checkboxes.every(checkboxId => 
                    document.getElementById(checkboxId).checked
                );
                if (proceedBtn) {
                    proceedBtn.disabled = !allChecked;
                }
            });
        }
    });

    // Close modal when clicking outside
    document.getElementById('modal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeModal();
        }
    });

    // Close loading overlay on escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeModal();
        }
    });
});

// Export functions for global use
window.startApplication = startApplication;
window.goBack = goBack;
window.proceedToApplication = proceedToApplication;
window.showModal = showModal;
window.closeModal = closeModal;
window.logout = logout;
window.switchTab = switchTab;

// Export Utils and AppState for other modules
window.Utils = Utils;
window.AppState = AppState;