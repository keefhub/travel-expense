export interface Trip {
  destinationCountry: string;
  currency: string;
  startDate: string;
  endDate: string;
  budget?: number;
}

export interface Category {
  name: string;
  isDefault: boolean;
}

export interface Expense {
  id: string;
  amount: number;
  currency: string;
  category: string;
  date: string;
  paymentMethod: string;
  location: string;
  description?: string;
}

export interface ExchangeRate {
  currency: string;
  rate: number;
}
