import { config } from 'dotenv';
config({ quiet: true });
import { test, describe } from 'node:test';
import assert from 'node:assert';
import FormatConverter from '../src/classes/FormatConverter';
import { Decimal } from 'decimal.js';


describe('Conversions', () => {
    test('Bigint to usd', function() {
        const test_bigint = BigInt(500e18);
        const usd_value = FormatConverter.bigIntToUsd(test_bigint);
        assert.strictEqual(usd_value.toFixed(2), '500.00');
    });

    test('Bigint to token input', function() {
        const tokens = BigInt(1000e6);
        const decimals = 6;

        const token_input = FormatConverter.bigIntToDecimal(tokens, decimals);
        assert.strictEqual(token_input.toFixed(2), '1000.00');
    });

    test('Decimal to bigint', function() {
        const token_input = new Decimal('250.75');
        const decimals = 8;

        const bigint_value = FormatConverter.decimalToBigInt(token_input, decimals);
        assert.strictEqual(bigint_value.toString(), '25075000000');
    });

    test('Percentage to BPS', function() {
        const percentage = new Decimal('0.005'); // 0.5%
        const bps = FormatConverter.percentageToBps(percentage);
        assert.strictEqual(bps.toString(), '50');
    });

    test('Percentage to BPS-WAD', function() {
        const percentage = new Decimal('0.005'); // 0.5%
        const bps_wad = FormatConverter.percentageToBpsWad(percentage);
        assert.strictEqual(bps_wad.toString(), '5000000000000000');
    });

    test('Bps to BPS-WAD', function() {
        const bps = BigInt(50);
        const bps_wad = FormatConverter.bpsToBpsWad(bps);
        assert.strictEqual(bps_wad.toString(), '5000000000000000');
    });
});