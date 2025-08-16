import { config } from 'dotenv';
config({ quiet: true });
import { test, describe, before } from 'node:test';
import assert from 'node:assert';

import { JsonRpcProvider, Wallet } from 'ethers';
import { address } from '../src/types';
import { OracleManager } from '../src/classes/OracleManager';
import { getTestSetup } from './utils/helper';
import { setupChain } from '../src/setup';
import { ChainRpcPrefix } from '../src/helpers';

describe('Faucet Tests', () => {
    let provider: JsonRpcProvider;
    let signer: Wallet;
    let account: address;
    let oracle: OracleManager;
    let test_token: address;
    let test_ctoken: address;

    before(async () => {
        const setup = await getTestSetup(process.env.DEPLOYER_PRIVATE_KEY as string);
        provider = setup.provider;
        signer = setup.signer;
        account = signer.address as address;

        const curvance = await setupChain(process.env.TEST_CHAIN as ChainRpcPrefix, signer);
        const market = curvance.markets[1]!;
        oracle = market.oracle_manager;

        const ctoken = market.tokens[0]!;
        test_token = await ctoken.asset.address as address;
        test_ctoken = ctoken.address;
    });

    test('get price', async () => {
        const price = await oracle.getPrice(test_token, true, true);
        assert(price > 0);

        const cPrice = await oracle.getPrice(test_ctoken, true, true);
        assert(cPrice > 0);
    });
});