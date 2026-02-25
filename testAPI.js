const http = require('http');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Create a JWT token directly for the teacher
const teacherId = '6971e4f4b04a0b40964cdd37';
const token = jwt.sign({ id: teacherId }, process.env.JWT_SECRET, { expiresIn: '7d' });

console.log('✅ Token created:', token.substring(0, 20) + '...\n');

// Call assigned-classes endpoint
const classesOptions = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/teachers/assigned-classes',
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
};

const classesReq = http.request(classesOptions, (classesRes) => {
  let classesBody = '';
  
  classesRes.on('data', (chunk) => {
    classesBody += chunk;
  });
  
  classesRes.on('end', () => {
    console.log('Classes Response Status:', classesRes.statusCode);
    const classesResult = JSON.parse(classesBody);
    console.log('\nClasses Result:');
    console.log(JSON.stringify(classesResult, null, 2));
    
    process.exit(0);
  });
});

classesReq.on('error', (e) => {
  console.error('Error calling assigned-classes:', e);
  process.exit(1);
});

classesReq.end();
