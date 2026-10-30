import type { Rule } from "../types";

export const r07Category: Rule = {
  id: "R7",
  evaluate: ({ policy, product }) => {
    const allowed = policy.rules.allowedCategories;
    const passed = product.category !== null && allowed.includes(product.category);
    return {
      ruleId: "R7",
      passed,
      explanation:
        product.category === null
          ? "Product category could not be verified"
          : `${product.category} is ${passed ? "an allowed" : "not an allowed"} category`,
      expected: allowed.join(", "),
      actual: product.category,
      source: "product_data",
    };
  },
};
