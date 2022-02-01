import puppeteer from 'puppeteer';
import {EnrichedTaxEntry} from '../entities';

const DECLARATIONS_URL = 'https://lkfl2.nalog.ru/lkfl/situations/3NDFL';

export class NalogRuReportMaker {
    constructor(private _page: puppeteer.Page) {}

    async makeReport(items: EnrichedTaxEntry[]) {
        await this._page.bringToFront();
        await this._openDeclarationsPage();
        await this._openForeignIncomePage();
        const lenStr = items.length.toString().length;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            console.log(
                `[🏦] Adding ${String(i + 1).padStart(lenStr, ' ')}/${items.length} ${
                    item.name
                }, ${item.tax} ${item.currency}`
            );
            await this._addNewIncomeItem(i, item);
        }
        await this._save();
    }

    private async _openDeclarationsPage() {
        const [btnNext] = await Promise.all([
            this._page.waitForXPath('//button[@type="submit" and contains(., "Далее")]'),
            this._page.waitForNavigation(),
            this._page.goto(DECLARATIONS_URL),
            this._page.waitForXPath(
                '//div[contains(., "Налоговая декларация физических лиц (3-НДФЛ)")]'
            )
        ]);
        if (!btnNext) {
            throw new Error('Next button is not found');
        }
        await this._wait();
        await btnNext.click();
        await this._wait();
    }

    private async _openForeignIncomePage() {
        const foreignIncomeTab = await this._page.waitForXPath(
            '//li[@role="tab" and contains(., "За пределами РФ")]'
        );
        if (!foreignIncomeTab) {
            throw new Error('No foreign income tab found');
        }
        await foreignIncomeTab.click();
    }

    private async _addNewIncomeItem(sourceIndex: number, item: EnrichedTaxEntry) {
        const formRoot = await this._openNewItemForm();
        const fields = this._createFieldsSet(sourceIndex, item);
        for (const field of fields) {
            await this._fillSingleField(field, formRoot);
        }
        await this._setCurrencyAutoCalc(formRoot);
    }

    private async _openNewItemForm(): Promise<puppeteer.ElementHandle> {
        const tabContent = await this._page.waitForXPath(
            '//div[contains(@class, "TabsComponent__tabs-content-outRF")]'
        );
        if (!tabContent) {
            throw new Error('Tab for foreign income is not found');
        }
        const addBtn = await tabContent.$('button[type="submit"]');
        if (!addBtn) {
            throw new Error('Add new income item button is not found');
        }
        await addBtn.click();
        const allSpoilers = await tabContent.$$('svg:not([class])');
        const lastItem = allSpoilers[allSpoilers.length - 1];
        await lastItem.click();
        return (
            await tabContent.$x('//div[contains(@class, "Spoiler_spoilerOpened__")]')
        )[0];
    }

    private _createFieldsSet(
        sourceIndex: number,
        item: EnrichedTaxEntry
    ): Array<[string, any]> {
        return [
            [
                `Ndfl3Package.payload.sheetB.sources[${sourceIndex}].incomeSourceName`,
                item.name
            ],
            [
                `Ndfl3Package.payload.sheetB.sources[${sourceIndex}].oksmIst`,
                item.countryCode
            ],
            [`Ndfl3Package.payload.sheetB.sources[${sourceIndex}].incomeTypeCode`, 1010],
            [
                `Ndfl3Package.payload.sheetB.sources[${sourceIndex}].taxDeductionCode`,
                'Не предоставлять'
            ],
            [
                `Ndfl3Package.payload.sheetB.sources[${sourceIndex}].incomeAmountCurrency`,
                item.sumBeforeTax
            ],
            [
                `Ndfl3Package.payload.sheetB.sources[${sourceIndex}].currencyCode`,
                item.currencyCode
            ],
            [
                `Ndfl3Package.payload.sheetB.sources[${sourceIndex}].incomeDate`,
                this._formatDate(item.datePay)
            ],
            [
                `Ndfl3Package.payload.sheetB.sources[${sourceIndex}].taxPaymentDate`,
                this._formatDate(item.datePay)
            ],
            [
                `Ndfl3Package.payload.sheetB.sources[${sourceIndex}].paymentAmountCurrency`,
                item.tax
            ]
        ];
    }

    private async _setCurrencyAutoCalc(formRoot: puppeteer.ElementHandle) {
        const checkbox = await formRoot.$('input[name="getCurrencyOnline"]');
        if (!checkbox) {
            throw new Error('Auto calc checkbox is not found');
        }
        await checkbox.click();
    }

    private async _fillSingleField(
        field: [string, any],
        formRoot: puppeteer.ElementHandle
    ) {
        const [id, value] = field;
        const sId = String(id).replace(/([.\[\]])/g, (_, g) => `\\${g}`);
        let fieldElement = await formRoot.$(`#${sId}`);
        let isDropdown = false;
        if (!fieldElement) {
            throw new Error(`Element ${id} is not found`);
        }
        const nodeName = await fieldElement.evaluate((e) => e.nodeName);
        if (nodeName !== 'INPUT') {
            isDropdown = true;
            fieldElement = await fieldElement.$('input');
            if (!fieldElement) {
                throw new Error(`Input element for ${id} is not found`);
            }
        }
        await fieldElement.type(String(value));
        if (isDropdown) {
            await this._page.keyboard.press('Enter');
        }
    }

    private _formatDate(date: Date): string {
        return [
            date.getDate().toString().padStart(2, '0'),
            (date.getMonth() + 1).toString().padStart(2, '0'),
            date.getFullYear().toString()
        ].join('.');
    }

    private async _save() {
        const exitBtn = await this._page.waitForXPath(
            '//button[@type="button" and contains(., "Выйти")]'
        );
        if (!exitBtn) {
            throw new Error('Exit button is not found');
        }
        await exitBtn.click();
        const yesBtn = await this._page.waitForXPath(
            '//button[@type="submit" and @value="Да" and contains(., "Да")]'
        );
        if (!yesBtn) {
            throw new Error('Yes button is not found');
        }
        await yesBtn.click();
    }

    private async _wait() {
        await this._page.waitForTimeout(2000);
    }
}
