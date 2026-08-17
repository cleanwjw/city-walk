const { chromium } = require(process.env.PCW_PLAYWRIGHT_PATH || 'playwright');
const fs = require('fs');

const base = 'http://127.0.0.1:8080/';
const allZones = ['huilongwo','hubushan','museum','hanculture','yunlonglake','yunlongshan','huaitower'];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function finishGuide(page) {
  await page.locator('#playerName').fill('测试旅人');
  await page.locator('#nameSubmit').click();
  for (let i = 0; i < 4; i += 1) await page.locator('#guideNext').click();
  await page.locator('#routePicker.open').waitFor();
}

async function desktopFlow(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, { waitUntil: 'networkidle' });
  await finishGuide(page);
  await page.locator('[data-route="landscape"]').click();
  assert(await page.locator('#activeRouteName').textContent() === '山水漫游', '桌面端路线选择失败');

  await page.locator('[data-zone="yunlonglake"]').click();
  const canvas = await page.locator('#game').boundingBox();
  assert(canvas, '找不到游戏画布');
  // 云龙湖靠世界西侧，镜头在 x=0 处夹紧；场景坐标 (255,390) 映射到画布约 (421,371)。
  await page.mouse.click(canvas.x + 421, canvas.y + 371);
  await page.locator('#story.open').waitFor();
  await page.locator('#collect').click();
  assert((await page.locator('#stampName').textContent()).includes('已获得'), '景点打卡没有发放印章');
  assert(await page.locator('.stamp-mini.earned').count() === 1, '印章架进度不正确');

  await page.evaluate(() => localStorage.setItem('pcw:xuzhou', JSON.stringify({
    v: 2,
    name: '测试旅人',
    visited: ['huilongwo:0','hubushan:0','museum:0'],
    stamps: ['huilongwo','hubushan','museum'],
    milestones: ['route:oldcity'],
    selectedRouteId: 'oldcity',
    route: ['huilongwo','hubushan','museum'],
    steps: 210
  })));
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#finishTrip').click();
  assert(await page.locator('#endingBadge').textContent() === '老城寻踪·完成', '主题路线结局未解锁');
  await page.locator('#continueTrip').click();

  await page.evaluate(() => localStorage.setItem('pcw:xuzhou', JSON.stringify({
    v: 2,
    name: '测试旅人',
    visited: ['museum:0','yunlongshan:0','huaitower:0'],
    stamps: ['museum','yunlongshan','huaitower'],
    milestones: ['triangle'],
    selectedRouteId: 'hanmemory',
    route: ['museum','yunlongshan','huaitower'],
    steps: 321
  })));
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#finishTrip').click();
  await page.locator('#tripEnd.open').waitFor();
  assert(await page.locator('#endingBadge').textContent() === '山水相逢·古今徐州', '三角主线结局未解锁');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#downloadCard').click();
  const download = await downloadPromise;
  const path = await download.path();
  assert(path && fs.statSync(path).size > 10000, 'PNG 下载文件为空或过小');

  await page.evaluate(zones => localStorage.setItem('pcw:xuzhou', JSON.stringify({
    v: 2,
    name: '测试旅人',
    visited: zones.map(id => `${id}:0`),
    stamps: zones,
    milestones: ['triangle','allStamps'],
    selectedRouteId: 'oldcity',
    route: zones,
    steps: 777
  })), allZones);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#finishTrip').click();
  assert(await page.locator('#endingBadge').textContent() === '七印彭城·圆满珍藏', '七印结局未解锁');
  assert(await page.locator('#resultStamps').textContent() === '7', '结算印章统计不正确');
  assert(errors.length === 0, `桌面端脚本错误：${errors.join('; ')}`);
  await context.close();
}

async function mobileFlow(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, { waitUntil: 'networkidle' });
  await finishGuide(page);
  await page.locator('[data-route="oldcity"]').click();
  await page.locator('#continuePortrait').click();
  assert(await page.locator('#activeRouteName').textContent() === '老城寻踪', '手机端路线选择失败');
  assert(await page.locator('#journeyPanel').isVisible(), '手机端任务面板不可见');
  assert(await page.locator('#chooseRoute').isVisible(), '手机端路线切换按钮不可见');
  assert(errors.length === 0, `手机端脚本错误：${errors.join('; ')}`);
  await context.close();
}

async function legacyCityFlow(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}?city=jinan`, { waitUntil: 'networkidle' });
  await page.locator('#playerName').fill('兼容测试');
  await page.locator('#nameSubmit').click();
  const guideCount = await page.locator('#guideProgress i').count();
  for (let i = 0; i < guideCount; i += 1) await page.locator('#guideNext').click();
  assert(!(await page.locator('#routePicker').isVisible()), '无玩法配置的旧城市不应弹出路线选择');
  assert(!(await page.locator('#chooseRoute').isVisible()), '无路线的旧城市不应显示路线按钮');
  assert(await page.locator('.pin').count() === 6, '济南旧配置地标数量异常');
  assert(errors.length === 0, `济南兼容模式脚本错误：${errors.join('; ')}`);
  await context.close();
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PCW_BROWSER_PATH || undefined
  });
  try {
    await desktopFlow(browser);
    await mobileFlow(browser);
    await legacyCityFlow(browser);
    console.log('PASS desktop: onboarding, route, landmark, stamp, route ending, triangle ending, all-stamp ending, PNG download');
    console.log('PASS mobile: onboarding, route picker, portrait hint, journey panel, route switch');
    console.log('PASS compatibility: Jinan config without gameplay extensions');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
