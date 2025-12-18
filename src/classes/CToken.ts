import { Contract, TransactionResponse } from "ethers";
import { contractSetup, BPS, ChangeRate, getRateSeconds, validateProviderAsSigner, WAD, getChainConfig, toBigInt, EMPTY_ADDRESS, toDecimal, SECONDS_PER_YEAR, toBps, NATIVE_ADDRESS, UINT256_MAX } from "../helpers";
import { AdaptorTypes, DynamicMarketToken, StaticMarketToken, UserMarketToken } from "./ProtocolReader";
import { ERC20 } from "./ERC20";
import { Market, PluginTypes } from "./Market";
import { Calldata } from "./Calldata";
import Decimal from "decimal.js";
import base_ctoken_abi from '../abis/BaseCToken.json';
import { address, bytes, curvance_provider, Percentage, TokenInput, USD, USD_WAD } from "../types";
import { Redstone } from "./Redstone";
import { Zapper, ZapperTypes, zapperTypeToName } from "./Zapper";
import { chain_config, setup_config } from "../setup";
import { PositionManager, PositionManagerTypes } from "./PositionManager";
import { BorrowableCToken } from "./BorrowableCToken";
import { NativeToken } from "./NativeToken";

export interface AccountSnapshot {
    asset: address;
    decimals: bigint;
    isCollateral: boolean;
    collateralPosted: bigint;
    debtBalance: bigint;
}

export interface MulticallAction {
    target: address;
    isPriceUpdate: boolean;
    data: bytes;
}

export interface ZapToken {
    interface: NativeToken | ERC20;
    type: ZapperTypes;
    quote?: (tokenIn: string, tokenOut: string, amount: TokenInput, slippage: bigint) => Promise<{
        out: TokenInput,
        min_out: TokenInput
    }>;
}

export type ZapperInstructions =  'none' | 'native-vault' | 'vault' | 'native-simple' | {
    type: ZapperTypes;
    inputToken: address;
    slippage: bigint;
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
    redeemCollateral(shares: bigint, receiver: address, owner: address): Promise<TransactionResponse>;
    postCollateral(shares: bigint): Promise<TransactionResponse>;
    removeCollateral(shares: bigint): Promise<TransactionResponse>;
    symbol(): Promise<string>;
    name(): Promise<string>;
    maxDeposit(receiver: address): Promise<bigint>;
    transfer(receiver: address, amount: bigint): Promise<TransactionResponse>;
    approve(spender: address, amount: bigint): Promise<TransactionResponse>;
    allowance(owner: address, spender: address): Promise<bigint>;
    isDelegate(user: address, delegate: address): Promise<boolean>;
    setDelegateApproval(delegate: address, approved: boolean): Promise<TransactionResponse>;
    // More functions available
}

export class CToken extends Calldata<ICToken> {
    provider: curvance_provider;
    address: address;
    contract: Contract & ICToken;
    abi: any;
    cache: StaticMarketToken & DynamicMarketToken & UserMarketToken;
    market: Market;
    zapTypes: ZapperTypes[] = [];
    leverageTypes: string[] = [];

    constructor(
        provider: curvance_provider,
        address: address,
        cache: StaticMarketToken & DynamicMarketToken & UserMarketToken,
        market: Market
    ) {
        super();
        this.provider = provider;
        this.address = address;
        this.contract = contractSetup<ICToken>(provider, address, base_ctoken_abi);
        this.cache = cache;
        this.market = market;

        const chain_config = getChainConfig();
        const isNativeVault = chain_config.native_vaults.some(vault => vault.contract == this.asset.address);
        // const isVault = chain_config.vaults.some(vault => vault.contract == this.asset.address);
        const isWrappedNative = chain_config.wrapped_native == this.asset.address;

        if(isNativeVault) this.zapTypes.push('native-vault');
        if("nativeVaultPositionManager" in this.market.plugins && isNativeVault) this.leverageTypes.push('native-vault');
        if(isWrappedNative) this.zapTypes.push('native-simple');
        
        // if(isVault) this.zapTypes.push('vault');
        // if("vaultPositionManager" in this.market.plugins && isVault) this.leverageTypes.push('vault');

        // if("simplePositionManager" in this.market.plugins) this.leverageTypes.push('simple');
        // this.zapTypes.push('simple');
    }

