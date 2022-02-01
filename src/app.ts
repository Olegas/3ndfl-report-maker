import {TinkoffForeignTaxReportParser} from './reportParser';
import {EntryValidatory} from './validator';
import {ReportEnricher} from './reportEnricher';
import {NalogRuReportMaker} from './reportMaker';
import {NalogRuPageController} from './nalogRuPageController';
import {EnrichedTaxEntry, TaxEntry} from './entities';
import path from 'path';
import puppeteer from 'puppeteer';

export class App {
    constructor(private _fileName: string) {}

    async run() {
        const items = await this._parseReport();
        const enrichedItems = await this._enrichItems(items);
        const browserController = new NalogRuPageController();
        try {
            const page = await this._preparePage(browserController);
            await this._makeReport(page, enrichedItems);
        } catch (e: any) {
            console.log('[❌] Something went wrong...');
            console.log(`[❌] Error details: ${e.message}`);
            console.log('[❌] Screenshot is saved');
            console.log('[❌] Press Enter to close browser');
            await this._readEnter();
            await browserController.screenshot(path.join(process.cwd(), 'error.png'));
        } finally {
            await browserController.finalize();
        }
    }

    private async _parseReport() {
        console.log('[🚀] Parsing tax report...');
        const report = new TinkoffForeignTaxReportParser(this._fileName);
        const items = await report.getTaxEntries();
        const itemsValid = items.every((i) => EntryValidatory.isValid(i));
        if (!itemsValid) {
            throw new Error('Invalid items found');
        }
        console.log(`[✅] Done! ${items.length} parsed`);
        return items;
    }

    private async _enrichItems(items: TaxEntry[]) {
        console.log(
            `[🚀] Enriching items (loading company names). This may take a while...`
        );
        const enricher = new ReportEnricher();
        const enrichedItems = await enricher.enrichItems(items);
        console.log(`[✅] Done!`);
        return enrichedItems;
    }

    private async _preparePage(browserController: NalogRuPageController) {
        console.log('[❗️] After pressing Enter, browser will be started...');
        console.log(
            '[❗️] Login with any suitable method, when return back and press Enter once again'
        );
        await this._readEnter();
        console.log('[🚀] Loading browser to make report...');
        const page = await browserController.getNalogRuPage();
        console.log(
            '[🖐] Please login to your Nalog.RU account, when go back here and press Enter'
        );
        await this._readEnter();

        return page;
    }

    private async _makeReport(page: puppeteer.Page, items: EnrichedTaxEntry[]) {
        console.log('[🚀] Making report. Please wait, this will take a while...');
        const reportMaker = new NalogRuReportMaker(page);
        await reportMaker.makeReport(items);
        console.log(`[✅] Done! Draft URL: ${page.url()}`);
    }

    private async _readEnter() {
        const stdin = process.stdin;
        return new Promise<void>((res) => {
            const handler = (key: Buffer) => {
                if (key.toString() === '\r') {
                    stdin.setRawMode(false);
                    stdin.pause();
                    stdin.off('data', handler);
                    res();
                }
            };
            stdin.setRawMode(true);
            stdin.resume();
            stdin.setEncoding('utf8');
            stdin.on('data', handler);
        });
    }
}
