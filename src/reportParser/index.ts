// @ts-ignore
import PDFParser from 'pdf2json';
import {TaxEntry} from '../entities';

type TDetectorFn = (str: string) => boolean;
type TParserFn = (str: string) => unknown;
type RowBoundary = [number, number];

interface Line {
    x: number;
    y: number;
    w: number;
    l: number;
    oc: string;
}

interface Fill {
    x: number;
    y: number;
    w: number;
    h: number;
    oc?: string;
    clr?: number;
}

interface Text {
    x: number;
    y: number;
    w: number;
    sw: number;
    A: 'left' | 'center' | 'right';
    oc: string | undefined;
    R: Array<{
        T: string;
        S: number;
        TS: [number, number, number, number];
    }>;
}

interface Page {
    Width: number;
    Height: number;
    HLines: Line[];
    VLines: Line[];
    Fills: Fill[];
    Texts: Text[];
}

type PDFData = {
    Pages: Page[];
};

const dpi = 96.0;
const gridYPerInch = 4.0;

const _pixelYPerGrid = dpi / gridYPerInch;
const _pixelPerPoint = dpi / 72;

function toPixelY(formY: number) {
    return Math.round(formY * _pixelYPerGrid);
}

function pointToPixel(point: number) {
    // Point unit (1/72 an inch) to pixel units
    return point * _pixelPerPoint;
}

export class TinkoffForeignTaxReportParser {
    private readonly _ready: Promise<TaxEntry[]>;
    private readonly _detectors = {
        date: (str: string) => /\d\d\.\d\d.\d\d/.test(str),
        isin: (str: string) => /[A-Z]{2}[0-9A-Z]{10}/.test(str),
        count: (str: string) => /\d/.test(str),
        sum: (str: string) => /\d,\d/.test(str),
        currency: (str: string) => /[A-Z]{3}/.test(str),
        country: (str: string) => /[а-я]{3}/i.test(str)
    };
    private readonly _parsers = {
        date: (str: string) => {
            const [d, m, y] = str.split('.').map(Number);
            return new Date(y, m - 1, d, 0, 0, 0, 0);
        },
        id: (str: string) => str,
        number: parseInt,
        sum: (str: string) => parseFloat(str.replace(',', '.'))
    };
    private readonly _fields: Array<[keyof TaxEntry, TDetectorFn, TParserFn]> = [
        ['dateFix', this._detectors.date, this._parsers.date],
        ['datePay', this._detectors.date, this._parsers.date],
        ['isin', this._detectors.isin, this._parsers.id],
        ['country', this._detectors.country, this._parsers.id],
        ['count', this._detectors.count, this._parsers.number],
        ['cost', this._detectors.sum, this._parsers.sum],
        ['comission', this._detectors.sum, this._parsers.sum],
        ['sumBeforeTax', this._detectors.sum, this._parsers.sum],
        ['tax', this._detectors.sum, this._parsers.sum],
        ['sumAfterTax', this._detectors.sum, this._parsers.sum],
        ['currency', this._detectors.currency, this._parsers.id]
    ];

    constructor(file: string) {
        const parser = new PDFParser();
        this._ready = new Promise<Page[]>((res, rej) => {
            parser.on('pdfParser_dataError', rej);
            parser.on('pdfParser_dataReady', (pdfData: PDFData) => {
                const {Pages} = pdfData;
                res(Pages);
            });
            parser.loadPDF(file);
        }).then((pages: Page[]): TaxEntry[] => {
            const result: TaxEntry[] = [];
            for (const page of pages) {
                result.push(...this._processPage(page));
            }
            return result;
        });
    }

    getTaxEntries(): Promise<TaxEntry[]> {
        return this._ready;
    }

    private _processPage(page: Page): TaxEntry[] {
        const result: TaxEntry[] = [];
        const trCell = this._searchForCurrencyCell(page.Texts);
        if (!trCell) {
            throw new Error('Can not find tor right cell for current page');
        }
        const allCurrencyCells = this._getAllCurrencyTextCells(page.Texts, trCell.x);
        const rows = this._getRowBoundaries(page.HLines, allCurrencyCells);
        for (let i = 0; i < rows.length - 1; i++) {
            const y1 = rows[i];
            const y2 = rows[i + 1];
            result.push(this._getItemsFromRow(page.Texts, [y1, y2]));
        }
        return result;
    }

    private _searchForCurrencyCell(items: Text[]): Text | undefined {
        return items.find((i) => this._getText(i) === 'Валюта');
    }

    private _getAllCurrencyTextCells(texts: Text[], leftPoint: number): Text[] {
        return texts.filter((text) => leftPoint < text.x);
    }

    private _getRowBoundaries(lines: Line[], currencyCells: Text[]): number[] {
        const uniqPoints = [...new Set(lines.map((l) => l.y))];
        uniqPoints.sort((a, b) => Math.sign(a - b));
        // Cells are sorted in reverse order
        currencyCells.sort((a, b) => Math.sign(b.y - a.y));
        const result: number[] = [];
        let currentCell: Text | undefined = currencyCells.pop();
        let ptIdx = 0;
        while (currentCell) {
            for (; ptIdx < uniqPoints.length; ptIdx++) {
                const point = uniqPoints[ptIdx];
                const ptY = toPixelY(point);
                const cellTop = toPixelY(currentCell.y);
                const cellBottom = cellTop + pointToPixel(currentCell.R[0].TS[1]);
                if (ptY < cellTop || (cellTop < ptY && ptY < cellBottom)) {
                    result[Math.max(0, result.length - 1)] = Math.min(
                        point,
                        currentCell.y
                    );
                } else {
                    result.push(point);
                    ptIdx--;
                    currentCell = currencyCells.pop();
                    break;
                }
            }
        }
        return result;
    }

    private _getItemsFromRow(items: Text[], row: RowBoundary): TaxEntry {
        const result = [];
        const iter = this._getItemsIterator(items, row);
        for (let i = 0; i < this._fields.length; i++) {
            const [field, detector, parser] = this._fields[i];
            while (true) {
                const {value, done} = iter.next();
                if (detector(value)) {
                    result.push([field, parser(value)]);
                    break;
                }
                if (done) break;
            }
        }
        return Object.fromEntries(result);
    }

    private *_getItemsIterator(items: Text[], row: RowBoundary): Generator<string> {
        const [y1, y2] = row;
        for (const item of items) {
            if (y1 <= item.y && item.y < y2) {
                yield this._getText(item);
            }
        }
    }

    private _getText(item: Text) {
        const {R} = item;
        if (R.length > 1) {
            throw new Error('Unsupported text node');
        }
        return decodeURIComponent(item.R[0].T);
    }
}
