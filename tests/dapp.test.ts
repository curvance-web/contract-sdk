import { config } from 'dotenv';
config({ quiet: true });
import { test, describe, before } from 'node:test';
import assert from 'node:assert';
import { JsonRpcProvider, Wallet } from 'ethers';
import { address, curvance_signer } from '../src/types';
import { fastForwardTime, getTestSetup, MARKET_HOLD_PERIOD_SECS, setNativeBalance } from './utils/helper';
import { chain_config, setupChain } from '../src/setup';
import { ChainRpcPrefix, SECONDS_PER_DAY, toBigInt, toDecimal } from '../src/helpers';
import { CToken, ZapperInstructions } from '../src/classes/CToken';
import Decimal from 'decimal.js';
import { BorrowableCToken } from '../src/classes/BorrowableCToken';
import { ERC20 } from '../src/classes/ERC20';
import { Market, MarketToken } from '../src/classes/Market';


describe('Market Tests', () => {
    let provider: JsonRpcProvider;
    let signer: curvance_signer;
    let account: address;
    let curvance: Awaited<ReturnType<typeof setupChain>>;
    let market: Market;
    let cWMON: BorrowableCToken;
    let cAprMON: CToken;
    let backup : { shMON: BorrowableCToken; cWMON: BorrowableCToken, backup_market: Market };

    before(async () => {
        const setup = await getTestSetup(process.env.DEPLOYER_PRIVATE_KEY as string);
        provider = setup.provider;
        signer = setup.signer;
        account = signer.address as address;

        await setNativeBalance(provider, account, BigInt(1_000e18)); // 1,000 MON

        curvance = await setupChain(process.env.TEST_CHAIN as ChainRpcPrefix, signer, true);

        // Grab the test market & tokens we wanna use
        market = curvance.markets[0]!;
        const tokens = market.tokens as [ MarketToken, BorrowableCToken ];
        cAprMON = tokens[0] as CToken;
        cWMON = tokens[1] as BorrowableCToken;

        
        const other_market = curvance.markets[1]!;
        const other_tokens = other_market.tokens as [ MarketToken, BorrowableCToken ];
        backup = {
            shMON: other_tokens[0]! as BorrowableCToken,
            cWMON: other_tokens[1]! as BorrowableCToken,
            backup_market: other_market
        };

        await cAprMON.approveUnderlying();
        await cWMON.approveUnderlying();
        await backup.shMON.approveUnderlying();
        await backup.cWMON.approveUnderlying();

        // Setup liquidity in the market
        if(process.env.SUPPLY_TEST_LIQUIDITY) {
            // Yoink some wMON from a whale and put it in curvance
            {
                const guy_with_a_ton_of_wmon = "0xFA735CcA8424e4eF30980653bf9015331d9929dB";
                await provider.send("anvil_impersonateAccount", [guy_with_a_ton_of_wmon]);
                const impersonatedSigner = await provider.getSigner(guy_with_a_ton_of_wmon);

                const wmon = new ERC20(impersonatedSigner, chain_config['monad-testnet'].wrapped_native);
                await wmon.transfer(account, Decimal(1000)); // 1000 wMON to our test account

                const impCurvance = await setupChain(process.env.TEST_CHAIN as ChainRpcPrefix, impersonatedSigner, true);
                for(const market of impCurvance.markets) {
                    for(const token of market.tokens) {
                        if(token.symbol == 'cWMON') {
                            console.log(`Depositing 250 wMON into ${market.name}`);
                            await token.approveUnderlying();
                            const tx = await token.deposit(Decimal(250));
                            await tx.wait();
                        }
                    }
                }

                await provider.send("anvil_stopImpersonatingAccount", [guy_with_a_ton_of_wmon]);
            }

            // Deploy a lot of LST tokens into market
            {
                const random_wallet = Wallet.createRandom();
                const wallet = await getTestSetup(random_wallet.privateKey);
                const ranCurvance = await setupChain(process.env.TEST_CHAIN as ChainRpcPrefix, wallet.signer, true);
                await setNativeBalance(provider, wallet.signer.address, BigInt(10_000e18)); // 10,000 MON

                for(const market of ranCurvance.markets) {
                    for(const token of market.tokens) {
                        if(token.canZap) {
                            console.log(`Depositing 250 MON as ${token.symbol} into ${market.name}`);
                            await token.approveUnderlying();
                            const tx = await token.deposit(Decimal(250), 'native-vault'); // 250 MON into each vault token
                            await tx.wait();
                        }
                    }
                }
            }
        }
    })

    test('[Explore] Zapping wMON', async() => {
        {
            // Zap cAprMon then withdraw it for raw aprMON
            await cAprMON.deposit(Decimal(2), 'native-vault');
            await fastForwardTime(provider, MARKET_HOLD_PERIOD_SECS);
            await cAprMON.redeem(Decimal(2));
        }

        {
            // Test simple zapper
            const { shMON, cWMON } = backup;

            const zapInstructions: ZapperInstructions = {
                type: 'simple',
                inputToken: shMON.asset.address
            };
            await cWMON.approveZapAsset(zapInstructions, Decimal(1));
            await cWMON.approvePlugin('simple', 'zapper');
            await cWMON.deposit(Decimal(1), zapInstructions);

            const list = await cWMON.getDepositTokens();
            for(const item of list) {
                if(item.type === 'simple') {
                    console.log(`Testing simple zap quote for ${item.interface.symbol}`);
                    try {
                        console.log(await item.quote!(item.interface.address, cWMON.asset.address, Decimal(1)));
                    } catch(e) {
                        console.error(`Failed to get quote for ${item.interface.symbol} - Address: ${item.interface.address}:`, e);
                    }
    
                    break;
                }
            }
        }

    });

    test('[Explore] Deposit token list', async() => {
        const deposit_tokens = await cAprMON.getDepositTokens();
        let type_list = deposit_tokens.map(t => t.type);
        assert(type_list.includes('native-vault'), "Should include native-vault");
        assert(type_list.includes('none'), "Should have original asset");
    });

    test('[Explore] Borrowable token & check state', async () => {

        // Ensure market datas been updated
        // Note: this one doesnt really work unless its fresh, existing deployment will break this
        // const borrowable_before = market.getBorrowableCTokens();
        // assert(borrowable_before.eligible.length == 0, "Should have no eligible borrowable tokens before activity");

        // Deploy some test collateral
        const before = cAprMON.cache.userCollateral;
        await cAprMON.approvePlugin('native-vault', 'zapper');
        await cAprMON.depositAsCollateral(Decimal(3), 'native-vault');
        const after = cAprMON.cache.userCollateral;
        assert(after > before, 'Collateral not increased');
        assert(after == await cAprMON.collateralPosted(), 'Cached collateral should match contract');

        // Borrow some tokens
        {
            assert(cWMON.isBorrowable, "Token should be borrowable");
            const debt_before = cWMON.getUserDebt(false);
            const tx = await cWMON.borrow(Decimal(1));
            await tx.wait();
            await fastForwardTime(provider, Number(SECONDS_PER_DAY * 7n));
            await market.reloadUserData(account);
            await market.reloadMarketData();
            const debt_after = cWMON.getUserDebt(false);
            assert(debt_after > debt_before, `Debt not increased ${debt_after} > ${debt_before}`);
        }

        // Ensure market datas been updated
        assert(market.userDeposits.greaterThan(0), "User deposits should be greater than 0");
        assert(market.positionHealth!.greaterThan(0), "Position health should be greater than 0");
        assert(market.userMaxDebt.greaterThan(0), "User max debt should be greater than 0");
        assert(market.userRemainingCredit.greaterThan(0), "User remaining credit should be greater than 0");
        assert(market.getBorrowableCTokens().eligible.length > 0, "Should have eligible borrowable tokens");
        assert(market.getUserDebtChange('year').greaterThan(0), "Debt change should be greater than 0");

        // Ensure some token datas been updated
        assert(cWMON.liquidationPrice!.greaterThan(0), "Liquidation price should be greater than 0");
        assert(cWMON.getLiquidity(true).greaterThan(0), "Liquidity should be greater than 0");
    });

    test('[Explore] Balances', async () => {
        await market.reloadUserData(account);
        await market.reloadMarketData();
        const shares = cAprMON.getUserShareBalance(false);
        const assets = cAprMON.getUserAssetBalance(false);
        const underlying = cAprMON.getUserUnderlyingBalance(false);
        assert(shares.greaterThan(0), "Share balance should be greater than 0");
        assert(assets.greaterThan(0), "Asset balance should be greater than 0");
        assert(underlying.greaterThan(0), "Underlying balance should be greater than 0");

        const assets_as_bigint = toBigInt(assets, cAprMON.asset.decimals);
        const shares_as_bigint = toBigInt(shares, cAprMON.decimals);
        const conversion = await cAprMON.convertToShares(assets_as_bigint);

        // Allow for 1 wei difference due to rounding
        const diff = conversion > shares_as_bigint ? conversion - shares_as_bigint : shares_as_bigint - conversion;
        assert(diff <= 1n, `Convert to shares should match within 1 wei. Difference: ${diff} wei (${conversion} vs ${shares_as_bigint})`);
    });

    test('[Explore] Zapping - native vault', async() => {
        assert(cAprMON.canZap, "Token should be zappable");

        const balance_before = await cAprMON.balanceOf(account);
        const tx = await cAprMON.deposit(Decimal(.01), 'native-vault');
        await tx.wait();
        const balance_after = await cAprMON.balanceOf(account);
        assert(balance_after > balance_before, "Balance should increase after zap deposit");
    });

    test('[Explore] Zapping - native vault collateral', async() => {
        assert(cAprMON.canZap, "Token should be zappable");

        await cAprMON.approvePlugin('native-vault', 'zapper');
        await cAprMON.getAsset(true).approve(cAprMON.address, Decimal(1));

        const balance_before = await cAprMON.balanceOf(account);
        const tx = await cAprMON.depositAsCollateral(Decimal(.01), 'native-vault');
        await tx.wait();
        const balance_after = await cAprMON.balanceOf(account);
        assert(balance_after > balance_before, "Balance should increase after zap deposit");
    });

    test('[Explore] Monad, Leverage', async() => {
        const { shMON, cWMON, backup_market } = backup;
        // Deposit with zapper then withdraw so we have some shMON to use in the leverage test
        // NOTE: You can't zap & leverage in the same action so this needs to be minted first
        {
            await shMON.deposit(Decimal(2), 'native-vault');
            await fastForwardTime(provider, MARKET_HOLD_PERIOD_SECS);
            await shMON.redeem(Decimal(2));
            const balance = await shMON.getAsset(true).balanceOf(account);
            assert(balance > shMON.convertTokenInput(Decimal(2), false), "shMON balance cannot cover leverage");
        }

        // Deposit and leverage
        {
            const before = await shMON.balanceOf(account);
            const asset = shMON.getAsset(true);
            await asset.approve(shMON.getPositionManager('native-vault').address, null); // Approved shMON to be transfered by PositionManager
            await shMON.approvePlugin('native-vault', 'positionManager'); // Approved Position Manager Plugin
            const tx = await shMON.depositAndLeverage(Decimal(2), cWMON, Decimal(1), 'native-vault');
            await tx.wait();
            const after = await shMON.balanceOf(account);
            assert(before + shMON.convertTokenInput(Decimal(3), false) >= after, "Balance should of increased by 3 (leveraging 2 deposit + 1 borrow)");
            await fastForwardTime(provider, MARKET_HOLD_PERIOD_SECS);
        }

        // Leverage up a bit more
        {
            const before = await shMON.balanceOf(account);
            const tx = await shMON.leverageUp(cWMON, Decimal(0.5), 'native-vault');
            await tx.wait();
            const after = await shMON.balanceOf(account);
            assert(before < after, "Balance should of increased by 0.5 (leveraging 0.5 borrow)");
        }

        // Leverage down
        {
            // Simulate user dragging down current leverage by 25%
            const leverageInfo = await market.reader.hypotheticalLeverageOf(account, shMON, cWMON, Decimal(0));
            const newMultiplier = leverageInfo.currentLeverage.sub(1).mul(0.25).add(1); // Reduce leverage by 25%

            await fastForwardTime(provider, MARKET_HOLD_PERIOD_SECS);
            await shMON.approvePlugin('simple', 'positionManager');
            const tx = await shMON.leverageDown(cWMON, leverageInfo.currentLeverage, newMultiplier, 'simple', Decimal(0.1));
            await tx.wait();

            const newLeverageInfo = await market.reader.hypotheticalLeverageOf(account, shMON, cWMON, Decimal(0));
            assert(newLeverageInfo.currentLeverage < leverageInfo.currentLeverage, "Leverage should be lower after leverage down");
        }
    });

    test(`[Explore] Check allowances`, async() => {
        const { shMON } = backup;
        assert(await cAprMON.getAllowance(cAprMON.address) > 0n, "Underlying should be approved more than 0");
        assert(await shMON.getAllowance(shMON.getPositionManager('native-vault').address) > 0n, "Position Manager should be approved more than 0");
    })

    test('[Explore] Deposit raw', async() => {
        {
            // Grab some cAprMon with a zap
            await cAprMON.approveUnderlying();
            await cAprMON.deposit(Decimal(1), 'native-vault');
            await fastForwardTime(provider, MARKET_HOLD_PERIOD_SECS);
            await cAprMON.redeem(Decimal(1));
        }

        const tx = await cAprMON.deposit(Decimal(1));
        await tx.wait();
    });

    test('[Explore] Deposit raw as collateral', async() => {
        {
            // Grab some cAprMon with a zap
            await cAprMON.deposit(Decimal(1), 'native-vault');
            await fastForwardTime(provider, MARKET_HOLD_PERIOD_SECS);
            await cAprMON.redeem(Decimal(1));
        }

        const tx = await cAprMON.depositAsCollateral(Decimal(1));
        await tx.wait();
    });

    test('[Dashboard] Repay', async () => {
        {
            // Setup borrowed amount
            await cWMON.borrow(Decimal(1));
            await fastForwardTime(provider, MARKET_HOLD_PERIOD_SECS);
        }

        const tx = await cWMON.repay(Decimal(1));
        await tx.wait();
    });

    test('[Dashboard] Modify collateral', async () => {
        const amount = Decimal(0.1);

        await cAprMON.deposit(amount);
        let before_coll = cAprMON.getUserCollateral(false);
        await cAprMON.postCollateral(amount);

        let after_coll = cAprMON.getUserCollateral(false);

        assert(after_coll.greaterThan(before_coll), `Collateral not increased correctly (1), Expected ${after_coll.toFixed(18)} > ${before_coll.toFixed(18)}`);
        before_coll = after_coll;
        await fastForwardTime(provider, MARKET_HOLD_PERIOD_SECS);

        await cAprMON.removeCollateral(amount);
        after_coll = cAprMON.getUserCollateral(false);
        assert(after_coll.lessThan(before_coll), `Collateral not decreased correctly (2), Expected ${after_coll.toFixed(18)} < ${before_coll.toFixed(18)}`);
    });

    // TODO: [Dashboard] Modify leverage
    test('[info][Explore] List markets', async () => {
        // Refresh cached data from previous actions
        curvance = await setupChain(process.env.TEST_CHAIN as ChainRpcPrefix, signer);

        const markets = curvance.markets;
        const market = markets[0]!; // All tests are using this market
        console.log(`Market: ${market.name} (${market.address}):
            TVL - ${market.tvl.toFixed(18)}
            LTV - ${market.ltv}
            Your Deposits: ${market.userDeposits}
            Available Collateral: ${market.userMaxDebt}
            Can borrow: ${market.hasBorrowing()}
            Highest APY: ${market.highestApy()}
            Collateral: ${market.userCollateral}
            Debt: ${market.userDebt}
            Position Health: ${market.positionHealth}
        `);

        for(const token of market.tokens) {
            console.log(`
                Symbol: ${token.symbol} | Token: ${token.name} (${token.address}):
                \tUnderlying: ${toDecimal(await (token.getAsset(true)).balanceOf(account), token.decimals)}
                \tBalance: ${toDecimal(await token.balanceOf(account), token.decimals)}
                \tCollateral Cap: ${token.getCollateralCap(true)}
                \tDebt Cap: ${token.getDebtCap(true)}
                \tIs borrowable: ${token.isBorrowable}
                \tPrice: ${token.getPrice()}
                \tDecimal: ${token.decimals}
                \tAPY: ${token.getApy()}
            `);
        }
    });


    test('[info][Dashboard] Portfolio values', async() => {
        let net = {
            total: Decimal(0),
            change: Decimal(0)
        };

        let deposits = {
            total: Decimal(0),
            change: Decimal(0)
        };

        let debt = {
            total: Decimal(0),
            change: Decimal(0)
        }

        for(const market of curvance.markets) {
            net.total = net.total.add(market.userNet);
            net.change = net.change.add(market.getUserNetChange('day'));
            deposits.total = deposits.total.add(market.userDeposits);
            deposits.change = deposits.change.add(market.getUserDepositsChange('day'));
            debt.total = debt.total.add(market.userDebt);
            debt.change = debt.change.add(market.getUserDebtChange('day'));
        }

        console.log(`Net Total: ${net.total.toFixed(18)}`);
        console.log(`Net change: ${net.change.toFixed(18)}`);
        console.log(`Deposit Total: ${deposits.total.toFixed(18)}`);
        console.log(`Deposit change: ${deposits.change.toFixed(18)}`);
        console.log(`Debt Total: ${debt.total.toFixed(18)}`);
        console.log(`Debt change: ${debt.change.toFixed(18)}`);
    });

    test('[info][Explore] List markets without wallet connected', async () => {
        const readonly_provider = new JsonRpcProvider(process.env.TEST_RPC);
        const test = await setupChain(process.env.TEST_CHAIN as ChainRpcPrefix, readonly_provider);

        const signed_market = curvance.markets[1]!;
        const unsigned_market = test.markets[1]!; // All tests are using this market
        assert(unsigned_market.ltv == signed_market.ltv, 'LTV should be the same');
        assert(unsigned_market.name == signed_market.name, 'Makert names should be the same');

        for(const token_idx in signed_market.tokens) {
            const signed_market_token = signed_market.tokens[token_idx]!;
            const unsigned_market_token = unsigned_market.tokens[token_idx]!;

            assert(unsigned_market_token.getDebtCap(true).equals(signed_market_token.getDebtCap(true)), `Debt Cap should be the same`);
            assert(unsigned_market_token.name == signed_market_token.name, `Token names should be the same`);
        }
    });

    test(`[info][Explore] Preview impacts`, async () => {
        const market = curvance.markets[1]!;
        const debt_token = market.tokens[0]! as BorrowableCToken;
        const coll_token = market.tokens[1]!;

        console.log('deposits', market.userDeposits);
        console.log('debt', market.userDebt);
        console.log('collateral', market.userCollateral);
        console.log('position health', market.positionHealth);
        console.log('Debt token symbol', debt_token.symbol);
        console.log('Coll token symbol', coll_token.symbol);

        {
            // Confirm position health calc is working correctly
            const borrow = await market.previewPositionHealthBorrow(debt_token, Decimal(0));
            assert(
                market.positionHealth == null ? market.positionHealth == borrow : borrow?.equals(market.positionHealth),
                `Position health should match with 0 change. Compared ${borrow} to ${market.positionHealth}`
            );
            const deposit = await market.previewPositionHealthDeposit(coll_token, Decimal(0));
            assert(
                market.positionHealth == null ? market.positionHealth == deposit : deposit?.equals(market.positionHealth!),
                `Position health should match with 0 change. Compared ${deposit} to ${market.positionHealth}`
            );
        }

        {
            // Check borrow impact health factor
            const borrow = await market.previewPositionHealthBorrow(debt_token, Decimal(10));
            console.log('Borrow result (Position Health):', borrow);
            console.log(`Borrow change`, borrow == null ? 'N/A' : borrow.sub(market.positionHealth ?? 0).toFixed(18));
        }

        {
            // Check deposit impact health factor
            const deposit = await market.previewPositionHealthDeposit(coll_token, Decimal(0.5));
            console.log(`Deposit result (Position Health):`, deposit);
            console.log('Deposit change', deposit == null ? 'N/A' : deposit.sub(market.positionHealth ?? 0).toFixed(18));
        }

        {
            // Check asset impact
            const asset = await market.previewAssetImpact(account, coll_token, debt_token, Decimal(50_000), Decimal(5_000), 'day');
            console.log(`Asset impact result:`, asset);
        }

        {
            // Check max leverage
            const lev = await market.reader.hypotheticalLeverageOf(
                account,
                coll_token,
                debt_token,
                Decimal(1000)
            );

            console.log(lev);
        }
    });

    test('[info] Hypothetical Redeem, Borrow', async () => {
        {
            const data = await cAprMON.hypotheticalRedemptionOf(Decimal(1));
            console.log(data);
        }

        {
            const data = await cWMON.hypotheticalBorrowOf(Decimal(1));
            console.log(data);
        }
    });

    test('[Explore] Weird number inputs', async() => {
        const amounts = [
            Decimal(0.000000031802381055),
            Decimal(0.000000073093595879)
        ];

        for(const amount of amounts) {
            const tokens = cAprMON.convertTokenInput(amount);
            assert(typeof tokens === 'bigint');
        }

        await cWMON.repay(amounts[0]!);
    });

    test('[Dashboard] Find max withdraw', async () => {
        const maxWithdraw = await cAprMON.maxRedemption();
        assert(maxWithdraw.greaterThan(0), "Max withdraw should be greater than 0");
    });

    test('[Dashboard] Redeem position health update', async() => {
        const before_ph = market.positionHealth;
        const new_ph = await market.previewPositionHealthRedeem(cAprMON, Decimal(1));
        assert(new_ph! < before_ph!, "Position health should increase after redeeming");
    });

    test('[Dashboard] Use 0 to repay max', async () => {
        // Setup position
        await cAprMON.approvePlugin('native-vault', 'zapper');
        await cAprMON.depositAsCollateral(Decimal(1), 'native-vault');
        await cWMON.borrow(Decimal(.01));
        await fastForwardTime(provider, MARKET_HOLD_PERIOD_SECS);

        // Repay
        const before = await cWMON.debtBalance(account);
        await cWMON.repay(Decimal(0));
        const after = await cWMON.debtBalance(account);
        assert(before > 0n, "Should of had some debt before repay");
        assert(after == 0n, "Should of repaid all debt with 0 input");
        await fastForwardTime(provider, MARKET_HOLD_PERIOD_SECS);
    });

    test('Conversions', async () => {

        {
            // Checks that shares can be passed into conversion & back out to be the exact same amount
            const token_amount = await cAprMON.balanceOf(account);
            const tokens_to_dollars = cAprMON.convertTokensToUsd(token_amount, false);
            const dollars_to_token = cAprMON.convertUsdToTokens(tokens_to_dollars, false, false);
            const formatted_tokens = cAprMON.convertBigInt(token_amount, false);
            const diff = formatted_tokens.sub(dollars_to_token);
            assert(diff.equals(0), `Difference between formatted tokens & dollars_to_token should be zero but is: ${diff.toFixed(18)}`);
            assert(formatted_tokens.equals(dollars_to_token), "When converted from Token -> USD -> Token. Token amount before & after should match.");
        }

        {
            // Check that this same thing works when using shares balance
            const share_amount = cAprMON.getUserShareBalance(false);
            const dollars_in_shares = cAprMON.getUserShareBalance(true);
            const dollars_to_shares = cAprMON.convertUsdToTokens(dollars_in_shares, false);
            assert(share_amount.equals(dollars_to_shares), "When converted from Shares -> USD -> Shares. Share amount before & after should match.");
        }

        {
            // Check that this same thing works when using asset balance
            const asset_amount = cAprMON.getUserAssetBalance(false);
            const dollars_in_assets = cAprMON.getUserAssetBalance(true);
            const dollars_to_assets = cAprMON.convertUsdToTokens(dollars_in_assets, true);
            assert(asset_amount.equals(dollars_to_assets), "When converted from Assets -> USD -> Assets. Asset amount before & after should match.");
        }
    });

    test('[Dashboard] Max withdraw', async() => {
        const max = await cAprMON.maxRedemption();
        await cAprMON.redeem(max);
    });
});