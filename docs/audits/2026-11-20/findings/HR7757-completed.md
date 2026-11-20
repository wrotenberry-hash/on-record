# H.R. 7757 (KIDS Act) — completion of the core check against the bill as passed

Second reading. Only official text fetched from govinfo, plus the packet, was used.

## What was fetched

| URL | Result |
|---|---|
| https://www.govinfo.gov/content/pkg/BILLS-119hr7757eh/html/BILLS-119hr7757eh.htm | 200, 151,165 bytes. "H.R. 7757 Engrossed in House (EH)"; ends "Passed the House of Representatives June 29, 2026." Answered every question. This is the text used below. |
| https://www.govinfo.gov/content/pkg/BILLS-119hr7757rfs/html/BILLS-119hr7757rfs.htm | 200, 151,124 bytes. Referred in Senate, July 13, 2026. Body from "SEC. 2. DEFINITIONS." to the passage line is identical to EH (compared after collapsing whitespace: equal, 108,064 chars). |
| https://www.govinfo.gov/content/pkg/BILLS-119hr7757ih/html/BILLS-119hr7757ih.htm | 200, 96,128 bytes. Introduced version; saved, not relied on. |
| https://www.govinfo.gov/content/pkg/BILLS-119hr7757rh/html/BILLS-119hr7757rh.htm | 302, no content (no such version at that address). Not needed. |

Saved under `/tmp/claude-0/-home-user-gravel/cfa1644a-f850-5783-9b0f-e12139451812/scratchpad/audit/fetched/HR7757/`
(`.htm` as fetched, `.txt` with tags stripped). Line numbers below are lines of `BILLS-119hr7757eh.txt`.
www.congress.gov was not tried (per brief). The summary JSON has no `textUrl`; the govinfo address was built from
the bill number.

## Statements settled

### 1. changes[1].ifPassed — the "under 17" age — VERIFIED
- Summary: "Covered social media platforms must make the most protective privacy and safety settings the default for
  users they know are under 17."
- Bill, Sec. 2(8) (line 210): "Minor.--Except as otherwise provided, the term ``minor'' means an individual under the
  age of 17 years."
