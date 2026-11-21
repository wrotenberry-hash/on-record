/**
 * The words of the address form (owner, 21 Nov 2026, after a trial reader typed his address and waited for
 * suggestions; he chose the option that needs no new key). Pure, so node's test runner loads it.
 */
/** Under the street-address field, in the owner's words. */
export const ADDRESS_PROMISE = "Your address is checked once against the U.S. Census Bureau and is never sent to an advertiser or data company.";
export const CHECK_ADDRESS = "Check address";
export const NO_SUGGESTIONS = "Suggestions do not appear as you type: finish the address, then tap Check address.";
/** The button that accepts the matched address: "Yes, show my legislators". */
export const yesLabel = (submit: string) => `Yes, ${submit.charAt(0).toLowerCase()}${submit.slice(1)}`;
