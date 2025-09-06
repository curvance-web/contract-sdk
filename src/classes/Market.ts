import { BPS, ChangeRate, contractSetup, EMPTY_ADDRESS, getRateSeconds, toBigInt, toDecimal, UINT256_MAX, validateProviderAsSigner, WAD, WAD_DECIMAL } from "../helpers";
import { Contract } from "ethers";
import { DynamicMarketData, ProtocolReader, StaticMarketData, UserMarket } from "./ProtocolReader";
import { CToken } from "./CToken";
import abi from '../abis/MarketManagerIsolated.json';
import { Decimal } from "decimal.js";
import { address, curvance_provider, Percentage, TokenInput, USD, USD_WAD } from "../types";
import { OracleManager } from "./OracleManager";
import { setup_config } from "../setup";
import { BorrowableCToken } from "./BorrowableCToken";

export type MarketToken = CToken | BorrowableCToken;
export type PluginTypes = 'zapper' | 'positionManager';

export interface Plugins {
    simplePositionManager?: address;
    vaultPositionManager?: address;
    nativeVaultPositionManager?: address;
}

export interface Zappers {
    simpleZapper?: address;
    vaultZapper?: address;
    nativeVaultZapper?: address;
}

export interface StatusOf {
    collateral: bigint;
    maxDebt: bigint;
    debt: bigint;
}

export interface DeployData {
    name: string,
    plugins: { [key: string]: address }
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

    /** @returns {string} - The name of the market at deployment. */
    get name() { return this.cache.deploy.name; }
    /** @returns {Plugins} - The address of the market's plugins by deploy name. */
    get plugins():Plugins { return this.cache.deploy.plugins ?? {}; }
    /** @returns {bigint} - The length of the cooldown period in seconds. */
    get cooldownLength() { return this.cache.static.cooldownLength; }
    /** @returns {bigint[]} - A list of oracle identifiers which can be mapped to AdaptorTypes enum */
    get adapters() { return this.cache.static.adapters; }
    /** @returns {Date | null} - Market cooldown, activated by Collateralization or Borrowing. Lasts as long as {this.cooldownLength} which is currently 20mins */
    get cooldown() { return this.cache.user.cooldown == this.cooldownLength ? null : new Date(Number(this.cache.user.cooldown * 1000n)); }
    /** @returns {Decimal} - The user's collateral in Shares. */
    get userCollateral() { return toDecimal(this.cache.user.collateral, 18n); }
    /** @returns {USD} - The user's debt in USD. */
    get userDebt() { return toDecimal(this.cache.user.debt, 18n); }
    /** @returns {USD} - The user's maximum debt in USD. */
    get userMaxDebt() { return toDecimal(this.cache.user.maxDebt, 18n); }
    /** @returns {USD} - The user's remaining credit in USD or in the token amount */
    get userRemainingCredit(): USD {
        const remaining = this.cache.user.maxDebt - this.cache.user.debt;
        return toDecimal(remaining, 18n);
    }

    /**
     * Get the user's position health.
     * @returns {USD | null} - The user's position health Percentage or null if infinity
     */
    get positionHealth() { 
        return this.cache.user.positionHealth == UINT256_MAX ? null : Decimal(this.cache.user.positionHealth).div(WAD_DECIMAL);
    }

    /**
     * Get the total user deposits in USD.
     * @returns {USD} - The total user deposits in USD.
     */
    get userDeposits() {
        let total_deposits = Decimal(0);
        for(const token of this.tokens) {
            total_deposits = total_deposits.add(token.getUserAssetBalance(true));
        }

        return total_deposits;
    }

    /**
     * Get the user's net position in USD.
     * @returns {USD} - The user's net position in USD.
     */
    get userNet() {
        return this.userDeposits.sub(this.userDebt);
    }
    
    /** @returns Market LTV */
    // TODO: This is probably wrong
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

