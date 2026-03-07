import { ChainRpcPrefix, getContractAddresses } from "./helpers";
import { Market } from "./classes/Market";
import { address, curvance_provider } from './types';
import { ProtocolReader } from "./classes/ProtocolReader";
import { OracleManager } from "./classes/OracleManager";
import { wrapProviderWithRetries } from "./retry-provider";
import { chain_config } from "./chains";

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

export let all_markets: Market[] = [];

export async function setupChain(chain: ChainRpcPrefix, provider: curvance_provider | null = null, approval_protection: boolean = false, api_url: string = "https://api.floppy-backup.com") {
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
        let rewards;
        try {
            rewards = await fetch(`${setup_config.api_url}/v1/rewards/active/${chain}`).then(res => res.json()) as {
                milestones: Array<MilestoneResponse>
                incentives: Array<IncentiveResponse>
            };
        } catch(e) {
            console.error("Failed to fetch rewards data from API:", e);
            rewards = {
                milestones: [],
                incentives: []
            };
        }

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

    all_markets = await Market.getAll(reader, oracle_manager, setup_config.provider, milestones, incentives);

    return {
        markets: all_markets,
        reader,
        dexAgg: chain_config[chain].dexAgg,
        global_milestone: milestones['global'] ?? null
    };
}