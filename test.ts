import Kuru from "./src/classes/Kuru";

const wallet = "0xe2165a834F93C39483123Ac31533780b9c679ed4";
const wmon = "0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701";
const gmon = "0xaEef2f6B429Cb59C9B2D7bB2141ADa993E8571c3";

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

async function main() {
    const quote = await Kuru.quote(wallet, wmon, gmon, "1000000000000000000");
    console.log("Quote:", quote);
    const quote2 = await Kuru.quote(wallet, wmon, gmon, "2000000000000000000");
    console.log("Quote2:", quote);
}