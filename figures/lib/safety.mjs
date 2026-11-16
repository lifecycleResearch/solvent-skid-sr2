// The safety questions.
//
// Not answers: the questions that have to be closed before the plant is built,
// the rule each one comes from, and who closes it. The point is that the
// register shows the holes rather than a set of conclusions nobody has
// checked.
//
// Two rules hold throughout. Nothing here states a regulatory status as
// settled unless the rule is unambiguous, and nothing here is advice: a
// question with an owner is a task, and a task can be closed.

export const SAFETY_QUESTIONS = [
  {
    id: "S-01",
    topic: "Hazardous area classification",
    rule: "NFPA 30 (flammable liquids), 29 CFR 1910.106",
    question: "The carrier's flash point decides the area classification of every room. What is it, what class are the rooms, and is every item of electrical equipment certified for its class?",
    owner: "the client's EHS adviser, with the equipment vendors",
    why: "Everything electrical in the plant follows from one number on one datasheet.",
  },
  {
    id: "S-02",
    topic: "Grounding and bonding",
    rule: "NFPA 30, 29 CFR 1910.106",
    question: "Where is the carrier transferred, and what is the bonding and grounding arrangement at each transfer point, including the tanker's connection?",
    owner: "the client's EHS adviser",
    why: "Static at the tank truck is the classic ignition source, and it is the one that gets missed.",
  },
  {
    id: "S-03",
    topic: "Pressure relief",
    rule: "ASME BPVC Section VIII Div 1 (UG-125), API 2000 for the relief study",
    question: "Every closed vessel needs a relief path sized for the fire case, and the vacuum vessels need one for the blocked-in case. Which vessels have one, at what set pressure, and where does it discharge?",
    owner: "the pressure vessel vendor, reviewed by the client's engineer",
    why: "A jacketed vessel at -40 degC is a vacuum vessel as well as a pressure vessel, and it has to be protected as both.",
  },
  {
    id: "S-04",
    topic: "Nitrogen and asphyxiation",
    rule: "29 CFR 1910.146 (permit-required confined spaces), 1910.253 (compressed gas)",
    question: "Which vessels are entered, what is the oxygen-deficiency procedure, and what is the ventilation plan for the blanketed ones?",
    owner: "the client's EHS adviser",
    why: "The blanketed vessels are entered to clean them, and nitrogen is not something a person can smell.",
  },
  {
    id: "S-05",
    topic: "The cold work",
    rule: "29 CFR 1910.132 (personal protective equipment), the client's own cold-work procedure",
    question: "Twelve hours at -40 degC with a scraper running: what is the exposure limit for the crew, what is the rotation, and what protects the hands?",
    owner: "the client's EHS adviser",
    why: "The crystallisation step is the one place where a person is inside the cold for a long time.",
  },
  {
    id: "S-06",
    topic: "Spill containment and drainage",
    rule: "40 CFR 112 (SPCC), the site's drainage plan",
    question: "What is the largest credible release, what is the containment volume, and can the site's drainage take it without going to the works sewer?",
    owner: "the client's EHS adviser",
    why: "A 30 000 L day tank and a tanker arriving weekly are different spill problems.",
  },
  {
    id: "S-07",
    topic: "The dried biomass",
    rule: "NFPA 652 and NFPA 654 (combustible dust)",
    question: "Where does the biomass dry, what is its dust explosibility assessment, and what does the plant do about the dust the mills and the filter make?",
    owner: "the client's EHS adviser",
    why: "Dried cannabis dust is a known combustible dust hazard, and the filtration step creates it.",
  },
  {
    id: "S-08",
    topic: "Emissions to air",
    rule: "Clean Air Act, the site's permit",
    question: "What does the permit require of the scrubber, how is it monitored, and what is the record the plant keeps?",
    owner: "the client's EHS adviser",
    why: "The scrubber is a control with a performance requirement; without the number it is just a vessel.",
  },
  {
    id: "S-09",
    topic: "The waste streams",
    rule: "40 CFR 261 (identification), the site's waste procedures",
    question: "What is the marc, the spent sieve and the spent carbon classified as, and where does each of them go?",
    owner: "the client's EHS adviser, with the waste broker",
    why: "The waste route is a commercial question as much as a compliance one, and it is the client's to answer.",
  },
  {
    id: "S-10",
    topic: "The vapour system",
    rule: "NFPA 30, the mechanical integrity programme",
    question: "Which lines are vapour-return, which are liquid, and what is the piping's classification on the drawings the vendors are quoting from?",
    owner: "the client's engineer",
    why: "The vapour lines are the ones that must not be liquid.",
  },
  {
    id: "S-11",
    topic: "Transport and the handover",
    rule: "49 CFR (DOT), the carrier's documentation",
    question: "Who is the carrier, what paperwork does the tanker movement need, and who checks that the blend's composition on the paperwork matches what the plant receives?",
    owner: "SCC, with the carrier",
    why: "The blend's ratio is an assumption until a document says otherwise, and the document is the transport paperwork.",
  },
  {
    id: "S-12",
    topic: "Emergency response",
    rule: "29 CFR 1910.38 (emergency action plans), the site's plan",
    question: "What does the site plan say about a carrier release, a fire and a cryogenic burn, and has the fire brigade seen the plant?",
    owner: "the client's EHS adviser",
    why: "A plan nobody has walked through is a document, not a plan.",
  },
];

/** The questions, and how they attach to a spec. */
export function safetyOf(spec) {
  const questions = (spec.safety && spec.safety.questions) || SAFETY_QUESTIONS;
  return {
    note: (spec.safety && spec.safety.note) || "The questions that have to be closed before the plant is built. Not answers: each one names the rule it comes from and who closes it.",
    questions,
    open: questions.filter((q) => !q.closed).length,
    byTopic: questions.map((q) => q.topic),
  };
}
