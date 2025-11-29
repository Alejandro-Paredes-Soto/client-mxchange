"use client";

export type Rates = {
    usd: { buy: number; sell: number };
    lastUpdated: number;
};

// Mock helper to fetch rates from backend or fallback
export async function getRatesMock(): Promise<Rates> {
    try {
        // Intentar obtener las tasas desde el backend
        const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');
        if (API_BASE) {
            const res = await fetch(`${API_BASE}/public/exchange-rate`);
            if (res.ok) {
                const data = await res.json();
                return { 
                    usd: { buy: Number(data.buy), sell: Number(data.sell) }, 
                    lastUpdated: new Date(data.fetched_at).getTime() 
                };
            }
        }
        
        // Fallback si no hay backend configurado
        console.log('getRatesMock: using fallback rates');
        return { 
            usd: { buy: 17.8, sell: 18.2 }, 
            lastUpdated: Date.now() 
        };
    } catch (e) {
        console.error('getRatesMock: error fetching rates, using fallback', e);
        return { 
            usd: { buy: 17.8, sell: 18.2 }, 
            lastUpdated: Date.now() 
        };
    }
}

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');

export async function getRates(): Promise<Rates> {
    if (!API_BASE) return getRatesMock();
    try {
        const res = await fetch(`${API_BASE}/public/exchange-rate`);
        if (!res.ok) throw new Error('bad');
        const data = await res.json();
        return { usd: { buy: Number(data.buy), sell: Number(data.sell) }, lastUpdated: new Date(data.fetched_at).getTime() };
    } catch {
        return getRatesMock();
    }
}

export async function listBranches(): Promise<{ id: number; name: string }[]> {
    if (!API_BASE) return [{ id: 1, name: 'Sucursal Centro' }, { id: 2, name: 'Sucursal Norte' }];
    try {
        const res = await fetch(`${API_BASE}/public/branches`, { cache: 'no-store' });
        if (!res.ok) return [];
        const data = await res.json();
        return data.branches || [];
    } catch (e) {
        console.error('listBranches error', e);
        return [];
    }
}

export type Transaction = {
    id: string;
    type: 'buy' | 'sell';
    amountFrom: number;
    amountTo: number;
    rate: number;
    method?: string;
    branch?: string;
    branchAddress?: string;
    branchCity?: string;
    branchState?: string;
    status: 'En proceso' | 'Listo para recoger' | 'Completado';
    commissionPercent?: number;
    commissionAmount?: number;
    createdAt: number;
};

export type BackendTransaction = {
    id?: number;
    transaction_code?: string;
    type: 'buy' | 'sell';
    amount_from: string;
    amount_to: string;
    exchange_rate: string;
    commission_percent?: string;
    commission_amount?: string;
    method?: string;
    branch_id?: number;
    branch?: string;
    branch_address?: string;
    branch_city?: string;
    branch_state?: string;
    status?: string;
    created_at?: string;
    user_name?: string;
    currency_from?: string;
    currency_to?: string;
};

export async function createTransactionApi(payload: Record<string, unknown>, token?: string) {
    if (!API_BASE) return { error: 'no-api' };
    const res = await fetch(`${API_BASE}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
        // Rechazar con forma similar a Axios para que el catch en componentes pueda leer status y message
        throw { response: { status: res.status, data } } as { response: { status: number; data: unknown } };
    }
    return data;
}

export async function getUserTransactions(token?: string): Promise<BackendTransaction[]> {
    if (!API_BASE) return [];
    if (!token) return [];
    try {
        const res = await fetch(`${API_BASE}/transactions`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        if (!res.ok) return [];
        const data = await res.json();
        return data.transactions || [];
    } catch (e) {
        console.error('getUserTransactions error', e);
        return [];
    }
}

const STORAGE_KEY = 'mx_transactions';

export function listTransactionsMock(): Transaction[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        return JSON.parse(raw) as Transaction[];
    } catch (e) {
        console.error('error reading transactions', e);
        return [];
    }
}

export function saveTransactionMock(tx: Transaction) {
    const list = listTransactionsMock();
    list.unshift(tx);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 50)));
}

// ============================================================================
// CÁLCULO DE OPERACIÓN (Backend Authoritative)
// El frontend NO calcula montos, comisiones ni tasas.
// Este endpoint devuelve TODOS los cálculos listos para mostrar.
// ============================================================================

export type OperationCalculation = {
    type: 'buy' | 'sell';
    usd_amount: number;
    mxn_amount: number;
    base_rate: number;
    effective_rate: number;
    commission_percent: number;
    commission_mxn: number;
    currency_from: 'MXN' | 'USD';
    currency_to: 'MXN' | 'USD';
    amount_from: number;
    amount_to: number;
    inventory: {
        branch_id: number;
        available: number;
        status: 'available' | 'insufficient' | 'error' | 'unknown';
    } | null;
};

export type CalculateOperationResponse = {
    success: boolean;
    calculation: OperationCalculation;
    calculated_at: string;
    valid_for_seconds: number;
};

export async function calculateOperation(
    type: 'buy' | 'sell',
    usdAmount: number,
    branchId?: number
): Promise<CalculateOperationResponse> {
    if (!API_BASE) {
        throw new Error('API no configurada');
    }

    const res = await fetch(`${API_BASE}/public/calculate-operation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            type,
            usd_amount: usdAmount,
            branch_id: branchId || null
        }),
    });

    const data = await res.json();
    
    if (!res.ok) {
        throw { response: { status: res.status, data } };
    }

    return data as CalculateOperationResponse;
}

