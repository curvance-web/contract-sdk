import { JsonRpcSigner, Wallet } from "ethers";
import { BorrowableCToken, CToken } from "./classes/CToken";
import { Contract } from "ethers";
import { Decimal } from "decimal.js";
import { address } from "./types";
import path from "path";
import fs from "fs";

export const WAD = BigInt(10n ** 18n);
export const WAD_DECIMAL = new Decimal(WAD);

export enum AdaptorTypes {
    CHAINLINK = 1,
    REDSTONE_CORE = 2,
    REDSTONE_CLASSIC = 3,
    MOCK = 1337
}

export function toDecimal(amount: bigint, decimals = 18n): bigint {
    return amount / BigInt(10n ** BigInt(decimals));
}

export function toInteger(amount: bigint, decimals = 18n): bigint {
    return amount * BigInt(10n ** BigInt(decimals));
}

export function contractSetup<I>(signer: JsonRpcSigner | Wallet, contractAddress: address, abi: any): Contract & I {
    const contract = new Contract(contractAddress, abi, signer);
    if(contract == undefined || contract == null) {
        throw new Error(`Failed to load contract at address ${contractAddress}.`);
    }
    return contract as Contract & I;
}

export function getContractAddresses(chain: ChainRpcPrefix) {
    const file_path = path.join(__dirname, 'chains', `${chain}.json`);
    if (!fs.existsSync(file_path)) {
        throw new Error(`No configuration found for chain ${chain}`);
    }

    return JSON.parse(fs.readFileSync(file_path, 'utf-8'));
}

export function handleTransactionWithOracles<T>(exec_func: Function, token: CToken | BorrowableCToken, adaptor: AdaptorTypes): Promise<T> {
    if(adaptor == AdaptorTypes.REDSTONE_CORE) {
        // TODO:
        // Handle Redstone Core specific logic
    }

    return exec_func() as Promise<T>;
}

export const AVAILABLE_CHAINS = [
    'monad-testnet',
];
export type ChainRpcPrefix = typeof AVAILABLE_CHAINS[number];