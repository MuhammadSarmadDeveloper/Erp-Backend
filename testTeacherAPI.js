require('dotenv').config();
const axios = require('axios');

const testTeacherAPI = async () => {
  try {
    // First, login to get token
    console.log('Logging in...');
    const loginResponse = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'wahab78@gmail.com',  // This is the admin/teacher email
      password: 'admin123'
    });
    
    if (!loginResponse.data.success) {
      console.error('Login failed');
      process.exit(1);
    }
    
    const token = loginResponse.data.token;
    console.log('✅ Login successful, token:', token.substring(0, 20) + '...');
    
    // Now test the teacher API
    console.log('\nTesting teacher assigned classes API...');
    const classesResponse = await axios.get(
      'http://localhost:5000/api/teachers/assigned-classes',
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    
    console.log('✅ API Response:');
    console.log(JSON.stringify(classesResponse.data, null, 2));
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    process.exit(1);
  }
};

testTeacherAPI();