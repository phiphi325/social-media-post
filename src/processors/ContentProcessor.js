// Step 2: Create src/processors/ContentProcessor.js
// This adds real AI content adaptation

const logger = require('../utils/logger');
const PrivacyFilter = require('../filters/PrivacyFilter');

class ContentProcessor {
  constructor() {
    this.contentCache = new Map();
    
    // Initialize OpenAI if available
    this.openai = null;
    this.initializeOpenAI();
    
    // Initialize Privacy Filter
    this.privacyFilter = new PrivacyFilter();
  }

  async initializeOpenAI() {
    try {
      if (process.env.OPENAI_API_KEY) {
        const OpenAI = require('openai');
        this.openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
        });
        logger.info('OpenAI initialized successfully');
      } else {
        logger.warn('OPENAI_API_KEY not found, using basic content processing');
      }
    } catch (error) {
      logger.warn('OpenAI initialization failed, using basic processing:', error.message);
    }
  }

  async adaptContentForPlatforms(content, platforms, options = {}) {
    const startTime = Date.now();
    const adaptedContent = {};
    
    try {
      const category = options.category || 'ai_automation';
      
      // Step 1: Apply privacy filtering if enabled
      const privacyResult = await this.privacyFilter.filterContent(content, options);
      const filteredContent = privacyResult.filteredContent;
      
      // Log privacy analysis results
      if (privacyResult.privacyFilterEnabled && privacyResult.privacyAnalysis) {
        logger.info('Privacy filter applied', {
          riskLevel: privacyResult.privacyAnalysis.riskLevel,
          issuesDetected: privacyResult.privacyAnalysis.detectedIssues.length,
          contentModified: filteredContent !== content
        });
      }
      
      // Step 2: Process each platform with filtered content
      for (const platform of platforms) {
        try {
          let platformContent;
          if (this.openai) {
            platformContent = await this.aiAdaptContent(filteredContent, platform, category);
          } else {
            platformContent = this.basicAdaptContent(filteredContent, platform);
          }
          
          // Add privacy information to adapted content
          if (privacyResult.privacyFilterEnabled) {
            platformContent.privacyInfo = {
              riskLevel: privacyResult.privacyAnalysis?.riskLevel || 'unknown',
              issuesDetected: privacyResult.privacyAnalysis?.detectedIssues.length || 0,
              suggestions: privacyResult.privacyAnalysis?.suggestions || []
            };
          }
          
          adaptedContent[platform] = platformContent;
        } catch (error) {
          logger.error(`Failed to adapt content for ${platform}:`, error);
          adaptedContent[platform] = this.basicAdaptContent(filteredContent, platform);
        }
      }

      logger.info('Content adaptation completed', { 
        duration: Date.now() - startTime,
        platforms: platforms.length, 
        category,
        method: this.openai ? 'AI' : 'basic'
      });

      return adaptedContent;
    } catch (error) {
      logger.error('Content adaptation failed:', error);
      throw new Error(`Content adaptation failed: ${error.message}`);
    }
  }

  async aiAdaptContent(content, platform, category) {
    const cacheKey = `${platform}-${category}-${this.hashContent(content)}`;
    
    if (this.contentCache.has(cacheKey)) {
      logger.info(`Using cached adaptation for ${platform}`);
      return this.contentCache.get(cacheKey);
    }

    const prompt = this.buildAIPrompt(content, platform, category);

    try {
      const response = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt(platform, category)
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 600,
        temperature: 0.7
      });

      const adaptedContent = this.parseAIResponse(response.choices[0].message.content, platform);
      
      // Cache the result
      this.contentCache.set(cacheKey, adaptedContent);
      
      return adaptedContent;
    } catch (error) {
      logger.error(`AI adaptation failed for ${platform}:`, error);
      return this.basicAdaptContent(content, platform);
    }
  }

  getSystemPrompt(platform, category) {
    return `You are a social media expert adapting content for ${platform}.
Transform the content while preserving the core message.
Return only valid JSON with: text, hashtags, title (if applicable), callToAction, estimatedEngagement.
Keep it professional yet engaging.`;
  }

  buildAIPrompt(content, platform, category) {
    const requirements = {
      linkedin: 'Professional tone, 2-3 hashtags, discussion prompt, under 3000 chars',
      twitter: 'Conversational, 1-3 hashtags, under 280 chars per tweet',
      medium: 'Thoughtful tone, detailed with examples, 8+ min read'
    };

    return `Transform this content for ${platform}:

"${content}"

Requirements: ${requirements[platform] || requirements.linkedin}
Category: ${category}

Return JSON format:
{
  "text": "adapted content",
  "hashtags": ["tag1", "tag2"], 
  "title": "title if needed",
  "callToAction": "engagement prompt",
  "estimatedEngagement": "low/medium/high"
}`;
  }

  parseAIResponse(response, platform) {
    try {
      const parsed = JSON.parse(response);
      return this.validateContent(parsed, platform);
    } catch (error) {
      logger.warn('Failed to parse AI response, using fallback');
      return this.basicAdaptContent(response, platform);
    }
  }

  validateContent(content, platform) {
    const maxLengths = { linkedin: 3000, twitter: 280, medium: 50000 };
    const maxLength = maxLengths[platform] || 3000;
    
    if (content.text && content.text.length > maxLength) {
      content.text = content.text.substring(0, maxLength - 3) + '...';
    }

    // Ensure required fields
    content.hashtags = content.hashtags || ['AI', 'Technology'];
    content.callToAction = content.callToAction || 'What are your thoughts?';
    content.estimatedEngagement = content.estimatedEngagement || 'medium';

    return content;
  }

  basicAdaptContent(content, platform) {
    const maxLengths = { linkedin: 2800, twitter: 250, medium: 1000 };
    const maxLength = maxLengths[platform] || 500;
    
    let text = content.length > maxLength 
      ? content.substring(0, maxLength - 3) + '...' 
      : content;
    
    // Platform-specific formatting
    if (platform === 'linkedin') {
      text = `🚀 ${text}\n\nWhat are your thoughts on this?`;
    } else if (platform === 'twitter') {
      text = `${text} 🧵`;
    }

    return {
      text: text,
      hashtags: ['AI', 'Technology', 'Innovation'],
      title: platform === 'medium' ? 'Insights and Thoughts' : null,
      callToAction: 'What do you think?',
      estimatedEngagement: 'medium'
    };
  }

  hashContent(content) {
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).substring(0, 8);
  }

  // Method to analyze content for privacy risks without processing
  async analyzePrivacyRisks(content) {
    return await this.privacyFilter.analyzeContent(content);
  }

  // Method to get privacy suggestions
  async getPrivacySuggestions(content) {
    return await this.privacyFilter.getAnonymizationSuggestions(content);
  }
}

module.exports = { ContentProcessor };