#!/usr/bin/env node

/**
 * Simple test for the frontend API route
 * Run with: node test-frontend-api.js
 */

async function testFrontendApi() {
  console.log('🧪 Testing Frontend API Route\n');

  try {
    // Test the frontend API route
    const response = await fetch('http://localhost:9002/api/test-agent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question: 'Test question',
        conversation: []
      })
    });

    console.log('✅ Frontend API Route Test:');
    console.log('   Status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('   Response keys:', Object.keys(data));
      console.log('   Answer preview:', data.answer?.substring(0, 50) + '...');
    } else {
      console.log('   Error:', await response.text());
    }
  } catch (error) {
    console.log('ℹ️  Frontend API test error (may be expected if frontend not running):', error.message);
  }

  console.log('\n✨ Frontend API Test Complete!');
}

testFrontendApi();