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
        // Pass cUSDC as borrow so we get newDebtInAssets back
        const preview = cWMON.previewLeverageDown(Decimal(1.5), leverageAfterUp!, cUSDC);
        const collateralUsd = cWMON.getUserCollateral(true);
        const reductionUsd = preview.collateralAssetReductionUsd;

        console.log(`Collateral (USD): ${collateralUsd}`);
        console.log(`Predicted reduction (USD): ${reductionUsd}`);

        // The reduction must be less than total collateral — the old bug
        // returned the target level which was often >= current collateral
        assert(reductionUsd.lt(collateralUsd), `Reduction $${reductionUsd} should be less than total collateral $${collateralUsd}`);
        // The reduction must be positive
        assert(reductionUsd.gt(0), `Reduction should be positive, got ${reductionUsd}`);

        // --- Verify new debt/collateral fields ---
        const debt = cWMON.market.userDebt;
        const equity = collateralUsd.sub(debt);

        console.log(`Current debt (USD): ${debt}`);
        console.log(`Equity (USD): ${equity}`);
        console.log(`newDebt (USD): ${preview.newDebt}`);
        console.log(`newDebtInAssets: ${preview.newDebtInAssets}`);
        console.log(`newCollateral (USD): ${preview.newCollateral}`);
        console.log(`newCollateralInAssets: ${preview.newCollateralInAssets}`);

        // newCollateral = equity * newLeverage
        const expectedCollateral = equity.mul(Decimal(1.5));
        const collateralDiff = preview.newCollateral.sub(expectedCollateral).abs();
        assert(collateralDiff.lt(Decimal(0.01)),
            `newCollateral ${preview.newCollateral} should ≈ equity*1.5 = ${expectedCollateral}`);

        // newDebt = newCollateral - equity = equity * (newLeverage - 1)
        const expectedDebt = equity.mul(Decimal(0.5));
        const debtDiff = preview.newDebt.sub(expectedDebt).abs();
        assert(debtDiff.lt(Decimal(0.01)),
            `newDebt ${preview.newDebt} should ≈ equity*0.5 = ${expectedDebt}`);

        // Invariant: newCollateral - newDebt = equity
        const impliedEquity = preview.newCollateral.sub(preview.newDebt);
        const equityDiff = impliedEquity.sub(equity).abs();
        assert(equityDiff.lt(Decimal(0.01)),
            `newCollateral - newDebt = ${impliedEquity} should ≈ equity = ${equity}`);

        // newDebtInAssets must be defined since we passed borrow
        assert(preview.newDebtInAssets !== undefined,
            'newDebtInAssets should be defined when borrow param is provided');
        assert(preview.newDebtInAssets!.gt(0),
            `newDebtInAssets should be positive, got ${preview.newDebtInAssets}`);

        // newCollateralInAssets must be defined and positive
        assert(preview.newCollateralInAssets.gt(0),
            `newCollateralInAssets should be positive, got ${preview.newCollateralInAssets}`);

        // newDebt should be less than current debt (we're deleveraging)
        assert(preview.newDebt.lt(debt),
            `newDebt ${preview.newDebt} should be less than current debt ${debt}`);

        // Without borrow param, newDebtInAssets should be undefined
        const previewNoBorrow = cWMON.previewLeverageDown(Decimal(1.5), leverageAfterUp!);
        assert(previewNoBorrow.newDebtInAssets === undefined,
            'newDebtInAssets should be undefined when borrow param is omitted');
        // Other fields should still be present
        assert(previewNoBorrow.newCollateral.gt(0), 'newCollateral should still work without borrow');
        assert(previewNoBorrow.newCollateralInAssets.gt(0), 'newCollateralInAssets should still work without borrow');

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
