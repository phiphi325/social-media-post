const PrivacyFilter = require('../../../src/filters/PrivacyFilter');
const logger = require('../../../src/utils/logger');

jest.mock('../../../src/utils/logger');
jest.mock('openai');

describe('PrivacyFilter', () => {
  let privacyFilter;

  beforeEach(() => {
    privacyFilter = new PrivacyFilter();
    jest.clearAllMocks();
  });

  describe('Pattern-based Detection', () => {
    test('should detect email addresses', async () => {
      const content = 'Contact me at john.doe@example.com for more info';
      const analysis = await privacyFilter.analyzeContent(content);
      
      expect(analysis.detectedIssues).toHaveLength(1);
      expect(analysis.detectedIssues[0].type).toBe('email');
      expect(analysis.detectedIssues[0].value).toBe('john.doe@example.com');
      expect(analysis.detectedIssues[0].riskLevel).toBe('HIGH');
    });

    test('should detect phone numbers', async () => {
      const content = 'Call me at (555) 123-4567 or 555-987-6543';
      const analysis = await privacyFilter.analyzeContent(content);
      
      const phoneIssues = analysis.detectedIssues.filter(issue => issue.type === 'phone');
      expect(phoneIssues).toHaveLength(2);
      expect(phoneIssues[0].riskLevel).toBe('HIGH');
    });

    test('should detect Social Security Numbers', async () => {
      const content = 'My SSN is 123-45-6789';
      const analysis = await privacyFilter.analyzeContent(content);
      
      const ssnIssues = analysis.detectedIssues.filter(issue => issue.type === 'ssn');
      expect(ssnIssues).toHaveLength(1);
      expect(ssnIssues[0].value).toBe('123-45-6789');
      expect(ssnIssues[0].riskLevel).toBe('HIGH');
    });

    test('should detect credit card numbers', async () => {
      const content = 'My card number is 4532 1234 5678 9012';
      const analysis = await privacyFilter.analyzeContent(content);
      
      const cardIssues = analysis.detectedIssues.filter(issue => issue.type === 'creditCard');
      expect(cardIssues).toHaveLength(1);
      expect(cardIssues[0].riskLevel).toBe('HIGH');
    });

    test('should detect addresses', async () => {
      const content = 'I live at 123 Main Street, Springfield';
      const analysis = await privacyFilter.analyzeContent(content);
      
      const addressIssues = analysis.detectedIssues.filter(issue => issue.type === 'address');
      expect(addressIssues).toHaveLength(1);
      expect(addressIssues[0].riskLevel).toBe('MEDIUM');
    });

    test('should detect company names', async () => {
      const content = 'I work at Acme Corp and Microsoft Inc';
      const analysis = await privacyFilter.analyzeContent(content);
      
      const companyIssues = analysis.detectedIssues.filter(issue => issue.type === 'companyName');
      expect(companyIssues).toHaveLength(2);
      expect(companyIssues[0].riskLevel).toBe('MEDIUM');
    });

    test('should detect IP addresses', async () => {
      const content = 'Server IP is 192.168.1.100';
      const analysis = await privacyFilter.analyzeContent(content);
      
      const ipIssues = analysis.detectedIssues.filter(issue => issue.type === 'ipAddress');
      expect(ipIssues).toHaveLength(1);
      expect(ipIssues[0].value).toBe('192.168.1.100');
      expect(ipIssues[0].riskLevel).toBe('MEDIUM');
    });

    test('should detect zip codes', async () => {
      const content = 'My zip code is 12345 and office is at 90210-1234';
      const analysis = await privacyFilter.analyzeContent(content);
      
      const zipIssues = analysis.detectedIssues.filter(issue => issue.type === 'zipCode');
      expect(zipIssues).toHaveLength(2);
      expect(zipIssues[0].riskLevel).toBe('MEDIUM');
    });

    test('should detect GPS coordinates', async () => {
      const content = 'Location: 40.7128, -74.0060';
      const analysis = await privacyFilter.analyzeContent(content);
      
      const coordIssues = analysis.detectedIssues.filter(issue => issue.type === 'coordinates');
      expect(coordIssues).toHaveLength(1);
      expect(coordIssues[0].riskLevel).toBe('HIGH');
    });

    test('should detect currency amounts', async () => {
      const content = 'The deal is worth $1,234.56 and we spent $500';
      const analysis = await privacyFilter.analyzeContent(content);
      
      const currencyIssues = analysis.detectedIssues.filter(issue => issue.type === 'currency');
      expect(currencyIssues).toHaveLength(2);
      expect(currencyIssues[0].riskLevel).toBe('MEDIUM');
    });
  });

  describe('Content Filtering', () => {
    test('should filter out sensitive information', async () => {
      const content = 'Email me at test@example.com or call (555) 123-4567';
      const analysis = await privacyFilter.analyzeContent(content);
      
      expect(analysis.filteredContent).toBe('Email me at [EMAIL_REDACTED] or call [PHONE_REDACTED]');
      expect(analysis.anonymizationMap.size).toBe(2);
    });

    test('should preserve non-sensitive content', async () => {
      const content = 'This is a regular social media post about technology';
      const analysis = await privacyFilter.analyzeContent(content);
      
      expect(analysis.filteredContent).toBe(content);
      expect(analysis.detectedIssues).toHaveLength(0);
    });

    test('should handle multiple occurrences of same pattern', async () => {
      const content = 'Email john@test.com and mary@test.com';
      const analysis = await privacyFilter.analyzeContent(content);
      
      expect(analysis.filteredContent).toBe('Email [EMAIL_REDACTED] and [EMAIL_REDACTED]');
      expect(analysis.detectedIssues).toHaveLength(2);
    });

    test('should filter company names', async () => {
      const content = 'Working at Google Inc and Apple Corp';
      const analysis = await privacyFilter.analyzeContent(content);
      
      expect(analysis.filteredContent).toContain('[COMPANY_REDACTED]');
      expect(analysis.detectedIssues.filter(issue => issue.type === 'companyName')).toHaveLength(2);
    });
  });

  describe('Risk Level Assessment', () => {
    test('should return HIGH risk for PII', async () => {
      const content = 'My email is test@example.com and SSN is 123-45-6789';
      const analysis = await privacyFilter.analyzeContent(content);
      
      expect(analysis.riskLevel).toBe('high');
    });

    test('should return MEDIUM risk for some location data', async () => {
      const content = 'I work at 123 Main Street in Springfield';
      const analysis = await privacyFilter.analyzeContent(content);
      
      expect(analysis.riskLevel).toBe('medium');
    });

    test('should return LOW risk for safe content', async () => {
      const content = 'Just posted about my latest project on GitHub';
      const analysis = await privacyFilter.analyzeContent(content);
      
      expect(analysis.riskLevel).toBe('low');
    });

    test('should return HIGH risk for multiple medium risks', async () => {
      const content = 'Office at 123 Main St, zip 12345, in Springfield near downtown';
      const analysis = await privacyFilter.analyzeContent(content);
      
      expect(analysis.riskLevel).toBe('high');
    });
  });

  describe('Suggestions Generation', () => {
    test('should generate relevant suggestions for email', async () => {
      const content = 'Contact me at test@example.com';
      const analysis = await privacyFilter.analyzeContent(content);
      
      expect(analysis.suggestions).toContain('Consider using a generic contact form instead of exposing email addresses');
    });

    test('should generate suggestions for phone numbers', async () => {
      const content = 'Call me at (555) 123-4567';
      const analysis = await privacyFilter.analyzeContent(content);
      
      expect(analysis.suggestions).toContain('Use a business phone number or contact form instead of personal numbers');
    });

    test('should generate high-risk warnings', async () => {
      const content = 'My SSN is 123-45-6789';
      const analysis = await privacyFilter.analyzeContent(content);
      
      expect(analysis.suggestions).toContain('HIGH RISK: This content contains sensitive information that should not be posted publicly');
    });

    test('should remove duplicate suggestions', async () => {
      const content = 'Email test1@example.com and test2@example.com';
      const analysis = await privacyFilter.analyzeContent(content);
      
      const emailSuggestions = analysis.suggestions.filter(s => s.includes('email'));
      expect(emailSuggestions).toHaveLength(1);
    });
  });

  describe('Content Filtering with Options', () => {
    test('should respect privacy filter disabled', async () => {
      const content = 'My email is test@example.com';
      const result = await privacyFilter.filterContent(content, { enablePrivacyFilter: false });
      
      expect(result.filteredContent).toBe(content);
      expect(result.privacyFilterEnabled).toBe(false);
      expect(result.privacyAnalysis).toBeNull();
    });

    test('should enable privacy filter with environment variable', async () => {
      process.env.ENABLE_PRIVACY_FILTER = 'true';
      const content = 'My email is test@example.com';
      const result = await privacyFilter.filterContent(content);
      
      expect(result.filteredContent).toBe('My email is [EMAIL_REDACTED]');
      expect(result.privacyFilterEnabled).toBe(true);
      expect(result.privacyAnalysis).toBeDefined();
      
      delete process.env.ENABLE_PRIVACY_FILTER;
    });

    test('should force privacy filter with option', async () => {
      const content = 'My email is test@example.com';
      const result = await privacyFilter.filterContent(content, { forcePrivacyFilter: true });
      
      expect(result.filteredContent).toBe('My email is [EMAIL_REDACTED]');
      expect(result.privacyFilterEnabled).toBe(true);
    });
  });

  describe('Utility Methods', () => {
    test('should check if content is safe', async () => {
      const safeContent = 'This is a safe post about technology';
      const unsafeContent = 'My email is test@example.com';
      
      // Note: isContentSafe returns a promise, so we need to await it
      const safeResult = await privacyFilter.isContentSafe(safeContent);
      const unsafeResult = await privacyFilter.isContentSafe(unsafeContent);
      
      expect(safeResult).toBe(true);
      expect(unsafeResult).toBe(false);
    });

    test('should provide anonymization suggestions', async () => {
      const content = 'My email is test@example.com and phone is (555) 123-4567';
      const suggestions = await privacyFilter.getAnonymizationSuggestions(content);
      
      expect(suggestions.riskLevel).toBe('high');
      expect(suggestions.suggestions).toBeInstanceOf(Array);
      expect(suggestions.detectedIssues).toHaveLength(2);
      expect(suggestions.detectedIssues[0].type).toBe('email');
      expect(suggestions.detectedIssues[0].suggestion).toBe('[EMAIL_REDACTED]');
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty content', async () => {
      const content = '';
      const analysis = await privacyFilter.analyzeContent(content);
      
      expect(analysis.filteredContent).toBe('');
      expect(analysis.detectedIssues).toHaveLength(0);
      expect(analysis.riskLevel).toBe('low');
    });

    test('should handle content with only whitespace', async () => {
      const content = '   \n\t   ';
      const analysis = await privacyFilter.analyzeContent(content);
      
      expect(analysis.filteredContent).toBe(content);
      expect(analysis.detectedIssues).toHaveLength(0);
      expect(analysis.riskLevel).toBe('low');
    });

    test('should handle very long content', async () => {
      const content = 'A'.repeat(10000) + ' test@example.com';
      const analysis = await privacyFilter.analyzeContent(content);
      
      const emailIssues = analysis.detectedIssues.filter(issue => issue.type === 'email');
      expect(emailIssues).toHaveLength(1);
      expect(emailIssues[0].type).toBe('email');
    });

    test('should handle special characters in sensitive data', async () => {
      const content = 'Email me at test+tag@example.com';
      const analysis = await privacyFilter.analyzeContent(content);
      
      expect(analysis.detectedIssues).toHaveLength(1);
      expect(analysis.detectedIssues[0].type).toBe('email');
    });
  });

  describe('Performance', () => {
    test('should process content efficiently', async () => {
      const content = 'This is a test post with some content that should be processed quickly';
      const startTime = Date.now();
      
      await privacyFilter.analyzeContent(content);
      
      const processingTime = Date.now() - startTime;
      expect(processingTime).toBeLessThan(1000); // Should complete in under 1 second
    });
  });
});