    get adapters() { return this.cache.adapters; }
    get borrowPaused() { return this.cache.borrowPaused }
    get collateralizationPaused() { return this.cache.collateralizationPaused }
    get mintPaused() { return this.cache.mintPaused }
    get marketManager() { return this.market; }
    get decimals() { return this.cache.decimals; }
    get symbol() { return this.cache.symbol; }
    get name() { return this.cache.name; }
    get asset() { return this.cache.asset }
    get isBorrowable() { return this.cache.isBorrowable; }
    get exchangeRate() { return this.cache.exchangeRate; }
    get canZap() { return this.zapTypes.length > 0; }
    get maxLeverage() { return Decimal(this.cache.maxLeverage / BPS); }
    get canLeverage() { return this.leverageTypes.length > 0; }
    get liquidationPrice(): USD | null {
        if (this.cache.liquidationPrice == UINT256_MAX) return null;
        return toDecimal(this.cache.liquidationPrice, 18n); 
    }

    getLeverage() {
        if(this.getUserCollateral(true).equals(0)) {
            return null;
        }
        
        const leverage = this.getUserCollateral(true).div(this.getUserCollateral(true).sub(this.market.userDebt));
        return leverage.eq(1) ? null : leverage;
    }

    /** @returns Remaining Collateral cap */
    getRemainingCollateral(formatted: true): USD;
    getRemainingCollateral(formatted: false): bigint;
    getRemainingCollateral(formatted: boolean = true): USD | bigint {
        const diff = this.cache.collateralCap - this.cache.collateral;
        return formatted ? this.convertTokensToUsd(diff) as USD : diff as bigint;
    }

    /** @returns Remaining Debt cap */
    getRemainingDebt(formatted: true): USD;
    getRemainingDebt(formatted: false): bigint;
    getRemainingDebt(formatted:boolean = true): USD | bigint {
        const diff = this.cache.debtCap - this.cache.debt;
        return formatted ? this.convertTokensToUsd(diff) as USD : diff as bigint;
    }

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

    /** @returns Close Factor Max in Percentage or bigint */
    getCloseFactorMax(inBPS: true): Percentage;
    getCloseFactorMax(inBPS: false): bigint;
    getCloseFactorMax(inBPS: boolean) {
        return inBPS ? Decimal(this.cache.closeFactorMax).div(BPS)  : this.cache.closeFactorMax;
    }

    /** @returns User shares in USD (native balance amount) or token */
    getUserShareBalance(inUSD: true): USD;
    getUserShareBalance(inUSD: false): TokenInput;
    getUserShareBalance(inUSD: boolean): USD | TokenInput {
        return inUSD ? this.convertTokensToUsd(this.cache.userShareBalance, false) : toDecimal(this.cache.userShareBalance, this.decimals);
    }

    /** @returns User assets in USD (this is the raw balance that the token exchanges too) or token */
    getUserAssetBalance(inUSD: true): USD;
    getUserAssetBalance(inUSD: false): TokenInput;
    getUserAssetBalance(inUSD: boolean): USD | TokenInput {
        return inUSD ? this.convertTokensToUsd(this.cache.userAssetBalance) : toDecimal(this.cache.userAssetBalance, this.asset.decimals);
    }

    /** @returns User underlying assets in USD or token */
    getUserUnderlyingBalance(inUSD: true): USD;
    getUserUnderlyingBalance(inUSD: false): TokenInput;
    getUserUnderlyingBalance(inUSD: boolean): USD | TokenInput {
        return inUSD ? this.convertTokensToUsd(this.cache.userUnderlyingBalance) : toDecimal(this.cache.userUnderlyingBalance, this.decimals);
    }

    /** @returns Token Collateral Cap in USD or USD WAD */
    getCollateralCap(inUSD: true): USD;
    getCollateralCap(inUSD: false): USD_WAD;
    getCollateralCap(inUSD: boolean): USD | USD_WAD {
        return inUSD ? this.convertTokensToUsd(this.cache.collateralCap) : this.cache.collateralCap;
    }

    /** @returns Token Debt Cap in USD or USD WAD */
    getDebtCap(inUSD: true): USD;
    getDebtCap(inUSD: false): bigint;
    getDebtCap(inUSD: boolean): USD | bigint {
        return inUSD ? this.convertTokensToUsd(this.cache.debtCap) : this.cache.debtCap;
    }

    /** @returns Token Collateral in USD or USD WAD*/
    getCollateral(inUSD: true): USD;
    getCollateral(inUSD: false): USD_WAD;
    getCollateral(inUSD: boolean): USD | USD_WAD {
        return inUSD ? this.convertTokensToUsd(this.cache.collateral) : this.cache.collateral;
    }

    /** @returns Token Debt in USD or USD WAD */
    getDebt(inUSD: true): USD;
    getDebt(inUSD: false): USD_WAD;
    getDebt(inUSD: boolean): USD | USD_WAD {
        return inUSD ? this.convertTokensToUsd(this.cache.debt) : this.cache.debt;
    }

