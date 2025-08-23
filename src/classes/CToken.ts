import { Contract, TransactionResponse } from "ethers";
import { contractSetup, WAD_DECIMAL, SECONDS_PER_YEAR, BPS, ChangeRate, getRateSeconds } from "../helpers";
import { AdaptorTypes, DynamicMarketToken, StaticMarketToken, UserMarketToken } from "./ProtocolReader";
import { ERC20 } from "./ERC20";
import { Market } from "./Market";
import Decimal from "decimal.js";
import base_ctoken_abi from '../abis/BaseCToken.json';
import borrowable_ctoken_abi from '../abis/BorrowableCToken.json';
import irm_abi from '../abis/IDynamicIRM.json';
import { address, bytes, curvance_provider, Percentage, USD } from "../types";
import { Redstone } from "./Redstone";

export interface AccountSnapshot {
    asset: address;
    decimals: bigint;
    isCollateral: boolean;
    exchangeRate: bigint;
    collateralPosted: bigint;
    debtBalance: bigint;
}

export interface MulticallAction {
    target: address;
    isPriceUpdate: boolean;
    data: bytes;
}

export interface ICToken {
    decimals(): Promise<bigint>;
    isBorrowable(): Promise<boolean>;
    balanceOf(account: address): Promise<bigint>;
    asset(): Promise<address>;
    totalSupply(): Promise<bigint>;
    totalAssets(): Promise<bigint>;
    marketManager(): Promise<address>;
    convertToAssets(shares: bigint): Promise<bigint>;
    convertToShares(assets: bigint): Promise<bigint>;
    exchangeRate(): Promise<bigint>;
    getSnapshot(account: address): Promise<AccountSnapshot>;
    multicall(calls: MulticallAction[]): Promise<TransactionResponse>;
    deposit(assets: bigint, receiver: address): Promise<TransactionResponse>;
    depositAsCollateral(assets: bigint, receiver: address): Promise<TransactionResponse>;
    redeem(shares: bigint, receiver: address, owner: address): Promise<TransactionResponse>;
    marketCollateralPosted(): Promise<bigint>;
    collateralPosted(account: address): Promise<bigint>;
    withdrawCollateral(assets: bigint, receiver: address, owner: address): Promise<TransactionResponse>;
    redeemCollateral(shares: bigint, receiver: address, owner: address): Promise<TransactionResponse>;
    postCollateral(shares: bigint): Promise<TransactionResponse>;
    removeCollateral(shares: bigint): Promise<TransactionResponse>;
    symbol(): Promise<string>;
    name(): Promise<string>;
    maxDeposit(receiver: address): Promise<bigint>;
    transfer(receiver: address, amount: bigint): Promise<TransactionResponse>;
    approve(spender: address, amount: bigint): Promise<TransactionResponse>;
    allowance(owner: address, spender: address): Promise<bigint>;
    // More functions available
}

export interface IBorrowableCToken extends ICToken {
    borrow(amount: bigint, receiver: address): Promise<TransactionResponse>;
    repay(amount: bigint): Promise<TransactionResponse>;
    interestFee(): Promise<bigint>;
    marketOutstandingDebt(): Promise<bigint>;
    debtBalance(account: address): Promise<bigint>;
    IRM(): Promise<address>;
    // More functions available
}

export interface IDynamicIRM {
    ADJUSTMENT_RATE(): Promise<bigint>;
    linkedToken(): Promise<address>;
    borrowRate(assetsHeld: bigint, debt: bigint): Promise<bigint>;
    predictedBorrowRate(assetsHeld: bigint, debt: bigint): Promise<bigint>;
    supplyRate(assetsHeld: bigint, debt: bigint, interestFee: bigint): Promise<bigint>;
    adjustedBorrowRate(assetsHeld: bigint, debt: bigint): Promise<bigint>;
    utilizationRate(assetsHeld: bigint, debt: bigint): Promise<bigint>;
}

// BaseCToken ABI
export class CToken {
    provider: curvance_provider;
    address: address;
    contract: Contract & ICToken;
    abi: any;
    cache: StaticMarketToken & DynamicMarketToken & UserMarketToken;
    market: Market;

