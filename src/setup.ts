import { JsonRpcProvider, JsonRpcSigner, Wallet } from "ethers";
import { ChainRpcPrefix, getContractAddresses } from "./helpers";
import { Market } from "./classes/Market";
import { address } from './types';
import { ProtocolReader } from "./classes/ProtocolReader";
import { Faucet } from "./classes/Faucet";
import { OracleManager } from "./classes/OracleManager";

export const backup_providers: Record<ChainRpcPrefix, JsonRpcProvider> = {
    "monad-testnet": new JsonRpcProvider("https://rpc.ankr.com/monad_testnet")
};
export let active_contracts: ReturnType<typeof getContractAddresses>;

export async function setupChain(chain: ChainRpcPrefix, signer: JsonRpcSigner | Wallet | JsonRpcProvider | null) {
    active_contracts = getContractAddresses(chain);

    if(signer == null) {
        signer = backup_providers[chain]!;
    }

    if(!("ProtocolReader" in active_contracts)) {
        throw new Error(`Chain configuration for ${chain} is missing ProtocolReader address.`);
    } else if (!("Faucet" in active_contracts)) {
        throw new Error(`Chain configuration for ${chain} is missing Faucet address.`);
    } else if (!("OracleManager" in active_contracts)) {
        throw new Error(`Chain configuration for ${chain} is missing OracleManager address.`);
    }

    const reader = new ProtocolReader(signer, active_contracts.ProtocolReader as address)
    const faucet = new Faucet(signer, active_contracts.Faucet as address);
    const oracle_manager = new OracleManager(signer, active_contracts.OracleManager as address);

    return {
        markets: await Market.getAll(signer, reader, oracle_manager, active_contracts),
        faucet,
        reader,
    };
}