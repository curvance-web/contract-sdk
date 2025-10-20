import { address } from "../types";

interface KuruJWTResponse {
    token: string;
    expires_at: number;
    rate_limit: {
        rps: number;
        burst: number;
    }
}

interface KuruQuoteResponse {
    type: string;
    status: string;
    output: string;
    minOut: string;
    transaction: {
        calldata: string;
        value: string;
        to: string;
    };
    gasPrices: {
        slow: string;
        standard: string;
        fast: string;
        rapid: string;
        extreme: string;
    };
}

const cached_jwt = new Map<string, KuruJWTResponse>();
const cached_requests = new Map<string, number[]>();

export default class Kuru {
    static api = "https://ws.staging.kuru.io/api"
    static router = "0x96eaC98928437496DdD0Cd2080E54Fe78BaC99b6" as address;
    jwt: string | null = null;
    rps = 1;

    async loadJWT(wallet: string) {
        if(cached_jwt.has(wallet)) {
            const cached = cached_jwt.get(wallet)!;
            const currentTime = Kuru.getCurrentTime();

            if(cached.expires_at > currentTime) {
                this.jwt = cached.token;
                this.rps = cached.rate_limit.rps;
                return;
            } else {
                cached_jwt.delete(wallet);
            }
        }

        const resp = await fetch(`${Kuru.api}/generate-token`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                user_address: wallet,
            }),
            keepalive: true
        });

        if(!resp.ok) {
            throw new Error(`Failed to fetch JWT: ${resp.status} ${resp.statusText}`);
        }

        const data = await resp.json() as KuruJWTResponse;

        this.jwt = data.token;
        this.rps = data.rate_limit.rps;
        cached_jwt.set(wallet, data);
    }

    async rateLimitSleep(wallet: string) {
        const now = Kuru.getCurrentTime();
        const requests = cached_requests.get(wallet) || [];
        const windowStart = now - 1;

        const recentRequests = requests.filter(timestamp => timestamp > windowStart);
        if(recentRequests.length >= this.rps) {
            const earliestRequest = Math.min(...recentRequests);
            const sleepTime = (earliestRequest + 1) - now;
            await new Promise(resolve => setTimeout(resolve, sleepTime * 1000));
        }
    }

    // Get current time in seconds
    static getCurrentTime() {
        return Math.floor(Date.now() / 1000);
    }

    static async quote(wallet: string, tokenIn: string, tokenOut: string, amount: string, slippageTolerance: bigint | null = null) {
        const kuru = new Kuru();
        await kuru.loadJWT(wallet);
        await kuru.rateLimitSleep(wallet);

        const payload: {
            userAddress: string;
            tokenIn: string;
            tokenOut: string;
            amount: string;
            referrer_address?: string;
            referrer_fee_bps?: number;
            slippage_tolerance?: number;
            autoSlippage?: boolean;
        } = {
            userAddress: wallet,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amount: amount,
        };

        if(!slippageTolerance) {
            payload.autoSlippage = true;
        } else {
            payload.slippage_tolerance = Number(slippageTolerance);
        }

        const resp = await fetch(`${Kuru.api}/quote`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${kuru.jwt}`,
            },
            body: JSON.stringify(payload),
        });

        if(!resp.ok) {
            throw new Error(`Failed to fetch quote: ${resp.status} ${resp.statusText}`);
        }

        cached_requests.set(wallet, (cached_requests.get(wallet) || []).concat(Kuru.getCurrentTime()));
        const data = await resp.json() as KuruQuoteResponse;
        return data;
    }
}