    constructor(
        provider: curvance_provider, 
        address: address,
        cache: StaticMarketToken & DynamicMarketToken & UserMarketToken, 
        market: Market
    ) {
        this.provider = provider;
        this.address = address;
        this.contract = contractSetup<ICToken>(provider, address, base_ctoken_abi);
        this.cache = cache;
        this.market = market;
    }

    get adapters() { return this.cache.adapters; }
    get borrowPaused() { return this.cache.borrowPaused }
    get collateralizationPaused() { return this.cache.collateralizationPaused }
    get mintPaused() { return this.cache.mintPaused }
    get marketManager() { return this.market; }
    get decimals() { return this.cache.decimals; }
    get symbol() { return this.cache.symbol; }
    get name() { return this.cache.name; }
    get remainingCollateral() { return this.cache.collateralCap - this.cache.collateral }
    get remainingDebt() { return this.cache.debtCap - this.cache.debt }
    get asset() { return this.cache.asset }
    get isBorrowable() { return this.cache.isBorrowable; }
    get canZap() { return "simpleZapper" in this.market.plugins || "vaultZapper" in this.market.plugins }
    get canLeverage() { return "simplePositionManager" in this.market.plugins || "vaultPositionManager" in this.market.plugins }

    /** @returns Collateral Ratio in BPS or bigint */
    getCollRatio(inBPS: true): Percentage;
    getCollRatio(inBPS: false): bigint;
    getCollRatio(inBPS: boolean) {
        return inBPS ? Decimal(this.cache.collRatio).div(BPS) : this.cache.collRatio;
    }

    /** @returns Soft Collateral Requirement in BPS or bigint */
    getCollReqSoft(inBPS: true): Percentage;
    getCollReqSoft(inBPS: false): bigint;
    getCollReqSoft(inBPS: boolean) {
        return inBPS ? Decimal(this.cache.collReqSoft).div(BPS) : this.cache.collReqSoft;
    }

    /** @returns Hard Collateral Requirement in BPS or bigint */
    getCollReqHard(inBPS: true): Percentage;
    getCollReqHard(inBPS: false): bigint;
    getCollReqHard(inBPS: boolean) {
        return inBPS ? Decimal(this.cache.collReqHard).div(BPS) : this.cache.collReqHard;
    }

    /** @returns Liquidation Incentive Base in BPS or bigint */
    getLiqIncBase(inBPS: true): Percentage;
    getLiqIncBase(inBPS: false): bigint;
    getLiqIncBase(inBPS: boolean) {
        return inBPS ? Decimal(this.cache.liqIncBase).div(BPS) : this.cache.liqIncBase;
    }

    /** @returns Liquidation Incentive Curve in BPS or bigint */
    getLiqIncCurve(inBPS: true): Percentage;
    getLiqIncCurve(inBPS: false): bigint;
    getLiqIncCurve(inBPS: boolean) {
        return inBPS ? Decimal(this.cache.liqIncCurve).div(BPS) : this.cache.liqIncCurve;
    }

    /** @returns Liquidation Incentive Min in BPS or bigint */
    getLiqIncMin(inBPS: true): Percentage;
    getLiqIncMin(inBPS: false): bigint;
    getLiqIncMin(inBPS: boolean) {
        return inBPS ? Decimal(this.cache.liqIncMin).div(BPS) : this.cache.liqIncMin;
    }

    /** @returns Liquidation Incentive Max in BPS or bigint */
    getLiqIncMax(inBPS: true): Percentage;
    getLiqIncMax(inBPS: false): bigint;
    getLiqIncMax(inBPS: boolean) {
        return inBPS ? Decimal(this.cache.liqIncMax).div(BPS) : this.cache.liqIncMax;
    }

    /** @returns Close Factor Base in BPS or bigint */
    getCloseFactorBase(inBPS: true): Percentage;
    getCloseFactorBase(inBPS: false): bigint;
    getCloseFactorBase(inBPS: boolean) {
        return inBPS ? Decimal(this.cache.closeFactorBase).div(BPS) : this.cache.closeFactorBase;
    }

