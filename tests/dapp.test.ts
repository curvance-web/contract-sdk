import { config } from 'dotenv';
config({ quiet: true });
import { test, describe, before } from 'node:test';
import assert from 'node:assert';
import { JsonRpcProvider, parseUnits } from 'ethers';
import { address, curvance_signer } from '../src/types';
import { fastForwardTime, getTestSetup, MARKET_HOLD_PERIOD_SECS, mineBlock, setNativeBalance } from './utils/helper';
import { chain_config, setupChain } from '../src/setup';
import { ChainRpcPrefix, SECONDS_PER_DAY, toBigInt, toDecimal, UINT256_MAX, UINT256_MAX_DECIMAL } from '../src/helpers';
import { CToken } from '../src/classes/CToken';
import Decimal from 'decimal.js';
import { BorrowableCToken } from '../src/classes/BorrowableCToken';
import { ERC20 } from '../src/classes/ERC20';
import { MarketToken } from '../src/classes/Market';


describe('Market Tests', () => {
    let provider: JsonRpcProvider;
    let signer: curvance_signer;
    let account: address;
    let curvance: Awaited<ReturnType<typeof setupChain>>;

    before(async () => {
        const setup = await getTestSetup(process.env.DEPLOYER_PRIVATE_KEY as string);
        provider = setup.provider;
        signer = setup.signer;
        account = signer.address as address;
        
        curvance = await setupChain(process.env.TEST_CHAIN as ChainRpcPrefix, signer, true);
    })
    
    test('[Explore] Deposit with a token using redstone pull', async() => {
        const market = curvance.markets[0]!;
        const token = market.tokens[0]!;

        const tx = await token.deposit(Decimal(0.01));
        await tx.wait();
    });

    test('[Explore] Deposit token list', async() => {
        const market = curvance.markets.find(m => m.tokens.some(t => t.canZap && t.symbol == 'cshMON'));
        const [ cshMON ] = market!.tokens as [ MarketToken, MarketToken ];

        const deposit_tokens = await cshMON.getDepositTokens();
        for(const zap of deposit_tokens) {
            const token = zap.interface;
            console.log(
                token.symbol, 
                await token.getPrice(true, true, false), 
                await token.balanceOf(account, true)
            );
        }
    });

    test('[Explore] Borrowable tokens', async () => {
        
        // Deploy some test collateral
        {
            const test = curvance.markets[1]!;
            const [ borrow, deposit ] = test.tokens as [BorrowableCToken, CToken];

            assert(deposit.symbol == 'cSWETH', `Not cSWETH: ${deposit.symbol}`);
            const before = deposit.cache.userCollateral;
            await deposit.depositAsCollateral(Decimal(0.1));
            const after = deposit.cache.userCollateral;
            assert(after > before, 'Collateral not increased');
            assert(after == await deposit.collateralPosted(), 'Cached collateral should match contract');
            await borrow.borrow(Decimal(100));
            await fastForwardTime(provider, MARKET_HOLD_PERIOD_SECS);
        }

        let count = 0;
        for(const market of curvance.markets) {
            console.log(`${market.name}`);
            const borrowable = market.getBorrowableCTokens();

            console.log(`\t Deposits: $${market.userDeposits}`);
            console.log(`\t Collateral: $${market.userCollateral}`);
            console.log(`\t Debt: $${market.userDebt}`);
            console.log(`\t Position Health: ${market.positionHealth}`);
            console.log(`\t Borrow limit: ${market.userMaxDebt}`);
            console.log(`\t Borrow remaining: ${market.userRemainingCredit}`);
            console.log(`\t Borrowable (${borrowable.eligible.length})`);
            console.log(`\t Deposit change: ${market.getUserDepositsChange('year').toFixed(18)}`);
            console.log(`\t Debt change: ${market.getUserDebtChange('year').toFixed(18)}`);
            for(const token of borrowable.eligible) {
                console.log(`\t\t ${token.symbol}`);
                console.log(`\t\t\t Liquidation price: ${token.liquidationPrice.toFixed(18)}`);
                console.log(`\t\t\t Liquidity: ${token.getLiquidity(true)}`);
            }
            console.log(`\t Ineligible (${borrowable.ineligible.length}): ${borrowable.ineligible.map(t=> `${t.symbol}`).join(', ')}`);
            console.log('----------------------------------');
            count++;
            if(count > 2) break;
        }

    });

    test('Balances', async () => {
        for(const market of curvance.markets) {
            console.log(`${market.name}`);
            
            for(const token of market.tokens) {
                console.log(`\t ${token.symbol} - ${token.name}`);
                console.log(`\t\t ${token.symbol} (share): ${token.getUserShareBalance(false)}`);
                console.log(`\t\t ${token.symbol} (asset): ${token.getUserShareBalance(false)}`);
                console.log(`\t\t ${token.asset.symbol}: ${token.getUserUnderlyingBalance(false)}`);
            }
            console.log('----------------------------------');
        }
    });

    test('[Explore] Can deposit a borrowable token', async() => {
        const market = curvance.markets[0]!;
        const token_a = market.tokens[0]!;

        assert(token_a.isBorrowable, "Token should be borrowable");
        const tx = await token_a.deposit(Decimal(0.001));
        await tx.wait();
    });

    test('[Explore] Zapping - native vault', async() => {
        const market = curvance.markets.find(m => m.tokens.some(t => t.canZap && t.symbol == 'cshMON'));
        assert(market, "Market could not be found that had zapping available");

        const zappable_token = market.tokens.find(t => t.canZap);
        assert(zappable_token, "No zappable token found");

        const balance_before = await zappable_token.balanceOf(account);
        const tx = await zappable_token.deposit(Decimal(.01), 'native-vault');
        await tx.wait();
        const balance_after = await zappable_token.balanceOf(account);
        assert(balance_after > balance_before, "Balance should increase after zap deposit");
    });

    test('[Explore] Zapping - native vault collateral', async() => {
        const market = curvance.markets.find(m => m.tokens.some(t => t.canZap && t.getCollateralCap(false) > 0n));
        assert(market, "Market could not be found that had zapping available");

        const zappable_token = market.tokens.find(t => t.canZap && t.getCollateralCap(false) > 0n);
        assert(zappable_token, "No zappable token found");

        await zappable_token.approvePlugin('native-vault', 'zapper');
        await zappable_token.getAsset(true).approve(zappable_token.address, Decimal(1));

        const balance_before = await zappable_token.balanceOf(account);
        const tx = await zappable_token.depositAsCollateral(Decimal(.01), 'native-vault');
        await tx.wait();
        const balance_after = await zappable_token.balanceOf(account);
        assert(balance_after > balance_before, "Balance should increase after zap deposit");
    });
        
    test('[Explore] Monad, Leverage', async() => {
        // Yoink some wMON from a whale and put it in curvance
        {
            const guy_with_a_ton_of_wmon = "0xFA735CcA8424e4eF30980653bf9015331d9929dB";
            await provider.send("anvil_impersonateAccount", [guy_with_a_ton_of_wmon]);
            const impersonatedSigner = await provider.getSigner(guy_with_a_ton_of_wmon);

            const imp_curvance = await setupChain(process.env.TEST_CHAIN as ChainRpcPrefix, impersonatedSigner, true);
            const shMON_market = imp_curvance.markets.find(m => m.tokens.some(t => t.symbol == 'cshMON'))!;
            const [ cshMON, cwMON ] = shMON_market.tokens as [ MarketToken, MarketToken  ];
    
            assert(`${cwMON.symbol}` == 'cWMON', `Expected cWMON for deposit, recevied: ${cwMON.symbol}`);
            const cwMON_before_balance = await cwMON.totalSupply();
            await cwMON.getAsset(true).approve(cwMON.address, null);
            const amount = Decimal(100);
            await cwMON.deposit(amount);
            const cwMON_balance = await cwMON.totalSupply();
            assert(cwMON_balance > cwMON_before_balance, `cwMON balance should be increased`);

            await provider.send("anvil_stopImpersonatingAccount", [guy_with_a_ton_of_wmon]);
        }
        
        {
            setNativeBalance(provider, account, BigInt(1000e18)); // 1000 MON
            const shMON_market = curvance.markets.find(m => m.tokens.some(t => t.symbol == 'cshMON'))!;
            const [ cshMON, cwMON ] = shMON_market.tokens as [BorrowableCToken, BorrowableCToken];

            // Deposit with zapper then withdraw so we have some shMON to use in the leverage test
            // NOTE: You can't zap & leverage in the same action so this needs to be minted first
            {
                assert(`${cshMON.symbol}` == 'cshMON', `Expected cshMON for deposit & redeem, received: ${cshMON.symbol}`);
                await cshMON.getAsset(true).approve(cshMON.address, null);
                await cshMON.deposit(Decimal(200), 'native-vault');
                await cshMON.redeem(Decimal(150));
                const balance = await cshMON.getAsset(true).balanceOf(account);
                assert(balance > cshMON.convertTokenInput(Decimal(100), false), "shMON balance cannot cover leverage");
            }

            // NOTE: This doesnt seem to actually return a good leverage amount
            // const leverage_info = await shMON_market.reader.hypotheticalLeverageOf(account, cshMON, cwMON, Decimal(100));
            // console.log(leverage_info);

            // NOTE: This caused a MulDivFailed error
            // const max_leverage = await cwMON.maxRemainingLeverage(cwMON as BorrowableCToken, 'native-vault');
            // console.log(await cwMON.totalAssets());

            const asset = cshMON.getAsset(true); 
            await asset.approve(cshMON.getPositionManager('native-vault').address, null); // Approved shMON to be transfered by PositionManager
            await cshMON.approvePlugin('native-vault', 'positionManager'); // Approved Position Manager Plugin
            const tx = await cshMON.depositAndLeverage(Decimal(10), cwMON, Decimal(5), 'native-vault');
            await tx.wait();

            await fastForwardTime(provider, MARKET_HOLD_PERIOD_SECS);
        }
    });

    test('[Faucet] Redeem all tokens', async() => {
        const market = curvance.markets[0]!;
        
        let claim_tokens: address[] = [];
        let claim_amounts: bigint[] = [];
        for(const token of market.tokens) {
            claim_tokens.push(token.asset.address);
            claim_amounts.push(BigInt(10000));
        }

        const last_claims = await curvance.faucet.multiLastClaimed(account, claim_tokens);
        const now = new Date();
        const one_day = SECONDS_PER_DAY * 1000n;
        for(const claim of last_claims) {
            if(now.getTime() < claim.getTime() + Number(one_day)) {
                console.log('Ran redeem token already -- found a claim that cannot be redeemed');
                return;
            }
        }

        const tx = await curvance.faucet.claim(claim_tokens);
        await tx.wait();
    });

    test(`[Explore] Approve all the markets with max approval amount`, async() => {
        for(const market of curvance.markets) {
            for(const token of market.tokens) {
                const asset = token.getAsset(true);
                const allownace = await asset.allowance(account, token.address);
                if(allownace >= UINT256_MAX / 2n) {
                    console.log(`Already approved ${token.symbol} -- skipping`);
                    continue;
                }

                const tx = await asset.approve(token.address, null);
                await tx.wait();
    
            }
        }
    })

    test('[Explore] Deposit raw', async() => {
        const market = curvance.markets[1]!;
        const token = market.tokens[0]!;

        const tx = await token.deposit(Decimal(100));
        await tx.wait();
    });

    test('[Explore] Deposit as collateral', async() => {
        const market = curvance.markets[1]!;
        const token = market.tokens[1]!;

        // This should be $3600
        const tx = await token.depositAsCollateral(Decimal(1));
        await tx.wait();
    })

    test('[Explore] Borrow', async() => {
        const market = curvance.markets[1]!;
        const token = market.tokens[0]! as BorrowableCToken;

        // This would be borrwing $15
        const tx = await token.borrow(Decimal(15));
        await tx.wait();

        await fastForwardTime(provider, MARKET_HOLD_PERIOD_SECS);
    });

    test('[Dashboard] Withdraw', async () => {
        const market = curvance.markets[1]!;
        const token = market.tokens[0]!;

        // Withdraw $1
        const tx = await token.redeem(Decimal(1));
        await tx.wait();
    });

    test('[Dashboard] Repay', async () => {
        const market = curvance.markets[1]!;
        const token = market.tokens[0]! as BorrowableCToken;

        // Repay $15
        const tx = await token.repay(Decimal(15));
        await tx.wait();
    });

    test('[Dashboard] Modify collateral', async () => {
        const market = curvance.markets[1]!;
        const token = market.tokens[1]! as CToken;
        const amount = Decimal(0.001);
        
        
        {
            // Deposit tokens to modify collateral on
            const tx = await token.deposit(amount);
            await tx.wait();
        }

        {
            // Modify collateral up
            const tx = await token.postCollateral(amount);
            await tx.wait();
            await fastForwardTime(provider, MARKET_HOLD_PERIOD_SECS);
        }

        {
            // Modify collateral down
            const tx = await token.removeCollateral(amount);
            await tx.wait();
        }
    });

    // TODO: [Dashboard] Modify leverage

    test('[Explore] List markets', async () => {
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


    test('[Dashboard] Portfolio values', async() => {
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

    test('[Explore] List markets without wallet connected', async () => {
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

    test(`[Explore] Preview impacts`, async () => {
        const market = curvance.markets[1]!;
        const debt_token = market.tokens[0]! as BorrowableCToken;
        const coll_token = market.tokens[1]!;
        const change_amount = Decimal(100.0);

        console.log('debt', debt_token.convertTokensToUsd(await debt_token.totalSupply()));
        console.log('collateral', coll_token.convertTokensToUsd(await coll_token.totalSupply()));

        {
            // Confirm position health calc is working correctly
            const borrow = await market.previewPositionHealthBorrow(Decimal(0));
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
            const borrow = await market.previewPositionHealthBorrow(change_amount);
            console.log('Borrow result (Position Health):', borrow);
            console.log(`Borrow change`, borrow == null ? 'N/A' : borrow.sub(market.positionHealth ?? 0).toFixed(18));
        }

        {
            // Check deposit impact health factor
            const deposit = await market.previewPositionHealthDeposit(coll_token, change_amount);
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
});