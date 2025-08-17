import { BorrowableCToken, CToken } from "./classes/CToken";
import { Contract } from "ethers";
import { Decimal } from "decimal.js";
import { address, curvance_provider, curvance_signer } from "./types";
import { chains } from "./chains";

export const BPS = BigInt(1e4);
export const BPS_SQUARED = BigInt(1e8);
export const WAD = BigInt(1e18);
export const WAD_BPS = BigInt(1e22);
export const RAY = BigInt(1e27);
export const WAD_SQUARED = BigInt(1e36);
export const WAD_CUBED_BPS_OFFSET = BigInt(1e50);
export const WAD_DECIMAL = new Decimal(WAD);

export const SECONDS_PER_YEAR = 31_536_000n;
export const SECONDS_PER_MONTH = 2_592_000n;
export const SECONDS_PER_WEEK = 604_800n;
export const SECONDS_PER_DAY = 86_400n

export const UINT256_MAX = 115792089237316195423570985008687907853269984665640564039457584007913129639935n;
export const EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000" as address;

export enum AdaptorTypes {
    CHAINLINK = 1,
    REDSTONE_CORE = 2,
    REDSTONE_CLASSIC = 3,
    MOCK = 1337
}

export function toDecimal(value: bigint, decimals: bigint): Decimal {
    return new Decimal(value).div(new Decimal(10).pow(decimals));
}

export function toBigInt(value: number, decimals: bigint): bigint {
    return BigInt(value) * (10n ** decimals);
}

export function validateProviderAsSigner(provider: curvance_provider) {
    const isSigner = "address" in provider;

    if(!isSigner) {
        throw new Error("Provider is not a signer, therefor this action is not available. Please connect a wallet to execute this action.");
    }

    return provider as curvance_signer;
}

export function contractSetup<I>(provider: curvance_provider, contractAddress: address, abi: any): Contract & I {
    const contract = new Contract(contractAddress, abi, provider);
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