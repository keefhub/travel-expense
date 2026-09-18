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

export interface SharedTripLink {
  tripId: string;
  shareToken: string;
  creatorToken: string;
}

export interface SharedTripSummary {
  id: string;
  destinationCountry: string;
  currency: string;
  startDate: string;
  endDate: string;
}

export interface JoinedTrip {
  tripId: string;
  shareToken: string;
  participantId: string;
  participantToken: string;
  participantName: string;
  trip: SharedTripSummary;
}

export interface ParticipantSummary {
  id: string;
  name: string;
}
