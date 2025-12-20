import { JsonRpcProvider } from "ethers";
import { setNativeBalance } from "./helper";
import { address, BorrowableCToken, ChainRpcPrefix, curvance_signer, ERC20, Market, setupChain } from "../../src";
import Decimal from "decimal.js";

export class TestFramework {
    provider: JsonRpcProvider;
    signer: curvance_signer
    chain: ChainRpcPrefix;
    curvance: Awaited<ReturnType<typeof setupChain>>;
    snapshot_id: number | null = null;

    constructor(provider: JsonRpcProvider, signer: curvance_signer, chain: ChainRpcPrefix, curvance: Awaited<ReturnType<typeof setupChain>>) {
        this.provider = provider;
        this.signer = signer;
        this.chain = chain;
        this.curvance = curvance;
    }

    async init({
        seedNativeBalance = true,
        seedLiquidity = true,
        snapshot = true,
    }: {
        seedNativeBalance?: boolean,
        seedLiquidity?: boolean,
        snapshot?: boolean,
    }) {
        await this.seedNativeBalance();
        await this.seedLiquidity();
        await this.snapshot();
    }

    get account(): address {
        return this.signer.address as address;
    }

    async seedLiquidity() {
        const seed_configs = {
            'monad-mainnet': [
                {holder: "0xA02318f858128c8D2048eF47171249E9B4a0DedA", target: "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a"}, //Has about $12m AUSD
                {holder: "0x85402dCB299A003797705Ee6C4D8b3af62010120", target: "0x103222f020e98Bba0AD9809A011FDF8e6F067496"}, //Has about $9m earnAUSD
            ],
            'monad-testnet': [],
            'local-monad-mainnet': []
        };

        for(const liquidity_source of seed_configs[this.chain] || []) {
            await this.provider.send("anvil_impersonateAccount", [liquidity_source.holder]);
            const impersonatedSigner = await this.provider.getSigner(liquidity_source.holder);

            const erc20 = new ERC20(impersonatedSigner, liquidity_source.target as address);
            console.log('Supplying test liquidity from ', liquidity_source.holder, ' for token ', await erc20.fetchSymbol());
            await erc20.transfer(this.account, Decimal(1_000_000));
            
            await this.provider.send("anvil_stopImpersonatingAccount", [liquidity_source.holder]);
        }
    }
    
    async seedNativeBalance(amount: bigint = 10000000000000000000n) {
        await setNativeBalance(this.provider, this.account, amount);
    }

    async snapshot(): Promise<number> {
        this.snapshot_id = await this.provider.send("evm_snapshot", []) as number;
        return this.snapshot_id;
    }

    async revertToLastSnapshot() {
        if(this.snapshot_id == null) {
            throw new Error("No snapshot to revert to");
        }

        await this.provider.send("evm_revert", [this.snapshot_id]);
        // Snapshot is now consumed, but we'll create a new one in the test
    }
    
    async getMarket(findMarketName: string): Promise<[Market, BorrowableCToken, BorrowableCToken]> {
        let market: Market | undefined;
        let tokenA: BorrowableCToken | undefined;
        let tokenB: BorrowableCToken | undefined;

        for(const curvance_market of this.curvance.markets) {
            if(curvance_market.name == findMarketName) {
                market = curvance_market;
                tokenA = curvance_market.tokens[0] as BorrowableCToken;
                tokenB = curvance_market.tokens[1] as BorrowableCToken;
                break;
            }
        }

        if(market == undefined || tokenA == undefined || tokenB == undefined) {
            throw new Error(`Market ${findMarketName} not found in curvance markets`);
        }

        return [ market, tokenA, tokenB ];
    }
}