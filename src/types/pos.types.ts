export interface PosFisicoInitRequest {
  amount: number;
}

export interface PosFisicoInitResponse {
  status: 'success' | 'error';
  message: string;
  data?: {
    facturaNro: string;
  };
}

export interface PosFisicoConfirmRequest {
  facturaNro: string;
  status_result: 'success' | 'error';
  pos_response?: any;
  error_message?: string;
}

export interface PosFisicoConfirmResponse {
  status: 'success' | 'error';
  message: string;
}
