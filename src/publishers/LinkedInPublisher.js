const axios = require('axios');
const logger = require('../utils/logger');

class LinkedInPublisher {
  constructor(config = {}) {
    this.clientId = config.clientId || process.env.LINKEDIN_CLIENT_ID;
    this.clientSecret = config.clientSecret || process.env.LINKEDIN_CLIENT_SECRET;
    this.redirectUri = config.redirectUri || process.env.LINKEDIN_REDIRECT_URI;
    this.apiVersion = 'v2';
    this.baseUrl = 'https://api.linkedin.com';
    
    // Rate limiting - LinkedIn allows 100 API calls per day for basic access
    this.rateLimiter = {
      requests: [],
      maxRequests: 100,
      timeWindow: 24 * 60 * 60 * 1000 // 24 hours in milliseconds
    };
  }

  async authenticate(authCode) {
    try {
      const tokenResponse = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', {
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: this.redirectUri,
        client_id: this.clientId,
        client_secret: this.clientSecret
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const { access_token, expires_in } = tokenResponse.data;
      
      logger.info('LinkedIn authentication successful');
      
      return {
        success: true,
        accessToken: access_token,
        expiresIn: expires_in,
        expiresAt: new Date(Date.now() + expires_in * 1000).toISOString()
      };
    } catch (error) {
      logger.error('LinkedIn authentication failed:', error.response?.data || error.message);
      
      return {
        success: false,
        error: 'Authentication failed',
        details: error.response?.data?.error_description || error.message
      };
    }
  }

  async getUserProfile(accessToken) {
    try {
      await this.checkRateLimit();
      
      // Try the OpenID Connect userinfo endpoint first (works with 'profile' scope)
      try {
        const response = await axios.get('https://api.linkedin.com/v2/userinfo', {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'cache-control': 'no-cache'
          }
        });

        return {
          success: true,
          profile: response.data,
          method: 'openid_connect'
        };
      } catch (oidcError) {
        // Fallback to legacy API (works with 'r_liteprofile' scope)
        logger.info('OpenID Connect userinfo failed, trying legacy API');
        
        const response = await axios.get(`${this.baseUrl}/v2/people/~`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'cache-control': 'no-cache',
            'X-Restli-Protocol-Version': '2.0.0'
          }
        });

