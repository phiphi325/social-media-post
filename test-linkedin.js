require('dotenv').config();
const axios = require('axios');

async function testLinkedInAPI() {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  
  console.log('Token exists:', !!token);
  console.log('Token length:', token ? token.length : 0);
  console.log('Token starts with:', token ? token.substring(0, 10) + '...' : 'N/A');
  
  try {
    // Test the LinkedIn API directly
    const response = await axios.get('https://api.linkedin.com/v2/people/~', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });
    
    console.log('✅ LinkedIn API Success:', {
      id: response.data.id,
      firstName: response.data.localizedFirstName,
      lastName: response.data.localizedLastName
    });
    
  } catch (error) {
    console.error('❌ LinkedIn API Error:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data
    });
  }
}

testLinkedInAPI();