    /** @returns Total market deposits */
    get tvl() {
        let marketTvl = new Decimal(0);
        for(const token of this.tokens) {
            marketTvl = marketTvl.add(token.getTvl(true));
        }
        return marketTvl;
    }

    /** @returns Total market debt */
    get totalDebt() {
        let marketDebt = new Decimal(0);
        for(const token of this.tokens) {
            if(token.isBorrowable) {
                marketDebt = marketDebt.add(token.getDebt(true));
            }
        }
        return marketDebt;
    }

    /** @returns Total market collateral */
    get totalCollateral() {
        let marketCollateral = new Decimal(0);
        for(const token of this.tokens) {
            marketCollateral = marketCollateral.add(token.getTotalCollateral(true));
        }
        return marketCollateral;
    }

    /**
     * Returns what tokens eligible and ineligible to borrow from
     * @returns What tokens can and cannot be borrowed from
     */
    getBorrowableCTokens() {
        const result: {
            eligible: BorrowableCToken[],
            ineligible: BorrowableCToken[]
        } = {
            eligible: [],
            ineligible: []
        };

        const users_market_collateral = this.userCollateral;

        for(const token of this.tokens) {
            if(token.isBorrowable) {
                if(token.getUserCollateral(false).greaterThan(0) || users_market_collateral.lessThanOrEqualTo(0)) {
                    result.ineligible.push(token as BorrowableCToken);
                } else {
                    result.eligible.push(token as BorrowableCToken);
                }
            }
        }

        return result;
    }

    /**
     * Get the total user deposits change based on the provided rate.
     * @param rate - What rate to calculate the change for (ex: 'day')
     * @returns The total user deposits change (ex: 50, which would be $50/day)
     */
    getUserDepositsChange(rate: ChangeRate) {
        let total_change = Decimal(0);
        for(const token of this.tokens) {
            const amount = token.getUserAssetBalance(true);
            total_change = total_change.add(token.earnChange(amount, rate)); 
        }

        return total_change;
    }


    /**
     * Get the total user debt change based on the provided rate.
     * @param rate - What rate to calculate the change for (ex: 'day')
     * @returns The total user debt change (ex: 50, which would be $50/day)
     */
    getUserDebtChange(rate: ChangeRate) {
        let total_change = Decimal(0);
        for(const token of this.tokens) {
            if(!token.isBorrowable) {
                continue;
            }

            const amount = token.getUserDebt(true);
            total_change = total_change.add((token as BorrowableCToken).borrowChange(amount, rate)); 
        }

        return total_change;
    }

    /**
     * Get the total user net change based on the provided rate.
     * @param rate - What rate to calculate the change for (ex: 'day')
     * @returns The total user net change (ex: 50, which would be $50/day)
     */
    getUserNetChange(rate: ChangeRate) {
        const earn = this.getUserDepositsChange(rate);
        const debt = this.getUserDebtChange(rate);
        return earn.sub(debt);
    }

    /**
     * Searchs through all tokens and finds highest APY
     * @returns The highest APY among all tokens
     */
    highestApy(): Percentage {
        let maxApy = new Decimal(0);
        for(const token of this.tokens) {
            const tokenApy = token.getApy();
            if(tokenApy.greaterThan(maxApy)) {
                maxApy = tokenApy;
            }
        }
        return maxApy;
    }

    /**
     * Does this market have the ability to borrow
     * @returns True if borrowing is allowed, false otherwise
     */
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

    /**
     * Gets the market status of
     * @param account - Wallet address
     * @returns collateral, max debt, debt for the market
     */
    async statusOf(account: address) {
        const data = await this.contract.statusOf(account);
        return {
            collateral: BigInt(data.collateral),
            maxDebt: BigInt(data.maxDebt),
            debt: BigInt(data.debt)
        }
    }

