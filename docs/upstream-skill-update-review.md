# EGM-Skills: Upstream-Update-Prüfung

Prüfdatum: **2026-11-02** · Issue: **bb-elephant-goldfish-t9s**

## Ergebnis und Vergleichsbasis

Empfohlen sind gezielte Ergänzungen an der Übergabe von Brainstorm zu Draft,
an der Verständlichkeitsprüfung und an der Quellenprüfung beim Bootstrap.
Ein vollständiger Austausch der Skills würde lokale Verträge zurücknehmen.
Dieser Bericht übernimmt keine Updates und erteilt keine Update-Freigabe.

| Stand | Festgehaltene Version |
| --- | --- |
| Lokale BB-Adaption | Checkout-HEAD `d04dd6b77c0abe47d4fecd84c95a9efd3c433d3e`, vor der Prüfung sauber |
| Lokaler Upstream-Pin | `3d0b34821ce88ad328b0c9bf0e06d7eb5f1cd669`, laut [NOTICE](../NOTICE) |
| Geprüfter Upstream | `main` bei Prüfungsbeginn: `403d8881d62022490637d740657b33f01e321ea8`, Commitdatum 2026-10-30 |

Grundlage sind die offiziellen GitHub-API-Metadaten und Quellarchive beider
Commits. Der [Vergleich der Commits][compare] dient als Einstieg; bewertet wurden
die einzelnen Dateien. Alle 25 lokalen Upstream-Dateien außer der lokalen
`AGENTS.md` stimmen bytegenau mit dem Pin überein. Dabei entspricht
`upstream/document_standards/` dem Originalpfad `resources/document_standards/`
und `upstream/execution_instructions.md` dem Original unter `resources/`.
Die Archive und Arbeitsdiffs lagen außerhalb des Repositorys.

Pro Skill wurden gepinntes Original, aktuelles Original und BB-Adaption
verglichen. Die Deltas unten sind Änderungen **seit dem Pin**; bestehende
BB-Abweichungen sind jeweils getrennt beschrieben. Der Stand nach diesem
Upstream-Commit ist nicht erfasst.

## Übersicht aller sieben Skills

Im Pin heißen die Verzeichnisse `egm_<name>`, aktuell `egm-<name>`.
Die lokalen BB-Skills verwenden bereits Bindestriche. `SKILL.md` bleibt jeweils
der Einstiegspunkt.

| Lokaler Skill / gepinntes Original | Delta im aktuellen Original | Empfehlung |
| --- | --- | --- |
| [brainstorm](../skills/egm-brainstorm/SKILL.md) / [Pin](../upstream/skills/egm_brainstorm/SKILL.md) | Abschnitt für verworfene Alternativen; reparierte Markdown-Tabelle | **Für BB anpassen:** Alternativen mit Begründung weitergeben; Tabellenformat lokal nicht betroffen. |
| [draft](../skills/egm-draft/SKILL.md) / [Pin](../upstream/skills/egm_draft/SKILL.md) | Alternativen aus Brief lesen, Abgleich vor Abschluss, neue Architektur-Auswahlpflicht | **Für BB anpassen:** Übergabe und Abschlussabgleich ergänzen; pauschale Auswahlpflicht **nicht übernehmen**. |
| [review](../skills/egm-review/SKILL.md) / [Pin](../upstream/skills/egm_review/SKILL.md) | Comprehension direkt, ohne Dokumentstandard, mit vollständiger Paraphrase | **Für BB anpassen:** gesonderte Änderung am Prompt-/Ausgabevertrag erforderlich. |
| [review-loop](../skills/egm-review-loop/SKILL.md) / [Pin](../upstream/skills/egm_review_loop/SKILL.md) | Reviewer-Ausfälle/IDs sowie neue Regeln für Konvergenz, erledigte Findings und Wiederholungen | Ausfälle/Identitäten lokal schon abgedeckt; neue Schleifen- und Unterdrückungsregeln **nicht übernehmen**. |
| [resolve](../skills/egm-resolve/SKILL.md) / [Pin](../upstream/skills/egm_resolve/SKILL.md) | Belegpflicht, Eskalation bei externem Wissen, Umgang mit Nits und Verständnislücken | **Für BB anpassen:** belegte Begründungen und offene Wissensfragen schärfen; keine automatischen Finding-Entscheidungen. |
| [drift-report](../skills/egm-drift-report/SKILL.md) / [Pin](../upstream/skills/egm_drift_report/SKILL.md) | [Aktuelles SKILL.md][drift] bytegleich, nur Verzeichnispfad geändert | **Nicht übernehmen:** kein neues inhaltliches Update; lokale Begrenzung der Aussagekraft erhalten. |
| [bootstrap](../skills/egm-bootstrap/SKILL.md) / [Pin](../upstream/skills/egm_bootstrap/SKILL.md) | Genauere Quellenbelege, andere Lesebudgets, Bazel-Korrekturen, Vorlagenauslagerung | **Für BB anpassen:** Quellen-/Link-/Befehlsprüfung ergänzen; vollständige parallele Lesevorgabe nicht pauschal übernehmen. |

