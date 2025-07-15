const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');

class TwitterPublisher {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.TWITTER_API_KEY;
    this.apiSecret = config.apiSecret || process.env.TWITTER_API_SECRET;
    this.accessToken = config.accessToken || process.env.TWITTER_ACCESS_TOKEN;
    this.accessSecret = config.accessSecret || process.env.TWITTER_ACCESS_SECRET;
    this.bearerToken = config.bearerToken || process.env.TWITTER_BEARER_TOKEN;
    
    this.baseUrl = 'https://api.twitter.com/2';
    this.uploadUrl = 'https://upload.twitter.com/1.1';
    
    // Rate limiting - Twitter API v2 limits
    this.rateLimiter = {
      tweets: {
        requests: [],
        maxRequests: 300, // 300 tweets per 15-minute window
        timeWindow: 15 * 60 * 1000 // 15 minutes
      },
      media: {
        requests: [],
        maxRequests: 300, // 300 media uploads per 15-minute window
        timeWindow: 15 * 60 * 1000
      }
    };
    
    // Tweet length limits
    this.maxTweetLength = 280;
    this.maxThreadTweets = 25;
  }

  async authenticate(authCode, codeVerifier) {
    try {
      const tokenResponse = await axios.post('https://api.twitter.com/2/oauth2/token', {
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: process.env.TWITTER_REDIRECT_URI,
        code_verifier: codeVerifier,
        client_id: this.apiKey
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString('base64')}`
        }
      });

      const { access_token, refresh_token, expires_in } = tokenResponse.data;
      
      logger.info('Twitter authentication successful');
      
      return {
        success: true,
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresIn: expires_in,
        expiresAt: new Date(Date.now() + expires_in * 1000).toISOString()
      };
    } catch (error) {
      logger.error('Twitter authentication failed:', error.response?.data || error.message);
      
      return {
        success: false,
        error: 'Authentication failed',
        details: error.response?.data?.error_description || error.message
      };
    }
  }

  async getUserProfile(accessToken) {
    try {
      await this.checkRateLimit('api');
      
      const token = accessToken || this.accessToken;
      const response = await axios.get(`${this.baseUrl}/users/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        params: {
          'user.fields': 'id,name,username,public_metrics,description,profile_image_url'
        }
      });

      return {
        success: true,
        profile: response.data.data,
        method: 'twitter_api_v2'
      };
    } catch (error) {
      logger.error('Failed to get Twitter user profile:', error.response?.data || error.message);
      
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
      const hashtagString = options.hashtags
        .map(tag => tag.startsWith('#') ? tag : `#${tag}`)
        .slice(0, 5) // Limit to 5 hashtags for better engagement
        .join(' ');
      formattedContent += `\n\n${hashtagString}`;
    }
    
    // Add mentions if provided
    if (options.mentions && Array.isArray(options.mentions)) {
      const mentionString = options.mentions
        .map(mention => mention.startsWith('@') ? mention : `@${mention}`)
        .slice(0, 3) // Limit mentions
        .join(' ');
      formattedContent += `\n\n${mentionString}`;
    }
    
    // Add GitHub repo link if not already present and there's space
    const repoUrl = 'https://github.com/phiphi325/social-media-post';
    if (!formattedContent.includes(repoUrl)) {
      const linkText = `\n\n🔗 Code: ${repoUrl}`;
      // Only add if it fits within reasonable length for threading
      if ((formattedContent + linkText).length <= 1000) {
        formattedContent += linkText;
      }
    }
    
    return formattedContent;
  }

  splitIntoThreads(content) {
    const tweets = [];
    let remainingContent = content;
    let tweetNumber = 1;
    
    // Calculate available length for thread numbering (e.g., " 1/5")
    const threadNumberLength = 10; // Conservative estimate
    const availableLength = this.maxTweetLength - threadNumberLength;
    
    while (remainingContent.length > 0 && tweets.length < this.maxThreadTweets) {
      if (remainingContent.length <= availableLength) {
        // Last tweet or content fits in one tweet
        tweets.push(remainingContent.trim());
        break;
      }
      
      // Find the best place to split
      let splitIndex = availableLength;
      
      // Try to split at sentence boundaries
      const sentenceEnd = remainingContent.lastIndexOf('.', splitIndex);
      const questionEnd = remainingContent.lastIndexOf('?', splitIndex);
      const exclamationEnd = remainingContent.lastIndexOf('!', splitIndex);
      
      const bestSentenceEnd = Math.max(sentenceEnd, questionEnd, exclamationEnd);
      if (bestSentenceEnd > availableLength * 0.7) {
        splitIndex = bestSentenceEnd + 1;
      } else {
        // Split at word boundaries
        const lastSpace = remainingContent.lastIndexOf(' ', splitIndex);
        if (lastSpace > availableLength * 0.7) {
          splitIndex = lastSpace;
        }
      }
      
      tweets.push(remainingContent.substring(0, splitIndex).trim());
      remainingContent = remainingContent.substring(splitIndex).trim();
      tweetNumber++;
    }
    
    // Add thread numbering if multiple tweets
    if (tweets.length > 1) {
      tweets.forEach((tweet, index) => {
        tweets[index] = `${tweet} ${index + 1}/${tweets.length}`;
      });
    }
    
    return tweets;
  }

  async uploadMedia(mediaUrl, accessToken) {
    try {
      await this.checkRateLimit('media');
      
      // Download media first
      const mediaResponse = await axios.get(mediaUrl, { responseType: 'arraybuffer' });
      const mediaBuffer = Buffer.from(mediaResponse.data);
      
      // Determine media type
      const contentType = mediaResponse.headers['content-type'] || 'image/jpeg';
      const mediaCategory = contentType.startsWith('video/') ? 'tweet_video' : 'tweet_image';
      
      // Upload media to Twitter
      const formData = new FormData();
      formData.append('media', mediaBuffer, {
        filename: 'media',
        contentType: contentType
      });
      formData.append('media_category', mediaCategory);
      
      const uploadResponse = await axios.post(`${this.uploadUrl}/media/upload.json`, formData, {
        headers: {
          'Authorization': this.generateOAuth1Header('POST', `${this.uploadUrl}/media/upload.json`),
          ...formData.getHeaders()
        }
      });
      
      return {
        success: true,
        mediaId: uploadResponse.data.media_id_string
      };
    } catch (error) {
      logger.error('Twitter media upload failed:', error.response?.data || error.message);
      
      return {
        success: false,
        error: 'Media upload failed',
        details: error.response?.data || error.message
      };
    }
  }

  async publish(accessTokenOrAdaptedContent, content, options = {}) {
    try {
      await this.checkRateLimit('tweets');
      
      // Handle both calling patterns like LinkedInPublisher
      let accessToken, actualContent, actualOptions;
      
      if (typeof accessTokenOrAdaptedContent === 'object' && accessTokenOrAdaptedContent.text) {
        const adaptedContent = accessTokenOrAdaptedContent;
        accessToken = this.accessToken;
        actualContent = adaptedContent.text;
        actualOptions = {
          hashtags: adaptedContent.hashtags,
          mediaUrl: adaptedContent.mediaUrl,
          mediaDescription: adaptedContent.description,
          ...options
        };
      } else {
        accessToken = accessTokenOrAdaptedContent;
        actualContent = content;
        actualOptions = options;
      }
      
      // For posting, we need OAuth 1.0a credentials, not just access token
      if (!this.apiKey || !this.apiSecret || !this.accessToken || !this.accessSecret) {
        return {
          success: false,
          error: 'Missing OAuth 1.0a credentials',
          details: 'Twitter posting requires TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, and TWITTER_ACCESS_SECRET for OAuth 1.0a authentication',
          platform: 'twitter',
          requiredEnvVars: ['TWITTER_API_KEY', 'TWITTER_API_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_SECRET']
        };
      }
      
      const formattedContent = this.formatContent(actualContent, actualOptions);
      const tweets = this.splitIntoThreads(formattedContent);
      
      // Handle media upload if provided
      let mediaIds = [];
      if (actualOptions.mediaUrl) {
        const mediaResult = await this.uploadMedia(actualOptions.mediaUrl, accessToken);
        if (mediaResult.success) {
          mediaIds.push(mediaResult.mediaId);
        } else {
          logger.warn('Media upload failed, posting without media');
        }
      }
      
      const results = [];
      let inReplyToTweetId = null;
      
      // Post tweets in sequence
      for (let i = 0; i < tweets.length; i++) {
        const tweetData = {
          text: tweets[i]
        };
        
        // Add media to first tweet only
        if (i === 0 && mediaIds.length > 0) {
          tweetData.media = { media_ids: mediaIds };
        }
        
        // Add reply reference for thread
        if (inReplyToTweetId) {
          tweetData.reply = { in_reply_to_tweet_id: inReplyToTweetId };
        }
        
        const response = await axios.post(`${this.baseUrl}/tweets`, tweetData, {
          headers: {
            'Authorization': this.generateOAuth1Header('POST', `${this.baseUrl}/tweets`),
            'Content-Type': 'application/json'
          }
        });
        
        const tweetResult = {
          success: true,
          tweetId: response.data.data.id,
          tweetUrl: `https://twitter.com/i/web/status/${response.data.data.id}`,
          text: tweets[i],
          threadPosition: i + 1,
          threadTotal: tweets.length
        };
        
        results.push(tweetResult);
        inReplyToTweetId = response.data.data.id;
        
        // Add delay between tweets in thread to avoid rate limiting
        if (i < tweets.length - 1) {
          await this.delay(2000);
        }
      }
      
      logger.info('Twitter thread published successfully', { 
        tweets: results.length,
        firstTweetId: results[0].tweetId 
      });
      
      return {
        success: true,
        thread: results,
        threadUrl: results[0].tweetUrl,
        publishedAt: new Date().toISOString(),
        platform: 'twitter',
        stats: {
          totalTweets: results.length,
          totalCharacters: formattedContent.length
        }
      };
    } catch (error) {
      logger.error('Twitter post publication failed:', error.response?.data || error.message);
      
      return {
        success: false,
        error: 'Post publication failed',
        details: error.response?.data || error.message,
        platform: 'twitter'
      };
    }
  }

  async checkRateLimit(type = 'tweets') {
    const limiter = this.rateLimiter[type];
    const now = Date.now();
    
    // Remove requests older than the time window
    limiter.requests = limiter.requests.filter(
      timestamp => now - timestamp < limiter.timeWindow
    );
    
    // Check if we're at the rate limit
    if (limiter.requests.length >= limiter.maxRequests) {
      const oldestRequest = Math.min(...limiter.requests);
      const resetTime = oldestRequest + limiter.timeWindow;
      const waitTime = resetTime - now;
      
      logger.warn(`Twitter ${type} rate limit reached. Next request available in ${Math.ceil(waitTime / 1000)} seconds`);
      
      throw new Error(`Rate limit exceeded for ${type}. Try again in ${Math.ceil(waitTime / 60000)} minutes`);
    }
    
    // Add current request to the tracker
    limiter.requests.push(now);
  }

  generateOAuth1Header(method, url, params = {}) {
    const oauth = {
      oauth_consumer_key: this.apiKey,
      oauth_token: this.accessToken,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: Math.floor(Date.now() / 1000),
      oauth_nonce: crypto.randomBytes(16).toString('hex'),
      oauth_version: '1.0'
    };
    
    // Create parameter string
    const allParams = { ...oauth, ...params };
    const paramString = Object.keys(allParams)
      .sort()
      .map(key => `${key}=${encodeURIComponent(allParams[key])}`)
      .join('&');
    
    // Create signature base string
    const signatureBase = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(paramString)}`;
    
    // Create signing key
    const signingKey = `${encodeURIComponent(this.apiSecret)}&${encodeURIComponent(this.accessSecret)}`;
    
    // Generate signature
    const signature = crypto.createHmac('sha1', signingKey).update(signatureBase).digest('base64');
    oauth.oauth_signature = signature;
    
    // Create authorization header
    const authHeader = 'OAuth ' + Object.keys(oauth)
      .map(key => `${key}="${encodeURIComponent(oauth[key])}"`)
      .join(', ');
    
    return authHeader;
  }

  getAuthUrl(state = '', codeChallenge = '') {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.apiKey,
      redirect_uri: process.env.TWITTER_REDIRECT_URI || 'http://localhost:3000/auth/twitter/callback',
      scope: 'tweet.read tweet.write users.read offline.access',
      state: state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });
    
    return `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
  }

  async validateToken(accessToken) {
    try {
      const response = await this.getUserProfile(accessToken);
      return {
        success: response.success,
        valid: response.success,
        profile: response.profile,
        error: response.error
      };
    } catch (error) {
      return {
        success: false,
        valid: false,
        error: error.message
      };
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = TwitterPublisher;