    /** @returns Close Factor Curve in BPS or bigint */
    getCloseFactorCurve(inBPS: true): Percentage;
    getCloseFactorCurve(inBPS: false): bigint;
    getCloseFactorCurve(inBPS: boolean) {
        return inBPS ? Decimal(this.cache.closeFactorCurve).div(BPS) : this.cache.closeFactorCurve;
    }

    /** @returns Close Factor Min in BPS or bigint */
    getCloseFactorMin(inBPS: true): Percentage;
    getCloseFactorMin(inBPS: false): bigint;
    getCloseFactorMin(inBPS: boolean) { 
        return inBPS ? Decimal(this.cache.closeFactorMin).div(BPS) : this.cache.closeFactorMin;
    }

    /** @returns Close Factor Max in BPS or bigint */
    getCloseFactorMax(inBPS: true): Percentage;
    getCloseFactorMax(inBPS: false): bigint;
    getCloseFactorMax(inBPS: boolean) { 
        return inBPS ? Decimal(this.cache.closeFactorMax).div(BPS)  : this.cache.closeFactorMax;
    }

    /** @returns User assets in USD or token */
    getUserShareBalance(inUSD: true): USD;
    getUserShareBalance(inUSD: false): bigint;
    getUserShareBalance(inUSD: boolean): USD | bigint { 
        return inUSD ? this.convertTokensToUsd(this.cache.userShareBalance, true) : this.cache.userShareBalance;
    }

    /** @returns User assets in USD or token */
    getUserAssetBalance(inUSD: true): USD;
    getUserAssetBalance(inUSD: false): bigint;
    getUserAssetBalance(inUSD: boolean): USD | bigint {
        return inUSD ? this.convertTokensToUsd(this.cache.userAssetBalance) : this.cache.userAssetBalance;
    }
    
    /** @returns Token Collateral Cap in USD or token */
    getCollateralCap(inUSD: true): USD;
    getCollateralCap(inUSD: false): bigint;
    getCollateralCap(inUSD: boolean): USD | bigint {
        return inUSD ? this.convertTokensToUsd(this.cache.collateralCap) : this.cache.collateralCap;
    }

    /** @returns Token Debt Cap in USD or token */
    getDebtCap(inUSD: true): USD;
    getDebtCap(inUSD: false): bigint;
    getDebtCap(inUSD: boolean): USD | bigint { 
        return inUSD ? this.convertTokensToUsd(this.cache.debtCap) : this.cache.debtCap;
    }

    /** @returns Token Collateral in USD or token*/
    getCollateral(inUSD: true): USD;
    getCollateral(inUSD: false): bigint;
    getCollateral(inUSD: boolean): USD | bigint { 
        return inUSD ? this.convertTokensToUsd(this.cache.collateral) : this.cache.collateral;
    }

    /** @returns Token Debt in USD or token */
    getDebt(inUSD: true): USD;
    getDebt(inUSD: false): bigint;
    getDebt(inUSD: boolean): USD | bigint {
        return inUSD ? this.convertTokensToUsd(this.cache.debt) : this.cache.debt;
    }

    /** @returns User Collateral in USD or token */
    getUserCollateral(inUSD: true): USD;
    getUserCollateral(inUSD: false): bigint;
    getUserCollateral(inUSD: boolean): USD | bigint {
        return inUSD ? this.convertTokensToUsd(this.cache.userCollateral) : this.cache.userCollateral;
    }

    /** @returns User Debt in USD or token */
    getUserDebt(inUSD: true): USD;
    getUserDebt(inUSD: false): bigint;
    getUserDebt(inUSD: boolean): USD | bigint {
        return inUSD ? this.convertTokensToUsd(this.cache.userDebt) : this.cache.userDebt;
    }

    earnChange(amount: USD, rateType: ChangeRate) {
        const rate = this.getApy();
        const rate_seconds = getRateSeconds(rateType);
        const rate_percent = rate.mul(rate_seconds);
        return amount.mul(rate_percent);
    }

