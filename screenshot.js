import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.setViewportSize({ width: 1280, height: 720 });
  
  try {
    await page.goto('http://localhost:4321/newsletter-detail/weekly-06', { 
      waitUntil: 'networkidle',
      timeout: 10000 
    });
    
    await page.waitForTimeout(2000);
    
    await page.screenshot({ 
      path: '/Users/archer/Desktop/newsletter-balanced-spacing.png', 
      fullPage: true
    });
    
    console.log('Balanced spacing screenshot saved');
    
  } catch (error) {
    console.error('Error taking screenshot:', error);
  } finally {
    await browser.close();
  }
})();