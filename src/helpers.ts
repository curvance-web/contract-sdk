import { Contract, parseUnits } from "ethers";
import { Decimal } from "decimal.js";
import { address, bytes, curvance_provider, curvance_signer } from "./types";
import { chains } from "./chains";
import { chain_config, setup_config } from "./setup";

export type ChangeRate = "year" | "month" | "week" | "day";
export type ChainRpcPrefix = keyof typeof chains;

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
export const UINT256_MAX_DECIMAL = Decimal(UINT256_MAX);
export const EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000" as address;
export const NATIVE_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as address;
export const EMPTY_BYTES = "0x" as bytes;

export function getRateSeconds(rate: ChangeRate): bigint {
    switch (rate) {
        case "year":
            return SECONDS_PER_YEAR;
        case "month":
            return SECONDS_PER_MONTH;
        case "week":
            return SECONDS_PER_WEEK;
        case "day":
            return SECONDS_PER_DAY;
        default:
            throw new Error(`Unknown rate: ${rate}`);
    }
}

export function toDecimal(value: bigint, decimals: bigint): Decimal {
    return new Decimal(value).div(new Decimal(10).pow(decimals));
}

export function toBigInt(value: number, decimals: bigint): bigint {
    return parseUnits(value.toString(), decimals);
}

export function getChainConfig() {
    const chain = setup_config.chain;
    const config = chain_config[chain];
    if (!config) {
        throw new Error(`No configuration found for chain ${chain}`);
    }
    return config;
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
    return contractWithGasBuffer(contract) as Contract & I;
}

export function getContractAddresses(chain: ChainRpcPrefix) {
    const config = chains[chain];

    if (!config) {
        throw new Error(`No configuration found for chain ${chain}`);
    }

    return config;
}

/**
 * Calculates the gas limit with a buffer percentage added
 * @param estimatedGas The original gas estimate from ethers
 * @param bufferPercent The percentage buffer to add (e.g., 20 for 20%)
 * @returns The gas limit with buffer applied
 */
function calculateGasWithBuffer(estimatedGas: bigint, bufferPercent: number): bigint {
    return (estimatedGas * BigInt(100 + bufferPercent)) / BigInt(100);
}

/**
 * Checks if a contract method supports gas estimation
 * @param method The contract method to check
 * @returns true if the method has an estimateGas function
 */
function canEstimateGas(method: any): boolean {
    return typeof method?.estimateGas === 'function';
}

/**
 * Attempts to estimate gas and add buffer to transaction arguments
 * @param method The contract method to estimate gas for
 * @param args The transaction arguments
 * @param bufferPercent The gas buffer percentage
 * @returns true if gas estimation was successful and added to args
 */
async function tryAddGasBuffer(method: any, args: any[], bufferPercent: number): Promise<boolean> {
    if (!canEstimateGas(method)) {
        return false;
    }

    const estimatedGas = await method.estimateGas(...args);
    const gasLimit = calculateGasWithBuffer(estimatedGas, bufferPercent);
    
    // Add the gas limit as transaction overrides
    args.push({ gasLimit });
    return true;
}

/**
 * Wraps a contract instance so all write actions automatically add a gas buffer.
 * 
 * How it works:
 * 1. Creates a proxy around the contract
 * 2. Intercepts all function calls
 * 3. For contract methods that support it, estimates gas usage
 * 4. Adds the specified buffer percentage to the gas limit
 * 5. Calls the original method with the buffered gas limit
 * 
 * @param contract The ethers contract instance to wrap
 * @param bufferPercent The percentage buffer to add (default 20%)
 * @returns The same contract but with automatic gas buffering
 */
export function contractWithGasBuffer<T extends object>(contract: T, bufferPercent = 10): T {
    return new Proxy(contract, {
        get(target, methodName, receiver) {
            const originalMethod = Reflect.get(target, methodName, receiver);
            
            // Only wrap functions, skip special properties like populateTransaction
            if (typeof originalMethod !== 'function' || methodName === 'populateTransaction') {
                return originalMethod;
            }
            
            // Return a wrapped version of the method
            return async (...args: any[]) => {
                try {
                    // Try to add gas buffer before calling the method
                    await tryAddGasBuffer(originalMethod, args, bufferPercent);
                    
                    // Call the original method with potentially modified args
                    return await originalMethod.apply(target, args);
                } catch (error: any) {
                    // Just enhance the original error message with method context
                    error.message = `Contract method '${String(methodName)}' failed: ${error.message}`;
                    throw error;
                }
            };
        }
    });
}