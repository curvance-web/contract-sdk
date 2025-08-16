import { Contract } from "ethers";
import { contractSetup } from "../helpers";
import abi from '../abis/ProtocolReader.json'
import { address, curvance_signer } from "../types";

export interface StaticMarketAsset {
    address: address;
    name: string;
    symbol: string;
    decimals: bigint;
    totalSupply: bigint;
}

export interface StaticMarketToken {
    address: address;
    asset: StaticMarketAsset;
    name: string;
    symbol: string;
    decimals: bigint;
    adapters: [bigint, bigint];
    isBorrowable: boolean;
    borrowPaused: boolean;
    collateralizationPaused: boolean;
    mintPaused: boolean;
    collateralCap: bigint;
    debtCap: bigint;
    isListed: boolean;
    collRatio: bigint;
    collReqSoft: bigint;
    collReqHard: bigint;
    liqIncBase: bigint;
    liqIncCurve: bigint;
    liqIncMin: bigint;
    liqIncMax: bigint;
    closeFactorBase: bigint;
    closeFactorCurve: bigint;
    closeFactorMin: bigint;
    closeFactorMax: bigint;
}

export interface StaticMarketData {
    address: address;
    adapters: bigint[];
    cooldownLength: bigint;
    tokens: StaticMarketToken[];
}

export interface DynamicMarketToken {
    address: address;
    tvl: bigint;
    collateral: bigint;
    debt: bigint;
    sharePrice: bigint;
    assetPrice: bigint;
    sharePriceLower: bigint;
    assetPriceLower: bigint;
    borrowRate: bigint;
    predictedBorrowRate: bigint;
    utilizationRate: bigint;
    supplyRate: bigint;
    liquidity: bigint;
}

export interface DynamicMarketData {
    address: address;
    tokens: DynamicMarketToken[];
}

export interface UserMarketToken {
    address: address;
    assetAmount: bigint;
    shareAmount: bigint;
    collateral: bigint;
    debt: bigint;
}

export interface UserMarket {
    address: address;
    collateral: bigint;
    maxDebt: bigint;
    debt: bigint;
    positionHealth: bigint;
    cooldown: bigint;
    tokens: UserMarketToken[]
}

export interface UserLock {
    lockIndex: bigint;
    amount: bigint;
    unlockTime: bigint;
}

export interface UserData {
    locks: UserLock[];
    markets: UserMarket[];
}

export interface IProtocolReader {
    getUserData(account: address): Promise<UserData>;
    getDynamicMarketData(): Promise<DynamicMarketData[]>;
    getStaticMarketData(): Promise<StaticMarketData[]>;
    marketMultiCooldown(markets: address[], account: address): Promise<bigint[]>;
    hypotheticalMaxLeverage(account: address, borrowableCToken: address, cToken: address, assets: bigint): { maxDebtBorrowable: bigint, isOffset: boolean }
}

export class ProtocolReader {
    signer: curvance_signer;
    address: address;
    contract: Contract & IProtocolReader;

    constructor(signer: curvance_signer, address: address) {
        this.signer = signer;
        this.address = address;
        this.contract = contractSetup<IProtocolReader>(signer, address, abi);
    }

    async getAllMarketData(account: address, use_api = true) {
        const all = await Promise.all([
            this.getStaticMarketData(use_api),
            this.getDynamicMarketData(use_api),
            this.getUserData(account)
        ])

        return {
            staticMarket : all[0],
            dynamicMarket: all[1],
            userData     : all[2]
        }
    }
    
