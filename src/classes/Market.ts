import { contractSetup } from "../helpers";
import { Contract } from "ethers";
import { DynamicMarketData, ProtocolReader, StaticMarketData, UserMarket } from "./ProtocolReader";
import { BorrowableCToken, CToken } from "./CToken";
import abi from '../abis/MarketManagerIsolated.json';
import { Decimal } from "decimal.js";
import { address, curvance_signer } from "../types";
import { OracleManager } from "./OracleManager";

export interface StatusOf {
    collateral: bigint;
    maxDebt: bigint;
    debt: bigint;
}

export interface LiquidationStatusOf {
    lFactor: bigint;
    collateralPrice: bigint;
    debtPrice: bigint;
}

export interface HypotheticalLiquidityOf {
    collateralSurplus: bigint,
    liquidityDeficit: bigint,
    positionsToClose: boolean[]
} 

export interface IMarket {
    accountAssets(account: address): Promise<bigint>;
    MIN_HOLD_PERIOD(): Promise<bigint>;
    hypotheticalLiquidityOf(account: address, cTokenModified: address, redemptionShares: bigint, borrowAssets: bigint): Promise<HypotheticalLiquidityOf>;
    statusOf(account: address): Promise<StatusOf>;
    liquidationStatusOf(account: address, collateralToken: address, debtToken: address): Promise<LiquidationStatusOf>;
}

export class Market {
    signer: curvance_signer;
    address: address;
    contract: Contract & IMarket;
    abi: any;
    adapters: bigint[];
    cooldownLength: bigint;
    tokens: (CToken | BorrowableCToken)[] = [];
    oracle_manager: OracleManager;
    cache: { static: StaticMarketData, dynamic: DynamicMarketData, user: UserMarket };

    constructor(
        signer: curvance_signer,
        static_data: StaticMarketData,
        dynamic_data: DynamicMarketData,
        user_data: UserMarket,
        oracle_manager: OracleManager
    ) {
        this.signer = signer;
        this.address = static_data.address;
        this.adapters = static_data.adapters;
        this.oracle_manager = oracle_manager;
        this.cooldownLength = static_data.cooldownLength;
        this.contract = contractSetup<IMarket>(signer, this.address, abi);
        this.cache = { static: static_data, dynamic: dynamic_data, user: user_data };

        for(let i = 0; i < static_data.tokens.length; i++) {
            const tokenData = {
                ...static_data.tokens[i]!,
                ...dynamic_data.tokens[i]!,
                ...user_data.tokens[i]!
            };

            if(tokenData.isBorrowable) {
                const ctoken = new BorrowableCToken(signer, tokenData.address, tokenData, this);
                this.tokens.push(ctoken);
            } else {
                const ctoken = new CToken(signer, tokenData.address, tokenData, this);
                this.tokens.push(ctoken);
            }
        }
    }

    get tvl() {
        let marketTvl = new Decimal(0);
        for(const token of this.tokens) {
            marketTvl = marketTvl.add(token.getTvl(true));
        }
        return marketTvl;
    }

    get totalDebt() {
        let marketDebt = new Decimal(0);
        for(const token of this.tokens) {
            if(token.isBorrowable) {
                marketDebt = marketDebt.add((token as BorrowableCToken).getTotalDebt(true));
            }
        }
        return marketDebt;
    }

    get totalCollateral() {
        let marketCollateral = new Decimal(0);
        for(const token of this.tokens) {
            marketCollateral = marketCollateral.add(token.getTotalCollateral(true));
        }
        return marketCollateral;
    }

    async statusOf(account: address) {
        const data = await this.contract.statusOf(account);
        return {
            collateral: BigInt(data.collateral),
            maxDebt: BigInt(data.maxDebt),
            debt: BigInt(data.debt)
        }
    }

    async liquidationStatusOf(account: address, collateralToken: address, debtToken: address) {
        const data = await this.contract.liquidationStatusOf(account, collateralToken, debtToken);
        return {
            lFactor: BigInt(data.lFactor),
            collateralPrice: BigInt(data.collateralPrice),
            debtPrice: BigInt(data.debtPrice)
        }
    }

    async hypotheticalLiquidityOf(account: address, cTokenModified: address, redemptionShares: bigint, borrowAssets: bigint) {
        const data = await this.contract.hypotheticalLiquidityOf(account, cTokenModified, redemptionShares, borrowAssets);
        return {
            collateralSurplus: BigInt(data.collateralSurplus),
            liquidityDeficit: BigInt(data.liquidityDeficit),
            positionsToClose: data.positionsToClose
        }
    }

    async expiresAt(account: address, fetch = false) {
        const cooldownTimestamp = await this.contract.accountAssets(account);
        const cooldownLength = fetch || this.cooldownLength == 0n ? await this.contract.MIN_HOLD_PERIOD() : this.cooldownLength;
        const unlockTime = cooldownTimestamp + cooldownLength;
        return unlockTime == cooldownLength ? null : new Date(Number(unlockTime * 1000n));
    }

    async multiHoldExpiresAt(markets: Market[], reader: ProtocolReader) {
        if(markets.length == 0) {
            throw new Error("You can't fetch expirations for no markets.");
        }

        const marketAddresses = markets.map(market => market.address);
        const cooldownTimestamps = await reader.marketMultiCooldown(marketAddresses, this.signer.address as address);
        

        let cooldowns: { [address: address]: Date | null } = {};
        for(let i = 0; i < markets.length; i++) {
            const market = markets[i]!;
            const cooldownTimestamp = cooldownTimestamps[i]!;
            const cooldownLength = market.cooldownLength;

            cooldowns[market.address] = cooldownTimestamp == cooldownLength ? null : new Date(Number(cooldownTimestamp * 1000n));
        }

        return cooldowns;
    }

    static async getAll(signer: curvance_signer, reader: ProtocolReader, oracle_manager: OracleManager) {
        const all_data = await reader.getAllMarketData(signer.address as address);

        let markets: Market[] = [];
        for(let i = 0; i < all_data.staticMarket.length; i++) {
            const staticData = all_data.staticMarket[i];
            const dynamicData = all_data.dynamicMarket[i];
            const userData = all_data.userData.markets[i];

            if(staticData == undefined) {
                throw new Error(`Could not find static market data for index: ${i}`);
            }

            if(dynamicData == undefined) {
                throw new Error(`Could not find dynamic market data for index: ${i}`);
            }

            if(userData == undefined) {
                throw new Error(`Could not find user market data for index: ${i}`);
            }

            const market = new Market(signer, staticData, dynamicData, userData, oracle_manager);
            markets.push(market);
        }

        return markets;
    }
}