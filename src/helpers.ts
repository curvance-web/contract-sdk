import { JsonRpcSigner, Wallet } from "ethers";
import { BorrowableCToken, CToken } from "./classes/CToken";
import { Contract } from "ethers";
import { Decimal } from "decimal.js";
import { address } from "./types";
import { chains } from "./chains";

export const WAD = BigInt(10n ** 18n);
export const WAD_DECIMAL = new Decimal(WAD);

export enum AdaptorTypes {
    CHAINLINK = 1,
    REDSTONE_CORE = 2,
    REDSTONE_CLASSIC = 3,
    MOCK = 1337
}

export function contractSetup<I>(signer: JsonRpcSigner | Wallet, contractAddress: address, abi: any): Contract & I {
    const contract = new Contract(contractAddress, abi, signer);
    if(contract == undefined || contract == null) {
        throw new Error(`Failed to load contract at address ${contractAddress}.`);
    }
    return contract as Contract & I;
}

export function getContractAddresses(chain: ChainRpcPrefix) {
    const config = chains[chain];

    if (!config) {
        throw new Error(`No configuration found for chain ${chain}`);
    }

    return config;
}

export function handleTransactionWithOracles<T>(exec_func: Function, token: CToken | BorrowableCToken, adaptor: AdaptorTypes): Promise<T> {
    if(adaptor == AdaptorTypes.REDSTONE_CORE) {
        // TODO:
        // Handle Redstone Core specific logic
    }

    return exec_func() as Promise<T>;
}

export type ChainRpcPrefix = keyof typeof chains;