    /**
     * Grabs the collateralization ratio and converts it to a Percentage.
     * @returns Percentage representation of the LTV (e.g. 0.75 for 75% LTV)
     */
    ltv() {
        return Decimal(this.cache.collRatio).div(BPS) as Percentage; 
    }
    
    getAsset(asErc20: true): ERC20;
    getAsset(asErc20: false): address;
    getAsset(asErc20: boolean) { 
        return asErc20 ? new ERC20(this.provider, this.cache.asset.address, this.cache.asset) : this.cache.asset.address 
    }
    
    getPrice(asset = false, lower = false) { 
        let price = asset ? this.cache.assetPrice : this.cache.sharePrice;
        if(lower) {
            price = asset ? this.cache.assetPriceLower : this.cache.sharePriceLower;
        }

        // Use 1e18 always against USD
        return Decimal(price).div(Decimal(1e18));
    }

    getApy() {
        // TODO: add underlying yield rate
        return Decimal(this.cache.supplyRate).div(BPS);
    }
    
    getTvl(inUSD: true): USD;
    getTvl(inUSD: false): bigint;
    getTvl(inUSD = true): USD | bigint {
        const tvl = this.cache.totalSupply;
        return inUSD ? this.convertTokensToUsd(tvl) : tvl;
    }

    async fetchTvl(inUSD: true): Promise<USD>;
    async fetchTvl(inUSD: false): Promise<bigint>;
    async fetchTvl(inUSD = true): Promise<USD | bigint> {
        const tvl = await this.totalSupply();
        return inUSD ? this.fetchConvertTokensToUsd(tvl) : tvl;
    }

    getTotalCollateral(inUSD: true): USD;
    getTotalCollateral(inUSD: false): bigint;
    getTotalCollateral(inUSD = true): USD | bigint {
        const totalCollateral = this.cache.collateral;
        return inUSD ? this.convertTokensToUsd(totalCollateral) : totalCollateral;
    }

    async fetchTotalCollateral(inUSD: true): Promise<USD>;
    async fetchTotalCollateral(inUSD: false): Promise<bigint>;
    async fetchTotalCollateral(inUSD = true): Promise<USD | bigint> {
        const totalCollateral = await this.contract.marketCollateralPosted();
        return inUSD ? this.fetchConvertTokensToUsd(totalCollateral) : totalCollateral;
    }

    async fetchDecimals() {
        const decimals = await this.contract.decimals();
        this.cache.decimals = decimals;
        return decimals;
    }

    async fetchIsBorrowable() {
        const canBorrow = await this.contract.isBorrowable();
        this.cache.isBorrowable = canBorrow;
        return canBorrow;
    }

    async fetchAsset() {
        const asset = await this.contract.asset();
        this.cache.asset.address = asset;
        return asset;
    }

    async fetchMarketManagerAddr() {
        return this.contract.marketManager();
    }

    async fetchSymbol() {
        const symbol = await this.contract.symbol();
        this.cache.symbol = symbol;
        return symbol;
    }

    async fetchName() {
        const name = await this.contract.name();
        this.cache.name = name;
        return name;
    }

    async fetchPrice(asset = false, getLower = false, inUSD = true) {
        const priceForAddress = asset ? this.asset.address : this.address;
        const price = await this.market.oracle_manager.getPrice(priceForAddress, inUSD, getLower);

        if(getLower) {
            this.cache.sharePriceLower = price;
        } else {
            this.cache.sharePrice = price;
        }
        return price;
    }

    async totalSupply() {
        return this.contract.totalSupply(); 
    }

    async totalAssets() { 
        return this.contract.totalAssets(); 
    }

    async exchangeRate() { 
        return this.contract.exchangeRate(); 
    }

    async marketCollateralPosted() { 
        return this.contract.marketCollateralPosted(); 
    }

    async balanceOf(account: address) { 
        return this.contract.balanceOf(account); 
    }

    async maxDeposit(receiver: address) {
        return this.contract.maxDeposit(receiver);
    }

    async transfer(receiver: address, amount: bigint) {
        return this.contract.transfer(receiver, amount);
    }

