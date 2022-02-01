import {TaxEntry} from '../entities';

export class EntryValidatory {
    static isValid(item: TaxEntry): boolean {
        if (
            !item.dateFix ||
            !item.datePay ||
            !item.isin ||
            !item.currency ||
            !item.country
        )
            return false;
        if (isNaN(item.sumBeforeTax) || isNaN(item.tax)) return false;

        return true;
    }
}
