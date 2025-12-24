import { config } from 'dotenv';
config({ quiet: true });
import { test, describe, before, afterEach, after } from 'node:test';
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
            seedUnderlying: true,
            snapshot: true,
            log: false,
        });
        account = framework.account;
    })

    after(async () => {
        await framework.destroy();
    });

    afterEach(async () => {
        await framework.reset();
    });

    test('Native vault deposit and leverage', async function() {
        const [ market, cshMON, cWMON ] = await framework.getMarket('shMON | WMON');
        const depositAmount = Decimal(1_000);
        await cshMON.approvePlugin('native-vault', 'positionManager');
        await cshMON.approveUnderlying(depositAmount, cshMON.getPluginAddress('native-vault', 'positionManager'));
        await cshMON.depositAndLeverage(depositAmount, cWMON, Decimal(3_000), 'native-vault', Decimal(0.01));
    });

    test('Native vault leverage up & down', async function() {
        const [ market, cshMON, cWMON ] = await framework.getMarket('shMON | WMON');

        const depositAmount = Decimal(1_000);
        await cshMON.approveUnderlying(depositAmount);
        await cshMON.depositAsCollateral(depositAmount);
        await cshMON.approvePlugin('native-vault', 'positionManager');
        await cshMON.leverageUp(cWMON, Decimal(3), 'native-vault', Decimal(0.01));

        await framework.skipMarketCooldown(market.address);
        await cshMON.approvePlugin('simple', 'positionManager');
        await cshMON.leverageDown(cWMON, cshMON.getLeverage() as Decimal, Decimal(1.5), 'simple', Decimal(0.01));
    });

    test('Vault deposit and leverage', async function() {
        const [ market, csAUSD, cAUSD ] = await framework.getMarket('sAUSD | AUSD');
        const depositAmount = Decimal(1_000);
        await csAUSD.approvePlugin('vault', 'positionManager');
        await csAUSD.approveUnderlying(depositAmount, csAUSD.getPluginAddress('vault', 'positionManager'));
        await csAUSD.depositAndLeverage(depositAmount, cAUSD, Decimal(3_000), 'vault', Decimal(0.005));
    });

    test('Vault leverage up & down', async function() {
        const [ market, csAUSD, cAUSD ] = await framework.getMarket('sAUSD | AUSD');

        const depositAmount = Decimal(1_000);
        await csAUSD.approveUnderlying(depositAmount);
        await csAUSD.depositAsCollateral(depositAmount);
        await csAUSD.approvePlugin('vault', 'positionManager');
        await csAUSD.leverageUp(cAUSD, Decimal(3), 'vault', Decimal(0.005));

        // TODO: Can't do this with sAUSD because there is no liquidity
        // await framework.skipMarketCooldown(market.address);
        // await sAUSD.approvePlugin('simple', 'positionManager');
        // await sAUSD.leverageDown(AUSD, sAUSD.getLeverage() as Decimal, Decimal(1.5), 'simple', Decimal(0.005));
    });

    test('Simple deposit and leverage', async function() {
        const [ market, cearnAUSD, cAUSD ] = await framework.getMarket('earnAUSD | AUSD');
        const depositAmount = Decimal(1_000);
        await cearnAUSD.approvePlugin('simple', 'positionManager');
        await cearnAUSD.approveUnderlying(depositAmount, cearnAUSD.getPluginAddress('simple', 'positionManager'));
        await cearnAUSD.depositAndLeverage(depositAmount, cAUSD, Decimal(3_000), 'simple', Decimal(0.005));
    });

    test('Simple leverage up & down', async function() {
        const [ market, cearnAUSD, cAUSD ] = await framework.getMarket('earnAUSD | AUSD');

        const depositAmount = Decimal(1_000);
        await cearnAUSD.approveUnderlying(depositAmount);
        await cearnAUSD.depositAsCollateral(depositAmount);
        await cearnAUSD.approvePlugin('simple', 'positionManager');
        await cearnAUSD.leverageUp(cAUSD, Decimal(3), 'simple', Decimal(0.005));

        await framework.skipMarketCooldown(market.address);
        await cearnAUSD.leverageDown(cAUSD, cearnAUSD.getLeverage() as Decimal, Decimal(1.5), 'simple', Decimal(0.005));
    });
});