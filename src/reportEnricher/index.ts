import {EnrichedTaxEntry, TaxEntry} from '../entities';
import countries from 'i18n-iso-countries';
// @ts-ignore
import ru from 'i18n-iso-countries/langs/ru';
import currencyCodes from 'currency-codes';
// @ts-ignore
import fetch from 'node-fetch';

countries.registerLocale(ru);

function delay(ms: number) {
    return new Promise((res) => setTimeout(res, ms));
}

export class ReportEnricher {
    private _cache: Record<string, string> = {};

    async enrichItems(items: TaxEntry[]): Promise<EnrichedTaxEntry[]> {
        const result: EnrichedTaxEntry[] = [];
        await this._preloadIsinCache(items);
        for (const item of items) {
            result.push(await this._enrichItem(item));
        }
        return result;
    }

    private async _preloadIsinCache(items: TaxEntry[]) {
        const uniqueIsin = [...new Set(items.map((i) => i.isin))];
        const batches = uniqueIsin.reduce(
            (batches: Array<string[]>, isin) => {
                const lastBatch = batches[batches.length - 1];
                if (lastBatch.length < 10) {
                    lastBatch.push(isin);
                } else {
                    batches.push([isin]);
                }
                return batches;
            },
            [[]]
        );
        for (const batch of batches) {
            this._cache = {
                ...this._cache,
                ...(await this._preloadBatch(batch))
            };
        }
    }

    private async _preloadBatch(batch: string[]): Promise<Record<string, string>> {
        let response;
        const batchResult: Record<string, string> = {};
        while (true) {
            response = await fetch('https://api.openfigi.com/v3/mapping', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(
                    batch.map((isin) => ({idType: 'ID_ISIN', idValue: isin}))
                )
            });
            if (response.status === 429) {
                console.warn('[⏱] Rate-limited, sleeping...');
                await delay(10000);
                continue;
            }
            break;
        }
        const result = await response.json();
        for (let i = 0; i < batch.length; i++) {
            const {
                data: [{name}]
            } = result[i];
            batchResult[batch[i]] = name;
        }
        return batchResult;
    }

    private _getName(item: TaxEntry): string {
        return this._cache[item.isin];
    }

    private async _enrichItem(item: TaxEntry): Promise<EnrichedTaxEntry> {
        const alpha2 = countries.getAlpha2Code(item.country, 'ru');
        if (!alpha2) {
            throw new Error(`Failed to detect alpha-2 code for country ${item.country}`);
        }
        const currencyCode = currencyCodes.code(item.currency)?.number;
        if (!currencyCode) {
            throw new Error(`Failed to detect code for currency ${item.currency}`);
        }
        return {
            ...item,
            countryCode: +countries.alpha2ToNumeric(alpha2),
            currencyCode: +currencyCode,
            name: this._getName(item)
        };
    }
}
