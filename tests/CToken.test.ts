import { config } from 'dotenv';
config({ quiet: true });
import { test, describe, before } from 'node:test';
import assert from 'node:assert';
import { JsonRpcProvider } from 'ethers';

import { address, curvance_signer } from '../src/types';
import { fastForwardTime, getTestSetup, MARKET_HOLD_PERIOD_SECS, setNativeBalance, TEST_ACCOUNTS } from './utils/helper';
import { CToken } from '../src/classes/CToken';
import { setupChain } from '../src/setup';
import { ERC20 } from '../src/classes/ERC20';
import { ChainRpcPrefix } from '../src/helpers';
import { BorrowableCToken } from '../src/classes/BorrowableCToken';
import Decimal from 'decimal.js';

for(const { account_name, account_pk } of TEST_ACCOUNTS) {
    describe(`CToken Tests (${account_name})`, () => {
        let provider: JsonRpcProvider;
        let signer: curvance_signer;
        let account: address;
        let cToken: CToken;
        let borrowableCToken: BorrowableCToken;
        let marketManager: address;
        
        before(async () => {
            const setup = await getTestSetup(account_pk);
            provider = setup.provider;
            signer = setup.signer;
            account = signer.address as address;

            const { markets, faucet } = await setupChain(process.env.TEST_CHAIN as ChainRpcPrefix, signer);
            if(markets.length > 0) {
                const market = markets[1]!;
                marketManager = market.address;
                borrowableCToken = market.tokens[0]! as BorrowableCToken;
                cToken = market.tokens[1]! as CToken;
            } else {
                throw new Error("No markets found");
            }
            
            if(account_name == 'FRESH') {
                setNativeBalance(provider, account, BigInt(10e18)); // 10 ETH
                const testAssets = [borrowableCToken.asset.address, cToken.asset.address];
                const tx = await faucet.claim(testAssets);
                await tx.wait();

                const test_1 = new ERC20(signer, cToken.asset.address);
                const test_2 = new ERC20(signer, borrowableCToken.asset.address);
                for(const approve_test of [{ asset: test_1, ctoken: cToken.address }, { asset: test_2, ctoken: borrowableCToken.address }]) {
                    const tx = await approve_test.asset.approve(approve_test.ctoken, null);
                    await tx.wait();          
                }
            }
        });

        test('should get token decimals', async () => {
            const decimals = cToken.decimals;
            assert.strictEqual(typeof decimals, 'bigint');
            assert(decimals > 0, 'Decimals should be greater than 0');
        });

        test('should check token borrowable status match', async () => {
            const cantBorrow = cToken.isBorrowable;
            const canBorrow = borrowableCToken.isBorrowable;

            assert.strictEqual(typeof canBorrow, 'boolean');
            assert.strictEqual(cantBorrow, false, 'Token should NOT be borrowable');
            assert.strictEqual(canBorrow, true, 'BorrowableCToken should not be borrowable');
        });

        test('should get asset address', async () => {
            const asset = cToken.asset.address;
            assert.strictEqual(typeof asset, 'string');
            assert(asset.startsWith('0x'), 'Asset should be a valid address');
            assert.strictEqual(asset.length, 42, 'Asset address should be 42 characters');
        });

        test('should get market manager address', async () => {
            const response = await cToken.fetchMarketManagerAddr();
            assert.strictEqual(response, marketManager, 'Market manager address should match');
        });

        test('should get token symbol', async () => {
            const response = cToken.symbol
            assert(response == "cSWETH", 'Token symbol should match');
        });

        test('should get token name', async () => {
            const response = cToken.name;
            assert(response == "Curvance CurvanceTest Swell Ethereum", 'Token name should match');
        });

        test('should get total supply', async () => {
            const totalSupply = await cToken.totalSupply();
            assert.strictEqual(typeof totalSupply, 'bigint');
            assert(totalSupply >= 0n, 'Total supply should be non-negative');
        });

        test('should get total assets', async () => {
            const totalAssets = await cToken.totalAssets();
            assert.strictEqual(typeof totalAssets, 'bigint');
            assert(totalAssets >= 0n, 'Total supply should be non-negative');
        });

        test('should get exchange rate', async () => {
            const exchangeRate = await cToken.exchangeRate();
            assert.strictEqual(typeof exchangeRate, 'bigint');
            assert(exchangeRate > 0n, 'Exchange rate should be positive');
        });

        test('should convert shares to assets', async () => {
            const shares = 1000n;
            const assets = await cToken.convertToAssets(shares);
            assert.strictEqual(typeof assets, 'bigint');
            assert(assets >= 0n, 'Assets should be non-negative');
        });

        test('market collateral posted', async() => {
            const beforeCollateral = await cToken.marketCollateralPosted();
            const amount = Decimal(0.001);
            const tx = await cToken.depositAsCollateral(amount);
            await tx.wait();
            const afterCollateral = await cToken.marketCollateralPosted();
            assert((afterCollateral - cToken.convertTokenInput(amount, true)) == beforeCollateral, `Market collateral should be increased by ${amount}`);
        })

        test('should deposit 100 assets', async () => {
            const beforeBalance = await cToken.balanceOf(account);
            const amount = Decimal(0.001);
            const tx = await cToken.deposit(amount);
            await tx.wait();
            const afterBalance = await cToken.balanceOf(account);
            assert.strictEqual(afterBalance - beforeBalance, cToken.convertTokenInput(amount, true), `Balance should increase by ${amount}`);
        });

        test('max deposit', async () => {
            const maxDeposit = await cToken.maxDeposit(account);
            assert.strictEqual(typeof maxDeposit, 'bigint');
            assert(maxDeposit > 0n, 'Max deposit should be greater than 0');
        });

        test('transfer', async() => {
            const beforeBalance = await cToken.balanceOf(account);
            const amount = Decimal(.0005);

            // First, verify transfer fails immediately due to minimum hold period
            const min_hold_error = "0xf25f18b2";
            await assert.rejects(
                async () => {
                    await cToken.transfer(marketManager, amount);
                },
                (error: any) => {
                    return error.data === min_hold_error;
                },
                'Transfer should fail due to minimum hold period'
            );
            
            // Fast forward time by 20 minutes (1200 seconds)
            await fastForwardTime(provider, MARKET_HOLD_PERIOD_SECS);
            
            // Now try the transfer again - should work after time has passed
            const tx = await cToken.transfer(marketManager, amount);
            await tx.wait();
            
            const afterBalance = await cToken.balanceOf(account);
            assert.strictEqual(beforeBalance - afterBalance, cToken.convertTokenInput(amount, true), `Balance should decrease by ${amount} after successful transfer`);
        });

        test('redeem collteral', async() => {
            const amount = Decimal(0.001);
            {
                const tx = await cToken.depositAsCollateral(amount);
                await tx.wait();
            }
            
            {
                await fastForwardTime(provider, MARKET_HOLD_PERIOD_SECS);
                const beforeCollateral = await cToken.collateralPosted(account);
                const tx = await cToken.redeemCollateral(amount);
                await tx.wait();
                const afterCollateral = await cToken.collateralPosted(account);
                assert.strictEqual(beforeCollateral - cToken.convertTokenInput(amount, true), afterCollateral, `Collateral should decrease by ${amount} after successful redeem`);
            }
        });

        test('modify collateral from deposit', async() => {
            {
                let tx = await cToken.deposit(Decimal(0.003));
                await tx.wait();
                const beforeCollateral = await cToken.collateralPosted(account);

                await fastForwardTime(provider, 10);

                const amount = Decimal(0.001);
                tx = await cToken.postCollateral(amount);
                await tx.wait();
                const afterCollateral = await cToken.collateralPosted(account);
                assert.strictEqual(beforeCollateral + cToken.convertTokenInput(amount, true), afterCollateral, `Collateral should increase by ${amount} after deposit`);
            }

            await fastForwardTime(provider, MARKET_HOLD_PERIOD_SECS);

            {
                const beforeBalance = await cToken.balanceOf(account);
                const beforeCollateral = await cToken.collateralPosted(account);
                
                const amount = Decimal(0.001);
                const tx = await cToken.removeCollateral(amount);
                await tx.wait();

                const afterBalance = await cToken.balanceOf(account);
                const afterCollateral = await cToken.collateralPosted(account);
                assert(afterBalance == beforeBalance, 'Balance should not of moved');
                assert.strictEqual(beforeCollateral - cToken.convertTokenInput(amount, true), afterCollateral, `Collateral have decreased by ${amount}`);
            }

            {
                const beforeBalance = await cToken.balanceOf(account);
                const beforeCollateral = await cToken.collateralPosted(account);

                const amount = Decimal(0.001);
                const shares = cToken.convertTokenInput(amount, true);
                const tx = await cToken.withdrawCollateral(amount);
                await tx.wait();

                const afterBalance = await cToken.balanceOf(account);
                const afterCollateral = await cToken.collateralPosted(account);
                assert.strictEqual(beforeBalance - shares, afterBalance, `Balance should be reduced by ${amount}`);
                assert.strictEqual(beforeCollateral - shares, afterCollateral, `Collateral have decreased by ${amount}`);
            }

            {
                const asset = cToken.asset.address;
                const underlying = new ERC20(signer, asset);
                const beforeUnderlyingBalance = await underlying.balanceOf(account);

                const amount = Decimal(0.001);
                const tx = await cToken.redeem(amount, account, account);
                await tx.wait();

                const afterUnderlyingBalance = await underlying.balanceOf(account);
                assert.strictEqual(beforeUnderlyingBalance + cToken.convertTokenInput(amount), afterUnderlyingBalance, `Underlying balance should increase by ${amount} after redeem`);
            }
        });

        test('collateral posted', async() => {
            const snapshot = await cToken.getSnapshot(account);
            assert(snapshot.asset == cToken.address);
            assert(snapshot.decimals == cToken.decimals);
            assert(snapshot.isCollateral == true);
            assert(snapshot.debtBalance == 0n);
            
            const snapshot2 = await borrowableCToken.getSnapshot(account);
            const outstandingDebt = await borrowableCToken.debtBalance(account)
            assert(snapshot2.isCollateral == outstandingDebt > 0 ? false : true);
            assert(snapshot2.debtBalance == outstandingDebt);
        });
    });
}
