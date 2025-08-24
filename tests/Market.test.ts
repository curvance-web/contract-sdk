import { config } from 'dotenv';
config({ quiet: true });
import { test, describe, before } from 'node:test';
import assert from 'node:assert';

import { JsonRpcProvider } from 'ethers';
import { address, curvance_signer } from '../src/types';
import { Market } from '../src/classes/Market';
import { getTestSetup } from './utils/helper';
import { setupChain } from '../src/setup';
import { ChainRpcPrefix } from '../src/helpers';


describe('Market Tests', () => {
    let provider: JsonRpcProvider;
    let signer: curvance_signer;
    let account: address;
    let markets: Market[];

    before(async () => {
        const setup = await getTestSetup(process.env.DEPLOYER_PRIVATE_KEY as string);
        provider = setup.provider;
        signer = setup.signer;
        account = signer.address as address;

        const curvance = await setupChain(process.env.TEST_CHAIN as ChainRpcPrefix, signer);
        markets = curvance.markets;
        let count = 0;
        console.log(`Market summaries in USD:`);
        for(const market of markets) {
            console.log(`[${count}] tvl: ${market.tvl.toFixed(18)} | totalDebt: ${market.totalDebt.toFixed(18)} | totalCollateral: ${market.totalCollateral.toFixed(18)}`);
            for(const token of market.tokens) {
                console.log(`\tToken: ${token.symbol} | Price: ${token.getPrice()} | Amount: ${token.getTvl(false)} | LTV: ${token.ltv()}`);
            }
            count++;
        }
    })
});