const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const path = require('path');

// Import config based on environment
const config = require(`./config/${process.env.NODE_ENV || 'development'}`);

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

class ADAChecker {
    async initialize() {
        this.browser = await puppeteer.launch(config.puppeteerOptions);
    }

    async checkURL(url) {
        const page = await this.browser.newPage();
        try {
            await page.goto(url, { 
                waitUntil: 'networkidle0', 
                timeout: config.timeoutMs 
            });
            
            const violations = await this.runChecks(page);
            return { url, violations, passed: violations.length === 0 };
        } catch (error) {
            return { url, error: error.message, passed: false };
        } finally {
            await page.close();
        }
    }

    async runChecks(page) {
        const violations = [];

        // Check images
        const images = await page.$$eval('img', imgs => 
            imgs.map(img => ({
                src: img.src,
                alt: img.alt
            }))
        );

        // Check ARIA
        const ariaElements = await page.$$eval('[role]', elements =>
            elements.map(el => ({
                role: el.getAttribute('role'),
                hasAriaLabel: el.hasAttribute('aria-label')
            }))
        );

        // Check headings
        const headings = await page.$$eval('h1, h2, h3, h4, h5, h6', elements =>
            elements.map(el => ({
                level: parseInt(el.tagName[1]),
                text: el.textContent
            }))
        );

        // Check forms
        const forms = await page.$$eval('input, select, textarea', elements =>
            elements.map(el => ({
                type: el.type || el.tagName.toLowerCase(),
                hasLabel: !!el.labels?.length,
                hasAriaLabel: el.hasAttribute('aria-label')
            }))
        );

        // Analyze results
        this.checkImages(images, violations);
        this.checkARIA(ariaElements, violations);
        this.checkHeadings(headings, violations);
        this.checkForms(forms, violations);

        return violations;
    }

    checkImages(images, violations) {
        images.forEach(img => {
            if (!img.alt) {
                violations.push({
                    type: 'Missing alt text',
                    element: 'img',
                    src: img.src
                });
            }
        });
    }

    checkARIA(elements, violations) {
        elements.forEach(el => {
            if (!el.hasAriaLabel) {
                violations.push({
                    type: 'Missing ARIA label',
                    element: `Element with role "${el.role}"`
                });
            }
        });
    }

    checkHeadings(headings, violations) {
        let previousLevel = 0;
        headings.forEach(heading => {
            if (heading.level - previousLevel > 1) {
                violations.push({
                    type: 'Incorrect heading hierarchy',
                    details: `Jump from h${previousLevel} to h${heading.level}`
                });
            }
            previousLevel = heading.level;
        });
    }

    checkForms(forms, violations) {
        forms.forEach(el => {
            if (!el.hasLabel && !el.hasAriaLabel) {
                violations.push({
                    type: 'Missing form label',
                    element: el.type
                });
            }
        });
    }
}

// Initialize checker
const checker = new ADAChecker();
checker.initialize().catch(console.error);

// Routes
app.post('/check', async (req, res) => {
    try {
        const { html } = req.body;
        const urlRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>/g;
        const urls = [];
        let match;
        
        while ((match = urlRegex.exec(html)) !== null) {
            if (match[1].startsWith('http')) {
                urls.push(match[1]);
            }
        }

        const results = await Promise.all(
            urls.slice(0, config.maxConcurrentChecks)
                .map(url => checker.checkURL(url))
        );

        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Start server
const port = config.port;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    if (checker.browser) {
        await checker.browser.close();
    }
    process.exit(0);
});
