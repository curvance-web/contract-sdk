import { Contract, TransactionResponse } from "ethers";
import { address, curvance_provider, Percentage, TokenInput, USD, USD_WAD } from "../types";
import { CToken, ICToken } from "./CToken";
import { DynamicMarketToken, StaticMarketToken, UserMarketToken } from "./ProtocolReader";
import { Market } from "./Market";
import { BPS, ChangeRate, contractSetup, getRateSeconds, validateProviderAsSigner, WAD } from "../helpers";
import borrowable_ctoken_abi from '../abis/BorrowableCToken.json';
import irm_abi from '../abis/IDynamicIRM.json';
import Decimal from "decimal.js";
import { ZapperTypes } from "./Zapper";

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

    get liquidationPrice(): USD {
        const coll_usd = this.cache.sharePrice * (this.market.cache.user.collateral / this.cache.collReqSoft);
        
        if(coll_usd == 0n || this.market.cache.user.debt == 0n) {
            return Decimal(0);
        }

        return Decimal(coll_usd / this.market.cache.user.debt).div(WAD);
    }
    
    getLiquidity(inUSD: true): USD;
    getLiquidity(inUSD: false): USD_WAD;
    getLiquidity(inUSD: boolean): USD | USD_WAD {
        return inUSD ? this.convertTokensToUsd(this.cache.liquidity) : this.cache.liquidity;
    }

    getBorrowRate(inPercentage: true): Percentage;
    getBorrowRate(inPercentage: false): bigint;
    getBorrowRate(inPercentage: boolean) { 
        return inPercentage ? Decimal(this.cache.borrowRate).div(BPS) : this.cache.borrowRate;
    }

    getPredictedBorrowRate(inPercentage: true): Percentage;
    getPredictedBorrowRate(inPercentage: false): bigint;
    getPredictedBorrowRate(inPercentage: boolean) { 
        return inPercentage ? Decimal(this.cache.predictedBorrowRate).div(BPS) : this.cache.predictedBorrowRate;
    }
    
    getUtilizationRate(inPercentage: true): Percentage;
    getUtilizationRate(inPercentage: false): bigint;
    getUtilizationRate(inPercentage: boolean) {
        return inPercentage ? Decimal(this.cache.utilizationRate).div(WAD) : this.cache.utilizationRate;
    }

    getSupplyRate(inPercentage: true): Percentage;
    getSupplyRate(inPercentage: false): bigint;
    getSupplyRate(inPercentage: boolean) {
        return inPercentage ? Decimal(this.cache.supplyRate).div(BPS) : this.cache.supplyRate;
    }

    borrowChange(amount: USD, rateType: ChangeRate) {
        const rate = this.getBorrowRate(false);
        const rate_seconds = getRateSeconds(rateType);
        const rate_percent = Decimal(rate).mul(rate_seconds).div(BPS);

        return amount.mul(rate_percent).div(WAD);
    }

    override async depositAsCollateral(amount: TokenInput, zap: ZapperTypes = 'none',  receiver: address | null = null) {
        if(this.cache.userDebt > 0) {
            throw new Error("Cannot deposit as collateral when there is outstanding debt");
        }
        return super.depositAsCollateral(amount, zap, receiver);
    }

    override async postCollateral(amount: TokenInput) {
        if(this.cache.userDebt > 0) {
            throw new Error("Cannot post collateral when there is outstanding debt");
        }
        return super.postCollateral(amount);
    }

    async fetchDebt(inUSD: true): Promise<USD>;
    async fetchDebt(inUSD: false): Promise<bigint>;
    async fetchDebt(inUSD = true): Promise<USD | bigint> {
        const totalDebt = await this.contract.marketOutstandingDebt();
        return inUSD ? this.fetchConvertTokensToUsd(totalDebt) : totalDebt;
    }

    async borrow(amount: TokenInput, receiver: address | null = null) {
        const signer = validateProviderAsSigner(this.provider);
        if(receiver == null) receiver = signer.address as address;
        const assets = this.convertTokenInput(amount);

        const calldata = this.getCallData("borrow", [ assets, receiver ]);
        return this.oracleRoute(calldata);
    }

    async dynamicIRM() {
        const irm_addr = await this.contract.IRM();
        return contractSetup<IDynamicIRM>(this.provider, irm_addr, irm_abi);
    }

    async fetchBorrowRate() {
        const irm = await this.dynamicIRM();
        const assetsHeld = await this.totalAssets();
        const debt = await this.contract.marketOutstandingDebt();
        const borrowRate = (await irm.borrowRate(assetsHeld, debt));
        this.cache.borrowRate = borrowRate;
        return borrowRate;
    }

    async fetchPredictedBorrowRate() {
        const irm = await this.dynamicIRM();
        const assetsHeld = await this.totalAssets();
        const debt = await this.contract.marketOutstandingDebt();
        const predictedBorrowRate = (await irm.predictedBorrowRate(assetsHeld, debt));
        this.cache.predictedBorrowRate = predictedBorrowRate;
        return predictedBorrowRate;
    }

    async fetchUtilizationRate() {
        const irm = await this.dynamicIRM();
        const assetsHeld = await this.totalAssets();
        const debt = await this.contract.marketOutstandingDebt();
        const utilizationRate = (await irm.utilizationRate(assetsHeld, debt));
        this.cache.utilizationRate = utilizationRate;
        return utilizationRate;
    }

    async fetchSupplyRate() {
        const irm = await this.dynamicIRM();
        const assetsHeld = await this.totalAssets();
        const debt = await this.contract.marketOutstandingDebt();
        const fee = await this.contract.interestFee();
        const supplyRate = (await irm.supplyRate(assetsHeld, debt, fee));
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

    async repay(amount: TokenInput) {
        const assets = this.convertTokenInput(amount);
        const calldata = this.getCallData("repay", [ assets ]);
        return this.oracleRoute(calldata);
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