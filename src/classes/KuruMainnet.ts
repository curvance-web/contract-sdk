import Decimal from "decimal.js";
import { address, curvance_provider, TokenInput } from "../types";
import { ERC20 } from "./ERC20";
import { toBigInt, toDecimal, validateProviderAsSigner, WAD } from "../helpers";
import { ZapToken } from "./CToken";
import { Swap } from "./Zapper";

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

export default class KuruMainnet {
    static api = "https://ws.kuru.io/api"
    static router = "0xb3e6778480b2E488385E8205eA05E20060B813cb" as address; // KuruFlowEntrypoint
    jwt: string | null = null;
    rps = 1;
    dao = "0x0Acb7eF4D8733C719d60e0992B489b629bc55C02" as address;

    async loadJWT(wallet: string) {
        if(cached_jwt.has(wallet)) {
            const cached = cached_jwt.get(wallet)!;
            const currentTime = KuruMainnet.getCurrentTime();

            if(cached.expires_at > currentTime) {
                this.jwt = cached.token;
                this.rps = cached.rate_limit.rps;
                return;
            } else {
                cached_jwt.delete(wallet);
            }
        }

        const resp = await fetch(`${KuruMainnet.api}/generate-token`, {
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
        const now = KuruMainnet.getCurrentTime();
        const requests = cached_requests.get(wallet) || [];
        const windowStart = now - 2;

        const recentRequests = requests.filter(timestamp => timestamp > windowStart);
        if(recentRequests.length >= this.rps) {
            const earliestRequest = Math.min(...recentRequests);
            const sleepTime = (earliestRequest + 2) - now;
            await new Promise(resolve => setTimeout(resolve, sleepTime * 2000));
        }
    }

    static async getAvailableTokens(provider: curvance_provider, query: string | null = null) {
        const signer = validateProviderAsSigner(provider);

        const userAddress = signer.address;
        let endpoint = `https://api.kuru.io/api/v2/tokens/search?limit=20&userAddress=${userAddress}`;
        if(query) {
            endpoint += `&q=${encodeURIComponent(query)}`;
        }

        const resp = await fetch(endpoint, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            }
        });

        if(!resp.ok) {
            throw new Error(`Failed to fetch available tokens: ${resp.status} ${resp.statusText}`);
        }

        const list = await resp.json() as {
            success: boolean;
            code: number;
            timestamp: number;
            data: {
                data: Array<{
                    address: string;
                    decimals: number;
                    name: string;
                    ticker: string;
                    imageurl: string,
                    twitter: string,
                    website: string,
                    is_verified: boolean,
                    contract_renounced: boolean,
                    is_erc20: boolean,
                    is_mintable: boolean,
                    is_strict: boolean,
                    balance: string,
                    last_price: string,
                    quote_asset: string,
                    market_address: string,
                    total_supply: string,
                    burned_supply: string
                }>
            }
        };
        
        let tokens: ZapToken[] = [];
        for(const token of list.data.data) {
            const erc20 = new ERC20(
                provider, 
                token.address as address,
                {
                    address: token.address as address,
                    name: token.name,
                    symbol: token.ticker,
                    decimals: BigInt(token.decimals ?? 18),
                    totalSupply: BigInt(token.total_supply ?? 0),
                    balance: BigInt(token.balance ?? 0),
                    image: token.imageurl,
                    price: Decimal(token.last_price).div(WAD)
                },
            );

            tokens.push({
                interface: erc20,
                type: 'simple',
                quote: async(tokenIn: string, tokenOut: string, amount: TokenInput, slippageTolerance: bigint | null = null) => {
                    const raw_amount = toBigInt(amount, 18n);
                    const data = await KuruMainnet.quote(signer.address, tokenIn, tokenOut, raw_amount.toString(), slippageTolerance);
                    return {
                        output: toDecimal(BigInt(data.output ?? 0), BigInt(token.decimals ?? 18)),
                        minOut: toDecimal(BigInt(data.minOut ?? 0), BigInt(token.decimals ?? 18)),
                        max_slippage: data.max_slippage
                    };
                }
            });
        }

        return tokens;
    }

    // Get current time in seconds
    static getCurrentTime() {
        return Math.floor(Date.now() / 1000);
    }

    static async quoteAction(wallet: string, tokenIn: string, tokenOut: string, amount: string, slippageTolerance: bigint | null = null) {
        const quote = await KuruMainnet.quote(wallet, tokenIn, tokenOut, amount, slippageTolerance);
        const action = {
            inputToken: tokenIn,
            inputAmount: BigInt(amount),
            outputToken: tokenOut,
            target: quote.transaction.to,
            slippage: slippageTolerance ?? 0n,
            call: `0x${quote.transaction.calldata}`
        } as Swap;

        return { action, quote };
    }

    static async quoteMin(wallet: string, tokenIn: string, tokenOut: string, amount: string, slippageTolerance: bigint | null = null) {
        const quote = await KuruMainnet.quote(wallet, tokenIn, tokenOut, amount, slippageTolerance);
        return quote.minOut;
    }

    static async quote(wallet: string, tokenIn: string, tokenOut: string, amount: string, slippageTolerance: bigint | null = null) {
        const kuru = new this();
        await kuru.loadJWT(wallet);
        await kuru.rateLimitSleep(wallet);

        const payload: {
            userAddress: string;
            tokenIn: string;
            tokenOut: string;
            amount: string;
            referrerAddress?: string;
            referrerFeeBps?: number;
            slippage_tolerance?: number;
            autoSlippage?: boolean;
        } = {
            userAddress: wallet,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amount: amount,
            referrerAddress: kuru.dao,
            referrerFeeBps: 10,
        };

        if(!slippageTolerance) {
            payload.autoSlippage = true;
        } else {
            payload.slippage_tolerance = Number(slippageTolerance);
        }

        cached_requests.set(wallet, (cached_requests.get(wallet) || []).concat(KuruMainnet.getCurrentTime()));
        const resp = await fetch(`${KuruMainnet.api}/quote`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${kuru.jwt}`
            },
            body: JSON.stringify(payload),
        });

        if(!resp.ok) {
            throw new Error(`Failed to fetch quote: ${resp.status} ${resp.statusText}`);
        }

        const data = await resp.json() as KuruQuoteResponse;

        return {
            ...data,
            max_slippage: KuruMainnet.getSlippage(BigInt(data.output ?? 0), BigInt(data.minOut ?? 0))
        };
    }

    static getSlippage(output: bigint, min_output: bigint) {
        const diff = output - min_output;
        const decimal = Decimal(diff).div(output).mul(100);
        return decimal ?? Decimal(100);
    }
}