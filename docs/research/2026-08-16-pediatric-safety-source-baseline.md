# Pediatric Safety Source Baseline

Research date: 2026-08-16

Scope: source-selection constraints for Agent Trujillo's deterministic pre-LLM safety roadmap.

Status: research input only; not an approved rule pack and not medical advice.

## Product boundary carried into the research

Agent Trujillo provides basic pediatric education and organization. It does not diagnose, confirm or exclude a diagnosis, prescribe, select a medicine, authorize a dose, or replace a pediatrician. A non-urgent professional-review result recommends a pediatrician without creating a case, appointment, contact, alarm, or handoff. An urgent result only recommends going directly to the emergency department; it triggers nothing else.

## Primary-source findings

### Colombia-first baseline

Colombia's current Minsalud “Herramienta Clínica Primera Infancia” describes itself as an update of clinical AIEPI and includes initial risk classification from warning signs and risk history. It is the preferred Colombia-specific discovery and clinical-review source, but its web modules must be captured as immutable artifacts with retrieval date and digest before any rule is authored: [Minsalud Herramienta Clínica Primera Infancia](https://herramientaclinicaprimerainfancia.minsalud.gov.co/).

Minsalud also publishes a fever-care artifact that identifies age under three months with fever above 38 °C as a high-risk situation. That document is a candidate source, not a production rule by itself; the team must confirm current status, applicability, measurement assumptions, and exact approved user wording: [Minsalud Atención del paciente con fiebre](https://www.minsalud.gov.co/sites/rid/Lists/BibliotecaDigital/RIDE/VS/TH/Atencion_paciente_con_fiebre.pdf).

### WHO/IMCI baseline

WHO's IMCI materials define general danger-sign assessment for sick children and urgent referral behavior. The source set includes inability to drink/breastfeed, vomiting everything, convulsions, and lethargy/unconsciousness, with age-specific young-infant material handled separately. Agent Trujillo must not reproduce IMCI clinician treatment or pre-referral steps; its approved product behavior remains only the emergency-department recommendation: [WHO IMCI publication set](https://www.who.int/publications/i/item/9789241506823), [WHO IMCI chart booklet](https://cdn.who.int/media/docs/default-source/mca-documents/child/imci-integrated-management-of-childhood-illness/imci-in-service-training/imci-chart-booklet.pdf).

The WHO materials are older global guidance and explicitly support country adaptation. They therefore provide a safety floor and taxonomy input, not automatic authority over Colombia or United States packages.

### United States baseline

The AAP 2021 clinical practice guideline covers well-appearing, term infants 8–60 days old with documented temperature at least 38.0 °C and explicitly excludes ill-appearing infants and several special populations. The agent must not implement the guideline's diagnostic or treatment algorithms; the source can support conservative emergency-boundary review only: [AAP febrile infant guideline](https://publications.aap.org/pediatrics/article/148/2/e2021052228/179783/Evaluation-and-Management-of-Well-Appearing).

The AAP page states that clinical practice guidelines automatically expire five years after publication unless reaffirmed, revised, or retired. This research did not find an authoritative reaffirmation/revision record as of 2026-08-16. Consequently, an AAP-derived production package is blocked until the clinical governance workflow records its current official status or a replacement source. It must not be labeled “current” from the publication page alone.

CDC condition-specific pages expose examples of emergency warning signs such as trouble breathing, inability to wake/stay awake, cyanotic color changes, and dehydration indicators. These pages are secondary inputs for corpus coverage because they are condition-specific, not a universal pediatric triage protocol: [CDC flu warning signs](https://www.cdc.gov/flu/signs-symptoms/index.html), [CDC MIS warning signs](https://www.cdc.gov/mis/signs-symptoms/index.html).

## Roadmap consequences

1. Red-flag evaluation is a deterministic synchronous pre-LLM engine, never an Eve tool and never a model classification.
2. Colombia and United States emergency packages are separate and independently approved. WHO/global rules are used only where an explicit domain policy permits them.
3. Every candidate rule must preserve age range, population, exclusions, measurement method, negation/quotation behavior, source version, and approved copy.
4. Conservative uncertainty cannot produce reassurance. It yields either one bounded clarification before generation or safe abstention/professional review according to an approved deterministic policy.
5. Urgent output is immutable approved copy whose only action is direct emergency-department recommendation. It contains no diagnosis, treatment, medicine, dose, alarm, notification, phone number, call, map, location action, booking, appointment, button, link, clinician contact, or Dr. Trujillo handoff.
6. Source publication does not equal package approval. Dr. Trujillo must approve the exact canonical artifact, sources, algorithms, locale, jurisdiction, and digest through module `03`.
7. All thresholds and wording remain absent from prompts and application code until their package passes source-status, checksum, clinical approval, eval, release, and rollback gates.

## Open clinical-review questions

- Which Minsalud/AIEPI artifacts are officially current for each child age band on the production activation date?
- Which rule set governs newborns and young infants below the age range of a cited general-child chart?
- What exact temperature measurement methods and caregiver-reported measurements are accepted for the emergency boundary?
- Which special populations require immediate abstention rather than evaluation by a general package?
- What bilingual emergency copy can be both clinically appropriate and compliant with the product's “emergency department only” constraint?
- What authoritative post-2021 United States source replaces or reaffirms the AAP febrile-infant guideline after its stated five-year lifecycle boundary?

These questions are release blockers, not details a worker or model may infer.
