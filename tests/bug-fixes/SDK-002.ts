import { config } from 'dotenv';
config({ quiet: true });
import { test, describe, before, after } from 'node:test';
import { address } from '../../src/types';
import Decimal from 'decimal.js';
import { TestFramework } from '../utils/TestFramework';
import assert from 'node:assert';


describe('SDK-002: previewLeverageDown computes correct reduction', () => {
    let account: address;
    let framework: TestFramework;

    before(async () => {
        framework = await TestFramework.init(process.env.DEPLOYER_PRIVATE_KEY as string, 'monad-mainnet', {
            seedNativeBalance: true,
            seedUnderlying: true,
            snapshot: true,
            log: false,
            apiUrl: "https://api.curvance.com"
        });
        account = framework.account;
    })

    after(async () => {
        await framework.destroy();
    });

    // BUG-SDK-002: previewLeverageDown returned the target collateral level
    // instead of the collateral *reduction* (current - target). This caused
    // leverageDown to over-withdraw collateral, triggering health-factor
    // reverts or attempting to withdraw more than the user owns.
    // NOTE: Restart the anvil fork before running to avoid stale oracle data.
    test('leverageDown simple from 3x to 1.5x', async function() {
        const [ market, cWMON, cUSDC ] = await framework.getMarket('WMON | USDC');

        // Seed borrow liquidity
        await cUSDC.approveUnderlying();
        await cUSDC.deposit(Decimal(5000));

        // Deposit collateral and leverage up first
        const depositAmount = Decimal(1_000);
        await cWMON.approveUnderlying(depositAmount);
        await cWMON.depositAsCollateral(depositAmount);

        await cWMON.approvePlugin('simple', 'positionManager');
        await cWMON.leverageUp(cUSDC, Decimal(3), 'simple', Decimal(0.01));

        const leverageAfterUp = cWMON.getLeverage();
        console.log(`Leverage after up: ${leverageAfterUp}`);
        assert(leverageAfterUp !== null, 'Leverage should not be null after leverageUp');
        assert(leverageAfterUp!.gte(Decimal(2.5)), `Expected leverage >= 2.5, got ${leverageAfterUp}`);

        // Verify previewLeverageDown returns a sane reduction amount
        const preview = cWMON.previewLeverageDown(Decimal(1.5), leverageAfterUp!);
        const collateralUsd = cWMON.getUserCollateral(true);
        const reductionUsd = preview.collateralAssetReductionUsd;

        console.log(`Collateral (USD): ${collateralUsd}`);
        console.log(`Predicted reduction (USD): ${reductionUsd}`);

        // The reduction must be less than total collateral — the old bug
        // returned the target level which was often >= current collateral
        assert(reductionUsd.lt(collateralUsd), `Reduction $${reductionUsd} should be less than total collateral $${collateralUsd}`);
        // The reduction must be positive
        assert(reductionUsd.gt(0), `Reduction should be positive, got ${reductionUsd}`);

        // Skip the minimum hold period cooldown enforced by MarketManager
        await framework.skipMarketCooldown(market.address);

        // Now actually execute leverageDown — before the fix this reverted
        await cWMON.leverageDown(cUSDC, leverageAfterUp!, Decimal(1.5), 'simple', Decimal(0.01));

        const leverageAfterDown = cWMON.getLeverage();
        console.log(`Leverage after down: ${leverageAfterDown}`);
        assert(leverageAfterDown !== null, 'Leverage should not be null after leverageDown');
        assert(leverageAfterDown!.lt(leverageAfterUp!), `Leverage should decrease: was ${leverageAfterUp}, now ${leverageAfterDown}`);
    });
});
