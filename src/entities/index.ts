export interface TaxEntry {
    dateFix: Date;
    datePay: Date;
    isin: string;
    country: string;
    count: number;
    cost: number;
    comission: number;
    sumBeforeTax: number;
    tax: number;
    sumAfterTax: number;
    currency: string;
}

export interface EnrichedTaxEntry extends TaxEntry {
    countryCode: number;
    currencyCode: number;
    name: string;
}
