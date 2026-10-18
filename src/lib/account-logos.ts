import aub from "../../Bank Logos/Asia_United_Bank_logo.svg?url";
import bdo from "../../Bank Logos/BDO Unibank Logo.svg?url";
import bpi from "../../Bank Logos/BPI Logo.svg?url";
import chinabank from "../../Bank Logos/China Bank Logo.svg?url";
import eastwest from "../../Bank Logos/EastWest_Bank_2011_h-pos_logo.svg?url";
import gcash from "../../Bank Logos/GCash_logo.svg?url";
import gotyme from "../../Bank Logos/GoTyme_Bank_logo.svg?url";
import metrobank from "../../Bank Logos/Metrobank Logo.svg?url";
import pnb from "../../Bank Logos/Philippine National Bank Logo.svg?url";
import rcbc from "../../Bank Logos/RCBC_logo.svg?url";
import robinsons from "../../Bank Logos/Robinsons_Bank_logo.svg?url";
import security from "../../Bank Logos/Security Bank Logo.svg?url";
import unionbank from "../../Bank Logos/UnionBank Logo.svg?url";
import amex from "../../Card Network Logos/american-express.svg?raw";
import jcb from "../../Card Network Logos/jcb.svg?raw";
import mastercard from "../../Card Network Logos/mastercard.svg?raw";
import visa from "../../Card Network Logos/visa-alt.svg?raw";
import googlepay from "../../Card Network Logos/google-pay-alt.svg?raw";
import paypal from "../../Card Network Logos/paypal.svg?raw";

const issuers: Record<string,string> = {
  aub, "asia united bank":aub, bdo, "bdo unibank":bdo, bpi, "bank of the philippine islands":bpi,
  "china bank":chinabank, chinabank, "china banking corporation":chinabank, eastwest, "eastwest bank":eastwest,
  gcash, "go tyme":gotyme, gotyme, "gotyme bank":gotyme, metrobank, "metropolitan bank and trust company":metrobank,
  pnb, "philippine national bank":pnb, rcbc, "rizal commercial banking corporation":rcbc,
  "robinsons bank":robinsons, "security bank":security, unionbank, "union bank":unionbank, "unionbank of the philippines":unionbank,
};
const networks: Record<string,string> = Object.fromEntries(
  Object.entries({visa,mastercard,"master card":mastercard,jcb,amex,"american express":amex,"google pay":googlepay,paypal})
    .map(([name,svg]) => [name, `data:image/svg+xml,${encodeURIComponent(svg.replace(/<rect width="120" height="80"[^>]*\/>/, ""))}`]),
);
export const issuerLogo = (issuer?:string|null) => issuers[issuer?.trim().toLowerCase() ?? ""];
export const networkLogo = (network?:string|null) => networks[network?.trim().toLowerCase() ?? ""];
