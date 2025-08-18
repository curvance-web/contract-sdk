import { Contract, TransactionResponse } from "ethers";
import { contractSetup, WAD_DECIMAL, SECONDS_PER_YEAR, BPS, toDecimal } from "../helpers";
import { AdaptorTypes, DynamicMarketToken, StaticMarketToken, UserMarketToken } from "./ProtocolReader";
import { ERC20 } from "./ERC20";
import { Market } from "./Market";
import Decimal from "decimal.js";
import base_ctoken_abi from '../abis/BaseCToken.json';
import borrowable_ctoken_abi from '../abis/BorrowableCToken.json';
import irm_abi from '../abis/IDynamicIRM.json';
import { address, bytes, curvance_provider, percentage } from "../types";
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
    get collateralCap() { return toDecimal(this.cache.collateralCap, 18n) }
    get debtCap() { return toDecimal(this.cache.debtCap, 18n) }
    get marketManager() { return this.market; }
    get decimals() { return this.cache.decimals; }
    get symbol() { return this.cache.symbol; }
    get name() { return this.cache.name; }
    get collateral() { return toDecimal(this.cache.collateral, 18n) }
    get debt() { return toDecimal(this.cache.debt, 18n) }
    get remainingCollateral() { return this.cache.collateralCap - this.cache.collateral }
    get remainingDebt() { return this.cache.debtCap - this.cache.debt }
    get collRatio() { return this.cache.collRatio }
    get collReqSoft() { return this.cache.collReqSoft }
    get collReqHard() { return this.cache.collReqHard }
    get liqIncBase() { return this.cache.liqIncBase }
    get liqIncCurve() { return this.cache.liqIncCurve }
    get liqIncMin() { return this.cache.liqIncMin }
    get liqIncMax() { return this.cache.liqIncMax }
    get closeFactorBase() { return this.cache.closeFactorBase }
    get closeFactorCurve() { return this.cache.closeFactorCurve }
    get closeFactorMin() { return this.cache.closeFactorMin }
    get closeFactorMax() { return this.cache.closeFactorMax; }
    get userShareBalance() { return this.cache.userShareBalance; }
    get userAssetBalance() { return this.cache.userAssetBalance; }
    get userDebt() { return this.cache.userDebt; }
    get userCollateral() { return this.cache.userCollateral; }
    get asset() { return this.cache.asset }
    get isBorrowable() { return this.cache.isBorrowable; }


    /**
     * Grabs the collateralization ratio and converts it to a percentage.
     * @returns percentage representation of the LTV (e.g. 0.75 for 75% LTV)
     */
    ltv() {
        return Decimal(this.cache.collRatio).div(BPS) as percentage; 
    }
    
    getAsset(asErc20 = true) { 
        return asErc20 ? new ERC20(this.provider, this.cache.asset.address, this.cache.asset) : this.cache.asset.address 
    }
    
    getPrice(lower = false, asset = false) { 
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
    
    getTvl(inUSD: true): Decimal;
    getTvl(inUSD: false): bigint;
    getTvl(inUSD = true): Decimal | bigint {
        const tvl = this.cache.totalSupply;
        return inUSD ? this.convertTokensToUsd(tvl) : tvl;
    }

    async fetchTvl(inUSD: true): Promise<Decimal>;
    async fetchTvl(inUSD: false): Promise<bigint>;
    async fetchTvl(inUSD = true): Promise<Decimal | bigint> {
        const tvl = await this.totalSupply();
        return inUSD ? this.fetchConvertTokensToUsd(tvl) : tvl;
    }

    getTotalCollateral(inUSD: true): Decimal;
    getTotalCollateral(inUSD: false): bigint;
    getTotalCollateral(inUSD = true): Decimal | bigint {
        const totalCollateral = this.cache.collateral;
        return inUSD ? this.convertTokensToUsd(totalCollateral) : totalCollateral;
    }

    async fetchTotalCollateral(inUSD: true): Promise<Decimal>;
    async fetchTotalCollateral(inUSD: false): Promise<bigint>;
    async fetchTotalCollateral(inUSD = true): Promise<Decimal | bigint> {
        const totalCollateral = await this.contract.marketCollateralPosted();
        return inUSD ? this.fetchConvertTokensToUsd(totalCollateral) : totalCollateral;
    }

    async fetchDecimals() {
        const decimals = await this.contract.decimals();
        this.cache.asset.decimals = decimals;
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
        this.cache.asset.symbol = symbol;
        return symbol;
    }

    async fetchName() {
        const name = await this.contract.name();
        this.cache.name = name;
        return name;
    }

    async fetchPrice(getLower = false, inUSD = true) {
        const price = await this.market.oracle_manager.getPrice(this.address, inUSD, getLower);

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

    async fetchConvertTokensToUsd(tokenAmount: bigint) {
        const price = await this.fetchPrice();
        const decimals = await this.fetchDecimals();
        return (price * tokenAmount) / (10n ** decimals);
    }

    convertTokensToUsd(tokenAmount: bigint) {
        const tokenAmountDecimal = Decimal(tokenAmount).div(WAD_DECIMAL);
        return this.getPrice().mul(tokenAmountDecimal);
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

    getTotalDebt(inUSD: true): Decimal;
    getTotalDebt(inUSD: false): bigint;
    getTotalDebt(inUSD = true): Decimal | bigint {
        const totalDebt = this.cache.debt;
        return inUSD ? this.convertTokensToUsd(totalDebt) : totalDebt;
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

    async fetchTotalDebt(inUSD: true): Promise<Decimal>;
    async fetchTotalDebt(inUSD: false): Promise<bigint>;
    async fetchTotalDebt(inUSD = true): Promise<Decimal | bigint> {
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