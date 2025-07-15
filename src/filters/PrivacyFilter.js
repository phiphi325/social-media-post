const logger = require('../utils/logger');

class PrivacyFilter {
  constructor() {
    this.openai = null;
    this.initializeOpenAI();
    
    // Pattern definitions for various sensitive data types
    this.patterns = {
      // Personal Information
      email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi,
      phone: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
      ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
      creditCard: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
      
      // Financial Data
      bankAccount: /\b\d{8,17}\b/g,
      routingNumber: /\b\d{9}\b/g,
      currency: /\$[\d,]+(?:\.\d{2})?/g,
      
      // Location Data
      address: /\b\d+\s+[A-Za-z0-9\s,]+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|way|court|ct|place|pl)(?:\s+[A-Za-z0-9\s,]+)*\b/gi,
      zipCode: /\b\d{5}(?:-\d{4})?\b/g,
      coordinates: /\b-?\d{1,3}\.\d+,\s*-?\d{1,3}\.\d+\b/g,
      
      // Identifiers
      ipAddress: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
      apiKey: /\b[A-Za-z0-9]{20,}\b/g,
      
      // Names (basic pattern - will be enhanced by AI)
      possibleNames: /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g
    };
    
    // Common company identifiers
    this.companyIndicators = [
      'Inc', 'LLC', 'Corp', 'Corporation', 'Company', 'Co', 'Ltd', 'Limited',
      'Partners', 'Associates', 'Group', 'Holdings', 'Enterprises', 'Solutions',
      'Technologies', 'Tech', 'Systems', 'Services', 'Consulting'
    ];
    
    // Location indicators
    this.locationIndicators = [
      'at', 'in', 'from', 'near', 'around', 'located', 'based', 'office',
      'headquarters', 'building', 'floor', 'suite', 'room'
    ];
    
