import { config } from 'dotenv';
config({ quiet: true });
import { test, describe, before, afterEach, beforeEach } from 'node:test';
import { address } from '../src/types';
import { getTestSetupFramework } from './utils/helper';
import Decimal from 'decimal.js';
import { TestFramework } from './utils/TestFramework';

describe('Leverage', () => {
    let account: address;
    let framework: TestFramework;

    before(async () => {
        framework = await getTestSetupFramework(process.env.DEPLOYER_PRIVATE_KEY as string, 'monad-mainnet');
        account = framework.account;

        await framework.init({
            seedNativeBalance: true,
            seedLiquidity: true,
            snapshot: true,
        });
    })

    beforeEach(async () => {
        await framework.revertToLastSnapshot();
        await framework.snapshot();
    });

    test('Simple deposit and leverage', async function() {
        const [ market, earnAUSD, AUSD ] = await framework.getMarket('earnAUSD | AUSD');
        const depositAmount = Decimal(1_000);
        await earnAUSD.approvePlugin('simple', 'positionManager');
        await earnAUSD.approveUnderlying(depositAmount, earnAUSD.getPluginAddress('simple', 'positionManager'));
        await earnAUSD.depositAndLeverage(depositAmount, AUSD, Decimal(3_000), 'simple', Decimal(0.005));
    });

    test('Simple leverage up', async function() {
        const [ market, earnAUSD, AUSD ] = await framework.getMarket('earnAUSD | AUSD');

        const depositAmount = Decimal(1_000);
        await AUSD.approvePlugin('simple', 'zapper');
        await AUSD.approveUnderlying(depositAmount, AUSD.getPluginAddress('simple', 'zapper'));
        await earnAUSD.deposit(depositAmount, {
            type: 'simple',
            inputToken: AUSD.asset.address,
            slippage: Decimal(0.005),
        });
    });
});