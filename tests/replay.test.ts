import { config } from 'dotenv';
config({ quiet: true });
import { test, describe, before, after } from 'node:test';
import { address } from '../src/types';
import { setupChain } from '../src/setup';
import { BorrowableCToken } from '../src/classes/BorrowableCToken';
import { TestFramework } from './utils/TestFramework';
import Decimal from 'decimal.js';


describe('Replay', () => {
    let account: address;
    let framework: TestFramework;

    before(async () => {
        framework = await TestFramework.init(process.env.DEPLOYER_PRIVATE_KEY as string, 'monad-mainnet', {
            seedNativeBalance: false,
            seedUnderlying: false,
            snapshot: true,
            log: false,
        });
        account = framework.account;
    })

    after(async () => {
        await framework.destroy();
    });

    test('test', async function() {
        await framework.impersonateStart("0xe2165a834F93C39483123Ac31533780b9c679ed4");
        
        const [ market, cearnAUSD, cAUSD ] = await framework.getMarket('earnAUSD | AUSD');

        console.log(await cAUSD.fetchDebtBalanceAtTimestamp(0n));
    });
});