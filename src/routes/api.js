// Step 3: Update src/routes/api.js to use real controllers

const express = require('express');
const router = express.Router();
const { SocialMediaController } = require('../controllers/SocialMediaController');
const logger = require('../utils/logger');

const socialController = new SocialMediaController();

// Content publishing with real implementation
router.post('/content/publish', async (req, res) => {
  try {
    const { content, platforms, category, options } = req.body;
    
    // Validation
    if (!content || !platforms || platforms.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Content and platforms are required'
      });
    }

    // Check for required API keys
    const missingKeys = [];
    if (platforms.includes('linkedin') && !process.env.LINKEDIN_ACCESS_TOKEN) {
      missingKeys.push('LINKEDIN_ACCESS_TOKEN');
    }
    if ((platforms.includes('twitter') || platforms.includes('x')) && !process.env.TWITTER_ACCESS_TOKEN) {
      missingKeys.push('TWITTER_ACCESS_TOKEN');
    }

    if (missingKeys.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required environment variables: ${missingKeys.join(', ')}`,
        hint: 'Please add these API keys to your .env file'
      });
    }

    logger.info('Real content publish request', { 
      contentLength: content.length, 
      platforms, 
      category 
    });

    // Real publishing
    const results = await socialController.publishContent(
      content, platforms, category, options
    );

    const successCount = Object.values(results).filter(r => r.success).length;
    const totalCount = Object.keys(results).length;

    res.json({
      success: successCount > 0,
      message: `Published to ${successCount}/${totalCount} platforms`,
      data: {
        results: results,
        summary: {
          successful: successCount,
          failed: totalCount - successCount,
          platforms: platforms
        },
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Content publish failed:', error);
    res.status(500).json({
      success: false,
      message: 'Publishing failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal error'
    });
  }
});

// Content preview with real AI adaptation
router.post('/content/preview', async (req, res) => {
  try {
    const { content, platforms, category, options } = req.body;
    
    if (!content || !platforms) {
      return res.status(400).json({
        success: false,
        message: 'Content and platforms are required'
      });
    }

    logger.info('Real content preview request', { 
      contentLength: content.length, 
      platforms, 
      category 
    });

    // Real AI-powered preview
    const previewData = await socialController.previewContent(
      content, platforms, category, options
    );

    res.json({
      success: true,
      data: previewData
    });

  } catch (error) {
    logger.error('Content preview failed:', error);
    res.status(500).json({
      success: false,
      message: 'Preview generation failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal error'
    });
  }
});

// Test LinkedIn authentication
router.get('/test/linkedin-auth', async (req, res) => {
  try {
    const LinkedInPublisher = require('../publishers/LinkedInPublisher');
    const publisher = new LinkedInPublisher();
    
    const profile = await publisher.getUserProfile();
    
    res.json({
      success: true,
      message: 'LinkedIn authentication successful',
      data: {
        id: profile.id,
        firstName: profile.localizedFirstName,
        lastName: profile.localizedLastName,
        headline: profile.headline?.localized || 'No headline'
      }
    });
  } catch (error) {
    logger.error('LinkedIn auth test failed:', error);
    res.status(400).json({
      success: false,
      message: 'LinkedIn authentication failed',
      error: error.message,
      hint: 'Check your LINKEDIN_ACCESS_TOKEN in .env file'
    });
  }
});

// Test Twitter authentication
router.get('/test/twitter-auth', async (req, res) => {
  try {
    const TwitterPublisher = require('../publishers/TwitterPublisher');
    const publisher = new TwitterPublisher();
    
    const profile = await publisher.getUserProfile();
    
    res.json({
      success: true,
      message: 'Twitter authentication successful',
      data: {
        id: profile.profile?.id,
        username: profile.profile?.username,
        name: profile.profile?.name,
        followers: profile.profile?.public_metrics?.followers_count || 0
      }
    });
  } catch (error) {
    logger.error('Twitter auth test failed:', error);
    res.status(400).json({
      success: false,
      message: 'Twitter authentication failed',
      error: error.message,
      hint: 'Check your TWITTER_ACCESS_TOKEN in .env file'
    });
  }
});

module.exports = router;