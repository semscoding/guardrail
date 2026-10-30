import type { Rule } from "../types";
import { registeredSeller } from "../facts";

export const r04ApprovedSeller: Rule = {
  id: "R4",
  evaluate: (input) => {
    const { rules } = input.policy;
    const seller = registeredSeller(input);
    const approved = seller !== undefined && rules.allowedSellerIds.includes(seller.shopId);
    const euOk = !rules.requireEu || seller?.eu === true;
    const passed = approved && euOk;
    return {
      ruleId: "R4",
      passed,
      explanation: !seller
        ? `${input.proposedShopId} is not an approved seller`
        : !approved
          ? `${seller.legalName} is registered but not approved in this policy`
          : !euOk
            ? `${seller.legalName} is based in ${seller.country}, outside the EU`
            : `${seller.legalName} is approved, based in ${seller.country}`,
      expected: rules.requireEu ? "approved EU seller" : "approved seller",
      actual: seller ? `${seller.shopId} (${seller.country})` : "not in registry",
      source: "seller_registry",
    };
  },
};
