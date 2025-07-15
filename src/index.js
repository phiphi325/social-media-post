require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');

const logger = require('./utils/logger');
const { errorHandler } = require('./middleware/errorHandler');
const apiRoutes = require('./routes/api');

class Application {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  setupMiddleware() {
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(compression());
    this.app.use(morgan('combined', {
      stream: { write: message => logger.info(message.trim()) }
    }));
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development'
      });
    });

    // API routes
    this.app.use('/api', apiRoutes);

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        message: 'Route not found',
        path: req.originalUrl
      });
    });
  }

  setupErrorHandling() {
    this.app.use(errorHandler);
  }

  start() {
    this.server = this.app.listen(this.port, () => {
      logger.info(`🚀 Social Media Automation MVP started on port ${this.port}`);
      logger.info(`📱 Health check: http://localhost:${this.port}/health`);
      logger.info(`📊 API docs: http://localhost:${this.port}/api/docs`);
    });
    
    return this.server;
  }
}

// Start application
if (require.main === module) {
  const app = new Application();
  app.start();
}

module.exports = Application;