import { config } from 'dotenv';
config({ quiet: true });
import { test, describe, before, after } from 'node:test';
import { address } from '../../src/types';
import Decimal from 'decimal.js';
import { TestFramework } from '../utils/TestFramework';
import assert from 'node:assert';


describe('Replay', () => {
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

    // BUG-SDK-001: leverageUp simple — expectedShares unit mismatch
    // On a market where the collateral cToken has accrued interest
    // (exchangeRate > 1e18), leverageUp would revert because expectedShares
    // was set to a raw asset amount instead of being converted to shares
    // via convertToShares.
    // NOTE: Restart the anvil fork before running to avoid stale oracle data.
    test('leverageUp simple with exchangeRate > 1', async function() {
        const [ market, cWMON, cUSDC ] = await framework.getMarket('WMON | USDC');

        // Both sides are borrowable, so both should have accrued interest
        const exchangeRate = await cWMON.getExchangeRate();
        console.log(`cWMON exchange rate: ${exchangeRate}`);
        assert(exchangeRate > 1000000000000000000n, `Expected exchangeRate > 1e18, got ${exchangeRate}`);

        // Seed borrow liquidity
        await cUSDC.approveUnderlying();
        await cUSDC.deposit(Decimal(5000));

        // Deposit collateral
        const depositAmount = Decimal(1_000);
        await cWMON.approveUnderlying(depositAmount);
        await cWMON.depositAsCollateral(depositAmount);

        // leverageUp — before the fix this reverted when exchangeRate > 1.0
        await cWMON.approvePlugin('simple', 'positionManager');
        await cWMON.leverageUp(cUSDC, Decimal(3), 'simple', Decimal(0.01));

        console.log(`Leverage: ${cWMON.getLeverage()}`);
    });
});