    async reloadMarketData() {
        const dynamic_data = await this.reader.getDynamicMarketData();
        this.cache.dynamic = dynamic_data.find(m => m.address == this.address)!;

        for(const token of this.tokens) {
            const new_cache = this.cache.dynamic.tokens.find(t => t.address == token.address)!;
            token.cache = {...token.cache, ...new_cache};
        }
    }

    async reloadUserData(account: address) {
        const data = (await this.reader.getUserData(account))
            .markets.find(market => market.address == this.address)!;

        this.cache.user = data;

        for(const token of this.tokens) {
            const new_cache = data.tokens.find(t => t.address == token.address)!;
            token.cache = {...token.cache, ...new_cache};
        }
    }

    /**
     * Preview the impact of the user descision for their deposit/borrow/leverage
     * @param user - Wallet address
     * @param collateral_ctoken - The collateral token
     * @param debt_ctoken - The debt token
     * @param deposit_amount - The colalteral amount
     * @param borrow_amount - The debt amount
     * @returns Supply, borrow & earn rates
     */
    async previewAssetImpact(user: address, collateral_ctoken: CToken, debt_ctoken: BorrowableCToken, deposit_amount: TokenInput, borrow_amount: TokenInput, rate_change: ChangeRate) {
        const amount_in = toBigInt(deposit_amount.toNumber(), collateral_ctoken.asset.decimals);
        const amount_out = toBigInt(borrow_amount.toNumber(), debt_ctoken.asset.decimals);
        
        const { supply, borrow } = await this.reader.previewAssetImpact(user, collateral_ctoken.address, debt_ctoken.address, amount_in, amount_out);
        const supply_percent = Decimal(supply * getRateSeconds(rate_change)).div(WAD);
        const borrow_percent = Decimal(borrow * getRateSeconds(rate_change)).div(WAD);

        const supply_change = debt_ctoken.convertTokensToUsd(amount_in).mul(supply_percent);
        const borrow_change = collateral_ctoken.convertTokensToUsd(amount_out).mul(borrow_percent);

        // TODO: Take in account the users current market position into this calculation
        return {
            supply: {
                percent: supply_percent,
                change: supply_change
            },
            borrow: {
                percent: borrow_percent,
                change: borrow_change
            },
            earn: {
                percent: supply_change.sub(borrow_change),
                change: supply_change.sub(borrow_change)
            }
        }
    }

    /**
     * Grabs the new position health when doing a deposit
     * @param ctoken - Token you are expecting to deposit on
     * @param amount - Amount of assets being deposited
     * @returns The new position health
     */
    async previewPositionHealthDeposit(ctoken: CToken, amount: TokenInput) {
        const provider = validateProviderAsSigner(this.provider);
        const user = provider.address as address;
        const data = await this.reader.getPositionHealth(
            this.address, 
            user, 
            ctoken.address, 
            EMPTY_ADDRESS, 
            true, 
            toBigInt(amount, ctoken.decimals), 
            false, 
            0n, 
            0n
        );
        
        if(data.errorCodeHit) {
            throw new Error(`Error code hit when calculating position health preview. This usually means price is stale so we couldn't get a valid health value.`);
        }

        return data.positionHealth == UINT256_MAX ? null : Decimal(data.positionHealth).div(WAD);
    }

    /**
     * Grabs the new position health when doing a borrow
     * @param token - Token you are expecting to borrow on
     * @param amount - Amount of assets being borrowed
     * @returns The new position health
     */
    async previewPositionHealthBorrow(token: BorrowableCToken, amount: TokenInput) {
        const provider = validateProviderAsSigner(this.provider);
        const user = provider.address as address;
        const data = await this.reader.getPositionHealth(
            this.address, 
            user, 
            EMPTY_ADDRESS, 
            token.address, 
            false, 
            0n, 
            false, 
            toBigInt(amount, token.decimals), 
            0n
        );
        
        if(data.errorCodeHit) {
            throw new Error(`Error code hit when calculating position health preview. This usually means price is stale so we couldn't get a valid health value.`);
        }

        console.log(data);

        return data.positionHealth == UINT256_MAX ? null : Decimal(data.positionHealth).div(WAD);
    }

