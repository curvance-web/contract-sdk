import { address } from "../types";
import Kuru from "./Kuru";


export default class KuruMainnet extends Kuru {
    override api = "https://ws.kuru.io/api"
    static override router = "0xb3e6778480b2E488385E8205eA05E20060B813cb" as address; // KuruFlowEntrypoint
}