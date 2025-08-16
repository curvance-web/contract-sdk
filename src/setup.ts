import { JsonRpcSigner, Wallet } from "ethers";
import { ChainRpcPrefix, getContractAddresses } from "./helpers";
import { Market } from "./classes/Market";
import { address } from './types';
import { ProtocolReader } from "./classes/ProtocolReader";
import { Faucet } from "./classes/Faucet";
import { OracleManager } from "./classes/OracleManager";

export default async function SetupChain(chain: ChainRpcPrefix, signer: JsonRpcSigner | Wallet) {
    const chain_addresses = getContractAddresses(chain);
    const reader = new ProtocolReader(signer, chain_addresses.ProtocolReader as address)
    const faucet = new Faucet(signer, chain_addresses.Faucet as address);
    const oracle_manager = new OracleManager(signer, chain_addresses.OracleManager as address);

    return {
        markets: await Market.getAll(signer, reader, oracle_manager),
        faucet,
        reader,
    };
}