    async redeemCollateral(shares: bigint, receiver: address, owner: address) {
        return this.oracleRoute(
            "redeemCollateral",
            [shares, receiver, owner]
        );
    }

    async postCollateral(shares: bigint) { 
        return this.oracleRoute(
            "postCollateral",
            [shares]
        );
    }

    async removeCollateral(shares: bigint) {
        return this.oracleRoute(
            "removeCollateral",
            [shares]
        );
    }

    async withdrawCollateral(assets: bigint, receiver: address, owner: address) {
        return this.oracleRoute(
            "withdrawCollateral",
            [assets, receiver, owner]
        );
    }

    async convertToAssets(shares: bigint) { 
        return this.contract.convertToAssets(shares); 
    }

    async convertToShares(assets: bigint) {
        return this.contract.convertToShares(assets);
    }

    async deposit(assets: bigint, receiver: address) {
        return this.oracleRoute(
            "deposit",
            [assets, receiver]
        );
    }

    async depositAsCollateral(assets: bigint, receiver: address) {
        const collateralCapError = "There is not enough collateral left in this tokens collateral cap for this deposit.";
        if(this.remainingCollateral == 0n) throw new Error(collateralCapError);
        if(this.remainingCollateral > 0n) {
            const shares = await this.convertToShares(assets);
            if(shares > this.remainingCollateral) {
                throw new Error(collateralCapError);
            }
        }
        
        return this.oracleRoute(
            "depositAsCollateral",
            [assets, receiver]
        );
    }

    async redeem(shares: bigint, receiver: address, owner: address) {
        return this.oracleRoute(
            "redeem",
            [shares, receiver, owner]
        );
    }

    async collateralPosted(account: address) { 
        return this.contract.collateralPosted(account); 
    }

    async multicall(calls: MulticallAction[]) { 
        return this.contract.multicall(calls); 
    }

    async getSnapshot(account: address) {
        const snapshot = await this.contract.getSnapshot(account);
        return {
            asset: snapshot.asset,
            decimals: BigInt(snapshot.decimals),
            isCollateral: snapshot.isCollateral,
            exchangeRate: BigInt(snapshot.exchangeRate),
            collateralPosted: BigInt(snapshot.collateralPosted),
            debtBalance: BigInt(snapshot.debtBalance)
        }
    }

    async fetchConvertTokensToUsd(tokenAmount: bigint, asset = true) {
        // Reload cache
        await this.fetchPrice(asset);
        await this.fetchDecimals();
        
        return this.convertTokensToUsd(tokenAmount, asset);
    }

    convertTokensToUsd(tokenAmount: bigint, asset = true) {
        const tokenAmountDecimal = Decimal(tokenAmount).div(WAD_DECIMAL);
        return this.getPrice(asset).mul(tokenAmountDecimal);
    }

    buildMultiCall(functionName: string, exec_params: any[]) {
        const encodedFunc = this.contract.interface.encodeFunctionData(functionName, exec_params);
        return {
            target: this.address,
            isPriceUpdate: false,
            data: encodedFunc
        } as MulticallAction;
    }

    async oracleRoute<T extends keyof (ICToken & IBorrowableCToken)>(
        functionName: T,
        exec_params: Parameters<(ICToken & IBorrowableCToken)[T]>
    ): Promise<TransactionResponse> {
        const adapter_enums = this.adapters.map(num => Number(num));

        if(adapter_enums.includes(AdaptorTypes.REDSTONE_CORE)) {
            const price_update = await Redstone.buildMulticallStruct(this);
            const token_action = await this.buildMultiCall(functionName as string, exec_params);
            return this.multicall([price_update, token_action]);
        }

        return (this.contract[functionName] as Function)(...exec_params);
    }
}

// BorrowableCToken
export class BorrowableCToken extends CToken {
    override contract: Contract & IBorrowableCToken;
    
    constructor(
        provider: curvance_provider, 
        address: address,
        cache: StaticMarketToken & DynamicMarketToken & UserMarketToken,
        market: Market
    ) {
        super(provider, address, cache, market);
        this.contract = contractSetup<IBorrowableCToken>(provider, address, borrowable_ctoken_abi);
    }
    
