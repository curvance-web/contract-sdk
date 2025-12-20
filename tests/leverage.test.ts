import { config } from 'dotenv';
config({ quiet: true });
import { test, describe, before, afterEach } from 'node:test';
import { address } from '../src/types';
import Decimal from 'decimal.js';
import { TestFramework } from './utils/TestFramework';
import { fastForwardTime, MARKET_HOLD_PERIOD_SECS } from './utils/helper';

describe('Leverage', () => {
    let account: address;
    let framework: TestFramework;

    before(async () => {
        framework = await TestFramework.init(process.env.DEPLOYER_PRIVATE_KEY as string, 'monad-mainnet', {
            seedNativeBalance: true,
            seedLiquidity: true,
            snapshot: true,
        });
        account = framework.account;
    })

    // afterEach(async () => {
    //     await framework.reset();
    // });

    // test('Simple deposit and leverage', async function() {
    //     const [ market, earnAUSD, AUSD ] = await framework.getMarket('earnAUSD | AUSD');
    //     const depositAmount = Decimal(1_000);
    //     await earnAUSD.approvePlugin('simple', 'positionManager');
    //     await earnAUSD.approveUnderlying(depositAmount, earnAUSD.getPluginAddress('simple', 'positionManager'));
    //     await earnAUSD.depositAndLeverage(depositAmount, AUSD, Decimal(3_000), 'simple', Decimal(0.005));
    // });

    test('Simple leverage up & down', async function() {
        const [ market, earnAUSD, AUSD ] = await framework.getMarket('earnAUSD | AUSD');

        const depositAmount = Decimal(1_000);
        await earnAUSD.approveUnderlying(depositAmount);
        await earnAUSD.depositAsCollateral(depositAmount);
        await earnAUSD.approvePlugin('simple', 'positionManager');
        await earnAUSD.leverageUp(AUSD, Decimal(3), 'simple', Decimal(0.005));
        
        await framework.skipMarketCooldown(market.address);
        await earnAUSD.leverageDown(AUSD, earnAUSD.getLeverage() as Decimal, Decimal(1.5), 'simple', Decimal(0.05));
    });
});