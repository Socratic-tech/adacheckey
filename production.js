module.exports = {
  port: process.env.PORT || 3000,
  puppeteerOptions: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--single-process'
    ]
  },
  maxConcurrentChecks: process.env.MAX_CONCURRENT_CHECKS || 10,
  timeoutMs: process.env.TIMEOUT_MS || 30000
};
