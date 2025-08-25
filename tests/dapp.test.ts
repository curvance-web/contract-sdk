import { config } from 'dotenv';
config({ quiet: true });
import { test, describe, before } from 'node:test';
import assert from 'node:assert';
import { JsonRpcProvider, parseUnits } from 'ethers';
import { address, curvance_signer } from '../src/types';
import { fastForwardTime, getTestSetup, MARKET_HOLD_PERIOD_SECS, mineBlock } from './utils/helper';
import { setupChain } from '../src/setup';
import { ChainRpcPrefix, SECONDS_PER_DAY, toBigInt, toDecimal, UINT256_MAX, UINT256_MAX_DECIMAL } from '../src/helpers';
import { CToken } from '../src/classes/CToken';
import Decimal from 'decimal.js';
import { BorrowableCToken } from '../src/classes/BorrowableCToken';


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

        await zappable_token.approvePlugin('native-vault');
        await zappable_token.getAsset(true).approve(zappable_token.address, Decimal(1));

        const balance_before = await zappable_token.balanceOf(account);
        const tx = await zappable_token.depositAsCollateral(Decimal(.01), 'native-vault');
        await tx.wait();
        const balance_after = await zappable_token.balanceOf(account);
        assert(balance_after > balance_before, "Balance should increase after zap deposit");
    });
    
    // TODO: [Explore] Deposit as zap
    // TODO: [Explore] Deposit with leverage

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

    test('[Explore] Deposit with a token using redstone pull', async() => {
        const market = curvance.markets[0]!;
        const token = market.tokens[0]!;

        const tx = await token.deposit(Decimal(0.01));
        await tx.wait();
    });

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
                parseUnits('1000', coll_token.decimals)
            );

            console.log(lev);
        }
    });
});