- Bill, Sec. 212 (lines 443–513) defines "child" ("an individual who is under the age of 13") and "teen" ("an
  individual who has attained the age of 13 years and is under the age of 17 years") but does not define "minor", so
  the Act-wide Sec. 2(8) definition applies to Sec. 214.
- Bill, Sec. 214(a)(3) (line 580): "in the case of a user of or visitor to the covered platform who the provider knows
  is a minor, the default setting of any safeguard described in paragraph (1) is the option available on the covered
  platform that provides the most protective level of control with respect to privacy and safety".
- Result: the age is right. Under 17 is the bill's number for this subtitle.
- Small points, not misstatements: (a) Sec. 212(6): "``know'' or ``knows'' means to know or should have known", so the
  duty is wider than "users they know"; (b) the rule covers "a user of or visitor to" the platform; (c) the default
  rule applies to the six safeguards listed in paragraph (1), as the first findings already noted (C13).

### 2. howItWorksToday[3] — "searchable accounts" — VERIFIED (two listed conditions left out)
- Summary: "The bill's social media section covers public online services where users create searchable accounts, share
  user-made content, and receive ads or recommendations based on personal information." (cited Sec. 201)
- Bill, Sec. 201(1) (lines 412–432): "``covered platform'' means a platform that is a website, software, application,
  or electronic service connected to the internet that meets the following requirements: (A) Is publicly available for
  use by consumers. (B) Enables the creation of a username or user identifier-- (i) that is searchable on the platform
  by other users through a function made available by the platform; and (ii) that can be followed by or is similarly
  accessible to other users of the platform. (C) As the primary purpose of the platform, facilitates the sharing and
  access to user-generated content through text, images, video, audio, or any other interactive medium. (D) Uses a
  design feature to promote user engagement on the platform. (E) Uses the personal information of the user to
  advertise, market, or make content recommendations."
- Result: "public", "searchable", user-made content, and ads or recommendations from personal information are all in
  Sec. 201, and the section cited is the right one.
- Left out (condition dropped, minor): requirement (D), "Uses a design feature to promote user engagement"; the
  "primary purpose" limit in (C); and (B)(ii), that the username can be followed. All five requirements must be met,
  so the summary's wording reads a little wider than the bill. The bill says "username or user identifier", which the
  summary renders "accounts".

### 3a. changes[4].ifPassed — video games — VERIFIED against the passed text
- Summary: "Online video game platforms must give parents tools to limit a minor's communication with other users and
  restrict purchases by a minor."
- Bill, Sec. 303(a) (line 1022): "An online video game provider shall provide safeguards to a parent of a covered user
  of an interactive online video game of such online video game provider that allow the parent to limit communication
  between such covered user and any other user of such interactive online video game."
- Bill, Sec. 303(b)(3) (line 1044): "An online video game provider shall provide to a covered user and a parent of a
  covered user ... readily accessible and easy-to-use safeguards to do the following: ... (B) Restrict purchases and
  financial transactions by such covered user. (C) Limit the amount of time spent by such covered user".
- Bill, Sec. 302 (lines 991–1010): "``covered user'' means a user of an interactive online video game if the online
  video game provider ... knows that such user is a minor"; "``minor'' means an individual under the age of 17 years";
  "``online video game provider'' means a person engaged in the business of providing ... a digital storefront, console
  network, mobile or cloud gaming platform, or similar means of digital distribution".
- Result: both duties are in the passed bill. Small points: the duty runs to a user the provider "knows" (knows or
  should have known) is a minor; the purchase safeguard goes to the minor as well as the parent; the bill also requires
  the communication limits to be on by default at the most restrictive setting (Sec. 303(b)(1)), which the row does not
  mention.

### 3b. changes[5].ifPassed — chatbots — VERIFIED against the passed text
- Summary: "Chatbot providers must tell minor users that the chatbot is an artificial intelligence system, not a human,
  and give suicide and emergency help hotline information."
- Bill, Sec. 404(a) (line 1110): "A chatbot provider shall clearly and conspicuously disclose to each covered user of a
  chatbot of such chat provider a disclosure of the following: (1) The chatbot is an artificial intelligence system and
  not a natural person. (2) Resources for contacting a suicide and crisis intervention hotline."
- Bill, Sec. 404(b) (line 1117): AI disclosure "at the initiation of the first interaction of a covered user with a
  chatbot; and ... at any point at which ... the covered user prompts the chatbot about whether the chatbot is an
  artificial intelligence system"; crisis disclosure "at any point at which ... the covered user prompts the chatbot
  about suicide or suicidal ideation."
- Bill, Sec. 402(2) (line 1096): "``covered user'' means a user of a chatbot if the provider of such chatbot knows that
  such user is a minor." Title IV has no definition of "minor", so Sec. 2(8) applies: under 17.
- Result: both disclosures are in the passed bill. Small points: the hotline information is required when the minor
  raises suicide, not at all times; "crisis intervention" is rendered "emergency help"; knowledge condition as above.
- Related, plainEnglish "chatbot warnings": the bill's word is "disclose" / "Disclosure Required" (Sec. 404). Same
  minor wording point the first findings recorded (C10); the passed text does not change it. Sec. 405(1) also requires
  policies so the chatbot "advises a covered user ... to take a break" after 3 hours, which is closer to a warning.

## Other core statements the first findings could not check against bill text

### 4. howItWorksToday[2] — one-third threshold (Sec. 102, absent from the packet) — VERIFIED
- Summary: "The bill's adult-content section would apply to public websites or online platforms where more than
  one-third of the content is sexual material harmful to minors."
- Bill, Sec. 102(1) (line 267): "``covered platform'' means a website or other online platform-- (A) that is
  accessible by the public; (B) with respect to which more than one-third of the material made available thereon is
  sexual material harmful to minors; and (C) with respect to which the provider of such platform knowingly makes
  available the sexual material harmful to minors described in subparagraph (B)."
- Result: "websites or online platforms", "public" and "more than one-third" all match. Left out (minor): requirement
  (C), that the provider "knowingly makes available" the material.
- Side note for the age question: in Title I only, Sec. 102(2) gives "minor" "the meaning given that term in section
  2256 of title 18", which the packet shows is under 18. So age checks on adult sites protect under-18s, while the
  social media, video game and chatbot titles use under 17. The summary's changes[0] row says only "minors", which is
  correct.

### 5. changes[0].ifPassed — "Starting 1 year after enactment" — VERIFIED (already in packet; unchanged in passed text)
- Bill, Sec. 103(a) (line 312): "Beginning on the date that is 1 year after the date of the enactment of this Act, a
  provider of a covered platform shall-- (1) adopt and utilize commercially available technology verification measures
  ... to identify minors; and (2) prevent such minors from accessing any sexual material harmful to minors".

### 6. plainEnglish — "stronger privacy rules for people under 18" (first findings C9: no bill section in packet) — VERIFIED
- Bill, Sec. 602(a) (lines 1577–1832), amending the Children's Online Privacy Protection Act definitions: "``child''
  means an individual under the age of 14"; "``Teen''.--The term `teen' means an individual who has attained the age
  of 14 and is under the age of 18."
- Bill, Sec. 602 (line ~1969): the notice and consent duties are extended to an operator "with actual knowledge or ...
  who should have known that a user is a child or teen"; "or teens" is inserted after "children" throughout.
- Result: the privacy title reaches people under 18. The bill text now supports the statement directly, so it no longer
  rests only on the floor statements.

### 7. howItWorksToday[4] — FTC and state attorneys general enforce (CRS of the introduced version) — VERIFIED
- Bill, Sec. 701(a)(2) (line 2549): "The Commission shall enforce this Act"; Sec. 701(b)(1) (line 2560): "the attorney
  general of a State, or an official or agency of a State ... may bring a civil action on behalf of the residents of
  the State".

### 8. changes[2] and changes[3] ifPassed (Sec. 214(b), Sec. 215) — unchanged
- The passed text of Sec. 214(b)(2)(A)–(F) and Sec. 215 reads as the packet's copies did; the first findings stand
  (supported, with the dropped conditions noted at C14).

## Not settled here (outside the task, or not checkable from bill text)
- The "today" cells and the "sources do not show" sentences (first findings C1–C8) are statements about the sources;
  the bill text cannot confirm or refute a statement about current law, and no current-law source was fetched.
  One relevant fact from the bill: Sec. 602 amends an existing statute, the Children's Online Privacy Protection Act
  of 1998 (15 U.S.C. 6501), so some federal children's privacy law exists today.
- Extended item E6 (not core): a 12-year-old is a "child" under Sec. 212(1) ("under the age of 13"), so the example
  parent could manage settings under Sec. 214(b)(2)(B). Supported.
- The floor record was not re-fetched; none of the statements to settle rests on it.

## Core result

ALL VERIFIED for the statements this pass was asked to settle. No wrong number, age or date was found. The remaining
faults are dropped conditions of the same minor kind the first reading recorded (Sec. 201 requirement (D) and
"primary purpose"; Sec. 102 "knowingly"; the "knows or should have known" standard; hotline information tied to the
minor raising suicide).