## Bewertung der relevanten Änderungen

### 1. Brainstorm und Draft: Entscheidungen über Sitzungen erhalten

**Neu:** [Brainstorm][brainstorm] speichert verworfene Alternativen mit Gründen
im Brief. [Draft][draft] liest diese Informationen statt sie aus Erinnerung zu
rekonstruieren und verlangt bei fehlendem Abschnitt eine Rückfrage. Vor dem
Abschluss wird der Entwurf erneut mit dem Vorgänger verglichen: Widersprüche
und wesentliche neue Architektur-, Schnittstellen- oder Abhängigkeitsentscheidungen
werden dem Menschen vorgelegt. Dieser Abgleich ersetzt die frühere eigene
Zoom-Out-Bewertung des Entwurfs; die frische Review-Stufe bleibt zuständig.

**Lokal heute:** Der Brief hat keinen benannten Alternativenabschnitt. Draft
liest den Vorgänger zu Beginn, verlangt aber keinen abschließenden Vergleich.
Entscheidungsrelevante Alternativen mit Empfehlung und die Abschnittsfreigaben
sind bereits vorgesehen. Ein eigener abschließender Zoom-Out-Test ist im
lokalen Skill ohnehin nicht enthalten.

**Für BB anpassen, zuerst empfohlen:** Reale Alternativen samt Gründen
festhalten und beim Draft lesen; bei Abschluss wesentliche Abweichungen
aufzeigen und entscheiden lassen. Fehlende Abschnittsüberschriften allein
begründen keine erneute Grundsatzbefragung: erst Brief und verfügbaren Kontext
prüfen; nur entscheidungsrelevante Lücken nachfragen. Keine Alternativen
erfinden. Das erhält die dsc-Regel, bekannte Entscheidungen wiederzuverwenden.
Beim bereits registrierten und geprüften Dokument bleibt jede Änderung ein
menschlich bestätigter `egm_propose`-Vorschlag.

**Nicht übernehmen:** Draft verlangt neu bei mehreren vertretbaren
Architekturantworten eine ungewichtete Auswahl ohne Empfehlung und verweigert
eine Auswahl selbst auf ausdrücklichen Wunsch des Menschen. Das widerspricht
der lokalen Pflicht, wesentliche Entscheidungen mit Empfehlung vorzulegen und
gleichwertige technische Ausführung offen zu lassen. Die vorhandenen
Abschnittsfreigaben reichen als Freigabevertrag; sie bleiben erhalten.

### 2. Review: Verständlichkeit statt Implementierungsdetail prüfen