// Admin types & API helpers
export type AdminInventoryItem = {
    id: number;
    branch_id: number;
    branch_name?: string;
    currency: string;
    amount: number;
    reserved_amount?: number;
    low_stock_threshold?: number;
    stock_status?: string;
    last_updated?: string;
};

export type AdminTransaction = BackendTransaction & { branch_name?: string };

export async function getAdminInventory(token?: string): Promise<AdminInventoryItem[]> {
    if (!API_BASE) return [];
    try {
        const res = await fetch(`${API_BASE}/admin/inventory`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }, cache: 'no-store' });
        if (!res.ok) return [];
        const data = await res.json();
        return data.inventory || [];
    } catch (e) {
        console.error('getAdminInventory error', e);
        return [];
    }
}

export async function putAdminInventory(id: number, payload: Partial<AdminInventoryItem>, token?: string) {
    if (!API_BASE) return { error: 'no-api' };
    try {
        const res = await fetch(`${API_BASE}/admin/inventory`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ id, ...payload }),
        });
        const data = await res.json();
        if (!res.ok) return { error: data };
        return data;
    } catch (e) {
        console.error('putAdminInventory error', e);
        return { error: e };
    }
}

export async function getAdminTransactions(filters: { code?: string; branch_id?: string; status?: string; start_date?: string; end_date?: string } = {}, token?: string): Promise<AdminTransaction[]> {
    if (!API_BASE) return [];
    if (!token) return [];
    try {
        const params = new URLSearchParams();
        if (filters.code) params.append('code', filters.code);
        if (filters.branch_id) params.append('branch_id', filters.branch_id);
        if (filters.status) params.append('status', filters.status);
        if (filters.start_date) params.append('start_date', filters.start_date);
        if (filters.end_date) params.append('end_date', filters.end_date);
        const res = await fetch(`${API_BASE}/admin/transactions?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        if (!res.ok) return [];
        const data = await res.json();
        return data.transactions || [];
    } catch (e) {
        console.error('getAdminTransactions error', e);
        return [];
    }
}

export async function putTransactionStatus(transactionId: number, status: string, token?: string) {
    if (!API_BASE) return { error: 'no-api' };
    try {
        const res = await fetch(`${API_BASE}/admin/transactions/${transactionId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ status }),
        });
        const data = await res.json();
        if (!res.ok) return { error: data };
        return data;
    } catch (e) {
        console.error('putTransactionStatus error', e);
        return { error: e };
    }
}

export type AdminUser = {
    idUser: number;
    name: string;
    email: string;
    role: string;
    active: boolean | number; // MySQL devuelve 0/1, TypeScript espera boolean
    createdAt: string;
};

export async function getAdminUsers(token?: string): Promise<AdminUser[]> {
    if (!API_BASE) return [];
    try {
        const res = await fetch(`${API_BASE}/admin/users`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }, cache: 'no-store' });
        if (!res.ok) return [];
        const data = await res.json();
        return data.users || [];
    } catch (e) {
        console.error('getAdminUsers error', e);
        return [];
    }
}

