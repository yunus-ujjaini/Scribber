
import puppeteer, { executablePath } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

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
    console.log('[renderPageToImage] Getting chromium executable path...');
    const execPath = await chromium.executablePath();
    console.log('[renderPageToImage] Chromium executable path:', execPath);
    console.log('[renderPageToImage] Executable path type:', typeof execPath);
    
    console.log('[renderPageToImage] Launching browser...');
    const startTime = Date.now();
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--disable-web-resources',
        '--disable-component-update'
      ],
      executablePath: execPath,
      timeout: 30000
    });
    const launchTime = Date.now() - startTime;
    console.log(`[renderPageToImage] Browser launched successfully in ${launchTime}ms`);
    
    console.log('[renderPageToImage] Creating new page...');
    const pageStartTime = Date.now();
    page = await browser.newPage();
    const pageTime = Date.now() - pageStartTime;
    console.log(`[renderPageToImage] New page created in ${pageTime}ms`);
    
    console.log('[renderPageToImage] Setting page size...');
    try {
      await page.setDefaultNavigationTimeout(10000);
      await page.setDefaultTimeout(10000);
      console.log('[renderPageToImage] Timeouts set');
    } catch (e) {
      console.warn('[renderPageToImage] Warning setting timeouts:', e.message);
    }
    
    // Do NOT call setViewport - it causes issues with chromium on Lambda
    // Instead, rely on viewport meta tag and CSS dimensions
    
    console.log('[renderPageToImage] Loading HTML content via goto with data URL...');
    const dataUrl = `data:text/html;base64,${Buffer.from(html).toString('base64')}`;
    console.log(`[renderPageToImage] Data URL created, length: ${dataUrl.length} characters`);
    
    const gotoStartTime = Date.now();
    await page.goto(dataUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    const gotoTime = Date.now() - gotoStartTime;
    console.log(`[renderPageToImage] Content loaded via goto in ${gotoTime}ms`);
    
    console.log('[renderPageToImage] Waiting for rendering to complete (1000ms)...');
    await page.waitForTimeout(1000);
    console.log('[renderPageToImage] Rendering wait complete');
    
    console.log('[renderPageToImage] Getting page dimensions...');
    const dimensions = await page.evaluate(() => ({
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      bodyWidth: document.body.scrollWidth,
      bodyHeight: document.body.scrollHeight
    }));
    console.log('[renderPageToImage] Page dimensions:', JSON.stringify(dimensions));
    
    console.log('[renderPageToImage] Taking screenshot...');
    const screenshotStartTime = Date.now();
    const result = await page.screenshot({ 
      path: filename, 
      omitBackground: false,
      clip: { x: 0, y: 0, width, height }
    });
    const screenshotTime = Date.now() - screenshotStartTime;
    console.log(`[renderPageToImage] Screenshot taken in ${screenshotTime}ms`);
    console.log(`[renderPageToImage] Screenshot result:`, result ? `${result.length} bytes` : 'null');
    console.log(`[renderPageToImage] Screenshot saved to: ${filename}`);
    
    console.log('[renderPageToImage] Execution completed successfully');
    return filename;
  } catch (error) {
    console.error('[renderPageToImage] ERROR occurred:', error.message);
    console.error('[renderPageToImage] Error stack:', error.stack);
    console.error('[renderPageToImage] Error type:', error.constructor.name);
    throw error;
  } finally {
    console.log('[renderPageToImage] Cleaning up resources...');
    if (page) {
      try {
        console.log('[renderPageToImage] Closing page...');
        await page.close();
        console.log('[renderPageToImage] Page closed successfully');
      } catch (e) {
        console.warn('[renderPageToImage] Error closing page:', e.message);
      }
    }
    if (browser) {
      try {
        console.log('[renderPageToImage] Closing browser...');
        await browser.close();
        console.log('[renderPageToImage] Browser closed successfully');
      } catch (e) {
        console.warn('[renderPageToImage] Error closing browser:', e.message);
      }
    }
    console.log('[renderPageToImage] Cleanup complete');
  }
}