**Neu:** [Review][review] dispatcht Comprehension ohne Synthesizer und ohne
`re-implementation-standard`. Die geänderte [Comprehension-Persona][comprehension]
formuliert zuerst in eigenen Worten das Vorhaben und das im Dokument erklärte
Bestandssystem. Der Mensch kann daran Missverständnisse erkennen, auch wenn
keine einzelnen Begriffe fehlen. Allgemeine Fachbegriffe sollen nicht als
fehlendes Projektwissen beanstandet werden. Der vollständige Text soll auch
ohne Findings erhalten bleiben.

**Lokal heute:** BB dispatcht die Persona bereits direkt. Die Presets `full`
und `feature_spec` verbinden sie aber weiterhin mit dem
Reimplementierungsstandard. [stageMessages und parseFindings](../server/prompts.ts)
fordern ausschließlich Finding-Blöcke oder `NO FINDINGS`; eine reine Paraphrase
würde als unstrukturierter Befund behandelt. Bei einer Paraphrase vor gültigen
Finding-Blöcken würde der Parser den Vorspann nicht als Finding erfassen.
Die Engine erhält den vollständigen Rohbericht bereits separat
([Engine](../server/engine.ts), `runStage`).

**Für BB anpassen, als gesonderte Produktänderung empfohlen:**
Verständlichkeitsprüfung vom Detailstandard lösen und die Paraphrase als
eigenständigen Berichtsteil behandeln, ohne daraus einen künstlichen Befund
zu machen oder sie im Finding-Überblick zu verlieren. Dafür reichen neue
Skill-Sätze allein nicht: `StagePlan`, Standardzuordnung, Prompt, Parser und
Berichtsdarstellung müssen zusammen betrachtet werden, ebenso beide Engines.
Der Brainstorm-Modus und Custom-Reviews sind gesondert abzugrenzen.
Die pauschale Upstream-Einstufung einer nicht paraphrasierbaren Passage als
Blocker sollte durch die dsc-Prüfung konkreter Ursache und Folgen eingegrenzt
werden; fehlender/budgetbedingt ausgelassener Kontext bleibt unbekannt.

### 3. Review-Loop: Fehler sichtbar halten, neue Abschlussregeln ablehnen

**Neu:** [Loop][loop] und [Synthesizer][synthesizer] verlangen Status je Reviewer,
einen Wiederholungsversuch bei Ausfall und stabile Finding-IDs. Weiterhin neu:
zwei aufeinanderfolgende saubere Runden, fünf Runden als Grenze und ein
Abbruchdialog bei widersprüchlichen Korrekturschleifen. Nits verhindern eine
saubere Runde nicht. Bereits bestrittene oder als Risiko behaltene Findings
sollen bei gleichem Thema und Bereich nicht erneut geöffnet werden.

**Lokal heute:** Persistente Stages und Finding-IDs bestehen schon. Leere
Berichte, Ausfälle und Timeouts werden als Nicht-Erfolg behandelt
([BB-Reviewer](../server/bb-reviewer.ts), [Engine](../server/engine.ts),
`runStage`); ein automatischer Wiederholungsversuch ist dort nicht vorgesehen.
Fortsetzung erfolgt nach bestätigter Änderung und abgeschlossenen
Finding-Entscheidungen, gebunden an die angewandte Version. Standardlimit ist
drei Runden, konfigurierbar von eins bis zehn. Ohne Änderung können alle
Finding-Entscheidungen den Lauf abschließen (`afterResolution`).

**Nicht übernehmen:** Ein `contested` Finding ist in BB ausdrücklich noch
offen ([Zustände](../server/contract.ts)). Historische Entscheidungen dürfen
nach dsc neue Findings nicht automatisch unterdrücken. Zwei Pflicht-Runden,
fünf als neues Defaultlimit und ein nicht blockierender Nit-Status würden
Kosten, Fortsetzungslogik und menschliche Entscheidungspflichten ändern.
Das wäre keine bloße Skill-Aktualisierung. Der Wiederholungsversuch wäre
ebenfalls eine eigene Laufzeit-/Kostenentscheidung; hier nicht empfohlen.
Die Fehlertransparenz und die Unterscheidung zwischen Limit und erfolgreicher
Prüfung sind lokal bereits vorhanden; dafür ist kein Import nötig.

