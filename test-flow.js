// Test script to validate the JobScooter application flow
const axios = require('axios');

const BASE_URL = 'http://localhost:3001';

async function testApplicationFlow() {
    console.log('🚀 Starting JobScooter Application Flow Test...\n');
    
    try {
        // Step 1: Test API health
        console.log('1. Testing API health...');
        const healthCheck = await axios.get(`${BASE_URL}/api/health`);
        console.log('✅ API is healthy:', healthCheck.data.status);
        
        // Step 2: Test session start
        console.log('\n2. Testing session start...');
        const sessionResponse = await axios.post(`${BASE_URL}/api/landing/start-application`, {
            userAgent: 'Test-Agent/1.0',
            ipAddress: '127.0.0.1'
        });
        
        if (sessionResponse.data.success && sessionResponse.data.data.sessionToken) {
            console.log('✅ Session started:', sessionResponse.data.data.sessionToken.substring(0, 8) + '...');
            const sessionToken = sessionResponse.data.data.sessionToken;
            
            // Step 3: Test legal agreements
            console.log('\n3. Testing legal agreements...');
            const legalResponse = await axios.put(`${BASE_URL}/api/landing/legal-accept`, {
                sessionToken: sessionToken,
                agreements: {
                    terms: true,
                    privacy: true,
                    data: true
                }
            });
            
            if (legalResponse.data.success) {
                console.log('✅ Legal agreements accepted');
                
                // Step 4: Test manual entry (since we don't have real ID processing in test)
                console.log('\n4. Testing manual account creation...');
                const accountResponse = await axios.post(`${BASE_URL}/api/application-enhanced/step1/manual-entry`, {
                    first_name: 'Test',
                    surname: 'User',
                    email: 'test@example.com',
                    phone: '+264812345678',
                    country: 'Namibia',
                    id_number: '12345678901234',
                    date_of_birth: '1990-01-01',
                    gender: 'Male'
                });
                
                if (accountResponse.data.success) {
                    console.log('✅ Account created successfully:', accountResponse.data.user.username);
                    console.log('   Email would be sent to:', accountResponse.data.user.email);
                    
                    const userToken = accountResponse.data.user.token;
                    
                    // Step 5: Test certificate upload (simulated)
                    console.log('\n5. Testing certificate upload...');
                    // Note: This would require actual file uploads in a real test
                    console.log('⏭️  Certificate upload would require file handling (skipped in basic test)');
                    
                    console.log('\n🎉 Application flow test completed successfully!');
                    console.log('\n📧 In a real scenario, the user would:');
                    console.log('   1. Receive an email with login credentials');
                    console.log('   2. Verify their email address');
                    console.log('   3. Login to complete their profile');
                    console.log('   4. Upload certificates and media');
                    console.log('   5. Get their Traffic Light score');
                    
                } else {
                    console.error('❌ Account creation failed:', accountResponse.data.error);
                }
                
            } else {
                console.error('❌ Legal agreements failed:', legalResponse.data.error);
            }
            
        } else {
            console.error('❌ Session start failed:', sessionResponse.data.error);
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.response ? error.response.data : error.message);
        console.error('💡 Make sure the server is running on port 3001');
    }
}

// Run the test if this file is executed directly
if (require.main === module) {
    testApplicationFlow();
}

module.exports = testApplicationFlow;