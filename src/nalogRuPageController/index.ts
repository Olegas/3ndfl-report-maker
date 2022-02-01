import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

const LK_URL = 'https://lkfl2.nalog.ru/lkfl/login';

export class NalogRuPageController {
    private _browser: puppeteer.Browser | undefined;
    private _page: puppeteer.Page | undefined;

    async getNalogRuPage(): Promise<puppeteer.Page> {
        const browser = await this._createBrowser();
        const page = await browser.newPage();
        await page.setViewport({
            width: 1024,
            height: 768
        });
        this._page = page;
        await Promise.all([this._page.waitForNavigation(), this._page.goto(LK_URL)]);
        return page;
    }

    async screenshot(path: string) {
        await this._page?.screenshot({
            type: 'png',
            path
        });
    }

    async finalize() {
        await this._page?.close();
        await this._browser?.close();
    }

    private async _createBrowser(): Promise<puppeteer.Browser> {
        const userDataDir = path.join(process.cwd(), '.userData');
        if (!fs.existsSync(userDataDir)) {
            fs.mkdirSync(userDataDir);
        }
        this._browser = await puppeteer.launch({
            headless: false,
            slowMo: 10,
            userDataDir
        });
        return this._browser;
    }
}