    get liquidity() { return this.cache.liquidity; }
    get borrowRate() { return this.cache.borrowRate; }
    get predictedBorrowRate() { return this.cache.predictedBorrowRate; }
    get utilizationRate() { return this.cache.utilizationRate; }
    get supplyRate() { return this.cache.supplyRate; }

    borrowChange(amount: USD, rateType: ChangeRate) {
        const rate = this.borrowRate;
        const rate_seconds = getRateSeconds(rateType);
        const rate_percent = Decimal(rate * rate_seconds).div(BPS);
        return amount.mul(rate_percent);
    }

    override async depositAsCollateral(assets: bigint, receiver: address) {
        if(this.cache.userDebt > 0) {
            throw new Error("Cannot deposit as collateral when there is outstanding debt");
        }

        return this.oracleRoute(
            "depositAsCollateral",
            [assets, receiver]
        );
    }

    override async postCollateral(shares: bigint) {
        if(this.cache.userDebt > 0) {
            throw new Error("Cannot post collateral when there is outstanding debt");
        }

        return this.oracleRoute(
            "postCollateral",
            [shares]
        );
    }

    async fetchDebt(inUSD: true): Promise<USD>;
    async fetchDebt(inUSD: false): Promise<bigint>;
    async fetchDebt(inUSD = true): Promise<USD | bigint> {
        const totalDebt = await this.contract.marketOutstandingDebt();
        return inUSD ? this.fetchConvertTokensToUsd(totalDebt) : totalDebt;
    }

    async borrow(amount: bigint, receiver: address) {
        return this.oracleRoute(
            "borrow",
            [amount, receiver]
        );
    }

    async dynamicIRM() {
        const irm_addr = await this.contract.IRM();
        return contractSetup<IDynamicIRM>(this.provider, irm_addr, irm_abi);
    }

    async fetchBorrowRate() {
        const irm = await this.dynamicIRM();
        const assetsHeld = await this.totalAssets();
        const debt = await this.contract.marketOutstandingDebt();
        const borrowRate = (await irm.borrowRate(assetsHeld, debt)) * SECONDS_PER_YEAR;
        this.cache.borrowRate = borrowRate;
        return borrowRate;
    }

    async fetchPredictedBorrowRate() {
        const irm = await this.dynamicIRM();
        const assetsHeld = await this.totalAssets();
        const debt = await this.contract.marketOutstandingDebt();
        const predictedBorrowRate = (await irm.predictedBorrowRate(assetsHeld, debt)) * SECONDS_PER_YEAR;
        this.cache.predictedBorrowRate = predictedBorrowRate;
        return predictedBorrowRate;
    }

    async fetchUtilizationRate() {
        const irm = await this.dynamicIRM();
        const assetsHeld = await this.totalAssets();
        const debt = await this.contract.marketOutstandingDebt();
        const utilizationRate = (await irm.utilizationRate(assetsHeld, debt)) * SECONDS_PER_YEAR;
        this.cache.utilizationRate = utilizationRate;
        return utilizationRate;
    }

    async fetchSupplyRate() {
        const irm = await this.dynamicIRM();
        const assetsHeld = await this.totalAssets();
        const debt = await this.contract.marketOutstandingDebt();
        const fee = await this.contract.interestFee();
        const supplyRate = (await irm.supplyRate(assetsHeld, debt, fee)) * SECONDS_PER_YEAR;
        this.cache.supplyRate = supplyRate;
        return supplyRate;
    }

    async fetchLiquidity() {
        const assetsHeld = await this.contract.totalAssets();
        const debt = await this.contract.marketOutstandingDebt();
        const liquidity = assetsHeld - debt;
        this.cache.liquidity = liquidity;
        return liquidity;
    }

    async repay(amount: bigint) {
        return this.oracleRoute(
            "repay",
            [amount]
        );
    }

    async interestFee() {
        return this.contract.interestFee();
    }

    async marketOutstandingDebt() {
        return this.contract.marketOutstandingDebt();
    }

    async debtBalance(account: address) {
        return this.contract.debtBalance(account);
    }
}