import { JsonRpcProvider, JsonRpcSigner, Wallet } from "ethers";
import { ChainRpcPrefix, getContractAddresses } from "./helpers";
import { Market } from "./classes/Market";
import { address, curvance_provider } from './types';
import { ProtocolReader } from "./classes/ProtocolReader";
import { Faucet } from "./classes/Faucet";
import { OracleManager } from "./classes/OracleManager";
import Kuru from "./classes/Kuru";

export let setup_config: {
    chain: ChainRpcPrefix;
    contracts: ReturnType<typeof getContractAddresses>;
    provider: curvance_provider;
    approval_protection: boolean;
    api_url: string | null;
};

export const chain_config = {
    'monad-testnet': {
        dexAgg: Kuru,
        provider: new JsonRpcProvider("https://rpc.ankr.com/monad_testnet"),
        native_symbol: 'MON',
        wrapped_native: "0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701" as address,
        vaults: [
            { name: "apriori", contract: "0xb2f82D0f38dc453D596Ad40A37799446Cc89274A" as address },
            { name: "fast-lane", contract: "0x3a98250F98Dd388C211206983453837C8365BDc1" as address },
            // { name: "magma", contract: "0xaEef2f6B429Cb59C9B2D7bB2141ADa993E8571c3" as address }, //Has no deposit function for some reason
            // { name: "kintsu", contract: "0xe1d2439b75fb9746E7Bc6cB777Ae10AA7f7ef9c5" as address } //Has a deposit function but uses uint96 instead of uint256
        ]
    }
};

export async function setupChain(chain: ChainRpcPrefix, provider: curvance_provider | null, approval_protection: boolean = false, api_url: string | null = null) {
    if(!(chain in chain_config)) {
        throw new Error("Chain does not have a corresponding config");
    }

    if(provider == null) {
        provider = chain_config[chain].provider!;
    }

    setup_config = {
        chain,
        contracts: getContractAddresses(chain),
        provider,
        approval_protection,
        api_url,
    }

    if(!("ProtocolReader" in setup_config.contracts)) {
        throw new Error(`Chain configuration for ${chain} is missing ProtocolReader address.`);
    } else if (!("OracleManager" in setup_config.contracts)) {
        throw new Error(`Chain configuration for ${chain} is missing OracleManager address.`);
    }

    const reader = new ProtocolReader(setup_config.contracts.ProtocolReader as address)
    const oracle_manager = new OracleManager(setup_config.contracts.OracleManager as address);

    return {
        markets: await Market.getAll(reader, oracle_manager),
        reader,
        dexAgg: chain_config[chain].dexAgg,
    };
}