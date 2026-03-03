import { config } from 'dotenv';
config({ quiet: true });
import { test, describe, before, after } from 'node:test';
import { address } from '../../src/types';
import Decimal from 'decimal.js';
import { TestFramework } from '../utils/TestFramework';
import assert from 'node:assert';


describe('SDK-004: convertTokenInputToShares single truncation', () => {
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
    });

    after(async () => {
        await framework.destroy();
    });

    // BUG-SDK-004: convertTokenInputToShares double-truncation
    // The old code did two sequential floors (decimalToBigInt then integer
    // division in virtualConvertToShares), losing up to ~2 wei.
    // The fix performs the full calculation in Decimal and floors once.
    // NOTE: Restart the anvil fork before running to avoid stale oracle data.
    test('convertTokenInputToShares is at least as accurate as two-step', async function() {
        const [ market, cWMON, cUSDC ] = await framework.getMarket('WMON | USDC');

        const totalSupply = cWMON.totalSupply;
        const totalAssets = cWMON.totalAssets;
        const decimals = cWMON.getAsset(true).decimals!;

        console.log(`totalSupply: ${totalSupply}, totalAssets: ${totalAssets}, decimals: ${decimals}`);

        // Pick a fractional amount that's likely to trigger rounding differences
        const amount = Decimal('123.456789012345678');

        // New single-truncation method
        const shares = cWMON.convertTokenInputToShares(amount);

        // Old double-truncation method for comparison
        const assetsBigInt = BigInt(Decimal(amount.toString()).mul(Decimal(10).pow(decimals)).floor().toFixed(0));
        const oldShares = (assetsBigInt * totalSupply) / totalAssets;

        // Exact reference: full precision, single floor at the end
        const exactShares = BigInt(
            Decimal(amount.toString())
                .mul(Decimal(10).pow(decimals))
                .mul(totalSupply.toString())
                .div(totalAssets.toString())
                .floor()
                .toFixed(0)
        );

        console.log(`New shares:   ${shares}`);
        console.log(`Old shares:   ${oldShares}`);
        console.log(`Exact shares: ${exactShares}`);

        // New method should match exact reference
        assert.equal(shares, exactShares, `New method ${shares} should equal exact ${exactShares}`);
        // New method should be >= old method (old could lose extra wei)
        assert(shares >= oldShares, `New shares ${shares} should be >= old shares ${oldShares}`);
        // Difference should be at most 1 wei (the single unavoidable floor)
        assert(shares - oldShares <= 1n, `Difference ${shares - oldShares} should be at most 1 wei`);
    });
});
