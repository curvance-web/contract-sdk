import fs from 'fs';
import { config } from 'dotenv'; config();
import Foundry from './tests/utils/foundry';

const contracts_used = [
    "BaseCToken",
    "BorrowableCToken",
    "IDynamicIRM",
    "MarketManagerIsolated",
    "ProtocolReader"
];

if(process.env.CONTRACT_REPO_PATH == undefined) {
    throw new Error("CONTRACT_REPO_PATH is not set in .env file. Please set it to the path of your contracts repository.");
}

for(const contractName of contracts_used) {
    const abi = Foundry.getAbi(contractName);
    fs.writeFileSync(`./src/abis/${contractName}.json`, JSON.stringify(abi, null, 2));
}
console.log('Contract ABIs have been refreshed.');

if(process.env.DEPLOYMENT_REPO_PATH == undefined) {
    throw new Error("DEPLOYMENT_REPO_PATH is not set in .env file. Please set it to the path of your deployment repository.");
}

const deployed_path = `${process.env.DEPLOYMENT_REPO_PATH}/output`;
fs.readdirSync(deployed_path).forEach(file => {
    if(file.endsWith(".json")) {
        const address_file = JSON.parse(fs.readFileSync(`${deployed_path}/${file}`, "utf-8"));
        fs.writeFileSync(`./src/chains/${file}`, JSON.stringify(address_file, null, 2));
    }
});
console.log('Deployed contract addresses have been refreshed.');