export async function toggleUserStatus(userId: number, active: boolean, token?: string) {
    if (!API_BASE) return { error: 'no-api' };
    try {
        const res = await fetch(`${API_BASE}/admin/users/${userId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ active }),
        });
        const data = await res.json();
        if (!res.ok) return { error: data };
        return data;
    } catch (e) {
        console.error('toggleUserStatus error', e);
        return { error: e };
    }
}

export async function getCurrentRates(token?: string): Promise<{ buy: number; sell: number }> {
    if (!API_BASE) return { buy: 17.8, sell: 18.2 };
    try {
        const res = await fetch(`${API_BASE}/admin/config/rates`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }, cache: 'no-store' });
        if (!res.ok) return { buy: 17.8, sell: 18.2 };
        const data = await res.json();
        return { buy: Number(data.buy), sell: Number(data.sell) };
    } catch (e) {
        console.error('getCurrentRates error', e);
        return { buy: 17.8, sell: 18.2 };
    }
}

export async function updateRates(payload: { buy: number; sell: number }, token?: string) {
    if (!API_BASE) return { error: 'no-api' };
    try {
        const res = await fetch(`${API_BASE}/admin/config/rates`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) return { error: data };
        return data;
    } catch (e) {
        console.error('updateRates error', e);
        return { error: e };
    }
}

export type Branch = {
    id: number;
    name: string;
    address: string;
    city: string;
    state: string;
    user_email?: string;
};

export async function listBranchesAdmin(token?: string): Promise<Branch[]> {
    if (!API_BASE) return [];
    try {
        const res = await fetch(`${API_BASE}/admin/config/branches`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }, cache: 'no-store' });
        if (!res.ok) return [];
        const data = await res.json();
        return data.branches || [];
    } catch (e) {
        console.error('listBranchesAdmin error', e);
        return [];
    }
}

export async function createBranch(payload: { name: string; address: string; email: string; password: string; city?: string; state?: string }, token?: string) {
    if (!API_BASE) return { error: 'no-api' };
    try {
        const res = await fetch(`${API_BASE}/admin/config/branches`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) return { error: data };
        return data;
    } catch (e) {
        console.error('createBranch error', e);
        return { error: e };
    }
}

export async function updateBranch(id: number, payload: Partial<Branch> & { email?: string; password?: string }, token?: string) {
    if (!API_BASE) return { error: 'no-api' };
    try {
        const res = await fetch(`${API_BASE}/admin/config/branches/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) return { error: data };
        return data;
    } catch (e) {
        console.error('updateBranch error', e);
        return { error: e };
    }
}

export async function deleteBranch(id: number, token?: string) {
    if (!API_BASE) return { error: 'no-api' };
    try {
        const res = await fetch(`${API_BASE}/admin/config/branches/${id}`, {
            method: 'DELETE',
            headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        });
        const data = await res.json();
        if (!res.ok) return { error: data };
        return data;
    } catch (e) {
        console.error('deleteBranch error', e);
        return { error: e };
    }
}

export async function getAlertSettings(token?: string): Promise<{ alertEmails: string }> {
    if (!API_BASE) return { alertEmails: '' };
    try {
        const res = await fetch(`${API_BASE}/admin/config/alerts`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }, cache: 'no-store' });
        if (!res.ok) return { alertEmails: '' };
        const data = await res.json();
        return { alertEmails: data.alertEmails || '' };
    } catch (e) {
        console.error('getAlertSettings error', e);
        return { alertEmails: '' };
    }
}

export async function updateAlertSettings(payload: { alertEmails: string }, token?: string) {
    if (!API_BASE) return { error: 'no-api' };
    try {
        const res = await fetch(`${API_BASE}/admin/config/alerts`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) return { error: data };
        return data;
    } catch (e) {
        console.error('updateAlertSettings error', e);
        return { error: e };
    }
}

export async function getInventorySummary(token?: string): Promise<{ summary: { [key: string]: number } }> {
    if (!API_BASE) return { summary: {} };
    try {
        const res = await fetch(`${API_BASE}/admin/dashboard/inventory-summary`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }, cache: 'no-store' });
        if (!res.ok) return { summary: {} };
        const data = await res.json();
        return data;
    } catch (e) {
        console.error('getInventorySummary error', e);
        return { summary: {} };
    }
}

// Generic settings helpers (stored in settings table on backend)
export async function getSetting(key: string, token?: string): Promise<{ key: string; value: string } | null> {
    if (!API_BASE) return { key, value: '' };
    try {
        // special-case commission which has a public endpoint
        if (key === 'commission_percent') {
            // backend monta las rutas públicas en /public
            const res = await fetch(`${API_BASE}/public/config/commission`, { cache: 'no-store' });
            if (!res.ok) return null;
            const data = await res.json();
            return { key, value: String(data.commissionPercent) };
        }
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}/admin/config/settings/${encodeURIComponent(key)}`, { headers, cache: 'no-store' });
        if (!res.ok) return null;
        const data = await res.json();
        return { key: data.key, value: data.value };
    } catch (e) {
        console.error('getSetting error', e);
        return null;
    }
}

export async function updateSetting(key: string, value: string, token?: string) {
    if (!API_BASE) return { error: 'no-api' };
    if (!token) return { error: 'no-token' };
    try {
        // if updating commission, use the admin commission endpoint
        if (key === 'commission_percent') {
            const res = await fetch(`${API_BASE}/admin/config/commission`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ commissionPercent: Number(value) }),
            });
            const data = await res.json();
            if (!res.ok) return { error: data };
            return data;
        }
        const res = await fetch(`${API_BASE}/admin/config/settings/${encodeURIComponent(key)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ value }),
        });
        const data = await res.json();
        if (!res.ok) return { error: data };
        return data;
    } catch (e) {
        console.error('updateSetting error', e);
        return { error: e };
    }
}

