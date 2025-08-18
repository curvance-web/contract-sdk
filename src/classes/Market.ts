import { contractSetup, EMPTY_ADDRESS, toDecimal, UINT256_MAX, validateProviderAsSigner, WAD } from "../helpers";
import { Contract, ethers } from "ethers";
import { DynamicMarketData, ProtocolReader, StaticMarketData, UserMarket } from "./ProtocolReader";
import { BorrowableCToken, CToken } from "./CToken";
import abi from '../abis/MarketManagerIsolated.json';
import { Decimal } from "decimal.js";
import { address, curvance_provider } from "../types";
import { OracleManager } from "./OracleManager";

export interface StatusOf {
    collateral: bigint;
    maxDebt: bigint;
    debt: bigint;
}

export interface DeployData {
    name: string,
    plugins: { [key: string]: address }
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
    liquidationValuesOf(account: address): Promise<{ soft: bigint, hard: bigint, debt: bigint }>;
}

export class Market {
    provider: curvance_provider;
    address: address;
    contract: Contract & IMarket;
    tokens: (CToken | BorrowableCToken)[] = [];
    oracle_manager: OracleManager;
    reader: ProtocolReader;
    cache: { static: StaticMarketData, dynamic: DynamicMarketData, user: UserMarket, deploy: DeployData };

    constructor(
        provider: curvance_provider,
        static_data: StaticMarketData,
        dynamic_data: DynamicMarketData,
        user_data: UserMarket,
        deploy_data: DeployData,
        oracle_manager: OracleManager,
        reader: ProtocolReader
    ) {
        this.provider = provider;
        this.address = static_data.address;
        this.oracle_manager = oracle_manager;
        this.reader = reader;
        this.contract = contractSetup<IMarket>(provider, this.address, abi);
        this.cache = { static: static_data, dynamic: dynamic_data, user: user_data, deploy: deploy_data };

        for(let i = 0; i < static_data.tokens.length; i++) {
            // @NOTE: Merged fields from the 3 types, so you wanna make sure there is no collisions
            // Otherwise we will have some dataloss
            const tokenData = {
                ...static_data.tokens[i]!,
                ...dynamic_data.tokens[i]!,
                ...user_data.tokens[i]!
            };

            if(tokenData.isBorrowable) {
                const ctoken = new BorrowableCToken(provider, tokenData.address, tokenData, this);
                this.tokens.push(ctoken);
            } else {
                const ctoken = new CToken(provider, tokenData.address, tokenData, this);
                this.tokens.push(ctoken);
            }
        }
    }

    get positionHealth() { return this.cache.user.positionHealth; }
    get userCollateral() { return toDecimal(this.cache.user.collateral, 18n); }
    get userDebt() { return toDecimal(this.cache.user.debt, 18n); }
    get userMaxDebt() { return toDecimal(this.cache.user.maxDebt, 18n); }
    get cooldown() { return this.cache.user.cooldown == this.cooldownLength ? null : new Date(Number(this.cache.user.cooldown * 1000n)); }
    get adapters() { return this.cache.static.adapters; }
    get cooldownLength() { return this.cache.static.cooldownLength; }
    get name() { return this.cache.deploy.name; }
    get plugins() { return this.cache.deploy.plugins ?? {}; }

    /**
     * Get the total user deposits in USD.
     * @returns {Decimal} - The total user deposits in USD.
     */
    get userDeposits() {
        let total_deposits = Decimal(0);
        for(const token of this.tokens) {
            total_deposits = total_deposits.add(token.convertTokensToUsd(token.userShareBalance));
        }

        return total_deposits;
    }