### 4. Resolve: Belege stärken, menschliche Entscheidungen erhalten

**Neu:** [Resolve][resolve] unterscheidet zusätzlich Eskalation bei nicht
zugänglichem Wissen und das Zurückstellen von Nits. Ein Contest braucht
nachprüfbare Belege; Verfasserabsicht allein reicht nicht. Kontext soll für
menschliche Leser ergänzt werden, nicht nur zur Beruhigung eines Reviewers.
Verständnislücken dürfen laut Original pauschal nicht bestritten werden.

**Lokal heute:** Konkrete Begründungen, Recherche vor Rückfragen, Beachtung von
`reviewContext` und unveränderte Severity sind bereits vorgeschrieben. Der
Elephant kann bestreiten oder einen Fix vorschlagen; allein der Mensch
entscheidet über Fix-Anforderung, akzeptiertes Risiko oder Verwerfen.

**Für BB anpassen:** Belege möglichst als Datei/Symbol oder dokumentierte
Entscheidung nennen. Nicht belegbares Teamwissen als offene menschliche
Klärung darstellen und notwendige Voraussetzungen sichtbar lassen; keine
neuen API-Zustände `ESCALATE`/`DECLINE` suggerieren. Einen Nit kann der Elephant
zur Ablehnung empfehlen, aber nicht selbst entscheiden oder ausblenden.
Das pauschale Contest-Verbot bei Verständnislücken nicht übernehmen: Zuerst
prüfen, ob der Text unklar ist oder ob ausgewählter Kontext fehlte. Externes
Wissen allein beweist auch nicht, dass eine Kritik unzutreffend ist. Der
bestehende Vorschlags-/Bestätigungspfad bleibt verbindlich.

### 5. Bootstrap und Codebase-Details: Tatsachen von Vorhaben trennen

**Neu:** [Bootstrap][bootstrap] fordert explizite Symbol-/Flag-/Tabellenbelege,
Prüfung von Imports und Build-Abhängigkeiten sowie zutreffende Diagramme.
Die Endkontrolle aller erzeugten Verträge und Links bestand schon im Pin;
neu ist ihre schärfere Bindung an konkrete Codebelege. Bazel-Beispiele verwenden
gültige Zielmuster. Die frühere Grenze von 50.000 Bytes je Verzeichnis und
300 Zeilen je Datei wird durch Quellen-Chunks von etwa 1.500 Zeilen ersetzt;
Nicht-Test-Quellen sollen vollständig gelesen werden, mit gesonderten Grenzen
für Templates und Konfiguration. Tests bleiben ausgeschlossen.

**Lokal heute:** Der knappe Skill verweist auf die
[Orchestrator-Persona](../skills/egm-bootstrap/references/bootstrap-orchestrator.md)
und [Vorlagen](../skills/egm-bootstrap/references/templates.md), nennt diese
konkreten Beleg-/Prüfschritte jedoch nicht. Symlink-/Ignore-Regeln,
Dokumentationsumfang und Freigabe bei mehr als 15 Verzeichnissen bestehen.

**Für BB anpassen:** Aussagen aus Quellen belegen, bestehende Inhalte schonend
aktualisieren, alle geschriebenen Verträge samt Links und tatsächlichen
Prüfbefehlen gegenlesen. Für nicht geprüfte Teile ausdrücklich Grenzen nennen;
keine Vollständigkeit behaupten. Bazel-Syntax nur bei entsprechender Codebasis
anwenden. Keine pauschale Pflicht zur vollständigen parallelen Lektüre, keinen
neuen Scout-Unterbau und keine Ausweitung der freigegebenen Baumgröße importieren.

