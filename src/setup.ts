import { JsonRpcSigner, Wallet } from "ethers";
import { ChainRpcPrefix, getContractAddresses } from "./helpers";
import { Market } from "./classes/Market";
import { address } from './types';
import { ProtocolReader } from "./classes/ProtocolReader";
import { Faucet } from "./classes/Faucet";
import { OracleManager } from "./classes/OracleManager";

export async function setupChain(chain: ChainRpcPrefix, signer: JsonRpcSigner | Wallet) {
    const chain_addresses = getContractAddresses(chain);

    if(!("ProtocolReader" in chain_addresses)) {
        throw new Error(`Chain configuration for ${chain} is missing ProtocolReader address.`);
    } else if (!("Faucet" in chain_addresses)) {
        throw new Error(`Chain configuration for ${chain} is missing Faucet address.`);
    } else if (!("OracleManager" in chain_addresses)) {
        throw new Error(`Chain configuration for ${chain} is missing OracleManager address.`);
    }

    const reader = new ProtocolReader(signer, chain_addresses.ProtocolReader as address)
    const faucet = new Faucet(signer, chain_addresses.Faucet as address);
    const oracle_manager = new OracleManager(signer, chain_addresses.OracleManager as address);

    return {
        markets: await Market.getAll(signer, reader, oracle_manager, chain_addresses),
        faucet,
        reader,
    };
}