    get ltv() {
        if (this.tokens.length === 0) {
            return { min: new Decimal(0), max: new Decimal(0) };
        }

        let min = this.tokens[0]!.ltv();
        let max = min;

        for (const token of this.tokens) {
            const ltv = new Decimal(token.ltv());
            if (ltv.lessThan(min)) {
                min = ltv;
            }
            if (ltv.greaterThan(max)) {
                max = ltv;
            }
        }

        if(min == max) {
            return `${min.mul(100)}%`;
        }

        return `${min.mul(100)}% - ${max.mul(100)}%`;
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

    highestApy() {
        let maxApy = new Decimal(0);
        for(const token of this.tokens) {
            const tokenApy = token.getApy();
            if(tokenApy.greaterThan(maxApy)) {
                maxApy = tokenApy;
            }
        }
        return maxApy;
    }

    hasBorrowing() {
        let canBorrow = false;
        for(const token of this.tokens) {
            if(token.isBorrowable) {
                canBorrow = true;
                break;
            }
        }
        return canBorrow;
    }

    async statusOf(account: address) {
        const data = await this.contract.statusOf(account);
        return {
            collateral: BigInt(data.collateral),
            maxDebt: BigInt(data.maxDebt),
            debt: BigInt(data.debt)
        }
    }

    async previewAssetImpact(user: address, collateral_ctoken: address, debt_ctoken: address, deposit_amount: bigint) {
        const preview = await this.reader.previewAssetImpact(user, collateral_ctoken, debt_ctoken, deposit_amount);
        return {
            supply: preview.supply,
            borrow: preview.borrow,
            earn: preview.supply - preview.borrow
        }
    }

    async previewPositionHealth(debt_change: bigint) {
        const provider = validateProviderAsSigner(this.provider);
        const liq = await this.contract.liquidationValuesOf(provider.address as address);

        if(liq.debt + debt_change <= 0n) {
            return UINT256_MAX;
        }

        return (liq.soft * WAD) / (liq.debt + debt_change);
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
        const provider = validateProviderAsSigner(this.provider);
        if(markets.length == 0) {
            throw new Error("You can't fetch expirations for no markets.");
        }

        const marketAddresses = markets.map(market => market.address);
        const cooldownTimestamps = await reader.marketMultiCooldown(marketAddresses, provider.address as address);
        

        let cooldowns: { [address: address]: Date | null } = {};
        for(let i = 0; i < markets.length; i++) {
            const market = markets[i]!;
            const cooldownTimestamp = cooldownTimestamps[i]!;
            const cooldownLength = market.cooldownLength;

            cooldowns[market.address] = cooldownTimestamp == cooldownLength ? null : new Date(Number(cooldownTimestamp * 1000n));
        }

        return cooldowns;
    }

    static async getAll(provider: curvance_provider, reader: ProtocolReader, oracle_manager: OracleManager, all_deploy_data: { [key: string]: any }) {
        const user = "address" in provider ? provider.address : EMPTY_ADDRESS;
        const all_data = await reader.getAllMarketData(user as address);
        const deploy_keys = Object.keys(all_deploy_data);

        let markets: Market[] = [];
        for(let i = 0; i < all_data.staticMarket.length; i++) {
            const staticData  = all_data.staticMarket[i]!;
            const dynamicData = all_data.dynamicMarket[i]!;
            const userData    = all_data.userData.markets[i]!;

            const market_address = staticData.address;
            let deploy_data: DeployData | undefined;
            for(const obj_key of deploy_keys) {
                const data = all_deploy_data[obj_key]!;
                
                if(market_address == data?.address) {
                    deploy_data = {
                        name: obj_key,
                        plugins: data.plugins
                    };
                    break;
                }
            }

            if(deploy_data == undefined) {
                throw new Error(`Could not find deploy data for market: ${market_address}`);
            }

            if(staticData == undefined) {
                throw new Error(`Could not find static market data for index: ${i}`);
            }

            if(dynamicData == undefined) {
                throw new Error(`Could not find dynamic market data for index: ${i}`);
            }

            if(userData == undefined) {
                throw new Error(`Could not find user market data for index: ${i}`);
            }

            const market = new Market(provider, staticData, dynamicData, userData, deploy_data, oracle_manager, reader);
            markets.push(market);
        }

        return markets;
    }
}