Auch die [Codebase-Details-Persona][codebase] unterscheidet neu zwischen
falschen Aussagen über bestehenden Code und erst geplanten Dateien. **Für BB
anpassen:** Diese sachliche Unterscheidung ist nützlich. Die automatischen
Severity-Vorgaben bei jeder falschen Bestandsaussage beziehungsweise fehlenden
Create/Modify/Delete-Markierung nicht übernehmen: dsc verlangt materielle
Folgen statt Pflichtetiketten. Der tool-lose Endpoint kann nur mitgelieferte
Quellen prüfen; fehlende Dateien im Kontext sind kein Beweis ihrer Nichtexistenz.

## Referenzen, Provenienz und bestehende Abweichungen

- Die fünf Dokumentstandards und die Personas `bootstrap_orchestrator`,
  `design_critic`, `implementation_readiness`, `structural`, `style` und
  `zoom_out` sind bytegleich zum Pin. Geändert sind `comprehension`,
  `codebase_details` und `synthesizer`, wie oben bewertet. Die unveränderten
  Standards bleiben durch die lokalen dsc-Leitplanken eingegrenzt.
- Das [Draft-Template][design-template] und das
  [Bootstrap-Return-Schema][worker-schema] sind seit dem Pin bytegleich.
  Das Draft-Template entspricht auch lokal bytegenau dem Original.
  Die [Bootstrap-Templates][bootstrap-templates] wurden aus dem Skill
  ausgelagert. Ihr Vertragsinhalt entspricht bereits der lokalen Kopie;
  neu sind Copyright-/SPDX-Kopf, Einleitung und Überschriftenebene.
  **Nicht übernehmen als Funktionsupdate**; bei späterer Übernahme neuer
  Originaldateien deren Apache-2.0-Attribution erhalten.
- [Gemeinsame Ausführungsregeln][execution] erklären neu offen, dass ein
  Design-Workflow keine Produktionsimplementierung ausführt. Die frühere
  Aufforderung, dies zu verschweigen und Codewünsche still auf Beispiele
  umzulenken, entfällt. **Übernehmen empfohlen** für
  [Drafts lokale Referenz](../skills/egm-draft/references/execution-instructions.md),
  die diese alten Sätze noch enthält. Dabei die lokale dsc-Ergänzung zur
  Wiederverwendung geklärter Entscheidungen und die Abschnittsfreigaben erhalten;
  nicht die ganze Referenz durch das Original ersetzen.
- Die ausgelagerten Vorlagen, relativen Skill-Referenzen und Bindestrichnamen
  brauchen keine Rückkehr zu Upstream-Workspace-Pfaden. Host-Anleitungen,
  `agents/openai.yaml`, Icons und Veröffentlichungs-/Testszenario-Dateien sind
  kein BB-Runtime-Update; deren Installation und Funktion in anderen Hosts
  wurden nicht geprüft. Keine persönliche Skill-Abhängigkeit hinzufügen.
- Ganze-Datei-Reviews, vom Nutzer ausgewählter Kontext, BB-Worker-Zustimmung,
  der tool-lose Endpoint, automatische versionsgebundene Folgerunden und
  menschlich bestätigte Diffs sind **bereits bestehende BB-Abweichungen**.
  Sie sind keine neu entdeckten Upstream-Änderungen und bleiben erhalten.
  Das gilt auch für die vorsichtige Aussagekraft des lokalen Drift-Reports.

## Erhalt der dsc-Fortschritte und Grenzen der Prüfung

Maßgeblich bleiben die [gemeinsamen Leitplanken](../server/review-guidelines.md),
direkt bereitgestellt durch [Agent-Konfiguration](../server.ts) und
[Goldfish-Prompt](../server/prompts.ts). Historische Entscheidungen und
Kontextlücken bleiben Eingabedaten mit Herkunft und Grenzen; sie werden weder
zu pauschalen Ausnahmen noch zu neuen Pflichtformularen. Jede spätere
Empfehlungsumsetzung muss die lokalen Verträge aus
[skills/AGENTS.md](../skills/AGENTS.md) und [server/AGENTS.md](../server/AGENTS.md)
erhalten, insbesondere Checkout-Bindung, dokumentierte Zustimmung und
`egm_propose` mit expliziter menschlicher Diff-Bestätigung.

