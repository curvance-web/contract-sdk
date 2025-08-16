import { JsonRpcSigner, Wallet } from "ethers";
import { ChainRpcPrefix } from "./helpers";
import { Market } from "./classes/Market";
import fs from "fs";
import { address } from './types';
import { ProtocolReader } from "./classes/ProtocolReader";
import { Faucet } from "./classes/Faucet";
import { OracleManager } from "./classes/OracleManager";
import path from "path";

export default async function SetupChain(chain: ChainRpcPrefix, signer: JsonRpcSigner | Wallet) {
    const file_path = path.join(__dirname, 'chains', `${chain}.json`);
    if (!fs.existsSync(file_path)) {
        throw new Error(`No configuration found for chain ${chain}`);
    }

    const chain_addresses = JSON.parse(fs.readFileSync(file_path, 'utf-8'));
    const reader = new ProtocolReader(signer, chain_addresses.ProtocolReader as address)
    const faucet = new Faucet(signer, chain_addresses.Faucet as address);
    const oracle_manager = new OracleManager(signer, chain_addresses.OracleManager as address);

    return {
        markets: await Market.getAll(signer, reader, oracle_manager),
        faucet,
        reader,
    };
}