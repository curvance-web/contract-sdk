import { TransactionResponse } from "ethers";
import { contractSetup } from "../helpers";
import { Contract } from "ethers";
import { StaticMarketAsset } from "./ProtocolReader";
import { address, curvance_signer } from "../types";

export interface IERC20 {
    balanceOf(account: address): Promise<bigint>;
    transfer(to: address, amount: bigint): Promise<TransactionResponse>;
    approve(spender: address, amount: bigint): Promise<TransactionResponse>;
    name(): Promise<string>;
    symbol(): Promise<string>;
    decimals(): Promise<bigint>;
    totalSupply(): Promise<bigint>;
    allowance(owner: address, spender: address): Promise<TransactionResponse>;
}

export class ERC20 {
    signer: curvance_signer;
    address: address;
    contract: Contract & IERC20;
    cache: StaticMarketAsset | undefined = undefined;

    constructor(
        signer: curvance_signer,
        address: address,
        cache: StaticMarketAsset | undefined = undefined
    ) {
        this.signer = signer;
        this.address = address;
        this.cache = cache;
        this.contract = contractSetup<IERC20>(signer, address, [
            "function balanceOf(address owner) view returns (uint256)",
            "function transfer(address to, uint256 amount) returns (bool)",
            "function approve(address spender, uint256 amount) returns (bool)",
            "function name() view returns (string)",
            "function symbol() view returns (string)",
            "function decimals() view returns (uint8)",
            "function allowance(address owner, address spender) view returns (uint256)",
        ]);
    }

    get name() { return this.cache?.name; }
    get symbol() { return this.cache?.symbol; }
    get decimals() { return this.cache?.decimals; }
    get totalSupply() { return this.cache?.totalSupply; }

    async balanceOf(account: address) {
        return this.contract.balanceOf(account);    
    }

    async transfer(to: address, amount: bigint) {
        return this.contract.transfer(to, amount);
    }

    async approve(spender: address, amount: bigint) {
        return this.contract.approve(spender, amount);
    }

    async fetchName() {
        const name = await this.contract.name();
        this.setCache('name', name);
        return name;
    }

    async fetchSymbol() {
        const symbol = await this.contract.symbol();
        this.setCache('symbol', symbol);
        return symbol;
    }

    async fetchDecimals() {
        const decimals = await this.contract.decimals();
        this.setCache('decimals', decimals);
        return decimals;
    }

    async fetchTotalSupply() {
        const totalSupply = await this.contract.totalSupply();
        this.setCache('totalSupply', totalSupply);
        return totalSupply;
    }

    async allowance(owner: address, spender: address) {
        return this.contract.allowance(owner, spender);
    }

    private setCache<K extends keyof StaticMarketAsset>(key: K, value: StaticMarketAsset[K]) {
        if (!this.cache) {
            this.cache = {} as StaticMarketAsset;
        }
        this.cache[key] = value;
    }
}