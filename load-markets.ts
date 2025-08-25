import { config } from "dotenv";
import { Wallet, JsonRpcProvider, Contract, parseUnits } from "ethers";
import { setupChain } from "./src/setup";
import { address } from "./src/types";
import { toDecimal } from "./src/helpers";
import { Decimal } from "decimal.js";
import { TransactionResponse } from "ethers";
import { NonceManagerSigner } from "./tests/utils/helper";

config();
const provider = new JsonRpcProvider("https://testnet-rpc.monad.xyz");
// const provider = new JsonRpcProvider(process.env.TEST_RPC);
const baseSigner = new Wallet(process.env.DEPLOYER_PRIVATE_KEY as string, provider);

main().catch(err => console.log(err));
async function main() {
    const startingNonce = await baseSigner.getNonce('latest');
    const signer = new NonceManagerSigner(baseSigner, startingNonce);
    
    const { markets, faucet } = await setupChain("monad-testnet", signer);
    const account = signer.address as address;

    for(const market of markets) {
        for(const token of market.tokens) {
            if(!faucet.token_symbols.includes(token.asset.symbol)) {
                continue;
            }

            const asset = token.getAsset(true);
            
            const amount_in_usd = 1_000_000;
            const price = token.getPrice(true).equals(0) ? Decimal(100_000) : token.getPrice();
            const amount_in_tokens = parseUnits(BigInt((amount_in_usd / price.toNumber()).toFixed(0)).toString(), token.decimals);
            const testnet_token = new Contract(asset.address, [
                "function mint(uint256) public"
            ], signer) as Contract & { mint(amount: bigint, overrides?: any): Promise<TransactionResponse> };

            const mint = await testnet_token.mint(amount_in_tokens);
            await mint.wait();

            const allowance = await asset.allowance(account, token.address);
            if(allowance < amount_in_tokens) {
                const tx = await asset.approve(token.address, null);
                await tx.wait();
            }
            
            console.log(`Depositing $${amount_in_usd}, ${amount_in_tokens} of ${token.symbol}`);
            const deposit = await token.deposit(toDecimal(amount_in_tokens, token.decimals));
            await deposit.wait();
        }
    }
}