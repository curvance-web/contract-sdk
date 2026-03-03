import { config } from 'dotenv';
config({ quiet: true });
import { test, describe, before, after } from 'node:test';
import { address } from '../../src/types';
import Decimal from 'decimal.js';
import { TestFramework } from '../utils/TestFramework';
import assert from 'node:assert';


describe('SDK-003: Zap quote uses output token decimals', () => {
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

    // BUG-SDK-003: getAvailableTokens quote closure converted output amounts
    // using the INPUT token's decimals instead of the OUTPUT token's decimals.
    // For cross-decimal swaps (e.g. MON 18dec → USDC 6dec), the formatted
    // output was off by 10^12.
    // NOTE: Restart the anvil fork before running to avoid stale oracle data.
    test('cross-decimal zap quote formats output with correct decimals', async function() {
        const [ market, cWMON, cUSDC ] = await framework.getMarket('WMON | USDC');

        const wmonAddress = cWMON.getAsset(true).address;
        const usdcAddress = cUSDC.getAsset(true).address;
        const wmonDecimals = cWMON.getAsset(true).decimals!;
        const usdcDecimals = cUSDC.getAsset(true).decimals!;

        console.log(`WMON decimals: ${wmonDecimals}, USDC decimals: ${usdcDecimals}`);
        assert.notEqual(wmonDecimals, usdcDecimals, 'Test requires tokens with different decimals');

        // Get zap tokens and find a quote function
        const zapTokens = await framework.curvance.dexAgg.getAvailableTokens(framework.signer);
        const wmonZap = zapTokens.find(z => z.interface.address.toLowerCase() === wmonAddress.toLowerCase());
        assert(wmonZap, `Could not find zap token for WMON (${wmonAddress})`);
        assert(wmonZap!.quote, `Zap token for WMON has no quote function`);

        // Quote: swap 1 WMON → USDC
        const result = await wmonZap!.quote!(wmonAddress, usdcAddress, Decimal(1), Decimal(0.01));

        console.log(`Raw output: ${result.output_raw}`);
        console.log(`Formatted output: ${result.output}`);
        console.log(`Formatted minOut: ${result.minOut}`);

        // The formatted output should be in a sane USDC range.
        // 1 MON at any reasonable price should yield between 0.001 and 1,000,000 USDC.
        // Before the fix, using 18 decimals on a 6-decimal value produced
        // a number ~10^12x too small (e.g. 0.000000000001 instead of 1.0).
        assert(result.output.gt(Decimal(0.001)), `Output ${result.output} is suspiciously small — likely using wrong decimals`);
        assert(result.output.lt(Decimal(1_000_000)), `Output ${result.output} is suspiciously large — likely using wrong decimals`);

        // Verify consistency: formatted value should equal raw / 10^outputDecimals
        const expectedOutput = Decimal(result.output_raw.toString()).div(Decimal(10).pow(usdcDecimals));
        assert(result.output.eq(expectedOutput), `Formatted output ${result.output} does not match raw/${10**Number(usdcDecimals)} = ${expectedOutput}`);

        const expectedMinOut = Decimal(result.minOut_raw.toString()).div(Decimal(10).pow(usdcDecimals));
        assert(result.minOut.eq(expectedMinOut), `Formatted minOut ${result.minOut} does not match raw/${10**Number(usdcDecimals)} = ${expectedMinOut}`);
    });
});