Geprüft wurden Quelltexte, Deltas, Pfadzuordnung und lokale Einbindung. Es gab
keine Modellläufe, Installation, Tests, Builds oder Plugin-Reloads: Dieser
Bericht ändert kein ausführbares Verhalten und belegt keine Verbesserung der
Modellurteile. Die GitHub-Webansicht der Historie war nicht abrufbar; API und
commitfixierte Originalarchive waren verfügbar. Innerhalb des beschriebenen
Quellvergleichs blieb keine Quelle unzugänglich. Modellwirkung, andere Hosts
und Änderungen nach dem festgehaltenen Commit bleiben ungeprüft.

DOX-Pass: Der Bericht wird in der Root-Anleitung als Entscheidungsgrundlage
verlinkt. Die Child-Anleitungen bleiben unverändert, weil ihre Zuständigkeiten
und Laufzeitverträge gleich bleiben. Skills, Upstream-Dateien, `NOTICE`, Pin
und Laufzeitcode werden durch diese Prüfung nicht geändert.

[compare]: https://github.com/google/elephant-goldfish-model/compare/3d0b34821ce88ad328b0c9bf0e06d7eb5f1cd669...403d8881d62022490637d740657b33f01e321ea8
[brainstorm]: https://github.com/google/elephant-goldfish-model/blob/403d8881d62022490637d740657b33f01e321ea8/skills/egm-brainstorm/SKILL.md#L199-L202
[draft]: https://github.com/google/elephant-goldfish-model/blob/403d8881d62022490637d740657b33f01e321ea8/skills/egm-draft/SKILL.md
[review]: https://github.com/google/elephant-goldfish-model/blob/403d8881d62022490637d740657b33f01e321ea8/skills/egm-review/SKILL.md#L326-L345
[loop]: https://github.com/google/elephant-goldfish-model/blob/403d8881d62022490637d740657b33f01e321ea8/skills/egm-review-loop/SKILL.md#L108-L191
[resolve]: https://github.com/google/elephant-goldfish-model/blob/403d8881d62022490637d740657b33f01e321ea8/skills/egm-resolve/SKILL.md#L54-L81
[drift]: https://github.com/google/elephant-goldfish-model/blob/403d8881d62022490637d740657b33f01e321ea8/skills/egm-drift-report/SKILL.md
[bootstrap]: https://github.com/google/elephant-goldfish-model/blob/403d8881d62022490637d740657b33f01e321ea8/skills/egm-bootstrap/SKILL.md
[comprehension]: https://github.com/google/elephant-goldfish-model/blob/403d8881d62022490637d740657b33f01e321ea8/agents/comprehension.md#L34-L66
[synthesizer]: https://github.com/google/elephant-goldfish-model/blob/403d8881d62022490637d740657b33f01e321ea8/agents/synthesizer.md#L35-L65
[codebase]: https://github.com/google/elephant-goldfish-model/blob/403d8881d62022490637d740657b33f01e321ea8/agents/codebase_details.md#L40-L50
[design-template]: https://github.com/google/elephant-goldfish-model/blob/403d8881d62022490637d740657b33f01e321ea8/skills/egm-draft/references/design_doc.md
[worker-schema]: https://github.com/google/elephant-goldfish-model/blob/403d8881d62022490637d740657b33f01e321ea8/skills/egm-bootstrap/references/worker-return.schema.json
[bootstrap-templates]: https://github.com/google/elephant-goldfish-model/blob/403d8881d62022490637d740657b33f01e321ea8/skills/egm-bootstrap/references/templates.md
[execution]: https://github.com/google/elephant-goldfish-model/blob/403d8881d62022490637d740657b33f01e321ea8/resources/execution_instructions.md#L1-L17
