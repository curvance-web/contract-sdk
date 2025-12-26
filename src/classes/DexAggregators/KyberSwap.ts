import { error } from "console";
import { address, bytes, curvance_provider, Percentage, TokenInput } from "../../types";
import { ZapToken } from "../CToken";
import IDexAgg from "./IDexAgg";
import { Swap } from "../Zapper";
import { all_markets, ERC20, fromBpsToWad, toBigInt, toBps, validateProviderAsSigner, WAD } from "../..";

export interface KyperSwapErrorResponse {
    code: number;
    message: string;
    requestId: string;
}

export interface KyberSwapQuoteResponse {
    message: string;
    data: {
        routeSummary: {
            tokenIn: string;
            amountIn: string;
            amountInUsd: string;
            tokenOut: string;
            amountOut: string;
            amountOutUsd: string;
            gas: string;
            gasPrice: string;
            gasUsd: string;
            l1FeeUsd: string;
            routeID: string;
            checksum: string;
            timestamp: number;
            extraFee: {
                feeAmount: string;
                chargeFeeBy: string;
                isInBps: boolean;
                feeReceiver: string;
            };
            route: [
                {
                    pool: string;
                    tokenIn: string;
                    tokenOut: string;
                    swapAmount: string;
                    amountOut: string;
                    exchange: string;
                    poolType: string;
                    poolExtra: any;
                    extra: any;
                }[]
            ];
        },
        routerAddress: string;
    },
    requestId: string;
};

export interface KyperSwapBuildResponse {
    code: number;
    message: string;
    data: {
        amountIn: string;
        amountInUsd: string;
        amountOut: string;
        amountOutUsd: string;
        gas: string;
        gasUsd: string;
        additionalCostUsd: string;
        additionalCostMessage: string;
        outputChange: {
            amount: string;
            percent: number;
            level: number;
        },
        data: string;
        routerAddress: string;
        transactionValue: string;
    },
    requestId: string;
}

export class KyberSwap implements IDexAgg {
    api: string;
    dao: address;
    router: address;
    chain: string;
    client_id: string = "curvance-sdk";

    constructor(
        dao: address = "0x0Acb7eF4D8733C719d60e0992B489b629bc55C02",
        router: address = "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5",
        chain: string = "monad-mainnet",
        api: string = "https://aggregator-api.kyberswap.com"
    ) {
        // KyberSwap uses 'monad' instead of 'monad-mainnet' like other providers, so we adjust here
        if(chain == "monad-mainnet") {
            chain = 'monad'; 
        }

        this.dao = dao;
        this.router = router;
        this.chain = chain;
        this.api = `${api}/${this.chain}`;
    }
    
    async getAvailableTokens(provider: curvance_provider, query: string | null = null, page: number = 1, pageSize: number = 25): Promise<ZapToken[]> {
        let zap_tokens: ZapToken[] = [];
        
        let tokens_set = new Set<string>();
        for(const market of all_markets) {
            for(const token of market.tokens) {
                if(tokens_set.has(token.address)) {
                    continue;
                }
                tokens_set.add(token.address);
                
                zap_tokens.push({
                    interface: token.getAsset(true),
                    type: 'simple',
                    quote: async (tokenIn: string, tokenOut: string, amount: TokenInput, slippage: Percentage) => {
                        const signer = validateProviderAsSigner(provider);
                        const erc20in = new ERC20(provider, tokenIn as address);
                        const decimals = erc20in.decimals ?? await erc20in.contract.decimals();
                        const amount_bigint = toBigInt(amount, decimals);
                        
                        return await this.quote(signer.address, tokenIn, tokenOut, amount_bigint, toBps(slippage));
                    }
                });
            }
        }

        // https://ks-setting.kyberswap.com/api/v1/tokens?chainIds=143&page=1&pageSize=25&isWhitelisted=true
        return zap_tokens;
    }

    async quoteAction(wallet: string, tokenIn: string, tokenOut: string, amount: bigint, slippage: bigint) {
        const quote = await this.quote(wallet, tokenIn, tokenOut, amount, slippage);
        const action = {
            inputToken: tokenIn,
            inputAmount: BigInt(amount),
            outputToken: tokenOut,
            target: quote.to,
            slippage: slippage ? fromBpsToWad(slippage) : 0n,
            call: quote.calldata
        } as Swap;

        return { action, quote };
    }

    async quoteMin(wallet: string, tokenIn: string, tokenOut: string, amount: bigint, slippage: bigint) {
        const quote = await this.quote(wallet, tokenIn, tokenOut, amount, slippage);
        return quote.out;
    }
    
    async quote(wallet: string, tokenIn: string, tokenOut: string, amount: bigint, slippage: bigint) {
        const params = new URLSearchParams({
            tokenIn,
            tokenOut,
            amountIn: amount.toString()
            // feeAmount
            // chargeFeeBy
            // isInBps
            // feeReceiver
        });
        
        const quote_response = await fetch(`${this.api}/api/v1/routes?${params.toString()}`, {
            method: 'GET',
            headers: {
                'X-Client-Id': this.client_id,
                'Content-Type': 'application/json'
            }
        });
        if (!quote_response.ok) {
            const error_return = await quote_response.json() as KyperSwapErrorResponse;
            throw new Error(`KyberSwap API request failed [${error_return.requestId}]: ${error_return.message} (code: ${error_return.code})`);
        }
        const quote = await quote_response.json() as KyberSwapQuoteResponse;

        const build_response = await fetch(`${this.api}/api/v1/route/build`, {
            method: 'POST',
            headers: {
                'X-Client-Id': this.client_id,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                routeSummary: quote.data.routeSummary,
                origin: wallet,
                sender: wallet,
                recipient: wallet,
                slippageTolerance: Number(slippage),
                referral: this.dao
            })
        });
        if (!build_response.ok) {
            const error_return = await build_response.json() as KyperSwapErrorResponse;
            throw new Error(`KyberSwap API build request failed [${error_return.requestId}]: ${error_return.message} (code: ${error_return.code})`);
        }
        const build_data = await build_response.json() as KyperSwapBuildResponse;

        // I need to figure out what min_out is by applying the slippage which is in bps to build_data.amountOut
        const min_out = BigInt(build_data.data.amountOut) * BigInt(10000n - slippage) / BigInt(10000);

        if(build_data.data.routerAddress != this.router) {
            throw new Error(`KyberSwap returned unexpected router address: ${build_data.data.routerAddress}`);
        }

        return {
            to: build_data.data.routerAddress as address,
            calldata: build_data.data.data as bytes,
            min_out: min_out,
            out: BigInt(build_data.data.amountOut),
            raw: build_data
        }
    }
}