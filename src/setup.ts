import { JsonRpcProvider, JsonRpcSigner, Wallet } from "ethers";
import { ChainRpcPrefix, getContractAddresses } from "./helpers";
import { Market } from "./classes/Market";
import { address, curvance_provider } from './types';
import { ProtocolReader } from "./classes/ProtocolReader";
import { OracleManager } from "./classes/OracleManager";
import { wrapProviderWithRetries } from "./retry-provider";
import { Kuru } from "./classes/DexAggregators/Kuru";
import { KyberSwap } from "./classes/DexAggregators";

export type IncentiveResponse = {
    market: address,
    type: string,
    rate: number,
    description: string,
    image: string
};

export type MilestoneResponse = {
    market: address;
    tvl: number;
    multiplier: number;
    fail_multiplier: number;
    chain_network: string;
    start_date: string;
    end_date: string;
    duration_in_days: number;
}
export type Milestones = { [key: string]: MilestoneResponse };
export type Incentives = { [key: address]: Array<IncentiveResponse> };

export let setup_config: {
    chain: ChainRpcPrefix;
    contracts: ReturnType<typeof getContractAddresses>;
    provider: curvance_provider;
    approval_protection: boolean;
    api_url: string | null;
};

const monad_mainnet_config = {
    dexAgg: new KyberSwap(),
    provider: new JsonRpcProvider("https://rpc-mainnet.monadinfra.com/rpc/yXdhejk7tio3mpBmpTyzQCdIQjDXsuAk"),
    native_symbol: 'MON',
    wrapped_native: "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A" as address,
    native_vaults: [
        { name: "aprMON", contract: "0x0c65A0BC65a5D819235B71F554D210D3F80E0852" as address },
        { name: "shMON", contract: "0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c" as address },
    ],
    vaults: [
        { name: "sAUSD", contract: "0xD793c04B87386A6bb84ee61D98e0065FdE7fdA5E" as address, underlying: "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a" as address },
        { name: "earnAUSD", contract: "0x103222f020e98Bba0AD9809A011FDF8e6F067496" as address, underlying: "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a" as address },
    ]
};
export const chain_config = {
    'monad-testnet': {
        dexAgg: new Kuru(
            "0x0Acb7eF4D8733C719d60e0992B489b629bc55C02",
            1,
            "0x96eaC98928437496DdD0Cd2080E54Fe78BaC99b6",
            "https://ws.staging.kuru.io/api"
        ),
        provider: new JsonRpcProvider("https://rpc.ankr.com/monad_testnet"),
        native_symbol: 'MON',
        wrapped_native: "0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701" as address,
        native_vaults: [
            { name: "aprMON", contract: "0xb2f82D0f38dc453D596Ad40A37799446Cc89274A" as address },
            { name: "shMON", contract: "0x3a98250F98Dd388C211206983453837C8365BDc1" as address },
            // { name: "magma", contract: "0xaEef2f6B429Cb59C9B2D7bB2141ADa993E8571c3" as address }, //Has no deposit function for some reason
            // { name: "kintsu", contract: "0xe1d2439b75fb9746E7Bc6cB777Ae10AA7f7ef9c5" as address } //Has a deposit function but uses uint96 instead of uint256
        ],
        vaults: []
    },
    'monad-mainnet': monad_mainnet_config,
    'local-monad-mainnet': {...monad_mainnet_config, provider: new JsonRpcProvider("http://localhost:8545")} //overwrite with mainnet
};

export async function setupChain(chain: ChainRpcPrefix, provider: curvance_provider | null, approval_protection: boolean = false, api_url: string | null = null) {
    if(!(chain in chain_config)) {
        throw new Error("Chain does not have a corresponding config");
    }

    if(provider == null) {
        provider = chain_config[chain].provider!;
    }

    provider = wrapProviderWithRetries(provider);

    setup_config = {
        chain,
        provider,
        approval_protection,
        contracts: getContractAddresses(chain),
        api_url,
    }

    if(!("ProtocolReader" in setup_config.contracts)) {
        throw new Error(`Chain configuration for ${chain} is missing ProtocolReader address.`);
    } else if (!("OracleManager" in setup_config.contracts)) {
        throw new Error(`Chain configuration for ${chain} is missing OracleManager address.`);
    }

    const reader = new ProtocolReader(setup_config.contracts.ProtocolReader as address)
    const oracle_manager = new OracleManager(setup_config.contracts.OracleManager as address);


    let milestones: Milestones = {};
    let incentives: Incentives = {};
    if(setup_config.api_url != null) {
        const rewards = await fetch(`${setup_config.api_url}/v1/rewards/active/${chain}`).then(res => res.json()) as { 
            milestones: Array<MilestoneResponse>
            incentives: Array<IncentiveResponse>
        };

        for(const milestone of rewards.milestones) {
            milestones[milestone.market] = milestone;
        }

        for(const incentive of rewards.incentives) {
            const market = incentive.market as address;
            if(!(market in incentives)) {
                incentives[market] = [];
            }

            incentives[market]!.push(incentive);
        }
    }
    
    return {
        markets: await Market.getAll(reader, oracle_manager, setup_config.provider, milestones, incentives),
        reader,
        dexAgg: chain_config[chain].dexAgg,
        global_milestone: milestones['global'] ?? null
    };
}