    async getDynamicMarketData(use_api = true) {
        // TODO: Implement API call
        const data = await this.contract.getDynamicMarketData();
        const typedData: DynamicMarketData[] = data.map((market: any) => ({
            address: market._address,
            tokens: market.tokens.map((token: any) => ({
                address: token._address,
                tvl: BigInt(token.tvl),
                collateral: BigInt(token.collateral),
                debt: BigInt(token.debt),
                sharePrice: BigInt(token.sharePrice),
                assetPrice: BigInt(token.assetPrice),
                sharePriceLower: BigInt(token.sharePriceLower),
                assetPriceLower: BigInt(token.assetPriceLower),
                borrowRate: BigInt(token.borrowRate),
                predictedBorrowRate: BigInt(token.predictedBorrowRate),
                utilizationRate: BigInt(token.utilizationRate),
                supplyRate: BigInt(token.supplyRate),
                liquidity: BigInt(token.liquidity)
            }))
        }));

        return typedData;

    }

    async getUserData(account: address) {
        const data = await this.contract.getUserData(account);
        
        const typedData: UserData = {
            locks: data.locks.map((lock: any) => ({
                lockIndex: BigInt(lock.lockIndex),
                amount: BigInt(lock.amount),
                unlockTime: BigInt(lock.unlockTime)
            })),
            markets: data.markets.map((market: any) => ({
                address: market._address,
                collateral: BigInt(market.collateral),
                maxDebt: BigInt(market.maxDebt),
                debt: BigInt(market.debt),
                positionHealth: BigInt(market.positionHealth),
                cooldown: BigInt(market.cooldown),
                tokens: market.tokens.map((token: any) => ({
                    address: token._address,
                    assetAmount: BigInt(token.assetAmount),
                    shareAmount: BigInt(token.shareAmount),
                    collateral: BigInt(token.collateral),
                    debt: BigInt(token.debt)
                }))
            }))
        };

        return typedData;
    }

    async getAllDynamicState(use_api = true) {
        // TODO: Implement API call
    }

    async hypotheticalMaxLeverage(account: address, borrowableCToken: address, cToken: address, assets: bigint) {
        const data = await this.contract.hypotheticalMaxLeverage(account, borrowableCToken, cToken, assets);
        return {
            maxDebtBorrowable: BigInt(data.maxDebtBorrowable),
            isOffset: data.isOffset
        };
    }

    async marketMultiCooldown(markets: address[], account: address) {
        return await this.contract.marketMultiCooldown(markets, account);
    }

    async getStaticMarketData(use_api = true) {
        // TODO: Implement API call
        const data = await this.contract.getStaticMarketData();

        const typedData: StaticMarketData[] = data.map((market: any) => ({
            address: market._address,
            adapters: market.adapters,
            cooldownLength: market.cooldownLength,
            tokens: market.tokens.map((token: any) => ({
                address: token._address,
                name: token.name,
                symbol: token.symbol,
                decimals: BigInt(token.decimals),
                asset: {
                    address: token.asset._address,
                    name: token.asset.name,
                    symbol: token.asset.symbol,
                    decimals: BigInt(token.asset.decimals),
                    totalSupply: BigInt(token.asset.totalSupply)
                },
                adapters: [BigInt(token.adapters[0]), BigInt(token.adapters[1])],
                isBorrowable: token.isBorrowable,
                borrowPaused: token.borrowPaused,
                collateralizationPaused: token.collateralizationPaused,
                mintPaused: token.mintPaused,
                collateralCap: BigInt(token.collateralCap),
                debtCap: BigInt(token.debtCap),
                isListed: token.isListed,
                collRatio: BigInt(token.collRatio),
                collReqSoft: BigInt(token.collReqSoft),
                collReqHard: BigInt(token.collReqHard),
                liqIncBase: BigInt(token.liqIncBase),
                liqIncCurve: BigInt(token.liqIncCurve),
                liqIncMin: BigInt(token.liqIncMin),
                liqIncMax: BigInt(token.liqIncMax),
                closeFactorBase: BigInt(token.closeFactorBase),
                closeFactorCurve: BigInt(token.closeFactorCurve),
                closeFactorMin: BigInt(token.closeFactorMin),
                closeFactorMax: BigInt(token.closeFactorMax)
            }))
        }));
        return typedData;
    }
}