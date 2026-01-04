
import puppeteer, { executablePath } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

// Global browser instance for reuse (helps with cold starts)
let cachedBrowser = null;

async function getBrowser() {
  console.log('[getBrowser] Checking for cached browser instance...');
  
  if (cachedBrowser && cachedBrowser.isConnected && cachedBrowser.isConnected()) {
    console.log('[getBrowser] Reusing cached browser instance');
    return cachedBrowser;
  }
  
  console.log('[getBrowser] No valid cached browser, launching new instance...');
  const execPath = await chromium.executablePath();
  console.log('[getBrowser] Chromium executable path:', execPath);
  
  cachedBrowser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-web-resources',
      '--disable-component-update',
      '--disable-sync',
      '--disable-default-apps',
      '--disable-preconnect'
    ],
    executablePath: execPath,
    timeout: 60000,
    protocolTimeout: 180000
  });
  
  console.log('[getBrowser] New browser instance launched');
  return cachedBrowser;
}

/**
 * Render a single story page as an image using Puppeteer and save to disk.
 * @param {string} text - The text to render.
 * @param {string} filename - The output image filename.
 * @param {object} [options] - Optional settings (width, height, font, etc.)
 * @returns {Promise<string>} - Resolves to the image file path.
 */
export async function renderPageToImage(text, filename, options = {}) {
  console.log(`[renderPageToImage] Starting with filename: ${filename}`);
  console.log(`[renderPageToImage] Text length: ${text.length} characters`);
  console.log(`[renderPageToImage] Options:`, JSON.stringify(options));
  
  // Accept pageNumber as an option
  const pageNumber = options.pageNumber || '';
  // Instagram post size: 1080x1080
  const width = options.width || 1080;
  const height = options.height || 1080;
  // Default font size smaller, e.g. 32
  const fontSize = options.fontSize || 32;
  // Default padding (margin) larger, e.g. 120
  const margin = options.margin || 120;
  // Allow font family, color, and background to be set
  const fontFamily = options.fontFamily || 'Ubuntu, DejaVu Sans, sans-serif';
  const background = options.background || '#fffbe9';
  const textColor = options.textColor || '#222';

  console.log(`[renderPageToImage] Dimensions: ${width}x${height}, fontSize: ${fontSize}, margin: ${margin}`);

  const html = `
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=${width}, initial-scale=1.0">
        <style>
          html, body {
            width: ${width}px;
            height: ${height}px;
            margin: 0;
            padding: 0;
            background: ${background};
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            overflow: hidden;
          }
          .content {
            padding: ${margin}px;
            font-size: ${fontSize}px;
            font-family: ${fontFamily};
            color: ${textColor};
            white-space: pre-wrap;
            line-height: 1.3;
            width: ${width - 2 * margin}px;
            min-height: ${height - 2 * margin}px;
            max-height: ${height - 2 * margin}px;
            word-break: break-word;
            box-sizing: border-box;
            border-radius: 24px;
            background: rgba(255,255,255,0.01);
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
          }
          .page-number {
            position: absolute;
            right: 32px;
            bottom: 24px;
            font-size: 24px;
            font-family: ${fontFamily};
            color: ${textColor};
            opacity: 0.7;
            pointer-events: none;
            background: rgba(255,255,255,0.0);
          }
        </style>
      </head>
      <body>
        <div class="content">${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
        ${pageNumber ? `<div class="page-number">${pageNumber}</div>` : ''}
      </body>
    </html>
  `;

  console.log(`[renderPageToImage] HTML generated, length: ${html.length} characters`);

  let browser;
  let page;
  try {
    console.log('[renderPageToImage] Getting browser instance...');
    const browserStartTime = Date.now();
    browser = await getBrowser();
    const browserTime = Date.now() - browserStartTime;
    console.log(`[renderPageToImage] Browser instance obtained in ${browserTime}ms`);
    
    console.log('[renderPageToImage] Creating new page...');
    const pageStartTime = Date.now();
    page = await browser.newPage();
    const pageTime = Date.now() - pageStartTime;
    console.log(`[renderPageToImage] New page created in ${pageTime}ms`);
    
    console.log('[renderPageToImage] Configuring page...');
    try {
      await page.setDefaultNavigationTimeout(30000);
      await page.setDefaultTimeout(30000);
      console.log('[renderPageToImage] Page timeouts configured');
    } catch (e) {
      console.warn('[renderPageToImage] Warning setting timeouts:', e.message);
    }
    
    console.log('[renderPageToImage] Disabling resource loading for performance...');
    await page.on('request', (request) => {
      const resourceType = request.resourceType();
      // Block images, stylesheets, fonts - we only need DOM rendering
      if (['image', 'stylesheet', 'font', 'media', 'fetch', 'xhr', 'websocket'].includes(resourceType)) {
        console.log(`[renderPageToImage] Blocking ${resourceType}: ${request.url().substring(0, 50)}`);
        request.abort('blockedbyclient').catch(() => {});
      } else {
        request.continue().catch(() => {});
      }
    });
    
    // Do NOT call setViewport - it causes issues with chromium on Lambda/Vercel
    // Instead, rely on viewport meta tag and CSS dimensions
    
    console.log('[renderPageToImage] Loading HTML content via goto with data URL...');
    const dataUrl = `data:text/html;base64,${Buffer.from(html).toString('base64')}`;
    console.log(`[renderPageToImage] Data URL created, length: ${dataUrl.length} characters`);
    
    const gotoStartTime = Date.now();
    try {
      await Promise.race([
        page.goto(dataUrl, { waitUntil: 'domcontentloaded', timeout: 20000 }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('goto timeout')), 25000))
      ]);
      const gotoTime = Date.now() - gotoStartTime;
      console.log(`[renderPageToImage] Content loaded via goto in ${gotoTime}ms`);
    } catch (gotoErr) {
      console.warn(`[renderPageToImage] goto failed: ${gotoErr.message}, attempting screenshot anyway...`);
    }
    
    console.log('[renderPageToImage] Waiting for rendering to complete (500ms)...');
      await new Promise(resolve => setTimeout(resolve, 500));
    console.log('[renderPageToImage] Rendering wait complete');
    
    console.log('[renderPageToImage] Getting page dimensions...');
    try {
      const dimensions = await page.evaluate(() => ({
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight,
        bodyWidth: document.body.scrollWidth,
        bodyHeight: document.body.scrollHeight
      }));
      console.log('[renderPageToImage] Page dimensions:', JSON.stringify(dimensions));
    } catch (dimErr) {
      console.warn('[renderPageToImage] Failed to get dimensions:', dimErr.message);
    }
    
    console.log('[renderPageToImage] Taking screenshot...');
    const screenshotStartTime = Date.now();
    const result = await page.screenshot({ 
      path: filename, 
      omitBackground: false,
      clip: { x: 0, y: 0, width, height }
    });
    const screenshotTime = Date.now() - screenshotStartTime;
    console.log(`[renderPageToImage] Screenshot taken in ${screenshotTime}ms, ${result.length} bytes`);
    console.log(`[renderPageToImage] Screenshot saved to: ${filename}`);
    
    console.log('[renderPageToImage] Execution completed successfully');
    return filename;
  } catch (error) {
    console.error('[renderPageToImage] ERROR occurred:', error.message);
    console.error('[renderPageToImage] Error stack:', error.stack);
    console.error('[renderPageToImage] Error type:', error.constructor.name);
    
    // Invalidate cached browser on fatal errors
    if (error.message && (error.message.includes('session') || error.message.includes('browser'))) {
      console.error('[renderPageToImage] Fatal browser error, clearing cache');
      cachedBrowser = null;
    }
    
    throw error;
  } finally {
    console.log('[renderPageToImage] Cleaning up page...');
    if (page) {
      try {
        await page.close();
        console.log('[renderPageToImage] Page closed successfully');
      } catch (e) {
        console.warn('[renderPageToImage] Error closing page:', e.message);
      }
    }
    console.log('[renderPageToImage] Cleanup complete');
  }
}
