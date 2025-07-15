#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

console.log('🔧 Setting up Social Media Automation MVP...');

async function createDirectories() {
  const dirs = [
    'src/controllers', 'src/publishers', 'src/processors', 'src/filters',
    'src/database', 'tests/unit', 'tests/integration', 'config', 'docs'
  ];

  for (const dir of dirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
      console.log(`✓ Created directory: ${dir}`);
    } catch (error) {
      if (error.code !== 'EEXIST') {
        console.error(`✗ Failed to create ${dir}:`, error.message);
      }
    }
  }
}

async function createEnvFile() {
  try {
    await fs.access('.env');
    console.log('✓ .env file already exists');
  } catch {
    try {
      await fs.copyFile('.env.example', '.env');
      console.log('✓ Created .env file');
      console.log('⚠️  Please update .env with your API credentials');
    } catch (error) {
      console.error('✗ Failed to create .env file:', error.message);
    }
  }
}

async function createBasicTest() {
  const testContent = `const request = require('supertest');
const app = require('../src/index');

describe('API Tests', () => {
  test('Health endpoint returns 200', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);
    
    expect(response.body.status).toBe('healthy');
  });
});
`;

  try {
    await fs.writeFile('tests/unit/basic.test.js', testContent);
    console.log('✓ Created basic test file');
  } catch (error) {
    console.error('✗ Failed to create test file:', error.message);
  }
}

async function main() {
  try {
    await createDirectories();
    await createEnvFile();
    await createBasicTest();
    
    console.log('\n🎉 Setup completed!');
    console.log('\n📋 Next steps:');
    console.log('1. Update .env with your API credentials');
    console.log('2. npm install');
    console.log('3. npm run dev');
    console.log('4. Test: curl http://localhost:3000/health');
    
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
  }
}

main();