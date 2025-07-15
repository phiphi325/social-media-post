const axios = require('axios');
const TwitterPublisher = require('../../../src/publishers/TwitterPublisher');
const logger = require('../../../src/utils/logger');

jest.mock('axios');
jest.mock('../../../src/utils/logger');

describe('TwitterPublisher', () => {
  let publisher;
  const mockConfig = {
    apiKey: 'test-api-key',
    apiSecret: 'test-api-secret',
    accessToken: 'test-access-token',
    accessSecret: 'test-access-secret'
  };

  beforeEach(() => {
    publisher = new TwitterPublisher(mockConfig);
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    test('should initialize with provided config', () => {
      expect(publisher.apiKey).toBe(mockConfig.apiKey);
      expect(publisher.apiSecret).toBe(mockConfig.apiSecret);
      expect(publisher.accessToken).toBe(mockConfig.accessToken);
      expect(publisher.accessSecret).toBe(mockConfig.accessSecret);
      expect(publisher.baseUrl).toBe('https://api.twitter.com/2');
      expect(publisher.maxTweetLength).toBe(280);
    });

    test('should fall back to environment variables', () => {
      process.env.TWITTER_API_KEY = 'env-api-key';
      process.env.TWITTER_ACCESS_TOKEN = 'env-access-token';

      const envPublisher = new TwitterPublisher();
      expect(envPublisher.apiKey).toBe('env-api-key');
      expect(envPublisher.accessToken).toBe('env-access-token');
    });
  });

  describe('Authentication', () => {
    describe('getUserProfile()', () => {
      test('should successfully get user profile', async () => {
        const mockProfileResponse = {
          data: {
            data: {
              id: '123456789',
              username: 'testuser',
              name: 'Test User',
              public_metrics: { followers_count: 1000 }
            }
          }
        };

        axios.get.mockClear();
        axios.get.mockResolvedValueOnce(mockProfileResponse);
        
        // Mock rate limiter to avoid interference
        jest.spyOn(publisher, 'checkRateLimit').mockResolvedValue();

        const result = await publisher.getUserProfile('test-token');

        expect(axios.get).toHaveBeenCalledWith(
          'https://api.twitter.com/2/users/me',
          expect.objectContaining({
            headers: expect.objectContaining({
              'Authorization': 'Bearer test-token'
            })
          })
        );

        expect(result.success).toBe(true);
        expect(result.profile).toEqual(mockProfileResponse.data.data);
        expect(result.method).toBe('twitter_api_v2');
      });

      test('should handle profile fetch failure', async () => {
        const mockError = {
          response: { data: { title: 'Unauthorized' } }
        };

        axios.get.mockRejectedValue(mockError);

        const result = await publisher.getUserProfile('invalid-token');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Failed to retrieve user profile');
        expect(logger.error).toHaveBeenCalled();
      });
    });

    describe('validateToken()', () => {
      test('should validate valid token', async () => {
        const mockProfileResponse = {
          data: {
            data: { id: '123', username: 'test' }
          }
        };

        axios.get.mockClear();
        axios.get.mockResolvedValueOnce(mockProfileResponse);
        
        // Mock rate limiter
        jest.spyOn(publisher, 'checkRateLimit').mockResolvedValue();

        const result = await publisher.validateToken('valid-token');

        expect(result.success).toBe(true);
        expect(result.valid).toBe(true);
        expect(result.profile).toBeDefined();
      });

      test('should handle invalid token', async () => {
        axios.get.mockRejectedValue(new Error('Invalid token'));

        const result = await publisher.validateToken('invalid-token');

        expect(result.success).toBe(false);
        expect(result.valid).toBe(false);
      });
    });
  });

  describe('Content Formatting', () => {
    describe('formatContent()', () => {
      test('should format content with hashtags', () => {
        const content = 'Test tweet content';
        const options = { hashtags: ['test', '#social', 'twitter'] };

        const formatted = publisher.formatContent(content, options);

        expect(formatted).toBe('Test tweet content\n\n#test #social #twitter');
      });

      test('should format content with mentions', () => {
        const content = 'Test tweet content';
        const options = { mentions: ['user1', '@user2', 'user3'] };

        const formatted = publisher.formatContent(content, options);

        expect(formatted).toBe('Test tweet content\n\n@user1 @user2 @user3');
      });

      test('should limit hashtags to 5', () => {
        const content = 'Test tweet content';
        const options = { 
          hashtags: ['tag1', 'tag2', 'tag3', 'tag4', 'tag5', 'tag6', 'tag7'] 
        };

        const formatted = publisher.formatContent(content, options);

        expect(formatted).toBe('Test tweet content\n\n#tag1 #tag2 #tag3 #tag4 #tag5');
      });

      test('should limit mentions to 3', () => {
        const content = 'Test tweet content';
        const options = { 
          mentions: ['user1', 'user2', 'user3', 'user4', 'user5'] 
        };

        const formatted = publisher.formatContent(content, options);

        expect(formatted).toBe('Test tweet content\n\n@user1 @user2 @user3');
      });
    });

    describe('splitIntoThreads()', () => {
      test('should return single tweet for short content', () => {
        const shortContent = 'This is a short tweet';
        const tweets = publisher.splitIntoThreads(shortContent);

        expect(tweets).toEqual([shortContent]);
      });

      test('should split long content into multiple tweets', () => {
        const longContent = 'A'.repeat(500); // 500 characters
        const tweets = publisher.splitIntoThreads(longContent);

        expect(tweets.length).toBeGreaterThan(1);
        tweets.forEach((tweet, index) => {
          expect(tweet.length).toBeLessThanOrEqual(280);
          expect(tweet).toContain(`${index + 1}/${tweets.length}`);
        });
      });

      test('should split at sentence boundaries when possible', () => {
        const content = 'First sentence. ' + 'A'.repeat(300) + '. Third sentence that is also very long and should be in another tweet.';
        const tweets = publisher.splitIntoThreads(content);

        expect(tweets.length).toBeGreaterThan(1);
        expect(tweets[0]).toContain('First sentence.');
      });

      test('should limit threads to maximum tweets', () => {
        const veryLongContent = 'A'.repeat(10000); // Very long content
        const tweets = publisher.splitIntoThreads(veryLongContent);

        expect(tweets.length).toBeLessThanOrEqual(publisher.maxThreadTweets);
      });
    });
  });

  describe('Publishing', () => {
    describe('publish()', () => {
      const mockAccessToken = 'test-access-token';

      test('should successfully publish single tweet', async () => {
        const mockTweetResponse = {
          data: { data: { id: '1234567890' } }
        };

        axios.post.mockResolvedValue(mockTweetResponse);

        const content = 'Test tweet content';
        const result = await publisher.publish(mockAccessToken, content);

        expect(axios.post).toHaveBeenCalledWith(
          'https://api.twitter.com/2/tweets',
          expect.objectContaining({
            text: content
          }),
          expect.objectContaining({
            headers: expect.objectContaining({
              'Authorization': `Bearer ${mockAccessToken}`
            })
          })
        );

        expect(result.success).toBe(true);
        expect(result.thread).toHaveLength(1);
        expect(result.thread[0].tweetId).toBe('1234567890');
        expect(result.platform).toBe('twitter');
      });

      test('should publish thread for long content', async () => {
        const mockTweetResponses = [
          { data: { data: { id: '1111' } } },
          { data: { data: { id: '2222' } } }
        ];

        axios.post.mockResolvedValueOnce(mockTweetResponses[0]);
        axios.post.mockResolvedValueOnce(mockTweetResponses[1]);

        const longContent = 'A'.repeat(500); // Long content that will be split
        const result = await publisher.publish(mockAccessToken, longContent);

        expect(axios.post).toHaveBeenCalledTimes(2);
        expect(result.success).toBe(true);
        expect(result.thread).toHaveLength(2);
        expect(result.thread[0].tweetId).toBe('1111');
        expect(result.thread[1].tweetId).toBe('2222');
        
        // Second tweet should be a reply to the first
        expect(axios.post).toHaveBeenNthCalledWith(2,
          'https://api.twitter.com/2/tweets',
          expect.objectContaining({
            reply: { in_reply_to_tweet_id: '1111' }
          }),
          expect.any(Object)
        );
      });

      test('should handle adapted content object', async () => {
        const adaptedContent = {
          text: 'Test adapted content',
          hashtags: ['test', 'automation'],
          mediaUrl: 'https://example.com/image.jpg'
        };

        const mockTweetResponse = {
          data: { data: { id: '1234567890' } }
        };

        axios.post.mockResolvedValue(mockTweetResponse);

        const result = await publisher.publish(adaptedContent);

        expect(result.success).toBe(true);
        expect(axios.post).toHaveBeenCalledWith(
          'https://api.twitter.com/2/tweets',
          expect.objectContaining({
            text: expect.stringContaining('Test adapted content')
          }),
          expect.any(Object)
        );
      });

      test('should handle publication failure', async () => {
        const mockError = {
          response: { data: { title: 'Forbidden' } }
        };

        axios.post.mockRejectedValue(mockError);

        const result = await publisher.publish(mockAccessToken, 'Test content');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Post publication failed');
        expect(result.platform).toBe('twitter');
        expect(logger.error).toHaveBeenCalled();
      });

      test('should handle missing access token', async () => {
        const adaptedContent = { text: 'Test content' };
        
        // Create publisher without access token and clear env vars
        const originalToken = process.env.TWITTER_ACCESS_TOKEN;
        delete process.env.TWITTER_ACCESS_TOKEN;
        
        const publisherNoToken = new TwitterPublisher({});

        const result = await publisherNoToken.publish(adaptedContent);

        // Restore env var
        if (originalToken) process.env.TWITTER_ACCESS_TOKEN = originalToken;

        expect(result.success).toBe(false);
        expect(result.error).toBe('No access token provided');
      });
    });
  });

  describe('Rate Limiting', () => {
    describe('checkRateLimit()', () => {
      test('should allow requests within rate limit', async () => {
        await expect(publisher.checkRateLimit('tweets')).resolves.not.toThrow();
        expect(publisher.rateLimiter.tweets.requests).toHaveLength(1);
      });

      test('should throw error when rate limit exceeded', async () => {
        // Fill up the rate limiter
        const now = Date.now();
        publisher.rateLimiter.tweets.requests = new Array(300).fill(now);

        await expect(publisher.checkRateLimit('tweets')).rejects.toThrow('Rate limit exceeded');
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Twitter tweets rate limit reached')
        );
      });

      test('should clean old requests from rate limiter', async () => {
        const oldTimestamp = Date.now() - (20 * 60 * 1000); // 20 minutes ago
        const recentTimestamp = Date.now() - (5 * 60 * 1000); // 5 minutes ago

        publisher.rateLimiter.tweets.requests = [oldTimestamp, recentTimestamp];

        await publisher.checkRateLimit('tweets');

        expect(publisher.rateLimiter.tweets.requests).not.toContain(oldTimestamp);
        expect(publisher.rateLimiter.tweets.requests).toContain(recentTimestamp);
        expect(publisher.rateLimiter.tweets.requests).toHaveLength(2); // recent + new request
      });

      test('should handle different rate limit types', async () => {
        await publisher.checkRateLimit('media');
        expect(publisher.rateLimiter.media.requests).toHaveLength(1);
        
        await publisher.checkRateLimit('tweets');
        expect(publisher.rateLimiter.tweets.requests).toHaveLength(1);
      });
    });
  });

  describe('Utility Methods', () => {
    describe('getAuthUrl()', () => {
      test('should generate correct authorization URL', () => {
        const state = 'test-state';
        const codeChallenge = 'test-challenge';
        const authUrl = publisher.getAuthUrl(state, codeChallenge);

        expect(authUrl).toContain('https://twitter.com/i/oauth2/authorize');
        expect(authUrl).toContain(`client_id=${mockConfig.apiKey}`);
        expect(authUrl).toContain(`state=${state}`);
        expect(authUrl).toContain(`code_challenge=${codeChallenge}`);
        expect(authUrl).toContain('scope=tweet.read+tweet.write+users.read+offline.access');
      });
    });

    describe('delay()', () => {
      test('should delay for specified time', async () => {
        const start = Date.now();
        await publisher.delay(100);
        const end = Date.now();
        
        expect(end - start).toBeGreaterThanOrEqual(90); // Allow some variance
      });
    });
  });
});