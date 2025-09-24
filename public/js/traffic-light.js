// JobScooter Traffic Light System

const TrafficLight = {
    // Traffic light thresholds
    thresholds: {
        green: 80,
        yellow: 60
    },

    // Calculate traffic light status based on score
    calculateStatus(score) {
        if (score >= this.thresholds.green) {
            return {
                status: 'green',
                level: 'Excellent',
                message: 'Ready for Employer Consideration',
                icon: 'fas fa-check-circle',
                description: 'Your profile meets all quality standards and is ready for employers.'
            };
        } else if (score >= this.thresholds.yellow) {
            return {
                status: 'yellow',
                level: 'Good',
                message: 'Minor Improvements Recommended',
                icon: 'fas fa-exclamation-triangle',
                description: 'Your profile is good but could benefit from some enhancements.'
            };
        } else {
            return {
                status: 'red',
                level: 'Needs Attention',
                message: 'Significant Improvements Required',
                icon: 'fas fa-times-circle',
                description: 'Your profile needs significant improvements before employer consideration.'
            };
        }
    },

    // Calculate detailed score breakdown
    calculateScoreBreakdown(applicantData) {
        const breakdown = {
            identity: 0,
            language: 0,
            certificate: 0,
            completeness: 0,
            consistency: 0
        };

        // 1. Identity Verification (20 points max)
        if (applicantData.id_extraction_confidence >= 0.95) {
            breakdown.identity += 15;
        } else if (applicantData.id_extraction_confidence >= 0.80) {
            breakdown.identity += 10;
        } else if (applicantData.id_extraction_confidence >= 0.60) {
            breakdown.identity += 5;
        }

        if (applicantData.email_verified) {
            const hoursToVerify = applicantData.email_verification_hours || 0;
            if (hoursToVerify <= 24) {
                breakdown.identity += 5;
            } else if (hoursToVerify <= 72) {
                breakdown.identity += 3;
            } else if (hoursToVerify > 72) {
                breakdown.identity += 1;
            }
        }

        // 2. Language Proficiency (25 points max)
        const languages = applicantData.languages || [];
        const verifiedLanguages = languages.filter(lang => lang.is_verified);
        const languageRatio = languages.length > 0 ? verifiedLanguages.length / languages.length : 0;
        
        breakdown.language = Math.round(languageRatio * 15); // Base score for verified languages

        // Bonus for German certificate (if applicable)
        const hasGermanCert = verifiedLanguages.some(lang => 
            lang.language.toLowerCase() === 'german' && lang.verification_method === 'certificate'
        );
        if (hasGermanCert) {
            breakdown.language += 10;
        }

        // 3. Certificate Quality (30 points max)
        const certificates = applicantData.certificates || [];
        if (certificates.length > 0) {
            const accreditedCerts = certificates.filter(cert => cert.is_accredited).length;
            const accreditationRatio = accreditedCerts / certificates.length;
            breakdown.certificate += Math.round(accreditationRatio * 10);

            const avgAuthenticity = certificates.reduce((sum, cert) => 
                sum + (cert.authenticity_score || 0), 0) / certificates.length;
            breakdown.certificate += Math.round((avgAuthenticity / 100) * 10);

            // Relevance score (simplified)
            const relevantCerts = certificates.filter(cert => 
                cert.certificate_type === 'academic' || cert.certificate_type === 'professional'
            ).length;
            const relevanceRatio = relevantCerts / certificates.length;
            breakdown.certificate += Math.round(relevanceRatio * 10);
        }

        // 4. Profile Completeness (15 points max)
        let completenessScore = 0;
        
        // Required fields
        const requiredFields = ['first_name', 'surname', 'email', 'phone', 'country'];
        const completedFields = requiredFields.filter(field => 
            applicantData[field] && applicantData[field].trim() !== ''
        ).length;
        completenessScore += Math.round((completedFields / requiredFields.length) * 8);

        // Media content
        if (applicantData.profile_picture_url) {
            completenessScore += 4;
        }
        if (applicantData.video_intro_url) {
            completenessScore += 3;
        }

        breakdown.completeness = completenessScore;

        // 5. Data Consistency (10 points max)
        // Simplified consistency check - in real implementation would cross-reference all documents
        let consistencyScore = 8; // Start high, deduct for inconsistencies
        
        // Check if certificates match profile name
        if (certificates.length > 0) {
            const profileName = `${applicantData.first_name} ${applicantData.surname}`.toLowerCase();
            const inconsistentCerts = certificates.filter(cert => {
                const extractedData = cert.extracted_data ? JSON.parse(cert.extracted_data) : {};
                const certName = extractedData.name || '';
                return certName && !certName.toLowerCase().includes(applicantData.first_name.toLowerCase());
            }).length;
            
            if (inconsistentCerts > 0) {
                consistencyScore -= Math.min(4, inconsistentCerts * 2);
            }
        }

        breakdown.consistency = Math.max(0, consistencyScore);

        const totalScore = Object.values(breakdown).reduce((sum, score) => sum + score, 0);

        return {
            breakdown,
            totalScore,
            maxScore: 100,
            status: this.calculateStatus(totalScore)
        };
    },

    // Generate improvement suggestions based on score breakdown
    generateImprovementSuggestions(breakdown, totalScore) {
        const suggestions = [];
        const status = this.calculateStatus(totalScore).status;

        if (breakdown.identity < 15) {
            if (breakdown.identity < 10) {
                suggestions.push({
                    category: 'identity',
                    priority: 'high',
                    message: 'Verify your email address immediately',
                    action: 'Check your email and click the verification link'
                });
            }
            suggestions.push({
                category: 'identity',
                priority: 'medium',
                message: 'Upload a clearer ID document',
                action: 'Ensure your ID is well-lit and all text is readable'
            });
        }

        if (breakdown.language < 20) {
            suggestions.push({
                category: 'language',
                priority: 'high',
                message: 'Upload certificates for claimed languages',
                action: 'Provide official language certificates from recognized institutions'
            });
        }

        if (breakdown.certificate < 25) {
            suggestions.push({
                category: 'certificate',
                priority: 'high',
                message: 'Upload certificates from accredited institutions',
                action: 'Ensure your certificates are from recognized, accredited institutions'
            });
        }

        if (breakdown.completeness < 12) {
            if (!breakdown.profile_picture) {
                suggestions.push({
                    category: 'completeness',
                    priority: 'medium',
                    message: 'Upload a professional profile picture',
                    action: 'Add a clear, professional headshot photo'
                });
            }
            if (!breakdown.video_intro) {
                suggestions.push({
                    category: 'completeness',
                    priority: 'medium',
                    message: 'Record a video introduction',
                    action: 'Create a short video introducing yourself professionally'
                });
            }
        }

        if (breakdown.consistency < 8) {
            suggestions.push({
                category: 'consistency',
                priority: 'high',
                message: 'Ensure all information is consistent',
                action: 'Check that names and details match across all documents'
            });
        }

        // Sort by priority
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        suggestions.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);

        return suggestions;
    },

    // Render traffic light component
    renderTrafficLight(containerId, scoreData) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const { totalScore, status, breakdown } = scoreData;
        const statusInfo = this.calculateStatus(totalScore);

        container.innerHTML = `
            <div class="traffic-light ${status.status}">
                <div class="traffic-light-icon">
                    <i class="${statusInfo.icon}"></i>
                </div>
                <div class="traffic-light-content">
                    <div class="traffic-light-message">${statusInfo.message}</div>
                    <div class="traffic-light-score">${totalScore}/100</div>
                    <div class="traffic-light-details">${statusInfo.description}</div>
                </div>
            </div>
        `;
    },

    // Render detailed score breakdown
    renderScoreBreakdown(containerId, scoreData) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const { breakdown } = scoreData;
        const categories = [
            { key: 'identity', label: 'Identity Verification', max: 20 },
            { key: 'language', label: 'Language Proficiency', max: 25 },
            { key: 'certificate', label: 'Certificate Quality', max: 30 },
            { key: 'completeness', label: 'Profile Completeness', max: 15 },
            { key: 'consistency', label: 'Data Consistency', max: 10 }
        ];

        const breakdownHtml = categories.map(category => {
            const score = breakdown[category.key];
            const percentage = (score / category.max) * 100;
            let categoryClass = 'poor';
            
            if (percentage >= 80) categoryClass = 'excellent';
            else if (percentage >= 60) categoryClass = 'good';

            return `
                <div class="score-category ${categoryClass}">
                    <div class="score-category-title">${category.label}</div>
                    <div class="score-category-value">${score}</div>
                    <div class="score-category-max">/ ${category.max}</div>
                </div>
            `;
        }).join('');

        container.innerHTML = `<div class="score-breakdown">${breakdownHtml}</div>`;
    },

    // Render improvement suggestions
    renderImprovementSuggestions(containerId, suggestions) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (suggestions.length === 0) {
            container.innerHTML = `
                <div class="improvement-suggestions">
                    <h4><i class="fas fa-trophy"></i> Excellent Work!</h4>
                    <p>Your profile is in great shape. Keep maintaining this quality!</p>
                </div>
            `;
            return;
        }

        const priorityIcons = {
            high: 'fas fa-exclamation-circle',
            medium: 'fas fa-info-circle',
            low: 'fas fa-lightbulb'
        };

        const suggestionsHtml = suggestions.map(suggestion => `
            <li>
                <i class="${priorityIcons[suggestion.priority]}"></i>
                <div>
                    <strong>${suggestion.message}</strong><br>
                    <span>${suggestion.action}</span>
                </div>
            </li>
        `).join('');

        container.innerHTML = `
            <div class="improvement-suggestions">
                <h4><i class="fas fa-chart-line"></i> Improvement Suggestions</h4>
                <ul class="suggestion-list">
                    ${suggestionsHtml}
                </ul>
            </div>
        `;
    },

    // Update traffic light in real-time
    async updateTrafficLight(applicantId) {
        try {
            const response = await Utils.apiCall(`/api/profile/${applicantId}/traffic-light`);
            const scoreData = this.calculateScoreBreakdown(response.data);
            
            // Update traffic light display
            this.renderTrafficLight('traffic-light', scoreData);
            
            // Update score breakdown if container exists
            if (document.getElementById('score-breakdown-container')) {
                this.renderScoreBreakdown('score-breakdown-container', scoreData);
            }
            
            // Update improvement suggestions if container exists
            if (document.getElementById('improvement-suggestions-container')) {
                const suggestions = this.generateImprovementSuggestions(
                    scoreData.breakdown, 
                    scoreData.totalScore
                );
                this.renderImprovementSuggestions('improvement-suggestions-container', suggestions);
            }
            
            return scoreData;
        } catch (error) {
            console.error('Error updating traffic light:', error);
            Utils.showToast('Error updating profile status', 'error');
        }
    },

    // Initialize traffic light for demo data
    initializeDemoTrafficLight() {
        const demoData = {
            first_name: 'John',
            surname: 'Doe',
            email: 'john.doe@example.com',
            phone: '+27123456789',
            country: 'South Africa',
            email_verified: true,
            email_verification_hours: 12,
            id_extraction_confidence: 0.92,
            profile_picture_url: '/uploads/media/demo_profile.jpg',
            video_intro_url: '/uploads/media/demo_video.mp4',
            languages: [
                { language: 'English', is_verified: true, verification_method: 'native' },
                { language: 'German', is_verified: true, verification_method: 'certificate' },
                { language: 'Afrikaans', is_verified: true, verification_method: 'native' }
            ],
            certificates: [
                {
                    certificate_type: 'academic',
                    is_accredited: true,
                    authenticity_score: 95,
                    extracted_data: JSON.stringify({ name: 'John Doe' })
                },
                {
                    certificate_type: 'language',
                    is_accredited: true,
                    authenticity_score: 98,
                    extracted_data: JSON.stringify({ name: 'John Doe' })
                },
                {
                    certificate_type: 'professional',
                    is_accredited: true,
                    authenticity_score: 92,
                    extracted_data: JSON.stringify({ name: 'John Doe' })
                }
            ]
        };

        const scoreData = this.calculateScoreBreakdown(demoData);
        
        // Render traffic light
        this.renderTrafficLight('traffic-light', scoreData);
        
        // If on dashboard, render additional components
        if (AppState.currentPage === 'dashboard-page') {
            const suggestions = this.generateImprovementSuggestions(
                scoreData.breakdown, 
                scoreData.totalScore
            );
            
            // Update dashboard stats
            if (document.getElementById('completion-percentage')) {
                document.getElementById('completion-percentage').textContent = `${scoreData.totalScore}%`;
            }
            
            return scoreData;
        }
    }
};

// Export for global use
window.TrafficLight = TrafficLight; 