    /**
     * Grabs the new liquidity values based on changes
     * @param account - The user's account address
     * @param cTokenModified - The ctoken you are modifiying
     * @param redemptionShares - Shares being redeemed
     * @param borrowAssets - Amount of assets being borrowed
     * @returns An object containing the hypothetical liquidity values
     */
    async hypotheticalLiquidityOf(account: address, cTokenModified: address, redemptionShares: bigint, borrowAssets: bigint) {
        const data = await this.contract.hypotheticalLiquidityOf(account, cTokenModified, redemptionShares, borrowAssets);
        return {
            collateralSurplus: BigInt(data.collateralSurplus),
            liquidityDeficit: BigInt(data.liquidityDeficit),
            positionsToClose: data.positionsToClose
        }
    }

    /**
     * Fetch the expiration date of a user's cooldown period
     * @param account - The user's account address
     * @param fetch - Whether to fetch the cooldown length from the contract
     * @returns The expiration date of the cooldown period or null if not in cooldown
     */
    async expiresAt(account: address, fetch = false) {
        const cooldownTimestamp = await this.contract.accountAssets(account);
        const cooldownLength = fetch || this.cooldownLength == 0n ? await this.contract.MIN_HOLD_PERIOD() : this.cooldownLength;
        const unlockTime = cooldownTimestamp + cooldownLength;
        return unlockTime == cooldownLength ? null : new Date(Number(unlockTime * 1000n));
    }

    /**
     * Fetch multiple market cooldown expirations
     * @param markets - Markets you want to search
     * @returns An object mapping market addresses to their cooldown expiration dates OR null if its not in cooldown
     */
    async multiHoldExpiresAt(markets: Market[]) {
        const provider = validateProviderAsSigner(this.provider);
        if(markets.length == 0) {
            throw new Error("You can't fetch expirations for no markets.");
        }

        const marketAddresses = markets.map(market => market.address);
        const cooldownTimestamps = await this.reader.marketMultiCooldown(marketAddresses, provider.address as address);

        let cooldowns: { [address: address]: Date | null } = {};
        for(let i = 0; i < markets.length; i++) {
            const market = markets[i]!;
            const cooldownTimestamp = cooldownTimestamps[i]!;
            const cooldownLength = market.cooldownLength;

            cooldowns[market.address] = cooldownTimestamp == cooldownLength ? null : new Date(Number(cooldownTimestamp * 1000n));
        }

        return cooldowns;
    }

    /**
     * Grab all the markets available and set them up using the protocol reader efficient RPC calls / API cached calls
     * @param reader  - instace of the ProtocolReader class
     * @param oracle_manager - instance of the OracleManager class
     * @param provider - The RPC provider
     * @returns An array of Market instances setup with protocol reader data
     */
    static async getAll(reader: ProtocolReader, oracle_manager: OracleManager, provider: curvance_provider = setup_config.provider) {
        const user = "address" in provider ? provider.address : EMPTY_ADDRESS;
        const all_data = await reader.getAllMarketData(user as address);
        const deploy_keys = Object.keys(setup_config.contracts.markets) as (keyof typeof setup_config.contracts.markets)[];

        let markets: Market[] = [];
        for(let i = 0; i < all_data.staticMarket.length; i++) {
            const staticData  = all_data.staticMarket[i]!;
            const dynamicData = all_data.dynamicMarket[i]!;
            const userData    = all_data.userData.markets[i]!;

            const market_address = staticData.address;
            let deploy_data: DeployData | undefined;
            for(const obj_key of deploy_keys) {
                const data = setup_config.contracts.markets[obj_key]!;
                
                if(typeof data != 'object') {
                    continue;
                }

                if(market_address == data.address) {
                    deploy_data = {
                        name: obj_key,
                        plugins: 'plugins' in data ? data.plugins as { [key: string]: address } : {}
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