import { JsonRpcProvider } from 'ethers';
import readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
const provider = new JsonRpcProvider('http://localhost:8545');

let impersonate = false;
rl.question("Start impersonation script? (Y/n): ", async function(answer) {
    if(answer.toLowerCase() === 'y' || answer === '') {
        impersonate = true;
    }
});

rl.question("Target wallet: ", async function(test_wallet) {
    if(impersonate) {
        await provider.send("anvil_impersonateAccount", [test_wallet]);
        console.log(`Impersonated account: ${test_wallet}`);
    } else {
        await provider.send("anvil_stopImpersonatingAccount", [test_wallet]);
        console.log(`Impersonation stopped for: ${test_wallet}`);
    }

    rl.close();
});