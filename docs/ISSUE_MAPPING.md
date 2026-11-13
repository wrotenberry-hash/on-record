# Issue mapping

How federal bills are sorted into On Record's 14 issue categories. The
source of truth is the `category_mappings` table, seeded from
`lib/federal/categories.ts`; seeding only inserts rows that are missing, so a
row edited or switched off in the table stays that way. The live rules are
also shown on the Issues page.

Congress.gov gives each bill one **policy area** (32 possible) and a list of
**legislative subjects**. A bill goes under every category one of its labels
matches. The rules use only those labels: never the sponsor, party or vote.

| Category | Congress.gov label | Kind | Match | Note |
| --- | --- | --- | --- | --- |
| Health care | Health | Policy area | exact |  |
| Taxes | Taxation | Policy area | exact |  |
| Economy & jobs | Economics and Public Finance | Policy area | exact | Budget, debt, appropriations |
| Economy & jobs | Commerce | Policy area | exact |  |
| Economy & jobs | Labor and Employment | Policy area | exact |  |
| Economy & jobs | Finance and Financial Sector | Policy area | exact |  |
| Economy & jobs | Foreign Trade and International Finance | Policy area | exact | Tariffs and trade |
| Economy & jobs | Transportation and Public Works | Policy area | exact | Infrastructure |
| Cost of living & housing | Housing and Community Development | Policy area | exact |  |
| Cost of living & housing | Social Welfare | Policy area | exact | Benefits such as SNAP and Social Security |
| Education | Education | Policy area | exact |  |
| Immigration | Immigration | Policy area | exact |  |
| Public safety & crime | Crime and Law Enforcement | Policy area | exact |  |
| Public safety & crime | Emergency Management | Policy area | exact | Disasters and emergency response |
| Energy & environment | Energy | Policy area | exact |  |
| Energy & environment | Environmental Protection | Policy area | exact |  |
| Energy & environment | Public Lands and Natural Resources | Policy area | exact |  |
| Energy & environment | Water Resources Development | Policy area | exact |  |
| Defense & veterans | Armed Forces and National Security | Policy area | exact |  |
| Elections & government | Government Operations and Politics | Policy area | exact |  |
| Elections & government | Congress | Policy area | exact |  |
| Tech & privacy | Science, Technology, Communications | Policy area | exact |  |
| Agriculture & rural | Agriculture and Food | Policy area | exact |  |
| Guns | Firearms and explosives | Subject | exact |  |
| Abortion | Abortion | Subject | exact |  |
| Defense & veterans | Veterans' | Subject | contains | Veterans' benefits, medical care, education and so on |
| Tech & privacy | Right of privacy | Subject | exact |  |
| Elections & government | Elections, voting, political campaign regulation | Subject | exact |  |
| Agriculture & rural | Rural conditions and development | Subject | exact |  |
| Health care | Prescription drugs | Subject | exact |  |
| Cost of living & housing | Cost of living | Subject | exact |  |

## Left unmapped on purpose

Animals; Arts, Culture, Religion; Civil Rights and Liberties, Minority Issues;
Families; Foreign affairs (International Affairs); Law; Native Americans;
Social Sciences and History; Sports and Recreation. Bills with only these labels
appear on their own bill pages and on members' vote lists, but under no issue,
rather than being forced into a category that does not fit.

## Changing a rule

Add, edit or switch off (`active = 0`) a row in `category_mappings`. Bills are
re-sorted the next time their details are refreshed. State bills (Phase E) are
sorted by AI classification with a confidence score; low confidence goes to the
review queue.
