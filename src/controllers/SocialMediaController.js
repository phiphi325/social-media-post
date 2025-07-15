
const LinkedInPublisher = require('../publishers/LinkedInPublisher');
const TwitterPublisher = require('../publishers/TwitterPublisher');
const logger = require('../utils/logger');

class SocialMediaController {
  constructor() {
    this.publishers = {
      linkedin: new LinkedInPublisher(),
      twitter: new TwitterPublisher()
    };
    // Initialize ContentProcessor later to avoid circular dependencies
    this.contentProcessor = null;
  }

  async initializeContentProcessor() {
    if (!this.contentProcessor) {
      try {
        const { ContentProcessor } = require('../processors/ContentProcessor');
        this.contentProcessor = new ContentProcessor();
      } catch (error) {
        logger.warn('ContentProcessor not available, using basic adaptation');
        this.contentProcessor = new BasicContentProcessor();
      }
    }
  }

  async publishContent(content, platforms, category, options = {}) {
    const results = {};
    
    try {
      await this.initializeContentProcessor();
      
      // First, adapt content for each platform
      const adaptedContent = await this.contentProcessor.adaptContentForPlatforms(
        content, platforms, { category, ...options }
      );

      // Then publish to each platform
      for (const platform of platforms) {
        if (!this.publishers[platform]) {
          results[platform] = {
            success: false,
            error: `Publisher not implemented for ${platform}`
          };
          continue;
        }

        try {
          logger.info(`Publishing to ${platform}...`);
          
          const publishResult = await this.publishers[platform].publish(
            adaptedContent[platform]
          );
          
          results[platform] = {
            success: true,
            data: publishResult,
            adaptedContent: adaptedContent[platform],
            timestamp: new Date().toISOString()
          };
          
          logger.info(`Successfully published to ${platform}`, publishResult);
          
          // Add delay between publications to respect rate limits
          if (platforms.length > 1) {
            await this.delay(2000);
          }
          
        } catch (error) {
          logger.error(`Failed to publish to ${platform}:`, error);
          results[platform] = {
            success: false,
            error: error.message,
            adaptedContent: adaptedContent[platform],
            timestamp: new Date().toISOString()
          };
        }
      }
      
      return results;
    } catch (error) {
      logger.error('Content processing failed:', error);
      throw new Error(`Content processing failed: ${error.message}`);
    }
  }

  async previewContent(content, platforms, category, options = {}) {
    try {
      await this.initializeContentProcessor();
      
      const adaptedContent = await this.contentProcessor.adaptContentForPlatforms(
        content, platforms, { category, ...options }
      );

      return {
        original: content,
        adapted: adaptedContent,
        category: category || 'ai_automation',
        platforms: platforms,
        estimatedPublishTime: new Date(Date.now() + 30000).toISOString()
      };
    } catch (error) {
      logger.error('Content preview failed:', error);
      throw new Error(`Preview generation failed: ${error.message}`);
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Basic fallback processor when OpenAI is not available
class BasicContentProcessor {
  async adaptContentForPlatforms(content, platforms, options = {}) {
    const adaptedContent = {};
    
    platforms.forEach(platform => {
      adaptedContent[platform] = this.createBasicAdaptation(content, platform);
    });
    
    return adaptedContent;
  }

  createBasicAdaptation(content, platform) {
    const maxLengths = { linkedin: 2800, twitter: 250, medium: 1000 };
    const maxLength = maxLengths[platform] || 500;
    
    let text = content.length > maxLength 
      ? content.substring(0, maxLength - 3) + '...' 
      : content;
    
    // Add platform-specific formatting
    if (platform === 'linkedin') {
      text = `🚀 ${text}\n\nWhat are your thoughts?`;
    } else if (platform === 'twitter') {
      text = `${text} 🧵`;
    }

    return {
      text: text,
      hashtags: ['AI', 'Technology', 'Innovation'],
      title: platform === 'medium' ? 'Shared Insights' : null,
      callToAction: 'What do you think?',
      estimatedEngagement: 'medium'
    };
  }
}

module.exports = { SocialMediaController };