        return {
          success: true,
          profile: response.data,
          method: 'legacy_api'
        };
      }
    } catch (error) {
      logger.error('Failed to get LinkedIn user profile:', error.response?.data || error.message);
      
      // Check if it's a permissions error
      if (error.response?.status === 403) {
        return {
          success: false,
          error: 'Insufficient permissions for LinkedIn profile access',
          details: 'Your LinkedIn token needs either "profile" scope (OpenID Connect) or "r_liteprofile" scope (legacy). Please regenerate your token with proper permissions.',
          permissionsRequired: {
            'openid_connect': ['openid', 'profile', 'email', 'w_member_social'],
            'legacy': ['r_liteprofile', 'r_emailaddress', 'w_member_social']
          }
        };
      }
      
      return {
        success: false,
        error: 'Failed to retrieve user profile',
        details: error.response?.data || error.message
      };
    }
  }

  formatContent(content, options = {}) {
    let formattedContent = content;
    
    // Add hashtags if provided
    if (options.hashtags && Array.isArray(options.hashtags)) {
      const hashtagString = options.hashtags.map(tag => 
        tag.startsWith('#') ? tag : `#${tag}`
      ).join(' ');
      formattedContent += `\n\n${hashtagString}`;
    }
    
    // Add mentions if provided
    if (options.mentions && Array.isArray(options.mentions)) {
      const mentionString = options.mentions.map(mention => 
        mention.startsWith('@') ? mention : `@${mention}`
      ).join(' ');
      formattedContent += `\n\n${mentionString}`;
    }
    
    // Ensure content doesn't exceed LinkedIn's character limit (3000 characters)
    if (formattedContent.length > 3000) {
      logger.warn('Content exceeds LinkedIn character limit, truncating...');
      formattedContent = formattedContent.substring(0, 2997) + '...';
    }
    
    return formattedContent;
  }

  async publish(accessTokenOrAdaptedContent, content, options = {}) {
    try {
      await this.checkRateLimit();
      
      // Handle both calling patterns:
      // 1. publish(accessToken, content, options) - direct API usage
      // 2. publish(adaptedContent) - called from SocialMediaController
      let accessToken, actualContent, actualOptions;
      
      if (typeof accessTokenOrAdaptedContent === 'object' && accessTokenOrAdaptedContent.text) {
        // Called from SocialMediaController with adapted content object
        const adaptedContent = accessTokenOrAdaptedContent;
        accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
        actualContent = adaptedContent.text;
        actualOptions = {
          hashtags: adaptedContent.hashtags,
          mediaUrl: adaptedContent.mediaUrl,
          mediaTitle: adaptedContent.title,
          mediaDescription: adaptedContent.description,
          ...options
        };
      } else {
        // Direct API usage
        accessToken = accessTokenOrAdaptedContent;
        actualContent = content;
        actualOptions = options;
      }
      
      if (!accessToken) {
        return {
          success: false,
          error: 'No access token provided',
          details: 'Either pass accessToken as parameter or set LINKEDIN_ACCESS_TOKEN environment variable',
          platform: 'linkedin'
        };
      }
      
      const formattedContent = this.formatContent(actualContent, actualOptions);
      
      // Get the actual member ID since symbolic URNs don't work
      const profileResult = await this.getUserProfile(accessToken);
      if (!profileResult.success) {
        return {
          success: false,
          error: 'Cannot get user profile for posting',
          details: 'LinkedIn requires the actual member ID for posting. Profile access failed.',
          platform: 'linkedin'
        };
      }
      
      // Extract member ID from profile response
      let memberId;
      if (profileResult.method === 'openid_connect') {
        // OpenID Connect userinfo response has 'sub' field with member ID
        memberId = profileResult.profile.sub;
      } else {
        // Legacy API response has 'id' field
        memberId = profileResult.profile.id;
      }
      
      const personUrn = `urn:li:person:${memberId}`;
      
      const postData = {
        author: personUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: formattedContent
            },
            shareMediaCategory: 'NONE'
          }
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
        }
      };

      // Add media if provided
      if (actualOptions.mediaUrl) {
        postData.specificContent['com.linkedin.ugc.ShareContent'].shareMediaCategory = 'ARTICLE';
        postData.specificContent['com.linkedin.ugc.ShareContent'].media = [{
          status: 'READY',
          description: {
            text: actualOptions.mediaDescription || ''
          },
          media: actualOptions.mediaUrl,
          title: {
            text: actualOptions.mediaTitle || ''
          }
        }];
      }

      const response = await axios.post(`${this.baseUrl}/${this.apiVersion}/ugcPosts`, postData, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        }
      });

      logger.info('LinkedIn post published successfully', { postId: response.data.id });
      
      return {
        success: true,
        postId: response.data.id,
        postUrl: `https://www.linkedin.com/feed/update/${response.data.id}`,
        publishedAt: new Date().toISOString(),
        platform: 'linkedin'
      };
    } catch (error) {
      logger.error('LinkedIn post publication failed:', error.response?.data || error.message);
      
      return {
        success: false,
        error: 'Post publication failed',
        details: error.response?.data || error.message,
        platform: 'linkedin'
      };
    }
  }

  async checkRateLimit() {
    const now = Date.now();
    
    // Remove requests older than the time window
    this.rateLimiter.requests = this.rateLimiter.requests.filter(
      timestamp => now - timestamp < this.rateLimiter.timeWindow
    );
    
    // Check if we're at the rate limit
    if (this.rateLimiter.requests.length >= this.rateLimiter.maxRequests) {
      const oldestRequest = Math.min(...this.rateLimiter.requests);
      const resetTime = oldestRequest + this.rateLimiter.timeWindow;
      const waitTime = resetTime - now;
      
      logger.warn(`LinkedIn rate limit reached. Next request available in ${Math.ceil(waitTime / 1000)} seconds`);
      
      throw new Error(`Rate limit exceeded. Try again in ${Math.ceil(waitTime / 60000)} minutes`);
    }
    
    // Add current request to the tracker
    this.rateLimiter.requests.push(now);
  }

  getAuthUrl(state = '') {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      state: state,
      scope: 'openid profile email w_member_social'
    });
    
    return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
  }

  async validateToken(accessToken) {
    try {
      const response = await axios.get(`${this.baseUrl}/${this.apiVersion}/me`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0'
        }
      });
      
      return {
        success: true,
        valid: true,
        profile: response.data
      };
    } catch (error) {
      return {
        success: false,
        valid: false,
        error: error.response?.data || error.message
      };
    }
  }
}

module.exports = LinkedInPublisher;