    /** @returns User Collateral in USD or asset token amount */
    getUserCollateral(inUSD: true): USD;
    getUserCollateral(inUSD: false): TokenInput;
    getUserCollateral(inUSD: boolean): USD | TokenInput {
        return inUSD ? this.convertTokensToUsd(this.cache.userCollateral, false) : this.convertBigInt(this.cache.userCollateral, true);
    }

    fetchUserCollateral(): Promise<bigint>;
    fetchUserCollateral(formatted: true): Promise<TokenInput>;
    fetchUserCollateral(formatted: false): Promise<bigint>;
    async fetchUserCollateral(formatted: boolean = false): Promise<bigint | TokenInput> {
        const signer = validateProviderAsSigner(this.provider);
        const collateral = await this.contract.collateralPosted(signer.address as address);
        this.cache.userCollateral = collateral;

        return formatted ? toDecimal(collateral, this.decimals) : collateral;
    }

    /** @returns User Debt in USD or Tokens owed */
    getUserDebt(inUSD: true): USD;
    getUserDebt(inUSD: false): bigint;
    getUserDebt(inUSD: boolean): USD | bigint {
        return inUSD ? this.convertTokensToUsd(this.cache.userDebt) : this.cache.userDebt;
    }

    earnChange(amount: USD, rateType: ChangeRate) {
        const rate = this.getApy(false);
        const rate_seconds = getRateSeconds(rateType);
        const rate_percent = Decimal(rate * rate_seconds).div(WAD);
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

    getPrice(): USD;
    getPrice(asset: boolean): USD;
    getPrice(asset: boolean, lower: boolean): USD;
    getPrice(asset: boolean, lower: boolean, formatted: true): USD;
    getPrice(asset: boolean, lower: boolean, formatted: false): USD_WAD;
    getPrice(asset: boolean = false, lower: boolean = false, formatted = true): USD | USD_WAD {
        let price = asset ? this.cache.assetPrice : this.cache.sharePrice;
        if(lower) {
            price = asset ? this.cache.assetPriceLower : this.cache.sharePriceLower;
        }

        return formatted ? Decimal(price).div(WAD) as USD : price as USD_WAD;
    }

    getApy(): Percentage;
    getApy(asPercentage: false): bigint;
    getApy(asPercentage: true): Percentage
    getApy(asPercentage = true): Percentage | bigint {
        // TODO: add underlying yield rate
        return asPercentage ? Decimal(this.cache.supplyRate).div(WAD).mul(SECONDS_PER_YEAR) : this.cache.supplyRate;
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
        this.cache.totalSupply = tvl;
        return inUSD ? this.getTvl(true) : this.getTvl(false);
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

    getPositionManager(type: PositionManagerTypes) {
        const signer = validateProviderAsSigner(this.provider);

        let manager_contract = this.getPluginAddress(type, 'positionManager');

        if(manager_contract == null) {
            throw new Error("Plugin does not have an associated contract");
        }

        return new PositionManager(manager_contract, signer, type);
    }

    getZapper(type: ZapperTypes) {
        const signer = validateProviderAsSigner(this.provider);
        const zap_contract = this.getPluginAddress(type, 'zapper');

        if(zap_contract == null) {
            return null;
        }

        return new Zapper(zap_contract, signer, type);
    }

    async isZapAssetApproved(instructions: ZapperInstructions, amount: bigint) {
        if(instructions == 'none' || typeof instructions != 'object') {
            return true;
        }
        
        const signer = validateProviderAsSigner(this.provider);
        const asset =  new ERC20(signer, instructions.inputToken);
        const plugin = this.getPluginAddress(instructions.type, 'zapper');

        const allowance = await asset.allowance(signer.address as address, plugin!);
        const isApproved = allowance >= amount;

        if(!isApproved) {
            const symbol = await asset.fetchSymbol();
            throw new Error(`Plugin needs to be approved for the asset: ${symbol}`);
        }

        return isApproved;
    }

    async approveZapAsset(instructions: ZapperInstructions, amount: TokenInput | null) {
        if(instructions == 'none' || typeof instructions != 'object') {
            throw new Error("Plugin does not have an associated contract");
        }
        const signer = validateProviderAsSigner(this.provider);
        const asset =  new ERC20(signer, instructions.inputToken);
        const plugin = this.getPluginAddress(instructions.type, 'zapper');

        return asset.approve(plugin!, amount);
    }

    async isPluginApproved(plugin: ZapperTypes | PositionManagerTypes, type: PluginTypes) {
        if(plugin == 'none') {
            return true;
        }

        const signer = validateProviderAsSigner(this.provider);
        const plugin_address = this.getPluginAddress(plugin, type);

        if(plugin_address == null) {
            throw new Error("Plugin does not have an associated contract");
        }

        return this.contract.isDelegate(signer.address as address, plugin_address);
    }

    async approvePlugin(plugin: ZapperTypes | PositionManagerTypes, type: PluginTypes) {
        const plugin_address = this.getPluginAddress(plugin, type);

        if(plugin_address == null) {
            throw new Error("Plugin does not have an associated contract");
        }

        return this.contract.setDelegateApproval(plugin_address, true);
    }

    getPluginAddress(plugin: ZapperTypes | PositionManagerTypes, type: PluginTypes): address | null {
        switch(type) {
            case 'zapper': {
                if(plugin == 'none') return null;
                if(!zapperTypeToName.has(plugin)) {
                    throw new Error("Plugin does not have a contract to map too");
                }

                const plugin_name = zapperTypeToName.get(plugin);
                if(!plugin_name || !setup_config.contracts.zappers || !(plugin_name in setup_config.contracts.zappers)) {
                    throw new Error(`Plugin ${plugin_name} not found in zappers`);
                }

                return setup_config.contracts.zappers[plugin_name] as address;
            }

            case 'positionManager': {
                switch(plugin) {
                    case 'vault': return this.market.plugins.vaultPositionManager as address;
                    case 'native-vault': return this.market.plugins.nativeVaultPositionManager as address;
                    case 'simple': return this.market.plugins.simplePositionManager as address;
                    default: throw new Error("Unknown position manager type");
                }
            }

            default: throw new Error("Unsupported plugin type");
        }
    }

    async getAllowance(check_contract: address, underlying = true) {
        const signer = validateProviderAsSigner(this.provider);
        const erc20 = new ERC20(this.provider, underlying ? this.asset.address : this.address);
        const allowance = await erc20.allowance(signer.address as address, check_contract);
        return allowance;
    }

    /**
     * Approves the underlying asset to be used with the ctoken contract.
     * @param amount - if null it will approve the max uint256, otherwise the amount specified
     * @returns tx
     */
    async approveUnderlying(amount: TokenInput | null = null, target: address | null = null) {
        const erc20 = new ERC20(this.provider, this.asset.address);
        const tx = await erc20.approve(target ? target : this.address, amount);
        return tx;
    }

    async approve(amount: TokenInput | null = null, spender: address) {
        const erc20 = new ERC20(this.provider, this.address);
        const tx = await erc20.approve(spender, amount);
        return tx;
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

    async getExchangeRate() {
        const rate = await this.contract.exchangeRate();
        this.cache.exchangeRate = rate;
        return rate;
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

    async transfer(receiver: address, amount: TokenInput) {
        const shares = this.convertTokenInput(amount, true, true);
        return this.contract.transfer(receiver, shares);
    }

    async redeemCollateral(amount: Decimal, receiver: address | null = null, owner: address | null = null) {
        const signer = validateProviderAsSigner(this.provider);
        if(receiver == null) receiver = signer.address as address;
        if(owner == null) owner = signer.address as address;

        const shares = this.convertTokenInput(amount, true, true);
        const calldata = this.getCallData("redeemCollateral", [shares, receiver, owner]);
        return this.oracleRoute(calldata);
    }

    async postCollateral(amount: TokenInput) {
        const signer = validateProviderAsSigner(this.provider);
        const shares = this.convertTokenInput(amount, true, true);
        const balance = await this.balanceOf(signer.address as address);
        const collateral = await this.fetchUserCollateral();
        const available_shares = balance - collateral;
        const max_shares = available_shares < shares ? available_shares : shares;

        const calldata = this.getCallData("postCollateral", [max_shares]);
        const tx = this.oracleRoute(calldata);

        // Reload collateral state after execution
        await this.fetchUserCollateral();

        return tx;
    }

    getZapBalance(zap: ZapperInstructions): Promise<bigint> {
        const signer = validateProviderAsSigner(this.provider);
        let asset: ERC20 | NativeToken;

        if(typeof zap === 'object') {
            if(zap.type === 'native-vault' || zap.type === 'native-simple') {
                asset = new NativeToken(setup_config.chain, this.provider); 
            } else {
                asset = new ERC20(this.provider, zap.inputToken);
            }
        } else {
            switch (zap) {
                case 'none': asset = this.getAsset(true); break;
                case 'native-vault': asset = new NativeToken(setup_config.chain, this.provider); break;
                case 'native-simple': asset = new NativeToken(setup_config.chain, this.provider); break;
                default: throw new Error("Unsupported zap type for balance fetch");
            }
        }
        
        return asset.balanceOf(signer.address as address, false);
    }

    // TODO: Hack to remove
    async ensureUnderlyingAmount(amount: TokenInput, zap: ZapperInstructions) : Promise<TokenInput> {
        const balance = await this.getZapBalance(zap);

        if(this.convertTokenInput(amount) > balance) {
            console.warn('[WARNING] Detected higher deposit amount then underlying balance, changing to the underlying balance. Diff: ', {
                raw: this.convertTokenInput(amount) - balance, 
                formatted: this.convertBigInt(this.convertTokenInput(amount) - balance)
            });
            return this.convertBigInt(balance);
        }
        
        return amount;
    }

    async removeCollateral(amount: TokenInput) {
        const shares = this.convertTokenInput(amount, true, true);
        const current_shares = await this.fetchUserCollateral();
        const max_shares = current_shares < shares ? current_shares : shares;

        const calldata = this.getCallData("removeCollateral", [max_shares]);
        const tx = this.oracleRoute(calldata);

        // Reload collateral state after execution
        await this.fetchUserCollateral();

        return tx;
    }

    async convertToAssets(shares: bigint) {
        return this.contract.convertToAssets(shares);
    }

    async convertToShares(assets: bigint) {
        return this.contract.convertToShares(assets);
    }

    async maxRedemption(): Promise<TokenInput>;
    async maxRedemption(in_shares: true): Promise<bigint>;
    async maxRedemption(in_shares: false): Promise<TokenInput>;
    async maxRedemption(in_shares: boolean = false): Promise<TokenInput | bigint> {
        const signer = validateProviderAsSigner(this.provider);
        const data = await this.market.reader.maxRedemptionOf(signer.address as address, this);

        if(data.errorCodeHit) {
            throw new Error(`Error fetching max redemption. Possible stale price or other issues...`);
        }

        const all_shares = data.maxCollateralizedShares + data.maxUncollateralizedShares;

        if(in_shares) return all_shares;

        const all_assets = await this.convertToAssets(all_shares);
        return this.convertBigInt(all_assets, true) as TokenInput;
    }

    convertBigInt(amount: bigint, inShares = false, use_exchange_rate = false) {
        const decimals = inShares ? this.decimals : this.asset.decimals;
        const raw_amount = use_exchange_rate ? (amount * this.exchangeRate) / WAD : amount;
        return toDecimal(raw_amount, decimals);
    }

    convertTokenInput(amount: TokenInput, inShares = false, use_exchange_rate = false) {
        const decimals = inShares ? this.decimals : this.asset.decimals;
        const newAmount = toBigInt(amount, decimals);

        return use_exchange_rate ? (newAmount * this.exchangeRate) / WAD : newAmount;
    }

    /** @returns A list of tokens mapped to their respective zap options */
    async getDepositTokens(search: string | null = null) {
        let tokens: ZapToken[] = [{
            interface: this.getAsset(true),
            type: 'none'
        }];
        let tokens_exclude = [this.asset.address.toLocaleLowerCase()];

        if(this.zapTypes.includes('native-vault')) {
            tokens.push({
                interface: new NativeToken(setup_config.chain, this.provider),
                type: 'native-vault'
            });
            tokens_exclude.push(EMPTY_ADDRESS);
            tokens_exclude.push(NATIVE_ADDRESS);
        }

        if(this.zapTypes.includes('native-simple')) {
            tokens.push({
                interface: new NativeToken(setup_config.chain, this.provider),
                type: 'native-simple'
            });

            if(!this.zapTypes.includes('native-vault')) {
                tokens_exclude.push(EMPTY_ADDRESS);
                tokens_exclude.push(NATIVE_ADDRESS);
            }
        }

        if(this.zapTypes.includes('simple')) {
            let dexAggSearch = await chain_config[setup_config.chain].dexAgg.getAvailableTokens(this.provider, search);
            tokens = tokens.concat(dexAggSearch.filter(token => !tokens_exclude.includes(token.interface.address.toLocaleLowerCase())));
        }

        return tokens;
    }

    async hypotheticalRedemptionOf(amount: TokenInput) {
        const signer = validateProviderAsSigner(this.provider);
        const shares = this.convertTokenInput(amount, true, true);
        return this.market.reader.hypotheticalRedemptionOf(
            signer.address as address,
            this,
            shares
        )
    }

    previewLeverageUp(newLeverage: Decimal, borrow: BorrowableCToken) {
        if(this.getLeverage() == null || this.getLeverage() != null && newLeverage.lte(this.getLeverage() as Decimal)) {
            throw new Error("New leverage must be more than current leverage");
        }

        const collateralAvail = this.cache.userCollateral;
        const collateralInUsd = this.convertTokensToUsd(collateralAvail, false);
        const newPosition = collateralInUsd.mul(newLeverage);
        const newDebt = newPosition.sub(this.market.userDebt).sub(collateralInUsd);
        const borrowPrice = borrow.getPrice(true);
        const borrowAmount = newDebt.div(borrowPrice);
        return { borrowAmount, newDebt, newPosition };
    }

    previewLeverageDown(newLeverage: Decimal, currentLeverage: Decimal) {
        if(newLeverage.gte(currentLeverage)) {
            throw new Error("New leverage must be less than current leverage");
        }

        const leverageDiff = Decimal(1).sub(newLeverage.div(currentLeverage));
        const collateralAvail = this.cache.userCollateral;
        const collateralAssetsAvail = collateralAvail * this.exchangeRate / WAD;
        const collateralAssetReduction = BigInt(leverageDiff.mul(collateralAssetsAvail).toFixed(0));

        return { collateralAssetReduction, leverageDiff };
    }

    async leverageUp(
        borrow: BorrowableCToken,
        newLeverage: Decimal,
        type: PositionManagerTypes,
        slippage_: TokenInput = Decimal(0.05)
    ) {
        const signer = validateProviderAsSigner(this.provider);
        const slippage = toBps(slippage_);
        const manager = this.getPositionManager(type);

        let calldata: bytes;
        const { borrowAmount } = this.previewLeverageUp(newLeverage, borrow);

        switch(type) {
            case 'simple': {
                const { action, quote } = await chain_config[setup_config.chain].dexAgg.quoteAction(
                    signer.address as address,
                    borrow.asset.address,
                    this.asset.address,
                    borrow.convertTokenInput(borrowAmount, false),
                    slippage
                );

                calldata = manager.getLeverageCalldata(
                    {
                        borrowableCToken: borrow.address,
                        borrowAssets    : borrow.convertTokenInput(borrowAmount),
                        cToken          : this.address,
                        expectedShares  : BigInt(quote.min_out),
                        swapAction      : action,
                        auxData         : "0x",
                    },
                    slippage * WAD);
                break;
            }

            case 'native-vault': {
                calldata = manager.getLeverageCalldata(
                    {
                        borrowableCToken: borrow.address,
                        borrowAssets    : borrow.convertTokenInput(borrowAmount),
                        cToken          : this.address,
                        expectedShares  : borrow.convertTokenInput(borrowAmount),
                        swapAction      : PositionManager.emptySwapAction(),
                        auxData         : "0x",
                    },
                    slippage * WAD);
                break;
            }

            default: throw new Error("Unsupported position manager type");
        }

        await this._checkPositionManagerApproval(manager);
        return this.oracleRoute(calldata, {
            to: manager.address
        });
    }

    async leverageDown(
        borrowToken: BorrowableCToken,
        currentLeverage: Decimal,
        newLeverage: Decimal,
        type: PositionManagerTypes,
        slippage_: Percentage = Decimal(0.05)
    ) {
        if(newLeverage.gte(currentLeverage)) {
            throw new Error("New leverage must be less than current leverage");
        }

        const config = getChainConfig();
        const signer = validateProviderAsSigner(this.provider);
        const slippage = toBps(slippage_);
        const manager = this.getPositionManager(type);
        let calldata: bytes;

        const { collateralAssetReduction, leverageDiff } = this.previewLeverageDown(newLeverage, currentLeverage);

        switch(type) {
            case 'simple': {
                const { action, quote } = await config.dexAgg.quoteAction(
                    signer.address,
                    this.asset.address,
                    borrowToken.asset.address,
                    collateralAssetReduction,
                    slippage
                );
                const minRepay = leverageDiff.equals(1) ? 0 : quote.min_out;

                calldata = manager.getDeleverageCalldata({
                    cToken: this.address,
                    collateralAssets: collateralAssetReduction,
                    borrowableCToken: borrowToken.address,
                    repayAssets: BigInt(minRepay),
                    swapActions: [ action ],
                    auxData: "0x",
                }, slippage * WAD);

                break;
            }

            default: throw new Error("Unsupported position manager type");
        }


        await this._checkPositionManagerApproval(manager);
        return this.oracleRoute(calldata, {
            to: manager.address
        });
    }

    async depositAndLeverage(
        depositAmount: TokenInput,
        borrow: BorrowableCToken,
        borrowAmount: TokenInput,
        type: PositionManagerTypes,
        slippage_: TokenInput = Decimal(0.5)
    ) {
        depositAmount = await this.ensureUnderlyingAmount(depositAmount, 'none');
        const signer = validateProviderAsSigner(this.provider);
        const slippage = toBps(slippage_);
        const manager = this.getPositionManager(type);

        let calldata: bytes;

        switch(type) {
            case 'simple':
                const { action, quote } = await chain_config[setup_config.chain].dexAgg.quoteAction(
                    signer.address as address,
                    borrow.asset.address,
                    this.asset.address,
                    borrow.convertTokenInput(borrowAmount),
                    slippage
                );
                
                calldata = manager.getDepositAndLeverageCalldata(
                    this.convertTokenInput(depositAmount),
                    {
                        borrowableCToken: borrow.address,
                        borrowAssets: borrow.convertTokenInput(borrowAmount),
                        cToken: this.address,
                        expectedShares: BigInt(quote.min_out),
                        swapAction: action,
                        auxData: "0x",
                    },
                    slippage * WAD);
                break;
                
            case 'native-vault': {
                calldata = manager.getDepositAndLeverageCalldata(
                    this.convertTokenInput(depositAmount),
                    {
                        borrowableCToken: borrow.address,
                        borrowAssets: borrow.convertTokenInput(borrowAmount),
                        cToken: this.address,
                        expectedShares: borrow.convertTokenInput(borrowAmount),
                        swapAction: {
                            inputToken: EMPTY_ADDRESS,
                            inputAmount: 0n,
                            outputToken: EMPTY_ADDRESS,
                            target: EMPTY_ADDRESS,
                            slippage: 0n,
                            call: "0x"
                        },
                        auxData: "0x",
                    },
                    slippage * WAD);
                break;
            }

            default: throw new Error("Unsupported position manager type");
        }

        await this._checkErc20Approval(
            this.asset.address,
            this.convertTokenInput(depositAmount),
            manager.address
        );
        await this._checkPositionManagerApproval(manager);
        return this.oracleRoute(calldata, {
            to: manager.address
        });
    }

    async zap(assets: bigint, zap: ZapperInstructions, collateralize = false, default_calldata : bytes) {
        let calldata: bytes;
        let calldata_overrides = {};
        let slippage: bigint = 0n;
        let inputToken: address | null = null;
        let type_of_zap: ZapperTypes;

        if(typeof zap == 'object') {
            slippage = zap.slippage;
            inputToken = zap.inputToken;
            type_of_zap = zap.type;
        } else {
            type_of_zap = zap;
        }


        let zapper = this.getZapper(type_of_zap);
        if(zapper == null) {
            if(type_of_zap != 'none') {
                throw new Error("Zapper type selected but no zapper contract found");
            }

            return { calldata: default_calldata, calldata_overrides, zapper: null };
        }

        switch(type_of_zap) {
            case 'simple':
                if(inputToken == null) throw new Error("Input token must be provided for simple zap");
                calldata = await zapper.getSimpleZapCalldata(this, inputToken, this.asset.address, assets, collateralize, slippage);
                calldata_overrides = { to: zapper.address };
                break;
            case 'native-vault':
                calldata = zapper.getNativeZapCalldata(this, assets, collateralize);
                calldata_overrides = { value: assets, to: zapper.address };
                break;
            case 'native-simple':
                calldata = zapper.getNativeZapCalldata(this, assets, collateralize, true);
                calldata_overrides = { value: assets, to: zapper.address };
                break;
            default:
                throw new Error("This zap type is not supported: " + zap);
        }

        return { calldata, calldata_overrides, zapper };
    }

    async deposit(amount: TokenInput, zap: ZapperInstructions = 'none', receiver: address | null = null) {
        amount = await this.ensureUnderlyingAmount(amount, zap);
        const signer = validateProviderAsSigner(this.provider);
        if(receiver == null) receiver = signer.address as address;
        const assets = this.convertTokenInput(amount);
        const zapType = typeof zap == 'object' ? zap.type : zap;
        const isNative = zapType == 'native-simple' || zapType == 'native-vault' || zapType == 'none'; 

        const default_calldata = this.getCallData("deposit", [assets, receiver]);
        const { calldata, calldata_overrides } = await this.zap(assets, zap, false, default_calldata);

        if(isNative) {
            await this._checkAssetApproval(assets);
        } else {
            await this.isZapAssetApproved(zap, assets);
            await this._checkZapperApproval(this.getZapper(zapType)!);
        }

        return this.oracleRoute(calldata, calldata_overrides);
    }

    async depositAsCollateral(amount: Decimal, zap: ZapperInstructions = 'none',  receiver: address | null = null) {
        amount = await this.ensureUnderlyingAmount(amount, zap);
        const signer = validateProviderAsSigner(this.provider);
        if(receiver == null) receiver = signer.address as address;
        const assets = this.convertTokenInput(amount);

        const collateralCapError = "There is not enough collateral left in this tokens collateral cap for this deposit.";
        const remainingCollateral = this.getRemainingCollateral(false);
        if(remainingCollateral == 0n) throw new Error(collateralCapError);
        if(remainingCollateral > 0n) {
            const shares = await this.convertToShares(assets);
            if(shares > remainingCollateral) {
                throw new Error(collateralCapError);
            }
        }

        const default_calldata = this.getCallData("depositAsCollateral", [assets, receiver]);
        const { calldata, calldata_overrides, zapper } = await this.zap(assets, zap, true, default_calldata);

        await this._checkDepositApprovals(zapper, assets);
        return this.oracleRoute(calldata, calldata_overrides);
    }

    async redeem(amount: TokenInput) {
        const signer   = validateProviderAsSigner(this.provider);
        const receiver = signer.address as address;
        const owner    = signer.address as address;

        const max_shares = await this.maxRedemption(true);
        const converted_shares = this.convertTokenInput(amount, true, true);
        const shares = max_shares < converted_shares ? max_shares : converted_shares;

        const calldata = this.getCallData("redeem", [shares, receiver, owner]);
        return this.oracleRoute(calldata);
    }

    async redeemShares(amount: bigint) {
        const signer = validateProviderAsSigner(this.provider);
        const receiver = signer.address as address;
        const owner = signer.address as address;

        const calldata = this.getCallData("redeem", [amount, receiver, owner]);
        return this.oracleRoute(calldata);
    }

    async collateralPosted(account: address | null = null) {
        if(!account) account = validateProviderAsSigner(this.provider).address as address;
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

    convertUsdToTokens(usdAmount: USD, asset = true, lower = false) {
        const price = this.getPrice(asset, lower);
        return usdAmount.div(price) as TokenInput;
    }

    convertTokensToUsd(tokenAmount: bigint, asset = true, use_exchange_rate = false) {
        const raw_amount = use_exchange_rate ? (tokenAmount * this.exchangeRate) / WAD : tokenAmount;
        const tokenAmountDecimal = toDecimal(raw_amount, asset ? this.asset.decimals : this.decimals);
        return this.getPrice(asset).mul(tokenAmountDecimal);
    }

    buildMultiCallAction(calldata: bytes) {
        return {
            target: this.address,
            isPriceUpdate: false,
            data: calldata
        } as MulticallAction;
    }

    private async _checkPositionManagerApproval(manager: PositionManager) {
        const isApproved = await this.isPluginApproved(manager.type, 'positionManager');
        if (!isApproved) {
            throw new Error(`PositionManager ${manager.address} is not approved for ${this.symbol}`);
        }
    }

    private async _checkZapperApproval(zapper: Zapper) {
        if(!setup_config.approval_protection) {
            return;
        }

        if (setup_config.approval_protection && zapper) {
            const plugin_allowed = await this.isPluginApproved(zapper.type, 'zapper');
            if (!plugin_allowed) {
                throw new Error(`Please approve the ${zapper.type} Zapper to be able to move ${this.symbol} on your behalf.`);
            }
        }
    }

    private async _checkErc20Approval(erc20_address: address, amount: bigint, spender: address) {
        const signer = validateProviderAsSigner(this.provider);
        const erc20 = new ERC20(signer, erc20_address);
        const allowance = await erc20.allowance(signer.address as address, spender);
        if(allowance < amount) {
            const symbol = await erc20.fetchSymbol();
            throw new Error(`Please approve ${symbol} for ${spender}: ${amount}`);
        }
    }

    private async _checkAssetApproval(assets: bigint) {
        if(!setup_config.approval_protection) {
            return;
        }

        const asset = this.getAsset(true);
        const owner = validateProviderAsSigner(this.provider).address as address;
        const allowance = await asset.allowance(owner, this.address);
        if(allowance < assets) {
            throw new Error(`Please approve the ${asset.symbol} token for ${this.symbol}`);
        }
    }

    private async _checkDepositApprovals(zapper: Zapper | null, assets: bigint) {
        if(!setup_config.approval_protection) {
            return;
        }

        if(zapper) {
            await this._checkZapperApproval(zapper);
        }

        await this._checkAssetApproval(assets);
    }

    async oracleRoute(calldata: bytes, override: { [key: string]: any } = {}): Promise<TransactionResponse> {
        const signer = validateProviderAsSigner(this.provider);
        const price_updates = await this.getPriceUpdates();

        if(price_updates.length > 0) {
            const token_action = this.buildMultiCallAction(calldata);
            calldata = this.getCallData("multicall", [[...price_updates, token_action]]);
        }

        const tx = await this.executeCallData(calldata, override);
        await this.market.reloadUserData(signer.address as address);

        return tx;
    }

    async getPriceUpdates(): Promise<MulticallAction[]> {
        const adapter_enums = this.adapters.map(num => Number(num));

        let price_updates = [];
        if(adapter_enums.includes(AdaptorTypes.REDSTONE_CORE)) {
            const redstone = await Redstone.buildMultiCallAction(this);
            price_updates.push(redstone);
        }

        return price_updates;
    }
}