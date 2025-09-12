import { Contract, TransactionResponse } from "ethers";
import { contractSetup, WAD_DECIMAL, BPS, ChangeRate, getRateSeconds, validateProviderAsSigner, WAD, getChainConfig, toBigInt, EMPTY_ADDRESS, NATIVE_ADDRESS, toDecimal } from "../helpers";
import { AdaptorTypes, DynamicMarketToken, StaticMarketToken, UserMarketToken } from "./ProtocolReader";
import { ERC20 } from "./ERC20";
import { Market, MarketToken, Plugins, PluginTypes } from "./Market";
import { Calldata } from "./Calldata";
import Decimal from "decimal.js";
import base_ctoken_abi from '../abis/BaseCToken.json';
import { address, bytes, curvance_provider, curvance_signer, Percentage, TokenInput, USD, USD_WAD } from "../types";
import { Redstone } from "./Redstone";
import { Zapper, ZapperTypes, zapperTypeToName } from "./Zapper";
import { setup_config } from "../setup";
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
        const isVault = chain_config.vaults.some(vault => vault.contract == this.asset.address);
        if(isVault) this.zapTypes.push('native-vault');
        if("nativeVaultPositionManager" in this.market.plugins && isVault) this.leverageTypes.push('native-vault');
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
    get exchangeRate() { return this.cache.exchangeRate; }
    get canZap() { return this.zapTypes.length > 0; }
    get canLeverage() { return this.leverageTypes.length > 0; }

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
        return inUSD ? this.convertTokensToUsd(this.cache.userShareBalance, true) : toDecimal(this.cache.userShareBalance, this.decimals);
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
        return inUSD ? this.convertTokensToUsd(this.cache.userCollateral) : this.convertBigInt(this.cache.userCollateral, true);
    }

    /** @returns User Debt in USD or USD WAD */
    getUserDebt(inUSD: true): USD;
    getUserDebt(inUSD: false): USD_WAD;
    getUserDebt(inUSD: boolean): USD | USD_WAD {
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
    
    getPrice(asset = false, lower = false) { 
        let price = asset ? this.cache.assetPrice : this.cache.sharePrice;
        if(lower) {
            price = asset ? this.cache.assetPriceLower : this.cache.sharePriceLower;
        }

        return Decimal(price).div(WAD) as USD;
    }

    getApy(): Percentage;
    getApy(asTokenInput: false): bigint;
    getApy(asTokenInput: true): Percentage
    getApy(asTokenInput = true): Percentage | bigint {
        // TODO: add underlying yield rate
        return asTokenInput ? Decimal(this.cache.supplyRate).div(WAD) : this.cache.supplyRate;
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

    getPositionManager(type: PositionManagerTypes) {
        const signer = validateProviderAsSigner(this.provider);

        let manager_contract: address = this.getPluginAddress(type, 'positionManager');

        return new PositionManager(manager_contract, signer, type);
    }

    getZapper(type: ZapperTypes) {
        const signer = validateProviderAsSigner(this.provider);
        const zap_contract = this.getPluginAddress(type, 'zapper');

        return new Zapper(zap_contract, signer, type);
    }

    async isPluginApproved(plugin: ZapperTypes | PositionManagerTypes, type: PluginTypes) {
        const signer = validateProviderAsSigner(this.provider);
        const plugin_address = this.getPluginAddress(plugin, type);
        return this.contract.isDelegate(signer.address as address, plugin_address);
    }

    async approvePlugin(plugin: ZapperTypes | PositionManagerTypes, type: PluginTypes) {
        const plugin_address = this.getPluginAddress(plugin, type);
        return this.contract.setDelegateApproval(plugin_address, true);
    }

    getPluginAddress(plugin: ZapperTypes | PositionManagerTypes, type: PluginTypes): address {
        switch(type) {
            case 'zapper': {
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
                    case 'native-vault': return this.market.plugins.nativeVaultPositionManager as address;
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
    async approveUnderlying(amount: TokenInput | null = null) {
        const erc20 = new ERC20(this.provider, this.asset.address);
        const tx = await erc20.approve(this.address, amount);
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
        const shares = this.convertTokenInput(amount, true);
        return this.contract.transfer(receiver, shares);
    }

    async redeemCollateral(amount: Decimal, receiver: address | null = null, owner: address | null = null) {
        const signer = validateProviderAsSigner(this.provider);
        if(receiver == null) receiver = signer.address as address;
        if(owner == null) owner = signer.address as address;

        const shares = this.convertTokenInput(amount, true);
        const calldata = this.getCallData("redeemCollateral", [shares, receiver, owner]);
        return this.oracleRoute(calldata);
    }

    async postCollateral(amount: TokenInput) {
        const shares = this.convertTokenInput(amount, true);
        const calldata = this.getCallData("postCollateral", [shares]);
        return this.oracleRoute(calldata);
    }

    async removeCollateral(amount: TokenInput) {
        const shares = this.convertTokenInput(amount, true);
        const calldata = this.getCallData("removeCollateral", [shares]);
        return this.oracleRoute(calldata);
    }

    async convertToAssets(shares: bigint) { 
        return this.contract.convertToAssets(shares); 
    }

    async convertToShares(assets: bigint) {
        return this.contract.convertToShares(assets);
    }

    async maxRedemption(): TokenInput {
        const signer = validateProviderAsSigner(this.provider);
        const data = await this.market.reader.maxRedemptionOf(signer.address as address, this);

        if(data.errorCodeHit) {
            throw new Error(`Error fetching max redemption. Possible stale price or other issues...`);
        }

        const all_shares = data.maxCollateralizedShares + data.maxUncollateralizedShares;
        const all_assets = await this.convertToAssets(all_shares);
        return this.convertBigInt(all_assets, false) as TokenInput;
    }

    convertBigInt(amount: bigint, inShares = false) {
        const decimals = inShares ? this.decimals : this.asset.decimals;
        const raw_amount = inShares ? (amount * this.exchangeRate) / WAD : amount;
        return toDecimal(raw_amount, decimals);
    }

    convertTokenInput(amount: TokenInput, inShares = false) {
        const decimals = inShares ? this.decimals : this.asset.decimals;
        const newAmount = toBigInt(amount, decimals);

        return inShares ? (newAmount * this.exchangeRate) / WAD : newAmount;
    }

    /** @returns A list of tokens mapped to their respective zap options */
    async getDepositTokens() {
        let tokens: ZapToken[] = [{
            interface: this.getAsset(true),
            type: 'none'
        }];

        if(this.zapTypes.includes('native-vault')) {
            tokens.push({
                interface: new NativeToken(setup_config.chain, this.provider),
                type: 'native-vault'
            });
        }

        // @NOTE: You are probably wondering... why the hell is this an async function,
        // The future plan for other zappers will be to query an API for a token list which will require this to be async 
        return tokens;
    }

    async maxRemainingLeverage(ctoken: BorrowableCToken, type: PositionManagerTypes) {
        const manager = this.getPositionManager(type);
        const amount = manager.maxRemainingLeverage(ctoken);

        return amount;
    }

    async hypotheticalRedemptionOf(amount: TokenInput) {
        const signer = validateProviderAsSigner(this.provider);
        const shares = this.convertTokenInput(amount, true);
        return this.market.reader.hypotheticalRedemptionOf(
            signer.address as address,
            this,
            shares
        )
    }

    async depositAndLeverage(
        depositAmount: TokenInput, 
        borrow: BorrowableCToken, 
        borrowAmount: TokenInput, 
        type: PositionManagerTypes, 
        slippage_: TokenInput = Decimal(0.5)
    ) {
        const slippage = toBigInt(slippage_.toNumber(), 18n);
        const manager = this.getPositionManager(type);
        
        let calldata: bytes;
        // TODO: Implement vault & simple position manager

        switch(type) {
            case 'native-vault': {
                calldata = manager.getDepositAndLeverageCalldata(
                    this.convertTokenInput(depositAmount),
                    {
                        borrowableCToken: borrow.address,
                        borrowAssets: borrow.convertTokenInput(borrowAmount),
                        cToken: this.address,
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
                    slippage);
                break;
            }

            default: throw new Error("Unsupported position manager type");
        }

        await this._checkAssetApproval(
            manager.address,
            this.convertTokenInput(depositAmount)
        )
        await this._checkPositionManagerApproval(manager);
        return this.oracleRoute(calldata, {
            to: manager.address
        });
    }

    async deposit(amount: TokenInput, zap: ZapperTypes = 'none',  receiver: address | null = null) {
        const signer = validateProviderAsSigner(this.provider);
        if(receiver == null) receiver = signer.address as address;
        const assets = this.convertTokenInput(amount);

        let calldata: bytes;
        let calldata_overrides = {};
        let zapper: Zapper | null = null;

        if(zap == 'native-vault') {
            zapper = this.getZapper(zap);
            calldata = zapper.getNativeZapCalldata(this, assets, false);
            calldata_overrides = { value: assets, to: zapper.address };
        } else if(zap != 'none') {
            // TODO: implement vault zap
            // TODO: implement simple zap
            throw new Error("This zap type is not supported");
        } else {
            calldata = this.getCallData("deposit", [assets, receiver]);
        }

        await this._checkAssetApproval(this.address, assets);
        return this.oracleRoute(calldata, calldata_overrides);
    }

    async depositAsCollateral(amount: Decimal, zap: ZapperTypes = 'none',  receiver: address | null = null) {
        const signer = validateProviderAsSigner(this.provider);
        if(receiver == null) receiver = signer.address as address;
        const assets = this.convertTokenInput(amount);

        const collateralCapError = "There is not enough collateral left in this tokens collateral cap for this deposit.";
        if(this.remainingCollateral == 0n) throw new Error(collateralCapError);
        if(this.remainingCollateral > 0n) {
            const shares = await this.convertToShares(assets);
            if(shares > this.remainingCollateral) {
                throw new Error(collateralCapError);
            }
        }
        
        let calldata: bytes;
        let call_overrides: any = {};
        let zapper: Zapper | null = null;
        if(zap == 'native-vault') {
            zapper = this.getZapper(zap);
            calldata = zapper.getNativeZapCalldata(this, assets, true);
            call_overrides = { value: assets, to: zapper.address }
        } else if(zap != 'none') {
            throw new Error("This zap type is not supported");
        } else {
            calldata = this.getCallData("depositAsCollateral", [assets, receiver]);
        }

        await this._checkDepositApprovals(zapper, assets);
        return this.oracleRoute(calldata, call_overrides);
    }

    async redeem(amount: TokenInput, receiver: address | null = null, owner: address | null = null) {
        const signer = validateProviderAsSigner(this.provider);
        if(receiver == null) receiver = signer.address as address;
        if(owner == null) owner = signer.address as address;
        const shares = this.convertTokenInput(amount, true);
        const calldata = this.getCallData("redeem", [shares, receiver, owner]);
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

    convertTokensToUsd(tokenAmount: bigint, asset = true) {
        const tokenAmountDecimal = toDecimal(tokenAmount, asset ? this.asset.decimals : this.decimals);
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

    private async _checkAssetApproval(target: address, assets: bigint) {
        if(!setup_config.approval_protection) {
            return;
        }

        const asset = this.getAsset(true);
        const owner = validateProviderAsSigner(this.provider).address as address;
        const allowance = await asset.allowance(owner, target);
        if(allowance < assets) {
            throw new Error(`Please approve the ${asset.symbol} token for ${this.symbol}.`);
        }
    }

    private async _checkDepositApprovals(zapper: Zapper | null, assets: bigint) {
        if(!setup_config.approval_protection) {
            return;
        }

        if(zapper) {
            await this._checkZapperApproval(zapper);
        }
        
        await this._checkAssetApproval(this.address, assets);
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