    // Privacy risk levels
    this.riskLevels = {
      HIGH: 'high',
      MEDIUM: 'medium',
      LOW: 'low'
    };
  }

  async initializeOpenAI() {
    try {
      if (process.env.OPENAI_API_KEY) {
        const OpenAI = require('openai');
        this.openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
        });
        logger.info('PrivacyFilter OpenAI initialized successfully');
      } else {
        logger.warn('OpenAI not available for privacy filter, using pattern-based filtering only');
      }
    } catch (error) {
      logger.warn('PrivacyFilter OpenAI initialization failed:', error.message);
    }
  }

  async analyzeContent(content) {
    const analysis = {
      originalContent: content,
      filteredContent: content,
      detectedIssues: [],
      riskLevel: this.riskLevels.LOW,
      suggestions: [],
      anonymizationMap: new Map()
    };

    try {
      // Step 1: Pattern-based detection
      await this.detectPatternBasedIssues(content, analysis);
      
      // Step 2: AI-powered analysis (if available)
      if (this.openai) {
        await this.detectAIBasedIssues(content, analysis);
      }
      
      // Step 3: Apply filters and anonymization
      analysis.filteredContent = await this.applyFilters(content, analysis);
      
      // Step 4: Calculate overall risk level
      analysis.riskLevel = this.calculateRiskLevel(analysis.detectedIssues);
      
      // Step 5: Generate suggestions
      analysis.suggestions = this.generateSuggestions(analysis);
      
      return analysis;
    } catch (error) {
      logger.error('Privacy analysis failed:', error);
      return {
        ...analysis,
        error: 'Privacy analysis failed',
        riskLevel: this.riskLevels.HIGH
      };
    }
  }

  async detectPatternBasedIssues(content, analysis) {
    // Personal Information Detection
    this.detectAndAdd(content, this.patterns.email, 'email', 'HIGH', analysis);
    this.detectAndAdd(content, this.patterns.phone, 'phone', 'HIGH', analysis);
    this.detectAndAdd(content, this.patterns.ssn, 'ssn', 'HIGH', analysis);
    this.detectAndAdd(content, this.patterns.creditCard, 'creditCard', 'HIGH', analysis);
    
    // Financial Data Detection
    this.detectAndAdd(content, this.patterns.bankAccount, 'bankAccount', 'HIGH', analysis);
    this.detectAndAdd(content, this.patterns.routingNumber, 'routingNumber', 'HIGH', analysis);
    this.detectAndAdd(content, this.patterns.currency, 'currency', 'MEDIUM', analysis);
    
    // Location Data Detection
    this.detectAndAdd(content, this.patterns.address, 'address', 'MEDIUM', analysis);
    this.detectAndAdd(content, this.patterns.zipCode, 'zipCode', 'MEDIUM', analysis);
    this.detectAndAdd(content, this.patterns.coordinates, 'coordinates', 'HIGH', analysis);
    
    // Technical Identifiers
    this.detectAndAdd(content, this.patterns.ipAddress, 'ipAddress', 'MEDIUM', analysis);
    this.detectAndAdd(content, this.patterns.apiKey, 'apiKey', 'HIGH', analysis);
    
    // Company Names Detection
    await this.detectCompanyNames(content, analysis);
    
    // Location Context Detection
    await this.detectLocationContext(content, analysis);
  }

  async detectAIBasedIssues(content, analysis) {
    try {
      const prompt = `Analyze the following content for privacy risks and sensitive information:

"${content}"

Identify:
1. Personal names (first/last names)
2. Company names not caught by patterns
3. Sensitive financial information
4. Private locations or addresses
5. Confidential project names or internal references
6. Any other privacy concerns

Return a JSON response with:
{
  "personalNames": ["name1", "name2"],
  "companyNames": ["company1", "company2"],
  "financialInfo": ["info1", "info2"],
  "locations": ["location1", "location2"],
  "confidentialInfo": ["info1", "info2"],
  "riskAssessment": "high|medium|low",
  "suggestions": ["suggestion1", "suggestion2"]
}`;

      const response = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a privacy expert. Analyze content for sensitive information that should not be shared publicly on social media.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 800,
        temperature: 0.1
      });

      const aiAnalysis = JSON.parse(response.choices[0].message.content);
      
      // Add AI-detected issues to analysis
      this.addAIDetectedIssues(aiAnalysis, analysis);
      
    } catch (error) {
      logger.warn('AI-based privacy analysis failed:', error.message);
    }
  }

  detectAndAdd(content, pattern, type, riskLevel, analysis) {
    const matches = content.match(pattern);
    if (matches) {
      matches.forEach(match => {
        analysis.detectedIssues.push({
          type: type,
          value: match,
          riskLevel: riskLevel,
          position: content.indexOf(match),
          detectionMethod: 'pattern'
        });
      });
    }
  }

  async detectCompanyNames(content, analysis) {
    const words = content.split(/\s+/);
    const companyPattern = new RegExp(`\\b\\w+\\s+(${this.companyIndicators.join('|')})\\b`, 'gi');
    
    const matches = content.match(companyPattern);
    if (matches) {
      matches.forEach(match => {
        analysis.detectedIssues.push({
          type: 'companyName',
          value: match,
          riskLevel: 'MEDIUM',
          position: content.indexOf(match),
          detectionMethod: 'pattern'
        });
      });
    }
  }

  async detectLocationContext(content, analysis) {
    // More specific location context detection to avoid false positives
    const locationPattern = new RegExp(`\\b(located|based|office|headquarters|building)\\s+(at|in|near)\\s+[A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*\\b`, 'gi');
    
    const matches = content.match(locationPattern);
    if (matches) {
      matches.forEach(match => {
        analysis.detectedIssues.push({
          type: 'locationContext',
          value: match,
          riskLevel: 'MEDIUM',
          position: content.indexOf(match),
          detectionMethod: 'pattern'
        });
      });
    }
  }

  addAIDetectedIssues(aiAnalysis, analysis) {
    // Add personal names
    if (aiAnalysis.personalNames) {
      aiAnalysis.personalNames.forEach(name => {
        analysis.detectedIssues.push({
          type: 'personalName',
          value: name,
          riskLevel: 'HIGH',
          position: analysis.originalContent.indexOf(name),
          detectionMethod: 'ai'
        });
      });
    }
    
    // Add company names
    if (aiAnalysis.companyNames) {
      aiAnalysis.companyNames.forEach(company => {
        analysis.detectedIssues.push({
          type: 'companyName',
          value: company,
          riskLevel: 'MEDIUM',
          position: analysis.originalContent.indexOf(company),
          detectionMethod: 'ai'
        });
      });
    }
    
    // Add financial information
    if (aiAnalysis.financialInfo) {
      aiAnalysis.financialInfo.forEach(info => {
        analysis.detectedIssues.push({
          type: 'financialInfo',
          value: info,
          riskLevel: 'HIGH',
          position: analysis.originalContent.indexOf(info),
          detectionMethod: 'ai'
        });
      });
    }
    
    // Add locations
    if (aiAnalysis.locations) {
      aiAnalysis.locations.forEach(location => {
        analysis.detectedIssues.push({
          type: 'location',
          value: location,
          riskLevel: 'MEDIUM',
          position: analysis.originalContent.indexOf(location),
          detectionMethod: 'ai'
        });
      });
    }
    
    // Add confidential information
    if (aiAnalysis.confidentialInfo) {
      aiAnalysis.confidentialInfo.forEach(info => {
        analysis.detectedIssues.push({
          type: 'confidentialInfo',
          value: info,
          riskLevel: 'HIGH',
          position: analysis.originalContent.indexOf(info),
          detectionMethod: 'ai'
        });
      });
    }
  }

  async applyFilters(content, analysis) {
    let filteredContent = content;
    
    // Sort issues by position (descending) to avoid index shifting
    const sortedIssues = [...analysis.detectedIssues].sort((a, b) => b.position - a.position);
    
    sortedIssues.forEach(issue => {
      if (issue.position >= 0) {
        const replacement = this.getReplacementText(issue);
        filteredContent = filteredContent.substring(0, issue.position) + 
                         replacement + 
                         filteredContent.substring(issue.position + issue.value.length);
        
        // Store anonymization mapping
        analysis.anonymizationMap.set(issue.value, replacement);
      }
    });
    
    return filteredContent;
  }

  getReplacementText(issue) {
    const replacements = {
      email: '[EMAIL_REDACTED]',
      phone: '[PHONE_REDACTED]',
      ssn: '[SSN_REDACTED]',
      creditCard: '[CARD_REDACTED]',
      bankAccount: '[ACCOUNT_REDACTED]',
      routingNumber: '[ROUTING_REDACTED]',
      currency: '[AMOUNT_REDACTED]',
      address: '[ADDRESS_REDACTED]',
      zipCode: '[ZIP_REDACTED]',
      coordinates: '[COORDINATES_REDACTED]',
      ipAddress: '[IP_REDACTED]',
      apiKey: '[API_KEY_REDACTED]',
      personalName: '[NAME_REDACTED]',
      companyName: '[COMPANY_REDACTED]',
      financialInfo: '[FINANCIAL_INFO_REDACTED]',
      location: '[LOCATION_REDACTED]',
      locationContext: '[LOCATION_CONTEXT_REDACTED]',
      confidentialInfo: '[CONFIDENTIAL_REDACTED]'
    };
    
    return replacements[issue.type] || '[REDACTED]';
  }

  calculateRiskLevel(detectedIssues) {
    const highRiskCount = detectedIssues.filter(issue => issue.riskLevel === 'HIGH').length;
    const mediumRiskCount = detectedIssues.filter(issue => issue.riskLevel === 'MEDIUM').length;
    
    if (highRiskCount > 0) return this.riskLevels.HIGH;
    if (mediumRiskCount > 1) return this.riskLevels.HIGH;
    if (mediumRiskCount > 0) return this.riskLevels.MEDIUM;
    
    return this.riskLevels.LOW;
  }

  generateSuggestions(analysis) {
    const suggestions = [];
    const issueTypes = [...new Set(analysis.detectedIssues.map(issue => issue.type))];
    
    const suggestionMap = {
      email: 'Consider using a generic contact form instead of exposing email addresses',
      phone: 'Use a business phone number or contact form instead of personal numbers',
      ssn: 'Never share Social Security Numbers publicly',
      creditCard: 'Remove all payment card information from public posts',
      bankAccount: 'Banking details should never be shared publicly',
      personalName: 'Consider using first names only or role titles instead of full names',
      companyName: 'Evaluate if specific company names need to be mentioned publicly',
      financialInfo: 'Remove specific financial figures or use ranges instead',
      location: 'Consider using city/state instead of specific addresses',
      address: 'Use general location references instead of specific addresses',
      confidentialInfo: 'Remove any internal or confidential project information',
      coordinates: 'Remove GPS coordinates and location data',
      ipAddress: 'Remove IP addresses and technical identifiers',
      apiKey: 'Never expose API keys or authentication tokens'
    };
    
    issueTypes.forEach(type => {
      if (suggestionMap[type]) {
        suggestions.push(suggestionMap[type]);
      }
    });
    
    // Add general suggestions based on risk level
    if (analysis.riskLevel === this.riskLevels.HIGH) {
      suggestions.push('HIGH RISK: This content contains sensitive information that should not be posted publicly');
      suggestions.push('Consider rewriting the content to remove all personal identifiers');
    } else if (analysis.riskLevel === this.riskLevels.MEDIUM) {
      suggestions.push('MEDIUM RISK: Review the content for potentially sensitive information');
      suggestions.push('Consider using more general terms instead of specific details');
    }
    
    return [...new Set(suggestions)]; // Remove duplicates
  }

  async filterContent(content, options = {}) {
    const enablePrivacyFilter = options.enablePrivacyFilter !== false && 
                               (process.env.ENABLE_PRIVACY_FILTER === 'true' || options.forcePrivacyFilter);
    
    if (!enablePrivacyFilter) {
      return {
        filteredContent: content,
        privacyAnalysis: null,
        privacyFilterEnabled: false
      };
    }
    
    const analysis = await this.analyzeContent(content);
    
    return {
      filteredContent: analysis.filteredContent,
      privacyAnalysis: analysis,
      privacyFilterEnabled: true
    };
  }

  // Utility method to check if content is safe for public posting
  async isContentSafe(content) {
    const analysis = await this.analyzeContent(content);
    return analysis.riskLevel === this.riskLevels.LOW;
  }

  // Method to get anonymization suggestions without filtering
  async getAnonymizationSuggestions(content) {
    const analysis = await this.analyzeContent(content);
    return {
      riskLevel: analysis.riskLevel,
      suggestions: analysis.suggestions,
      detectedIssues: analysis.detectedIssues.map(issue => ({
        type: issue.type,
        riskLevel: issue.riskLevel,
        suggestion: this.getReplacementText(issue)
      }))
    };
  }
}

module.exports = PrivacyFilter;