export async function getDashboardKPIs(token?: string): Promise<{ volumenTransacciones: number; totalUSDVendidos: number; totalUSDComprados: number; incumplimientos: number }> {
    if (!API_BASE) return { volumenTransacciones: 0, totalUSDVendidos: 0, totalUSDComprados: 0, incumplimientos: 0 };
    try {
        const res = await fetch(`${API_BASE}/admin/dashboard/kpis`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }, cache: 'no-store' });
        if (!res.ok) return { volumenTransacciones: 0, totalUSDVendidos: 0, totalUSDComprados: 0, incumplimientos: 0 };
        const data = await res.json();
        return data;
    } catch (e) {
        console.error('getDashboardKPIs error', e);
        return { volumenTransacciones: 0, totalUSDVendidos: 0, totalUSDComprados: 0, incumplimientos: 0 };
    }
}

export async function getDashboardChartData(token?: string): Promise<{ chartData: { date: string; total_movimientos: number; no_realizados: number }[] }> {
    if (!API_BASE) return { chartData: [] };
    try {
        const res = await fetch(`${API_BASE}/admin/dashboard/chart`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }, cache: 'no-store' });
        if (!res.ok) return { chartData: [] };
        const data = await res.json();
        return data;
    } catch (e) {
        console.error('getDashboardChartData error', e);
        return { chartData: [] };
    }
}

export async function getRecentTransactions(token?: string): Promise<{ transactions: AdminTransaction[] }> {
    if (!API_BASE) return { transactions: [] };
    try {
        const res = await fetch(`${API_BASE}/admin/dashboard/recent-transactions`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }, cache: 'no-store' });
        if (!res.ok) return { transactions: [] };
        const data = await res.json();
        return data;
    } catch (e) {
        console.error('getRecentTransactions error', e);
        return { transactions: [] };
    }
}

export async function getTransactionDetails(id: number, token?: string): Promise<{ transaction: AdminTransaction }> {
    if (!API_BASE) return { transaction: {} as AdminTransaction };
    try {
        const res = await fetch(`${API_BASE}/admin/transactions/${id}`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }, cache: 'no-store' });
        if (!res.ok) return { transaction: {} as AdminTransaction };
        const data = await res.json();
        return data;
    } catch (e) {
        console.error('getTransactionDetails error', e);
        return { transaction: {} as AdminTransaction };
    }
}

// ==================== STRIPE HELPERS (FRONTEND) ====================
export type StripeConfig = { publicKey: string | null; provider: 'stripe' };

export async function getStripeConfig(): Promise<StripeConfig | null> {
    if (!API_BASE) return null;
    try {
        const res = await fetch(`${API_BASE}/payments/stripe/config`, { cache: 'no-store' });
        if (!res.ok) return null;
        return res.json();
    } catch (e) {
        console.error('getStripeConfig error', e);
        return null;
    }
}

export async function stripeCharge(payload: {
    amount: number;
    currency?: string;
    description?: string;
    transaction_code: string;
    customer: { name: string; email: string };
    payment_method_id: string;
}, token?: string) {
    if (!API_BASE) return { error: 'no-api' } as const;
    try {
        const res = await fetch(`${API_BASE}/payments/stripe/charge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) return { error: data } as const;
        return data;
    } catch (e) {
        console.error('stripeCharge error', e);
        return { error: e } as const;
    }
}

export async function createStripePaymentIntent(payload: {
    amount: number;
    currency?: string;
    description?: string;
    transaction_code?: string;
    customer: { name: string; email: string };
}, token?: string) {
    if (!API_BASE) return { error: 'no-api' } as const;
    try {
        const res = await fetch(`${API_BASE}/payments/stripe/create-payment-intent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) return { error: data } as const;
        return data;
    } catch (e) {
        console.error('createStripePaymentIntent error', e);
        return { error: e } as const;
    }
}
