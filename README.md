# Social Media Automation MVP

🚀 AI-powered social media content distribution system that automatically adapts and publishes your content across multiple platforms.

## Quick Start

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Update .env with your API keys

# Start development
npm run dev
```

## Test Your Setup

```bash
# Health check
curl http://localhost:3000/health

# Test content preview
curl -X POST http://localhost:3000/api/content/preview \
  -H "Content-Type: application/json" \
  -d '{"content":"AI is transforming business","platforms":["linkedin"]}'
```

## Features

- ✅ Multi-platform publishing (LinkedIn, Twitter, Medium)
- ✅ AI content adaptation for each platform
- ✅ Privacy protection and content filtering
- ✅ RSS feed monitoring
- ✅ RESTful API with comprehensive endpoints
- ✅ Docker deployment ready

## API Endpoints

- `GET /health` - Application health check
- `POST /api/content/publish` - Publish content to platforms
- `POST /api/content/preview` - Preview adapted content
- `GET /api/stats` - Analytics and statistics

## Development

```bash
npm run dev          # Start with hot reload
npm test             # Run tests
npm run setup        # Run setup script
```

## Next Steps

1. **Add your API credentials** to `.env`
2. **Implement publishers** in `src/publishers/`
3. **Add AI processing** in `src/processors/`
4. **Customize content adaptation** prompts
5. **Deploy** using Docker or cloud services

## License

MIT