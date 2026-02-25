// Test login API directly
const axios = require('axios');

const testLogin = async () => {
  try {
    console.log('Testing login API...\n');
    
    const response = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'admin@school.com',
      password: 'admin123'
    }, {
      withCredentials: true,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Login Successful!');
    console.log('\nResponse:');
    console.log('Success:', response.data.success);
    console.log('Message:', response.data.message);
    console.log('User:', response.data.user);
    console.log('Token:', response.data.token ? 'Generated ✓' : 'Missing ✗');
    
  } catch (error) {
    console.log('❌ Login Failed!');
    console.log('\nError:', error.response?.data || error.message);
    console.log('Status:', error.response?.status);
  }
};

testLogin();
