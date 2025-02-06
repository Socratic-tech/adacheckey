module.exports = {
  port: process.env.PORT || 3000,
  puppeteerOptions: {
    headless: true,
    args: ['--no-sandbox']
  },
  maxConcurrentChecks: 5,
  timeoutMs: 30000
};
