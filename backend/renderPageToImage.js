
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

  const html = `
    <html>
      <head>
        <style>
          body {
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

  let browser;
  let page;
  try {
    const execPath = await chromium.executablePath();
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
      executablePath: execPath
    });
    
    page = await browser.newPage();
    await page.setViewport({ width, height });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    // Wait a bit for rendering to complete
    await page.waitForTimeout(500);
    
    const element = await page.$('body');
    if (element) {
      await element.screenshot({ path: filename, omitBackground: false });
    } else {
      throw new Error('Failed to find body element');
    }
    
    return filename;
  } catch (error) {
    console.error('Error rendering page:', error);
    throw error;
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
