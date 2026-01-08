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
        
        const [ market, cWMON, cAUSD ] = await framework.getMarket('WMON | AUSD');
        await cWMON.approvePlugin('simple', 'positionManager');
        await cWMON.approveUnderlying(Decimal(600), cWMON.getPluginAddress('simple', 'positionManager'));
        await cWMON.depositAndLeverage(Decimal(600), cAUSD, Decimal(5), 'simple', Decimal(0.005));
    });
});