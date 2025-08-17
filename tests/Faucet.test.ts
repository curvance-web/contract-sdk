import { config } from 'dotenv';
config({ quiet: true });
import { test, describe, before } from 'node:test';
import assert from 'node:assert';
import { JsonRpcProvider } from 'ethers';
import { address, curvance_signer } from '../src/types';
import { Faucet } from '../src/classes/Faucet';
import { ERC20 } from '../src/classes/ERC20';
import { fastForwardTime, getTestSetup } from './utils/helper';
import { setupChain } from '../src/setup';
import { ChainRpcPrefix } from '../src/helpers';


describe('Faucet Tests', () => {
    let provider: JsonRpcProvider;
    let signer: curvance_signer;
    let account: address;
    let faucet: Faucet;
    let test_tokens: address[] = [];
    let test_amounts: bigint[] = [];
    let test_token: address;
    let test_amount: bigint;
    let one_day_secs = 24 * 60 * 60;

    before(async () => {
        const setup = await getTestSetup(process.env.DEPLOYER_PRIVATE_KEY as string);
        provider = setup.provider;
        signer = setup.signer;
        account = signer.address as address;
        
        const curvance = await setupChain(process.env.TEST_CHAIN as ChainRpcPrefix, signer);
        faucet = curvance.faucet;
        for(const market of curvance.markets) {
            const tokens = market.tokens;
            for(const token of tokens) {
                test_tokens.push(token.asset.address);
                test_amounts.push(100n);
            }
        }

        test_token = test_tokens[0]!;
        test_amount = test_amounts[0]!;
        fastForwardTime(provider, one_day_secs);
    });

    test('is available', async () => {
        const available = await faucet.isAvailable(test_token, test_amount);
        assert.strictEqual(available, true, 'Faucet should be available');
    });

    test('multi is available', async () => {
        const availability = await faucet.multiIsAvailable(test_tokens, test_amounts);
        const keys = Object.keys(availability);

        assert(Object.keys(availability).length > 2);
        assert(availability[keys[0]! as address]);
        assert(availability[keys[keys.length - 1]! as address] == false);
    });

    test('claim', async () => {
        const token = new ERC20(signer, test_token);
        const balanceBefore = await token.balanceOf(account);
        await faucet.claim(account, test_token, 100n);
        const balanceAfter = await token.balanceOf(account);

        assert(balanceBefore + 100n == balanceAfter);
    });

    test('multi last claimed', async () => {
        const last_claimed = await faucet.multiLastClaimed(account, test_tokens);
        assert(last_claimed.length == test_tokens.length);
    });
});