const axios = require('axios');
const LinkedInPublisher = require('../../../src/publishers/LinkedInPublisher');
const logger = require('../../../src/utils/logger');

jest.mock('axios');
jest.mock('../../../src/utils/logger');

describe('LinkedInPublisher', () => {
  let publisher;
  const mockConfig = {
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    redirectUri: 'http://localhost:3000/callback'
  };

  beforeEach(() => {
    publisher = new LinkedInPublisher(mockConfig);
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    test('should initialize with provided config', () => {
      expect(publisher.clientId).toBe(mockConfig.clientId);
      expect(publisher.clientSecret).toBe(mockConfig.clientSecret);
      expect(publisher.redirectUri).toBe(mockConfig.redirectUri);
      expect(publisher.apiVersion).toBe('v2');
      expect(publisher.baseUrl).toBe('https://api.linkedin.com');
    });

    test('should fall back to environment variables', () => {
      process.env.LINKEDIN_CLIENT_ID = 'env-client-id';
      process.env.LINKEDIN_CLIENT_SECRET = 'env-client-secret';
      process.env.LINKEDIN_REDIRECT_URI = 'env-redirect-uri';

      const envPublisher = new LinkedInPublisher();
      expect(envPublisher.clientId).toBe('env-client-id');
      expect(envPublisher.clientSecret).toBe('env-client-secret');
      expect(envPublisher.redirectUri).toBe('env-redirect-uri');
    });
  });

  describe('Authentication', () => {
    describe('authenticate()', () => {
      test('should successfully authenticate with valid auth code', async () => {
        const mockTokenResponse = {
          data: {
            access_token: 'test-access-token',
            expires_in: 3600
          }
        };

        axios.post.mockResolvedValue(mockTokenResponse);

        const result = await publisher.authenticate('valid-auth-code');

        expect(axios.post).toHaveBeenCalledWith(
          'https://www.linkedin.com/oauth/v2/accessToken',
          {
            grant_type: 'authorization_code',
            code: 'valid-auth-code',
            redirect_uri: mockConfig.redirectUri,
            client_id: mockConfig.clientId,
            client_secret: mockConfig.clientSecret
          },
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          }
        );

        expect(result.success).toBe(true);
        expect(result.accessToken).toBe('test-access-token');
        expect(result.expiresIn).toBe(3600);
        expect(result.expiresAt).toBeDefined();
        expect(logger.info).toHaveBeenCalledWith('LinkedIn authentication successful');
      });

      test('should handle authentication failure', async () => {
        const mockError = {
          response: {
            data: {
              error_description: 'Invalid authorization code'
            }
          }
        };

        axios.post.mockRejectedValue(mockError);

        const result = await publisher.authenticate('invalid-auth-code');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Authentication failed');
        expect(result.details).toBe('Invalid authorization code');
        expect(logger.error).toHaveBeenCalled();
      });
    });

    describe('getAuthUrl()', () => {
      test('should generate correct authorization URL', () => {
        const state = 'test-state';
        const authUrl = publisher.getAuthUrl(state);

        expect(authUrl).toContain('https://www.linkedin.com/oauth/v2/authorization');
        expect(authUrl).toContain(`client_id=${mockConfig.clientId}`);
        expect(authUrl).toContain(`redirect_uri=${encodeURIComponent(mockConfig.redirectUri)}`);
        expect(authUrl).toContain(`state=${state}`);
        expect(authUrl).toContain('scope=r_liteprofile+r_emailaddress+w_member_social');
      });

      test('should work without state parameter', () => {
        const authUrl = publisher.getAuthUrl();
        expect(authUrl).toContain('state=');
      });
    });

    describe('validateToken()', () => {
      test('should validate valid token', async () => {
        const mockProfileResponse = {
          data: { id: 'test-user-id', firstName: { localized: { en_US: 'John' } } }
        };

        axios.get.mockResolvedValue(mockProfileResponse);

        const result = await publisher.validateToken('valid-token');

        expect(result.success).toBe(true);
        expect(result.valid).toBe(true);
        expect(result.profile).toEqual(mockProfileResponse.data);
      });

      test('should handle invalid token', async () => {
        const mockError = { response: { data: { message: 'Invalid token' } } };
        axios.get.mockRejectedValue(mockError);

        const result = await publisher.validateToken('invalid-token');

        expect(result.success).toBe(false);
        expect(result.valid).toBe(false);
        expect(result.error).toEqual(mockError.response.data);
      });
    });
  });

  describe('Content Formatting', () => {
    describe('formatContent()', () => {
      test('should format content with hashtags', () => {
        const content = 'Test post content';
        const options = { hashtags: ['test', '#social', 'linkedin'] };

        const formatted = publisher.formatContent(content, options);

        expect(formatted).toBe('Test post content\n\n#test #social #linkedin');
      });

      test('should format content with mentions', () => {
        const content = 'Test post content';
        const options = { mentions: ['user1', '@user2', 'user3'] };

        const formatted = publisher.formatContent(content, options);

        expect(formatted).toBe('Test post content\n\n@user1 @user2 @user3');
      });

      test('should format content with both hashtags and mentions', () => {
        const content = 'Test post content';
        const options = {
          hashtags: ['test', 'social'],
          mentions: ['user1', 'user2']
        };

        const formatted = publisher.formatContent(content, options);

        expect(formatted).toBe('Test post content\n\n#test #social\n\n@user1 @user2');
      });

      test('should truncate content exceeding character limit', () => {
        const longContent = 'a'.repeat(3001);
        const formatted = publisher.formatContent(longContent);

        expect(formatted.length).toBe(3000);
        expect(formatted.endsWith('...')).toBe(true);
        expect(logger.warn).toHaveBeenCalledWith('Content exceeds LinkedIn character limit, truncating...');
      });

      test('should return original content when no options provided', () => {
        const content = 'Test post content';
        const formatted = publisher.formatContent(content);

        expect(formatted).toBe(content);
      });
    });
  });

  describe('Publishing', () => {
    describe('publish()', () => {
      const mockAccessToken = 'test-access-token';
      const mockProfileResponse = {
        data: { id: 'test-user-id' }
      };
      const mockPostResponse = {
        data: { id: 'urn:li:share:123456789' }
      };


      test('should successfully publish text post', async () => {
        // Mock getUserProfile call
        axios.get.mockResolvedValueOnce(mockProfileResponse);
        // Mock publish call
        axios.post.mockResolvedValueOnce(mockPostResponse);
        
        const content = 'Test post content';
        const result = await publisher.publish(mockAccessToken, content);

        expect(axios.get).toHaveBeenCalledWith(
          'https://api.linkedin.com/v2/me',
          expect.objectContaining({
            headers: expect.objectContaining({
              'Authorization': `Bearer ${mockAccessToken}`
            })
          })
        );

        expect(axios.post).toHaveBeenCalledWith(
          'https://api.linkedin.com/v2/ugcPosts',
          expect.objectContaining({
            author: 'urn:li:person:test-user-id',
            lifecycleState: 'PUBLISHED',
            specificContent: {
              'com.linkedin.ugc.ShareContent': {
                shareCommentary: { text: content },
                shareMediaCategory: 'NONE'
              }
            },
            visibility: {
              'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
            }
          }),
          expect.objectContaining({
            headers: expect.objectContaining({
              'Authorization': `Bearer ${mockAccessToken}`,
              'Content-Type': 'application/json'
            })
          })
        );

        expect(result.success).toBe(true);
        expect(result.postId).toBe('urn:li:share:123456789');
        expect(result.postUrl).toBe('https://www.linkedin.com/feed/update/urn:li:share:123456789');
        expect(result.platform).toBe('linkedin');
        expect(result.publishedAt).toBeDefined();
      });

      test('should publish post with media', async () => {
        // Mock getUserProfile call
        axios.get.mockResolvedValueOnce(mockProfileResponse);
        // Mock publish call
        axios.post.mockResolvedValueOnce(mockPostResponse);
        
        const content = 'Test post with media';
        const options = {
          mediaUrl: 'https://example.com/image.jpg',
          mediaTitle: 'Test Image',
          mediaDescription: 'Test image description'
        };

        const result = await publisher.publish(mockAccessToken, content, options);

        expect(axios.post).toHaveBeenCalledWith(
          'https://api.linkedin.com/v2/ugcPosts',
          expect.objectContaining({
            specificContent: {
              'com.linkedin.ugc.ShareContent': expect.objectContaining({
                shareMediaCategory: 'ARTICLE',
                media: expect.arrayContaining([
                  expect.objectContaining({
                    status: 'READY',
                    media: options.mediaUrl,
                    title: { text: options.mediaTitle },
                    description: { text: options.mediaDescription }
                  })
                ])
              })
            }
          }),
          expect.any(Object)
        );

        expect(result.success).toBe(true);
      });

      test('should handle publication failure', async () => {
        const mockError = {
          response: {
            data: { message: 'Publication failed' }
          }
        };

        // Mock successful profile fetch first, then failed post
        axios.get.mockResolvedValueOnce(mockProfileResponse);
        axios.post.mockRejectedValueOnce(mockError);

        const result = await publisher.publish(mockAccessToken, 'Test content');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Post publication failed');
        expect(result.details).toEqual(mockError.response.data);
        expect(result.platform).toBe('linkedin');
        expect(logger.error).toHaveBeenCalled();
      });

      test('should handle profile retrieval failure', async () => {
        const mockError = { response: { data: { message: 'Profile fetch failed' } } };
        axios.get.mockRejectedValueOnce(mockError);

        const result = await publisher.publish(mockAccessToken, 'Test content');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Failed to retrieve user profile');
      });
    });
  });

  describe('Rate Limiting', () => {
    describe('checkRateLimit()', () => {
      test('should allow requests within rate limit', async () => {
        await expect(publisher.checkRateLimit()).resolves.not.toThrow();
        expect(publisher.rateLimiter.requests).toHaveLength(1);
      });

      test('should throw error when rate limit exceeded', async () => {
        // Fill up the rate limiter
        const now = Date.now();
        publisher.rateLimiter.requests = new Array(100).fill(now);

        await expect(publisher.checkRateLimit()).rejects.toThrow('Rate limit exceeded');
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('LinkedIn rate limit reached')
        );
      });

      test('should clean old requests from rate limiter', async () => {
        const oldTimestamp = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
        const recentTimestamp = Date.now() - (1 * 60 * 60 * 1000); // 1 hour ago

        publisher.rateLimiter.requests = [oldTimestamp, recentTimestamp];

        await publisher.checkRateLimit();

        expect(publisher.rateLimiter.requests).not.toContain(oldTimestamp);
        expect(publisher.rateLimiter.requests).toContain(recentTimestamp);
        expect(publisher.rateLimiter.requests).toHaveLength(2); // recent + new request
      });
    });
  });

  describe('getUserProfile()', () => {
    test('should successfully get user profile', async () => {
      const mockProfileResponse = {
        data: {
          id: 'test-user-id',
          firstName: { localized: { en_US: 'John' } },
          lastName: { localized: { en_US: 'Doe' } }
        }
      };

      axios.get.mockClear();
      axios.get.mockResolvedValueOnce(mockProfileResponse);

      const result = await publisher.getUserProfile('test-token');

      expect(axios.get).toHaveBeenCalledWith(
        'https://api.linkedin.com/v2/me',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
            'X-Restli-Protocol-Version': '2.0.0'
          })
        })
      );

      expect(result.success).toBe(true);
      expect(result.profile).toEqual(mockProfileResponse.data);
    });

    test('should handle profile fetch failure', async () => {
      const mockError = {
        response: { data: { message: 'Unauthorized' } }
      };

      axios.get.mockClear();
      axios.get.mockRejectedValueOnce(mockError);

      const result = await publisher.getUserProfile('invalid-token');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to retrieve user profile');
      expect(result.details).toEqual(mockError.response.data);
      expect(logger.error).toHaveBeenCalled();
    });
  });
});